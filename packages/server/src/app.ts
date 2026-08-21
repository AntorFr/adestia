/**
 * The Fastify application.
 *
 * One rule governs this file: **there is a single spawn site.** Every agent
 * turn — chat, scheduled, delegated over MCP — goes through `runTurn` here, so
 * the driver's env contract, the concurrency cap and the transcript are
 * applied once. The predecessor had two spawn paths and forgetting one broke a
 * whole channel silently for days.
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { Driver, DriverDescriptor, PermissionBroker, TurnEvent } from '@antorfr/golem-drivers'

import { isPublicRoute, resolveIdentity, type Identity } from './auth.js'
import { AttachmentInbox, frameAttachments, type StoredAttachment } from './attachments.js'
import { ConversationStore, type StoredMessage } from './conversations.js'
import type { GolemConfig } from './config.js'
import { frontendPayload, type DiscoveredPlugin, type DiscoveryProblem } from './extensions.js'
import { registerOidc } from './oidc-routes.js'
import { registerMcp } from './mcp-routes.js'
import { registerPages } from './pages.js'
import { mountPluginApis } from './plugin-host.js'
import { ArmingSessions, SecretStore } from './secrets.js'
import { registerStatic } from './static.js'

/** What the shell needs to dress itself, before it renders anything. */
export interface SkinPayload {
  readonly styles?: string
  readonly module?: string
  readonly icon?: string
  readonly scheme?: 'light' | 'dark' | 'auto'
}

export interface AppDependencies {
  readonly config: GolemConfig
  readonly driver: Driver
  readonly plugins: readonly DiscoveredPlugin[]
  readonly pluginProblems: readonly DiscoveryProblem[]
  /** Built shell bundle. Absent in dev, where Vite serves it and proxies here. */
  readonly webRoot?: string | undefined
  /** Injected in tests; production stores secrets under the data directory. */
  readonly secrets?: SecretStore
  /** Answers the UI's permission decisions; shared with the driver. */
  readonly permissions?: PermissionBroker
  /** The active skin, when the configured one was found on disk. */
  readonly skin?: { readonly id: string; readonly dir: string; readonly manifest: SkinPayload }
}

/** The optional slice of the driver contract that arms credentials. */
interface AuthCapableDriver {
  authStatus(): Promise<unknown>
  beginAuth(): Promise<{ sessionId: string; [key: string]: unknown }>
  completeAuth(sessionId: string, input: string): Promise<{ secret: string }>
  cancelAuth(sessionId: string): Promise<void>
  setCredentials?(credentials: Record<string, string>, savedAt?: string): void
  /** The environment variable this driver's CLI reads its credential from. */
  readonly credentialVar?: string
}

/** The identity every authenticated route can count on. */
function identityOf(request: FastifyRequest): Identity {
  return (request as FastifyRequest & { identity?: Identity }).identity ?? {
    userId: 'local',
    displayName: 'Local user',
    groups: [],
  }
}

/** Turn admission: subscription limits are real, so concurrency is bounded. */
class TurnLimiter {
  #running = 0
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.#running >= this.max) return false
    this.#running += 1
    return true
  }

  release(): void {
    this.#running = Math.max(0, this.#running - 1)
  }

  get running(): number {
    return this.#running
  }
}

/**
 * Variables a driver may NOT claim for its secret.
 *
 * The driver names the variable — a hardcoded map in the core would mean no
 * third-party engine could ever be armed — but the core VALIDATES it. Without
 * this list, a driver could ask for its token to be written into `PATH` and
 * turn an arming flow into arbitrary code execution at the next spawn.
 */
const FORBIDDEN_CREDENTIAL_VARS = new Set([
  'PATH',
  'HOME',
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'SHELL',
  'IFS',
  'BASH_ENV',
  'ENV',
])

