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
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type {
  AskAnswer,
  AskDesk,
  Driver,
  DriverDescriptor,
  ShellToolsHandle,
  TurnEvent,
} from '@antorfr/adestia-drivers'

import { isPublicRoute, resolveIdentity, type Identity } from './auth.js'
import { AttachmentInbox, frameAttachments, type StoredAttachment } from './attachments.js'
import { frameView } from './screen.js'
import { ConversationStore } from './conversations.js'
import { readMcpServer, type AdestiaConfig } from './config.js'
import { frontendPayload, type DiscoveredPlugin, type DiscoveryProblem } from './extensions.js'
import {
  describeInstructionPaths,
  isManaged,
  listInstructions,
  safeInstructionPath,
  writeInstruction,
} from './instructions.js'
import { MANAGED_MARKER } from './skills.js'
import { McpStore, maskServer, unmaskServer, type McpServerView } from './mcp-store.js'
import { registerOidc } from './oidc-routes.js'
import { registerMcp } from './mcp-routes.js'
import { registerFiles } from './files.js'
import { registerPages } from './pages.js'
import { ConfigError } from './config.js'
import { foreignRoots, pagesService, resolveStores } from './stores.js'
import { registerEvents } from './watch.js'
import { mountPluginApis } from './plugin-host.js'
import { ArmingSessions, SecretStore } from './secrets.js'
import { registerStatic } from './static.js'
import { TurnCapacityError, TurnDesk, type TurnJob, type TurnSpec } from './turns.js'
import { baseManifest, withInstanceName, type WebManifest } from './webmanifest.js'

/** What the shell needs to dress itself, before it renders anything. */
export interface SkinPayload {
  readonly styles?: string
  readonly module?: string
  readonly icon?: string
  readonly scheme?: 'light' | 'dark' | 'auto'
}

export interface AppDependencies {
  readonly config: AdestiaConfig
  readonly driver: Driver
  readonly plugins: readonly DiscoveredPlugin[]
  readonly pluginProblems: readonly DiscoveryProblem[]
  /**
   * Per-user tokens, when the instance keeps them.
   *
   * Present only in `oidc` mode with a rebound audience configured. Its
   * absence is what makes a turn have no caller, and therefore no reach into
   * anybody's own data.
   */
  readonly userTokens?: {
    accessToken(subject: string): Promise<string | undefined>
    remember(subject: string, refreshToken: string): Promise<void>
  }
  /** Built shell bundle. Absent in dev, where Vite serves it and proxies here. */
  readonly webRoot?: string | undefined
  /** Injected in tests; production stores secrets under the data directory. */
  readonly secrets?: SecretStore
  /**
   * The servers the shell itself wrote. Injected the way `secrets` is.
   *
   * Handed in rather than built here whenever the process already holds one:
   * `start()` keeps the very same instance in the driver's hands, so a server
   * added from a browser is wired on the next turn instead of the next boot.
   */
  readonly mcpStore?: McpStore
  /**
   * Where the engine's questions wait, in `ask` posture. Absent in `open`,
   * where nothing ever asks and the answer route is not mounted at all.
   */
  readonly asks?: AskDesk
  /**
   * The instance's own tools (`shell-tools.ts`), started by `start()` and
   * injected: the service listens on a unix socket, and an app built bare —
   * every test — must not open one as a side effect. Absent, a chat turn
   * simply carries no tools, the way a scheduled turn always does.
   */
  readonly shellTools?: {
    handleFor(ctx: { userId: string; conversationId: string }): ShellToolsHandle
    release(handle: ShellToolsHandle): Promise<void>
  }
  /** The active skin, when the configured one was found on disk. */
  readonly skin?: { readonly id: string; readonly dir: string; readonly manifest: SkinPayload }
  /**
   * The merged web app manifest. Built at boot rather than per request: the
   * skin's fragment is read from disk once, and the fields it declared off
   * contract are reported there, with the rest of the extension problems.
   */
  readonly webManifest?: WebManifest | undefined
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
  const { config, driver, plugins, pluginProblems, userTokens, webRoot } = deps
  const app = Fastify({ logger: false })
  const limiter = new TurnLimiter(config.maxConcurrentTurns)
  // The desk owns chat turns; the clock's and the MCP delegation's loops below
  // stay as they are and share the same limiter, so the cap keeps one meaning.
  const desk = new TurnDesk(driver, limiter)
  const conversations = new ConversationStore(config.dataDir)
  const secrets = deps.secrets ?? new SecretStore(config.dataDir)
  const mcpStore = deps.mcpStore ?? new McpStore(config.dataDir)
  const inbox = new AttachmentInbox(config.dataDir, config.attachments)
  const arming = new ArmingSessions()
  const descriptor: DriverDescriptor = await driver.describe()

