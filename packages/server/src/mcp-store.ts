/**
 * MCP servers the SHELL wrote — the fourth layer, and the only writable one.
 *
 * The design names three sources for an outbound server: the operator's
 * `mcp:` block, a plugin's manifest, and the CLI's own config (which is the
 * user's business and stays untouched). None of the three can be edited from
 * a browser, and that was fine while MCP wiring was something you did once
 * with a text editor. It stops being fine the moment the product offers a
 * screen with an "add a server" button on it.
 *
 * The obvious implementation — have the shell rewrite `adestia.config.yaml` —
 * was refused for two reasons that are both about the operator rather than
 * about us. That file is hand-written and commented, and a serializer would
 * hand it back stripped of every comment somebody wrote to explain why a
 * server is there. And in the deployment this product is built for it is a
 * mounted file, often read-only, so the button would fail on exactly the
 * instances that matter.
 *
 * So the shell gets its own file, in the data directory, and the operator's
 * stays theirs. Which leaves precedence, and the answer here is NEITHER wins:
 * a name already held by the config or by a plugin is REFUSED, loudly, at the
 * moment somebody tries to add it. Shadowing would make "where does this
 * server come from" a question with two answers again, which is the one thing
 * the merge in `extensions.ts` exists to prevent.
 *
 * The file holds bearers, so it is written 0600 through a temporary file, and
 * nothing in it is ever handed to the browser unmasked — see `maskServer`.
 */

import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import { readMcpServer, type McpServerConfig } from './config.js'

/**
 * What a secret reads as once it has left the server.
 *
 * It travels in both directions on purpose: a value that comes BACK still
 * equal to the mask means "the one you are holding", which is what lets
 * somebody edit a server's URL without being asked to re-type its token. A
 * sentinel rather than an omission, because an omitted key and a key somebody
 * deleted have to stay tellable apart.
 */
export const MCP_MASK = '••••••'

/** Where a server was declared. Only `ui` is ours to change. */
export type McpSource = 'config' | 'plugin' | 'ui'

export interface McpServerView {
  readonly name: string
  readonly source: McpSource
  /** The plugin that brought it, when one did. */
  readonly owner?: string
  readonly editable: boolean
  readonly transport: 'stdio' | 'http'
  /** The declaration itself, secrets masked. What the detail screen draws. */
  readonly config: Readonly<Record<string, unknown>>
  /**
   * A `ui` server whose name the config or a plugin has since taken.
   *
   * The write path refuses a collision, so this only happens when a file was
   * edited behind us — and a server silently doing nothing is exactly the
   * failure the layered merge exists to make visible.
   */
  readonly shadowed?: boolean
}

/** The fields that are credentials, and therefore never leave as themselves. */
function maskMap(
  map: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  if (!map) return undefined
  return Object.fromEntries(Object.keys(map).map((key) => [key, MCP_MASK]))
}

/**
 * A server as the browser may see it.
 *
 * Every `env` and `header` value goes, not just the ones that look like a
 * token: which of them is a secret is the operator's knowledge, not a pattern
 * we can match, and guessing wrong leaks the one that mattered. The KEYS
 * stay — a server is unreadable without them, and a key is wiring.
 */
export function maskServer(server: McpServerConfig): Record<string, unknown> {
  const { name, identity, command, args, url, env, headers, auth } = server
  return {
    name,
    ...(identity ? { identity } : {}),
    ...(command ? { command } : {}),
    ...(args ? { args } : {}),
    ...(url ? { url } : {}),
    ...(env ? { env: maskMap(env) } : {}),
    ...(headers ? { headers: maskMap(headers) } : {}),
    ...(auth
      ? {
          auth: {
            tokenUrl: auth.tokenUrl,
            clientId: auth.clientId,
            ...(auth.clientSecret ? { clientSecret: MCP_MASK } : {}),
            ...(auth.refreshToken ? { refreshToken: MCP_MASK } : {}),
            ...(auth.scope ? { scope: auth.scope } : {}),
            ...(auth.audience ? { audience: auth.audience } : {}),
          },
        }
      : {}),
  }
}

/** Whether a value came back untouched from `maskServer`. */
const isMask = (value: unknown): boolean => value === MCP_MASK