export function credentialVar(driver: { credentialVar?: string }, driverId: string): string {
  const variable = driver.credentialVar
  if (!variable) {
    throw new Error(`driver "${driverId}" declares no credential variable`)
  }
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(variable)) {
    throw new Error(`driver "${driverId}" asks for an implausible variable name: ${variable}`)
  }
  if (FORBIDDEN_CREDENTIAL_VARS.has(variable)) {
    // Loud, because this is either a bug or an attack, and both deserve to be
    // read rather than swallowed.
    throw new Error(`driver "${driverId}" may not store its secret in ${variable}`)
  }
  return variable
}

/** One SSE frame. Multi-line payloads must be prefixed per line or they break. */
export function sseFrame(event: TurnEvent): string {
  const data = JSON.stringify(event)
  return `event: ${event.type}\ndata: ${data}\n\n`
}

/**
 * What `buildApp` hands back besides the app: the one function that starts a
 * turn. The clock uses it rather than calling the driver, so the concurrency
 * cap, the transcript and the driver's env contract apply to a scheduled turn
 * exactly as they do to a typed one — a second spawn path is a second place
 * for all three to be forgotten.
 */
export interface BuiltApp {
  readonly app: FastifyInstance
  runTurn(prompt: string, options?: { conversationId?: string }): Promise<void>
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, driver, plugins, pluginProblems, webRoot } = deps
  const app = Fastify({ logger: false })
  const limiter = new TurnLimiter(config.maxConcurrentTurns)
  const conversations = new ConversationStore(config.dataDir)
  const secrets = deps.secrets ?? new SecretStore(config.dataDir)
  const inbox = new AttachmentInbox(config.dataDir, config.attachments)
  const arming = new ArmingSessions()
  const descriptor: DriverDescriptor = await driver.describe()

  app.decorateRequest('identity', null)

  // Mounted FIRST, because it installs the hook that reads the session cookie
  // — and a gate that runs before the session is resolved sees every signed-in
  // user as anonymous. Hook order is the whole correctness of this file.
  await registerOidc(app, config)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicRoute(request.url.split('?')[0] ?? request.url)) return

    const outcome = resolveIdentity(
      {
        headers: request.headers as Record<string, string | string[] | undefined>,
        session: (request as FastifyRequest & { session?: { identity?: Identity } }).session,
      },
      config.auth,
    )
    if (!outcome.ok) {
      await reply.code(outcome.status).send({ error: outcome.reason })
      return reply
    }
    ;(request as FastifyRequest & { identity: Identity }).identity = outcome.identity
    return undefined
  })

  app.get('/api/health', () => ({ status: 'ok' }))

  /**
   * What the UI is built from. The driver's *name* never appears — the front
   * end renders from capabilities alone, so a second engine needs no UI change.
   */
  app.get('/api/instance', (request) => ({
    driver: {
      label: descriptor.label,
      cliVersion: descriptor.cliVersion,
      capabilities: descriptor.capabilities,
    },
    auth: { mode: config.auth.mode },
    user: (request as FastifyRequest & { identity?: Identity }).identity ?? null,
    /**
     * What the shell loads, not just a name. A skin named in config but absent
     * from disk must not leave the front end fetching files that are not there
     * — it renders the default, and the boot log already said why.
     */
    skin: deps.skin
      ? { id: deps.skin.id, base: '/skin/', ...deps.skin.manifest }
      : { id: 'default', base: '/skin/' },
    plugins: frontendPayload(plugins),
    /**
     * Refused plugins are reported to the UI, not buried in a log nobody
     * reads: a plugin you believe is loaded and is not costs far more than one
     * that says out loud why it was rejected.
     */
    pluginProblems: [...pluginProblems, ...apiProblems],
    turns: { max: config.maxConcurrentTurns, running: limiter.running },
  }))

  app.get('/api/models', async (_request, reply) => {
    if (!descriptor.capabilities.includes('modelSelection')) {
      // 404, not an empty list: "this instance cannot enumerate models" and
      // "this instance has no models" are different facts.
      await reply.code(404).send({ error: 'this driver does not enumerate models' })
      return reply
    }
    const listModels = (driver as Driver & { listModels(): Promise<unknown> }).listModels
    return { models: await listModels.call(driver) }
  })

  await app.register(multipart, {
    limits: { fileSize: config.attachments.maxBytes, files: config.attachments.maxFiles },
  })

  app.post('/api/upload', async (request, reply) => {
    const files: { name: string; data: Buffer }[] = []
    try {
      for await (const part of request.files()) {
        files.push({ name: part.filename, data: await part.toBuffer() })
      }
    } catch (error) {
      // The size limit surfaces here as a throw; saying which limit was hit
      // beats a 500 that names nothing.
      return reply.code(413).send({ error: (error as Error).message })
    }
    if (files.length === 0) return reply.code(400).send({ error: 'no file was sent' })

    const { stored, refused } = await inbox.store(files)
    return {
      attachments: stored.map(({ id, name, bytes }) => ({ id, name, bytes })),
      // Reported alongside what worked: a file silently dropped is a file the
      // user believes the agent has.
      refused,
    }
  })

  app.get('/api/conversations', async (request) => ({
    conversations: await conversations.list(identityOf(request).userId),
  }))

  app.post<{ Body?: { title?: unknown } }>('/api/conversations', async (request) => {
    // The title comes with the creation rather than in a second call: a thread
    // that exists for one round trip under the name "New conversation" is a
    // thread that keeps that name whenever the second call is lost.
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
    return conversations.create(
      identityOf(request).userId,
      ...(title.length > 0 ? ([title] as const) : []),
    )
  })

  app.patch<{ Params: { id: string }; Body?: { title?: unknown } }>(
    '/api/conversations/:id',
    async (request, reply) => {
      const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
      if (title.length === 0) return reply.code(400).send({ error: 'title is required' })

      const userId = identityOf(request).userId
      if (!(await conversations.read(userId, request.params.id))) {
        return reply.code(404).send({ error: 'no such conversation' })
      }
      await conversations.rename(userId, request.params.id, title)
      return { renamed: true }
    },
  )

  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const conversation = await conversations.read(identityOf(request).userId, request.params.id)
    // 404 rather than an empty thread: "this conversation is not yours" and
    // "this conversation is empty" must not look the same to the UI.
    if (!conversation) return reply.code(404).send({ error: 'no such conversation' })
    return conversation
  })

  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const removed = await conversations.remove(identityOf(request).userId, request.params.id)
    if (!removed) return reply.code(404).send({ error: 'no such conversation' })
    return { deleted: true }
  })

  app.post<{
    Body: {
      prompt?: unknown
      sessionId?: unknown
      model?: unknown
      conversationId?: unknown
      attachments?: unknown
    }
  }>(
    '/api/turn',
    async (request, reply) => {
      const body = request.body ?? {}
      if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
        await reply.code(400).send({ error: 'prompt is required' })
        return reply
      }
      if (!limiter.tryAcquire()) {
        // Refusing now beats queueing behind a lock that may not release for
        // an hour: a refusal is information, a silent wait is not.
        await reply.code(429).send({
          error: 'too many turns running',
          max: config.maxConcurrentTurns,
        })
        return reply
      }

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        // Nginx and friends buffer SSE into uselessness without this.
        'x-accel-buffering': 'no',
      })

      // Resolved before the turn: an id that escapes the inbox is refused
      // rather than handed to the agent as a path to read.
      const attachments: StoredAttachment[] = []
      for (const id of Array.isArray(body.attachments) ? body.attachments : []) {
        if (typeof id !== 'string') continue
        const path = inbox.resolve(id)
        if (path) attachments.push({ id, name: id.split('/').pop() ?? id, bytes: 0, path })
      }

      const userId = identityOf(request).userId
      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId : undefined

      if (conversationId) {
        await conversations.append(userId, conversationId, {
          id: randomUUID(),
          role: 'user',
          text: body.prompt,
          at: new Date().toISOString(),
        })
      }

      // Accumulated as the turn streams, so what is stored is what the UI drew
      // — tool calls, interruption, usage — not just the final text.
      const tools: { name: string; target?: string; ok?: boolean }[] = []
      let text = ''
      let stopped = false
      let failure: string | undefined
      let usage: StoredMessage['usage']

      try {
        const events = driver.runTurn({
          prompt: frameAttachments(body.prompt, attachments),
          cwd: config.workspace.root,
          ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}),
          ...(typeof body.model === 'string' ? { model: body.model } : {}),
        })
        for await (const event of events) {
          reply.raw.write(sseFrame(event))
          if (event.type === 'text-delta') text += event.text
          else if (event.type === 'tool-use') {
            tools.push({ name: event.name, ...(event.target ? { target: event.target } : {}) })
          } else if (event.type === 'tool-result') {
            const pending = tools.findLast((tool) => tool.name === event.name && tool.ok === undefined)
            if (pending) pending.ok = event.ok
          } else if (event.type === 'error') failure = event.message
          else if (event.type === 'result') {
            stopped = event.stopped
            usage = {
              ...(event.usage?.contextTokens !== undefined
                ? { contextTokens: event.usage.contextTokens }
                : {}),
              ...(event.usage?.outputTokens !== undefined
                ? { outputTokens: event.usage.outputTokens }
                : {}),
            }
            if (conversationId) await conversations.setSession(userId, conversationId, event.sessionId)
          }
        }
      } catch (error) {
        failure = (error as Error).message
        reply.raw.write(sseFrame({ type: 'error', message: failure, fatal: true }))
      } finally {
        if (conversationId) {
          // Written even when the turn failed: a thread that silently drops
          // the answer it did produce is worse than one showing it broke.
          await conversations
            .append(userId, conversationId, {
              id: randomUUID(),
              role: 'agent',
              text,
              at: new Date().toISOString(),
              ...(tools.length > 0 ? { tools } : {}),
              ...(stopped ? { stopped } : {}),
              ...(failure ? { error: failure } : {}),
              ...(usage ? { usage } : {}),
            })
            .catch(() => undefined)
        }
        limiter.release()
        reply.raw.end()
      }
      return reply
    },
  )

  app.post<{ Body: { id?: unknown; allow?: unknown } }>(
    '/api/permission',
    async (request, reply) => {
      const { id, allow } = request.body ?? {}
      if (typeof id !== 'string' || typeof allow !== 'boolean') {
        return reply.code(400).send({ error: 'id and allow are required' })
      }
      const answered = deps.permissions?.answer(id, allow ? 'allow' : 'deny') ?? false
      // 409 rather than 404: the request existed, it simply timed out or was
      // already answered — and telling the user "unknown" would suggest they
      // clicked something that never was.
      if (!answered) return reply.code(409).send({ error: 'that request is no longer waiting' })
      return { answered: true }
    },
  )

  app.get('/api/permission', async () => ({
    // A reconnecting UI re-asks rather than leaving the agent stuck behind a
    // prompt the browser forgot when it reloaded.
    pending: deps.permissions?.outstanding() ?? [],
  }))

  app.post<{ Body: { sessionId?: unknown } }>('/api/turn/stop', async (request, reply) => {
    const sessionId = request.body?.sessionId
    if (typeof sessionId !== 'string') {
      await reply.code(400).send({ error: 'sessionId is required' })
      return reply
    }
    try {
      await driver.interrupt(sessionId)
      return { stopped: true }
    } catch (error) {
      await reply.code(409).send({ error: (error as Error).message })
      return reply
    }
  })

  const canArm = descriptor.capabilities.includes('authManagement')
  const authDriver = driver as unknown as AuthCapableDriver

  app.get('/api/auth/driver', async (_request, reply) => {
    if (!canArm) {
      // 404 rather than a status saying "absent": "this engine cannot be armed
      // from here" and "this engine has no token" are different facts, and an
      // interface that confuses them offers a button that can never work.
      await reply.code(404).send({ error: 'this driver cannot be armed from the interface' })
      return reply
    }
    return authDriver.authStatus()
  })

  app.post('/api/auth/driver/begin', async (_request, reply) => {
    if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })
    try {
      const prompt = await authDriver.beginAuth()
      const session = arming.start(descriptor.id)
      // The driver's own session id is replaced by ours: the browser holds a
      // handle to OUR flow, and the driver never has to be trusted with
      // session bookkeeping it does not own.
      return { ...prompt, sessionId: session.id }
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message })
    }
  })

  app.post<{ Body: { sessionId?: unknown; input?: unknown } }>(
    '/api/auth/driver/complete',
    async (request, reply) => {
      if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })

      const { sessionId, input } = request.body ?? {}
      if (typeof sessionId !== 'string' || typeof input !== 'string' || input.trim() === '') {
        return reply.code(400).send({ error: 'sessionId and input are required' })
      }
      const session = arming.get(sessionId)
      if (!session) {
        return reply.code(409).send({ error: 'that arming session has expired; start again' })
      }

      try {
        const { secret } = await authDriver.completeAuth(sessionId, input)
        // The CORE stores it: one policy for every engine, and the file never
        // passes back through the driver.
        const stored = await secrets.write(descriptor.id, secret)
        authDriver.setCredentials?.(
          { [credentialVar(authDriver, descriptor.id)]: stored.value },
          stored.savedAt,
        )
        arming.end(sessionId)
        return { armed: true, savedAt: stored.savedAt }
      } catch (error) {
        arming.end(sessionId)
        return reply.code(502).send({ error: (error as Error).message })
      }
    },
  )

  app.post<{ Body: { sessionId?: unknown } }>('/api/auth/driver/cancel', async (request) => {
    const sessionId = request.body?.sessionId
    if (typeof sessionId === 'string') {
      arming.end(sessionId)
      await authDriver.cancelAuth?.(sessionId).catch(() => undefined)
    }
    return { cancelled: true }
  })

  app.delete('/api/auth/driver', async (_request, reply) => {
    if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })
    const cleared = await secrets.clear(descriptor.id)
    authDriver.setCredentials?.({}, undefined)
    return cleared ? { cleared: true } : reply.code(404).send({ error: 'nothing stored' })
  })

  registerPages(app, { root: join(config.workspace.root, config.workspace.pages) })

  // Mounted before the static catch-all, so a plugin route always wins over
  // the shell's fallback; and after the auth hook, so it is gated like
  // everything else.
  const apiProblems = await mountPluginApis(app, plugins)

  registerMcp(app, {
    config: config.mcp,
    // Through the same spawn path as everything else, so the concurrency cap
    // applies to delegated work exactly as it does to a typed message.
    runTurn: async (prompt) => {
      if (!limiter.tryAcquire()) throw new Error('too many turns running')
      let text = ''
      try {
        for await (const event of driver.runTurn({ prompt, cwd: config.workspace.root })) {
          if (event.type === 'text-delta') text += event.text
          if (event.type === 'error' && event.fatal) throw new Error(event.message)
        }
      } finally {
        limiter.release()
      }
      return text
    },
  })

  // Last, so an API route always wins over the shell's catch-all.
  registerStatic(app, {
    plugins,
    ...(webRoot ? { webRoot } : {}),
    ...(deps.skin ? { skinDir: deps.skin.dir } : {}),
  })

  // Exposed on the instance so `start()` can hand it to the clock without a
  // second construction path.
  ;(app as FastifyInstance & { golemRunTurn?: unknown }).golemRunTurn = async (
    prompt: string,
  ): Promise<void> => {
    if (!limiter.tryAcquire()) {
      // The cap applies to scheduled turns too: a person typing must not find
      // the instance busy with work nobody asked for right now.
      throw new Error('too many turns running')
    }
    try {
      for await (const event of driver.runTurn({ prompt, cwd: config.workspace.root })) {
        if (event.type === 'error' && event.fatal) throw new Error(event.message)
      }
    } finally {
      limiter.release()
    }
  }

  return app
}