  app.decorateRequest('identity', null)

  // Mounted FIRST, because it installs the hook that reads the session cookie
  // — and a gate that runs before the session is resolved sees every signed-in
  // user as anonymous. Hook order is the whole correctness of this file.
  await registerOidc(app, config, userTokens)

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
      /*
       * A person opening the page gets SENT to sign in; anything else gets the
       * refusal as JSON.
       *
       * This path never ran while the instance sat behind a reverse proxy that
       * authenticated for it: the proxy bounced the browser and Adestia only
       * ever saw requests that already had an identity. Becoming an OIDC
       * client means owning that bounce — otherwise a person typing the
       * address lands on `{"error":"not signed in"}`, which is a correct
       * answer to a question they did not ask.
       *
       * Narrow on purpose: only a GET that asks for a document. A fetch from
       * the already-loaded shell must keep receiving its 401, or the front
       * would parse a login page as data and report something absurd.
       */
      const wantsDocument =
        request.method === 'GET' && String(request.headers.accept ?? '').includes('text/html')
      if (wantsDocument && config.auth.mode === 'oidc') {
        await reply.redirect(`/auth/login?returnTo=${encodeURIComponent(request.url)}`)
        return reply
      }
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
    /**
     * What the operator called this instance, when they called it anything.
     *
     * The shell needs it, not just the manifest: iOS proposes the DOCUMENT
     * TITLE when someone adds the page to their home screen, so a name that
     * only reached the manifest would be ignored on the platform it was most
     * wanted for.
     */
    ...(config.name ? { name: config.name } : {}),
    /**
     * Absent when the operator set none — the shell then asks the browser,
     * which is what lets one instance answer two visitors in their own
     * languages.
     */
    ...(config.locale ? { locale: config.locale } : {}),
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

  /**
   * The instruction zone: prose a person may read and correct.
   *
   * 404 when the driver declares none, the same shape as the other
   * driver-gated routes: "this engine has no such concept" and "you have
   * written none" are different facts.
   */
  app.get('/api/instructions', async (_request, reply) => {
    const paths = driver.instructionPaths?.() ?? []
    if (paths.length === 0) {
      await reply.code(404).send({ error: 'this driver declares no instruction zone' })
      return reply
    }
    return {
      files: await listInstructions(config.workspace.root, paths),
      // Where one may be CREATED. A zone with nothing in it and no way to put
      // anything there is a dead end: the listing shows what exists, and a
      // fresh instance has nothing. The client cannot guess these — only the
      // driver knows where its CLI reads prose.
      paths: await describeInstructionPaths(config.workspace.root, paths),
    }
  })

  app.get<{ Params: { '*': string } }>('/api/instructions/*', async (request, reply) => {
    const paths = driver.instructionPaths?.() ?? []
    const file = safeInstructionPath(config.workspace.root, paths, request.params['*'])
    if (!file) return reply.code(400).send({ error: 'not an instruction path' })
    try {
      const [info, markdown] = await Promise.all([stat(file), readFile(file, 'utf8')])
      return {
        path: request.params['*'],
        markdown,
        modified: new Date(info.mtimeMs).toISOString(),
        // Reported rather than hidden: the listing already omits managed
        // files, and a client that reached one anyway must not be told it can
        // save over something the next restart will rewrite.
        managed: markdown.includes(MANAGED_MARKER),
      }
    } catch {
      return reply.code(404).send({ error: 'no such instruction' })
    }
  })

  app.put<{ Params: { '*': string }; Body: { markdown?: unknown } }>(
    '/api/instructions/*',
    async (request, reply) => {
      const paths = driver.instructionPaths?.() ?? []
      const file = safeInstructionPath(config.workspace.root, paths, request.params['*'])
      if (!file) return reply.code(400).send({ error: 'not an instruction path' })

      const markdown = request.body?.markdown
      if (typeof markdown !== 'string') {
        return reply.code(400).send({ error: 'markdown is required' })
      }
      // Refused rather than accepted-then-lost: the core rewrites this file at
      // every start, so saving it would be a change that disappears without
      // anyone being told.
      if (await isManaged(file)) {
        return reply
          .code(409)
          .send({ error: 'this file is delivered with the product and is rewritten at every start' })
      }

      await writeInstruction(file, markdown)
      return { path: request.params['*'], modified: new Date().toISOString() }
    },
  )