/**
 * A proposed declaration, with every mask put back to what is on disk.
 *
 * Run BEFORE validation, so the grammar judges the real thing: a `${VAR}` left
 * unresolved is refused by the same rule whether it was typed here or in the
 * YAML, and a mask standing in for a value that is not there is caught as the
 * mistake it is rather than stored as six bullet characters.
 */
export function unmaskServer(
  proposed: Readonly<Record<string, unknown>>,
  stored: McpServerConfig | undefined,
  issues: string[],
): Record<string, unknown> {
  const restored: Record<string, unknown> = { ...proposed }

  for (const field of ['env', 'headers'] as const) {
    const value = proposed[field]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const held = stored?.[field] ?? {}
    restored[field] = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (!isMask(item)) return [key, item]
        const kept = held[key]
        if (kept === undefined) {
          issues.push(`${field}.${key} is still the mask, and there is no stored value behind it`)
          return [key, item]
        }
        return [key, kept]
      }),
    )
  }

  const auth = proposed['auth']
  if (auth !== null && typeof auth === 'object' && !Array.isArray(auth)) {
    const held = stored?.auth
    const copy: Record<string, unknown> = { ...(auth as Record<string, unknown>) }
    for (const field of ['clientSecret', 'refreshToken'] as const) {
      if (!isMask(copy[field])) continue
      const kept = held?.[field]
      if (kept === undefined) {
        issues.push(`auth.${field} is still the mask, and there is no stored value behind it`)
        continue
      }
      copy[field] = kept
    }
    restored['auth'] = copy
  }

  return restored
}

/**
 * The shell's own servers, on disk.
 *
 * Writes are serialized through one chain: two requests editing two different
 * servers at once would otherwise read-modify-write the same file and lose
 * one of them — the same failure `FileRefreshStore` guards against, for the
 * same reason.
 */
export class McpStore {
  readonly #path: string
  #queue: Promise<unknown> = Promise.resolve()
  /**
   * The last list read or written, so the DRIVER can be asked synchronously.
   *
   * A driver builds its server map at the spawn site, which is not a place
   * that can await a file. Every route that touches this store goes through
   * `list()` or `save()`, and both refresh this — so what the agent is handed
   * on the next turn is what the screen last showed.
   */
  #cache: readonly McpServerConfig[] = []

  constructor(dataDir: string) {
    this.#path = join(dataDir, 'mcp-servers.json')
  }

  /** The last known list, without touching the disk. */
  current(): readonly McpServerConfig[] {
    return this.#cache
  }

  /**
   * What is stored, validated on the way out.
   *
   * A file somebody hand-edited into nonsense yields the entries that still
   * parse rather than an exception: an instance must boot, and a server that
   * cannot be read is a server that is absent, which the screen can say.
   */
  async list(): Promise<readonly McpServerConfig[]> {
    let raw: string
    try {
      raw = await readFile(this.#path, 'utf8')
    } catch {
      this.#cache = []
      return this.#cache
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.#cache = []
      return this.#cache
    }
    const servers = (parsed as { servers?: unknown })?.servers
    if (!Array.isArray(servers)) {
      this.#cache = []
      return this.#cache
    }
    const kept: McpServerConfig[] = []
    for (const [index, entry] of servers.entries()) {
      const server = readMcpServer(entry, `servers[${index}]`, [])
      if (server) kept.push(server)
    }
    this.#cache = kept
    return this.#cache
  }

  /** Replaces the whole list, atomically and at 0600. */
  async save(servers: readonly McpServerConfig[]): Promise<void> {
    const write = this.#queue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true })
      const temporary = `${this.#path}.${randomUUID()}.tmp`
      try {
        // The mode is set at creation rather than after: a file created 0644
        // and chmod-ed is world-readable for as long as that takes, and it
        // holds bearers.
        await writeFile(temporary, `${JSON.stringify({ servers }, null, 2)}\n`, { mode: 0o600 })
        await chmod(temporary, 0o600)
        await rename(temporary, this.#path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
      // Only once it is on disk: a cache updated before the write would hand
      // the agent a server that a failed rename never actually stored.
      this.#cache = servers
    })
    this.#queue = write.catch(() => undefined)
    await write
  }
}
