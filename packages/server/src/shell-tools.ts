/**
 * The instance's own tools — the agent acting on the product that runs it.
 *
 * One registry, one dispatch, several ways in. A tool is a name, a schema, a
 * handler and nothing else; every surface that exposes it is generated from
 * the registry, so adding a tool is adding an entry. The target is always
 * IMPLICIT: a handler receives the user and conversation of the turn that
 * called it, resolved on this side — the model only ever handles meaning
 * (a title, an id), never an address. See DESIGN.md, "Shell tools".
 *
 * Two ways in, one dispatch:
 *
 * - IN-PROCESS — a driver that can host tools where this store lives calls
 *   the handle's `call` directly; the turn's context travels by closure and
 *   no token exists on that path at all.
 * - THE SOCKET — a unix socket speaking MCP (newline-delimited JSON-RPC),
 *   fronted by a generic stdio bridge the server writes. The bridge announces
 *   the turn's token; the token resolves, server-side, to the same context
 *   the closure would have carried. A unix socket rather than a port on the
 *   app: the app's listener is published through an ingress, and an organ
 *   only the agent may reach must not exist on the network at all.
 *
 * Both were measured before being committed to (spikes/shell-tools-transport):
 * engines respawn a stdio MCP server on every turn — resumed ones included —
 * so a per-turn token in the bridge's env is fresh by construction; engines
 * open SEVERAL socket connections per turn, so connections here are cheap and
 * carry no state beyond the token they announced; and a dead socket degrades
 * into "server failed" without hurting the turn.
 */

import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ShellToolOutcome, ShellToolSpec, ShellToolsHandle } from '@antorfr/adestia-drivers'

import type { ConversationStore } from './conversations.js'

/** A failure worded for the AGENT — anything else is logged, not forwarded. */
export class ShellToolError extends Error {}

export interface ShellToolContext {
  readonly userId: string
  readonly conversationId: string
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A ULID: 48 bits of milliseconds then 80 of randomness, Crockford base32.
 * Hand-rolled (26 lines beat a dependency): ids sort by creation time, which
 * is what makes them the instance's canonical format for page identity.
 */
export function ulid(now = Date.now()): string {
  const chars = new Array<string>(26)
  let time = now
  for (let index = 9; index >= 0; index -= 1) {
    chars[index] = CROCKFORD[time % 32]!
    time = Math.floor(time / 32)
  }
  let value = 0n
  for (const byte of randomBytes(10)) value = (value << 8n) | BigInt(byte)
  for (let index = 25; index >= 10; index -= 1) {
    chars[index] = CROCKFORD[Number(value & 31n)]!
    value >>= 5n
  }
  return chars.join('')
}

/** Renders in a tab and in a list row; anything longer is a paragraph. */
const MAX_TITLE = 120

interface RegisteredTool {
  readonly spec: ShellToolSpec
  /**
   * Returns the sentence the agent reads back. Throws `ShellToolError` for a
   * failure the agent should hear in its own words.
   */
  handler(ctx: ShellToolContext, args: Readonly<Record<string, string>>): Promise<string>
}

interface TokenEntry {
  readonly ctx: ShellToolContext
  readonly expiresAt: number
}

export interface ShellToolsOptions {
  readonly dataDir: string
  readonly conversations: ConversationStore
  readonly log?: (message: string) => void
  /** Safety net only — the primary revocation is the turn settling. */
  readonly tokenTtlMs?: number
}

export class ShellToolsService {
  readonly #conversations: ConversationStore
  readonly #log: (message: string) => void
  readonly #tokenTtlMs: number
  readonly #tools = new Map<string, RegisteredTool>()
  readonly #tokens = new Map<string, TokenEntry>()
  /** Conversations renamed this turn — compacted when their turn settles. */
  readonly #renamed = new Set<string>()
  readonly #connections = new Set<Socket>()
  #server: Server | undefined
  readonly socketPath: string
  readonly bridgePath: string