  /**
   * What the outbound MCP servers are doing.
   *
   * Same gate and same 404 as the models route: "this driver cannot report"
   * and "this instance has no servers" are different facts, and a panel that
   * cannot tell them apart shows an empty box for both.
   */
  app.get('/api/mcp/status', async (_request, reply) => {
    if (!descriptor.capabilities.includes('mcpStatus')) {
      await reply.code(404).send({ error: 'this driver does not report MCP health' })
      return reply
    }
    const mcpStatus = (driver as Driver & { mcpStatus(): Promise<unknown> }).mcpStatus
    return { servers: await mcpStatus.call(driver) }
  })

  /**
   * Every outbound server this instance knows about, and who owns it.
   *
   * `/api/mcp/status` answers "what are they doing"; this answers "what are
   * they, and which of them may I touch". Two routes rather than one because
   * health is a driver CAPABILITY that legitimately 404s, while the wiring is
   * always knowable — folding them together would have made a screen that can
   * add a server disappear on an engine that cannot report on one.
   */
  const mcpViews = async (): Promise<readonly McpServerView[]> => {
    const views: McpServerView[] = []
    const declared = new Set<string>()

    for (const server of config.mcpServers) {
      declared.add(server.name)
      views.push({
        name: server.name,
        source: 'config',
        editable: false,
        transport: server.url ? 'http' : 'stdio',
        config: maskServer(server),
      })
    }
    for (const plugin of plugins) {
      if (!plugin.active) continue
      for (const server of plugin.manifest.mcpServers ?? []) {
        if (declared.has(server.name)) continue
        declared.add(server.name)
        views.push({
          name: server.name,
          source: 'plugin',
          owner: plugin.manifest.id,
          editable: false,
          transport: server.url ? 'http' : 'stdio',
          config: maskServer(server),
        })
      }
    }
    for (const server of await mcpStore.list()) {
      views.push({
        name: server.name,
        source: 'ui',
        editable: true,
        transport: server.url ? 'http' : 'stdio',
        config: maskServer(server),
        // A name the config or a plugin took AFTER this one was added. The
        // write path refuses a collision, so this can only happen when a
        // file was edited behind us — and a row that quietly did nothing
        // would be the worst possible way to find that out.
        ...(declared.has(server.name) ? { shadowed: true } : {}),
      })
    }
    return views
  }

  app.get('/api/mcp/servers', async () => ({ servers: await mcpViews() }))

  /**
   * Adding and editing, which only the shell's own layer allows.
   *
   * The proposal is unmasked against what is stored and then judged by the
   * CONFIG's grammar — the same function the YAML goes through — so there is
   * no second, looser way into this instance's wiring.
   */
  const acceptServer = async (
    proposed: unknown,
    replacing: string | undefined,
    reply: FastifyReply,
  ): Promise<FastifyReply | { server: Record<string, unknown> }> => {
    if (proposed === null || typeof proposed !== 'object' || Array.isArray(proposed)) {
      return reply.code(400).send({ error: 'a server declaration is required' })
    }
    const stored = await mcpStore.list()
    const previous = replacing ? stored.find((server) => server.name === replacing) : undefined
    if (replacing && !previous) {
      return reply.code(404).send({ error: `no server named "${replacing}" was added here` })
    }

    const issues: string[] = []
    const filled = unmaskServer(proposed as Record<string, unknown>, previous, issues)
    const server = readMcpServer(filled, 'server', issues)
    if (!server || issues.length > 0) {
      return reply.code(400).send({ error: issues.join('; ') || 'that is not a server' })
    }

    // A name is where the agent's tools live. Two servers answering to one is
    // a tool call going somewhere nobody chose, so a collision is refused
    // here rather than resolved by precedence.
    const taken =
      config.mcpServers.some((other) => other.name === server.name) ||
      plugins.some(
        (plugin) =>
          plugin.active &&
          (plugin.manifest.mcpServers ?? []).some((other) => other.name === server.name),
      ) ||
      stored.some((other) => other.name === server.name && other.name !== replacing)
    if (taken) {
      return reply
        .code(409)
        .send({ error: `"${server.name}" is already declared on this instance` })
    }

    const kept = stored.filter((other) => other.name !== replacing)
    await mcpStore.save([...kept, server])
    return { server: maskServer(server) }
  }