  constructor(options: ShellToolsOptions) {
    this.#conversations = options.conversations
    this.#log = options.log ?? (() => undefined)
    this.#tokenTtlMs = options.tokenTtlMs ?? 6 * 60 * 60 * 1000

    // A unix socket path is capped around 104 bytes on macOS (108 on Linux);
    // a data directory deep enough to cross that gets a stable short home in
    // the OS temp dir instead — hashed, so two instances never collide.
    const preferred = join(options.dataDir, 'shell-tools.sock')
    this.socketPath =
      Buffer.byteLength(preferred) <= 100
        ? preferred
        : join(
            tmpdir(),
            `adestia-${createHash('sha256').update(options.dataDir).digest('hex').slice(0, 8)}.sock`,
          )
    this.bridgePath = join(options.dataDir, 'shell-tools-bridge.mjs')

    this.#register({
      spec: {
        name: 'rename_conversation',
        description:
          'Rename the conversation this turn belongs to, so its title says what the thread is about. The target is implicit: pass only the new title.',
        params: [
          {
            name: 'title',
            description: `New title for this conversation — short, specific, plain text (at most ${MAX_TITLE} characters).`,
          },
        ],
      },
      handler: async (ctx, args) => {
        const title = (args['title'] ?? '')
          .replace(/[\u0000-\u001F\u007F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (title === '') throw new ShellToolError('title must not be empty')
        if (title.length > MAX_TITLE) {
          throw new ShellToolError(
            `title is ${title.length} characters; the maximum is ${MAX_TITLE}`,
          )
        }
        const existing = await this.#conversations.read(ctx.userId, ctx.conversationId)
        if (!existing) throw new ShellToolError('this conversation no longer exists')
        await this.#conversations.rename(ctx.userId, ctx.conversationId, title)
        this.#renamed.add(`${ctx.userId}/${ctx.conversationId}`)
        return `Conversation renamed to "${title}".`
      },
    })

    this.#register({
      spec: {
        name: 'new_id',
        description:
          "Mint a unique id in this instance's canonical format (ULID: 26 characters, sortable by creation time). Use it whenever a page or record needs an id, unless the domain's own instructions define another scheme.",
        params: [],
      },
      handler: () => Promise.resolve(ulid()),
    })
  }

  #register(tool: RegisteredTool): void {
    this.#tools.set(tool.spec.name, tool)
  }

  /** Opens the socket and writes the bridge. Idempotent per process life. */
  async start(): Promise<void> {
    if (this.#server) return
    await mkdir(join(this.bridgePath, '..'), { recursive: true })
    // The bridge carries NO secret — socket path and token travel in the
    // child's env — so its mode can be the default and its content stable.
    await writeFile(this.bridgePath, BRIDGE_SOURCE)
    // A stale socket file from a previous life refuses the new listener.
    await unlink(this.socketPath).catch(() => undefined)

    const server = createServer((connection) => this.#serve(connection))
    this.#server = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.socketPath, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    // Belt to the socket's braces: same host, same user is the trust boundary.
    await chmod(this.socketPath, 0o600).catch(() => undefined)
  }

  async close(): Promise<void> {
    const server = this.#server
    this.#server = undefined
    for (const connection of this.#connections) connection.destroy()
    this.#connections.clear()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await unlink(this.socketPath).catch(() => undefined)
  }

  /**
   * Mints this turn's handle. Deliberately NO rotation: a message queued
   * while a turn runs mints its own handle, and retiring the running turn's
   * token then would break a tool call mid-flight. The desk merges a queue
   * into one turn that keeps only the LAST spec, so a queued handle that
   * never runs is simply never released — the TTL (and the purge here) is
   * what makes that a non-event rather than a leak.
   */
  handleFor(ctx: ShellToolContext): ShellToolsHandle {
    const now = Date.now()
    for (const [token, entry] of this.#tokens) {
      if (entry.expiresAt < now) this.#tokens.delete(token)
    }

    const token = randomUUID()
    this.#tokens.set(token, { ctx, expiresAt: now + this.#tokenTtlMs })

    return {
      socketPath: this.socketPath,
      token,
      bridgePath: this.bridgePath,
      tools: [...this.#tools.values()].map((tool) => tool.spec),
      call: (name, args) => this.dispatch(ctx, name, args),
    }
  }

  /**
   * The turn settled: the token dies, and a conversation renamed during the
   * turn is compacted NOW — after the finish closure's own appends, and under
   * the desk's serialization, so the rewrite races nothing of this turn's.
   */
  async release(handle: ShellToolsHandle): Promise<void> {
    const entry = this.#tokens.get(handle.token)
    this.#tokens.delete(handle.token)
    if (!entry) return
    const key = `${entry.ctx.userId}/${entry.ctx.conversationId}`
    if (this.#renamed.delete(key)) {
      await this.#conversations
        .compact(entry.ctx.userId, entry.ctx.conversationId)
        .catch(() => undefined)
    }
  }

  /** The one dispatch — the in-process path and the socket both end here. */
  async dispatch(
    ctx: ShellToolContext,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<ShellToolOutcome> {
    const tool = this.#tools.get(name)
    if (!tool) return { ok: false, error: `unknown tool "${name}"` }

    const picked: Record<string, string> = {}
    for (const param of tool.spec.params) {
      const value = args[param.name]
      if (value === undefined || value === null) {
        if (!param.optional) return { ok: false, error: `parameter "${param.name}" is required` }
        continue
      }
      if (typeof value !== 'string') {
        return { ok: false, error: `parameter "${param.name}" must be a string` }
      }
      picked[param.name] = value
    }

    try {
      return { ok: true, text: await tool.handler(ctx, picked) }
    } catch (error) {
      if (error instanceof ShellToolError) return { ok: false, error: error.message }
      // Anything else is the instance's problem, not the agent's prompt.
      this.#log(`shell tool "${name}" failed: ${(error as Error).message}`)
      return { ok: false, error: `tool "${name}" failed on the server` }
    }
  }

  #resolve(token: string | undefined): ShellToolContext | undefined {
    if (!token) return undefined
    const entry = this.#tokens.get(token)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.#tokens.delete(token)
      return undefined
    }
    return entry.ctx
  }

  /**
   * One socket connection: newline-delimited JSON-RPC, the MCP subset a tool
   * server needs. Engines open several connections per turn (measured), so a
   * connection holds nothing but the token its bridge announced.
   */
  #serve(connection: Socket): void {
    this.#connections.add(connection)
    let token: string | undefined
    let buffer = ''

    const reply = (id: unknown, result: unknown): void => {
      connection.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
    }

    const handle = async (message: {
      id?: unknown
      method?: string
      params?: {
        protocolVersion?: string
        token?: string
        name?: string
        arguments?: Record<string, unknown>
      }
    }): Promise<void> => {
      switch (message.method) {
        case 'bridge/hello':
          token = typeof message.params?.token === 'string' ? message.params.token : undefined
          return
        case 'initialize':
          return reply(message.id, {
            protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'adestia', version: '1' },
          })
        case 'notifications/initialized':
          return
        case 'tools/list':
          return reply(message.id, {
            tools: [...this.#tools.values()].map(({ spec }) => ({
              name: spec.name,
              description: spec.description,
              inputSchema: {
                type: 'object',
                properties: Object.fromEntries(
                  spec.params.map((param) => [
                    param.name,
                    { type: 'string', description: param.description },
                  ]),
                ),
                required: spec.params.filter((param) => !param.optional).map((param) => param.name),
              },
            })),
          })
        case 'tools/call': {
          const ctx = this.#resolve(token)
          // Worded for the agent: `isError` reaches the model, a JSON-RPC
          // error reaches a log nobody watches mid-turn.
          const outcome = ctx
            ? await this.dispatch(ctx, message.params?.name ?? '', message.params?.arguments ?? {})
            : { ok: false as const, error: 'this turn\'s token is unknown or expired' }
          return reply(message.id, {
            content: [{ type: 'text', text: outcome.ok ? outcome.text : outcome.error }],
            ...(outcome.ok ? {} : { isError: true }),
          })
        }
        default:
          // `ping` and whatever else a client sends with an id: answer rather
          // than stall a handshake on a method a tool server does not care about.
          if (message.id !== undefined) reply(message.id, {})
      }
    }

    connection.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (line.trim() === '') continue
        try {
          void handle(JSON.parse(line) as Parameters<typeof handle>[0])
        } catch {
          this.#log('shell tools socket: unparseable frame dropped')
        }
      }
    })
    connection.on('error', () => connection.destroy())
    connection.on('close', () => this.#connections.delete(connection))
  }
}