  app.post<{ Body: unknown }>('/api/mcp/servers', async (request, reply) =>
    acceptServer(request.body, undefined, reply),
  )

  app.put<{ Params: { name: string }; Body: unknown }>(
    '/api/mcp/servers/:name',
    async (request, reply) => acceptServer(request.body, request.params.name, reply),
  )

  app.delete<{ Params: { name: string } }>('/api/mcp/servers/:name', async (request, reply) => {
    const stored = await mcpStore.list()
    if (!stored.some((server) => server.name === request.params.name)) {
      // 404 rather than a silent success: the only servers this route can
      // remove are the ones it wrote, and "gone" would read as "removed" for
      // a name that is actually still wired from the config.
      return reply.code(404).send({ error: `no server named "${request.params.name}" was added here` })
    }
    await mcpStore.save(stored.filter((server) => server.name !== request.params.name))
    return { removed: request.params.name }
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

  app.get('/api/conversations', async (request) => {
    const userId = identityOf(request).userId
    const list = await conversations.list(userId)
    return {
      // `turn` is computed against the desk per request, never stored: a
      // status dot that survived a crash in a file would show a turn nobody
      // is running. Absent means idle.
      conversations: list.map((meta) => {
        const job = desk.activeFor(`${userId}/c:${meta.id}`)
        return job ? { ...meta, turn: job.waiting ? ('waiting' as const) : ('running' as const) } : meta
      }),
    }
  })

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

  app.post<{ Params: { id: string }; Body?: { archived?: unknown } }>(
    '/api/conversations/:id/archive',
    async (request, reply) => {
      // Reversible by construction: the same route brings a thread back, so
      // an archive is never a delete somebody has to regret.
      const archived = request.body?.archived !== false
      const userId = identityOf(request).userId
      const existing = await conversations.read(userId, request.params.id)
      if (!existing) return reply.code(404).send({ error: 'no such conversation' })
      await conversations.archive(userId, request.params.id, archived)
      return { id: request.params.id, archived }
    },
  )

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
      view?: unknown
    }
  }>(
    '/api/turn',
    async (request, reply) => {
      const body = request.body ?? {}
      if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
        await reply.code(400).send({ error: 'prompt is required' })
        return reply
      }

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
      const sessionId =
        typeof body.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : undefined

      // What serializes turns: the conversation when there is one, the CLI
      // session otherwise. Both prefixed by the user — a key is an address,
      // and two people must never share one. A first-ever message has
      // neither, and two of those genuinely are independent turns.
      const key = conversationId
        ? `${userId}/c:${conversationId}`
        : sessionId
          ? `${userId}/s:${sessionId}`
          : undefined

      // The caller's own identity, for the servers that serve their own
      // data. Resolved here because this is the only turn with a person at
      // the other end: the clock's and a delegation's have none, and
      // deliberately pass nothing.
      const caller = (request as FastifyRequest & { identity?: Identity }).identity
      const callerToken = caller?.userId
        ? await userTokens?.accessToken(caller.userId)
        : undefined

      // The instance's own tools, minted for THIS turn of THIS conversation.
      // The handle is how `rename_conversation` knows its target without the
      // model ever seeing an id; a turn without a conversation carries none,
      // because it has nothing to rename and no reason to hold a token.
      const tools =
        conversationId && deps.shellTools
          ? deps.shellTools.handleFor({ userId, conversationId })
          : undefined

      const spec: TurnSpec = {
        request: {
          // Framed here, not in the browser: what the thread stores is the
          // raw prompt, so a reload replays what the person typed rather
          // than the gateway's own notes.
          prompt: frameView(frameAttachments(body.prompt, attachments), body.view),
          cwd: config.workspace.root,
          ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(typeof body.model === 'string' ? { model: body.model } : {}),
          ...(callerToken ? { callerToken } : {}),
          ...(tools ? { tools } : {}),
        },
        // Written even when the turn failed: a thread that silently drops
        // the answer it did produce is worse than one showing it broke. The
        // desk calls this whether or not anybody is still watching — which
        // is the whole point of the desk.
        finish: async (outcome) => {
          if (!conversationId) return
          // ONE MESSAGE PER PART. An agent that answers, goes back to its
          // tools and answers again said two things, and the thread records
          // two — otherwise a reload would glue back together what the live
          // view had just drawn apart. A turn that produced nothing still
          // leaves a line: it is what carries the interruption and the error.
          const parts = outcome.parts.filter(
            (part) => part.text !== '' || part.tools.length > 0,
          )
          const written = parts.length > 0 ? parts : [{ tools: [], text: '' }]
          for (const [index, part] of written.entries()) {
            // How the TURN ended belongs to its last word only; the usage is
            // the whole turn's, and hangs there too.
            const last = index === written.length - 1
            await conversations
              .append(userId, conversationId, {
                id: randomUUID(),
                role: 'agent',
                text: part.text,
                at: new Date().toISOString(),
                ...(part.tools.length > 0 ? { tools: [...part.tools] } : {}),
                ...(last && outcome.stopped ? { stopped: outcome.stopped } : {}),
                ...(last && outcome.failure ? { error: outcome.failure } : {}),
                ...(last && outcome.usage ? { usage: outcome.usage } : {}),
              })
              .catch(() => undefined)
          }
          if (outcome.sessionId) {
            await conversations
              .setSession(userId, conversationId, outcome.sessionId)
              .catch(() => undefined)
          }
          // Last, after this turn's own appends: the token dies with the
          // turn, and a rename during it compacts the thread here — under
          // the desk's serialization, so the rewrite races nothing.
          if (tools) await deps.shellTools?.release(tools).catch(() => undefined)
        },
      }

      let admission
      try {
        admission = desk.admit(key)
      } catch (error) {
        if (error instanceof TurnCapacityError) {
          // Refusing now beats queueing behind a lock that may not release
          // for an hour: a refusal is information, a silent wait is not.
          // Only a conversation's OWN backlog ever queues, above.
          await reply.code(429).send({
            error: 'too many turns running',
            max: config.maxConcurrentTurns,
          })
          return reply
        }
        throw error
      }

      if (conversationId) {
        // Persisted the moment it is ACCEPTED — held or run alike. This line
        // is why a queued message survives a reload: it is in the thread
        // before the browser hears anything back.
        try {
          await conversations.append(userId, conversationId, {
            id: randomUUID(),
            role: 'user',
            text: body.prompt,
            at: new Date().toISOString(),
          })
        } catch (error) {
          if (admission.mode === 'run') admission.abort()
          // The turn will never run, so its finish will never release this.
          if (tools) await deps.shellTools?.release(tools).catch(() => undefined)
          await reply.code(500).send({ error: (error as Error).message })
          return reply
        }
      }

      if (admission.mode === 'queued') {
        admission.enqueue(spec)
        // 202: accepted, held. The browser shows it waiting and re-attaches
        // for the merged turn once the running one settles.
        await reply.code(202).send({ held: true })
        return reply
      }

      await streamJob(admission.start(spec), request, reply)
      return reply
    },
  )

  /**
   * Re-attaching to the turn a conversation is running — turn adoption.
   *
   * A reload, a phone that slept, a second tab: the turn kept running at the
   * desk, and this replays its whole event log then follows live. Same
   * frames, same reducer in the browser — an adopted turn is
   * indistinguishable from one never left. 204 says "nothing running", which
   * is an answer, not an error.
   */
  app.get<{ Querystring: { conversation?: string } }>('/api/turn/attach', async (request, reply) => {
    const conversationId = request.query.conversation
    if (typeof conversationId !== 'string' || conversationId === '') {
      await reply.code(400).send({ error: 'conversation is required' })
      return reply
    }
    const job = desk.activeFor(`${identityOf(request).userId}/c:${conversationId}`)
    if (!job) {
      await reply.code(204).send()
      return reply
    }
    await streamJob(job, request, reply)
    return reply
  })

  /**
   * One subscription of one response to one job. The job outlives the
   * response by design: a client that goes away is unsubscribed and nothing
   * else — the turn keeps running at the desk.
   */
  async function streamJob(job: TurnJob, request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // Nginx and friends buffer SSE into uselessness without this.
      'x-accel-buffering': 'no',
    })

    // Snapshot and subscribe in the SAME tick: events are emitted from the
    // driver's async loop, so nothing can land between the two.
    for (const event of job.log) reply.raw.write(sseFrame(event))

    await new Promise<void>((resolve) => {
      const unsubscribe = job.subscribe({
        event: (event) => reply.raw.write(sseFrame(event)),
        end: () => {
          reply.raw.end()
          resolve()
        },
      })
      request.raw.on('close', () => {
        unsubscribe()
        resolve()
      })
    })
  }

  /**
   * Answering what the engine asked.
   *
   * Three answers, no policy: `once` allows this call, `always` allows it and
   * hands the engine back its OWN suggestion so IT writes the rule into its
   * own file in the workspace, `deny` refuses. Adestia stores no rule either
   * way — the durable allowlist belongs to the engine, in a file a person can
   * open and edit.
   */
  app.post<{ Body: { id?: unknown; answer?: unknown } }>(
    '/api/permission',
    async (request, reply) => {
      const { id, answer } = request.body ?? {}
      const valid = answer === 'once' || answer === 'always' || answer === 'deny'
      if (typeof id !== 'string' || !valid) {
        return reply.code(400).send({ error: 'id and answer (once|always|deny) are required' })
      }
      // 409 rather than 404: the question existed, it simply timed out or was
      // already answered — "unknown" would suggest the person clicked
      // something that never was.
      if (!deps.asks?.answer(id, answer as AskAnswer)) {
        return reply.code(409).send({ error: 'that question is no longer waiting' })
      }
      // Out of the replay too: a re-attached stream must not resurrect a
      // question that nothing can resolve any more.
      desk.scrubAsk(id)
      return { answered: true }
    },
  )

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

  // Memory, composed. One store or several, every route below sees the same
  // shape — and a contradiction between declarations is refused here rather
  // than repaired, because the repair would have to guess which half the
  // operator meant.
  const { stores, issues } = resolveStores(config.workspace.stores, config.workspace.root)
  if (issues.length > 0) throw new ConfigError(issues)

  // Declared to every turn: the agent edits pages with its OWN file tools, so
  // a circle mounted outside its home has to be named or the CLI refuses it.
  const agentRoots = foreignRoots(stores, config.workspace.root)

  registerPages(app, { stores, locale: config.locale })
  // The agent writes these files with its own tools, past every route above;
  // the feed is how a shell already on screen learns they changed.
  registerEvents(app, { stores, watch: config.workspace.watch })
  // The same stores: an attachment is a file sitting next to a page, and a
  // second configurable place would be a second thing to explain.
  registerFiles(app, { stores, locale: config.locale })

  // Mounted before the static catch-all, so a plugin route always wins over
  // the shell's fallback; and after the auth hook, so it is gated like
  // everything else.
  const apiProblems = await mountPluginApis(app, plugins, {
    workspaceRoot: config.workspace.root,
    pages: pagesService(stores),
    dataDir: config.dataDir,
    scheduleEnabled: config.schedule.enabled,
    secrets: config.secrets,
  })

  registerMcp(app, {
    config: config.mcp,
    // Through the same spawn path as everything else, so the concurrency cap
    // applies to delegated work exactly as it does to a typed message.
    runTurn: async (prompt) => {
      if (!limiter.tryAcquire()) throw new Error('too many turns running')
      let text = ''
      try {
        for await (const event of driver.runTurn({
          prompt,
          cwd: config.workspace.root,
          ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
          // A delegating agent is not a person at a screen.
          unattended: true,
        })) {
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
    webManifest:
      deps.webManifest ?? withInstanceName(baseManifest({ locale: config.locale }), config.name),
  })

  // Exposed on the instance so `start()` can hand it to the clock without a
  // second construction path.
  ;(app as FastifyInstance & { adestiaRunTurn?: unknown }).adestiaRunTurn = async (
    prompt: string,
  ): Promise<void> => {
    if (!limiter.tryAcquire()) {
      // The cap applies to scheduled turns too: a person typing must not find
      // the instance busy with work nobody asked for right now.
      throw new Error('too many turns running')
    }
    try {
      for await (const event of driver.runTurn({
        prompt,
        cwd: config.workspace.root,
        ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
        // The clock is nobody at a screen: a question raised here is refused
        // at once rather than holding a turn slot until it times out.
        unattended: true,
      })) {
        if (event.type === 'error' && event.fatal) throw new Error(event.message)
      }
    } finally {
      limiter.release()
    }
  }

  return app
}