/**
 * The generic bridge, embedded rather than shipped as an asset: the server
 * writes it under its own data directory at start, which keeps the path real
 * in every deployment — compiled, dev server, container — without asking the
 * build system to carry a loose file. It knows nothing about MCP: it
 * announces the turn's token, then pipes bytes.
 */
const BRIDGE_SOURCE = `// The Adestia stdio<->socket bridge. Written by the server at start; carries
// no secret (socket path and turn token arrive in this process's env).
import { connect } from 'node:net'

const socket = process.env.ADESTIA_TOOLS_SOCKET
if (!socket) {
  console.error('adestia bridge: ADESTIA_TOOLS_SOCKET is not set')
  process.exit(2)
}

const conn = connect(socket)

conn.on('connect', () => {
  conn.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'bridge/hello',
      params: { token: process.env.ADESTIA_TOOLS_TOKEN ?? null },
    }) + '\\n',
  )
  process.stdin.pipe(conn)
  conn.pipe(process.stdout)
})

conn.on('error', (error) => {
  // Loud, so the engine reports a failed server instead of hanging on a pipe.
  console.error('adestia bridge: socket unreachable: ' + error.message)
  process.exit(1)
})

conn.on('close', () => process.exit(0))
process.stdin.on('end', () => process.exit(0))
`
