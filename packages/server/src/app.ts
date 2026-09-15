/**
 * The Fastify application.
 *
 * One rule governs this file: **there is a single spawn site.** Every agent
 * turn — chat, scheduled, delegated over MCP — goes through `runTurn` here, so
 * the driver's env contract, the concurrency cap and the transcript are
 * applied once. The predecessor had two spawn paths and forgetting one broke a
 * whole channel silently for days.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { AskDesk, Driver, DriverDescriptor } from '@antorfr/adestia-drivers'

import { isPublicRoute, resolveIdentity, type Identity } from './auth.js'
import { AttachmentInbox } from './attachments.js'
import { frameShell } from './introduction.js'
import { ConversationStore } from './conversations.js'
import { ConfigError, type AdestiaConfig } from './config.js'
import { registerCallback } from './callback.js'
import { DelegationChannel } from './delegations.js'
import type { DiscoveredPlugin, DiscoveryProblem } from './extensions.js'
import { McpStore } from './mcp-store.js'
import { McpSignIn } from './mcp-signin.js'
import { registerOidc } from './oidc-routes.js'
import { registerMcp } from './mcp-routes.js'
import { registerFiles } from './files.js'
import { registerPages } from './pages.js'
import { registerArming } from './routes/arming.js'
import { registerConversations } from './routes/conversations.js'
import { registerInstance, type SkinPayload } from './routes/instance.js'
import { registerInstructions } from './routes/instructions.js'
import { outboundServersOf, registerMcpServers } from './routes/mcp-servers.js'
import { registerTurns, type ShellToolsPort, type UserTokens } from './routes/turns.js'
import { registerUpload } from './routes/upload.js'
import { foreignRoots, pagesService, resolveStores } from './stores.js'
import { registerEvents } from './watch.js'
import { mountPluginApis } from './plugin-host.js'
import { ArmingSessions, SecretStore } from './secrets.js'
import { registerStatic } from './static.js'
import { TurnDesk } from './turns.js'
import { baseManifest, withInstanceName, type WebManifest } from './webmanifest.js'

// Two helpers the tests reach through this module, where they always lived.
export { buildVersion } from './routes/instance.js'
export { sseFrame } from './routes/turns.js'
export type { SkinPayload } from './routes/instance.js'

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
  readonly userTokens?: UserTokens
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
  readonly mcpSignIn?: McpSignIn
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
  readonly shellTools?: ShellToolsPort
  /** The active skin, when the configured one was found on disk. */
  readonly skin?: { readonly id: string; readonly dir: string; readonly manifest: SkinPayload }
  /**
   * The merged web app manifest. Built at boot rather than per request: the
   * skin's fragment is read from disk once, and the fields it declared off
   * contract are reported there, with the rest of the extension problems.
   */
  readonly webManifest?: WebManifest | undefined
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

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, driver, plugins, pluginProblems, userTokens, webRoot } = deps
  const app = Fastify({ logger: false })
  const limiter = new TurnLimiter(config.maxConcurrentTurns)
  /**
   * The shell's own preamble, decided once and applied on both spawn paths.
   *
   * Only where the engine has somewhere to READ the contract from: a driver
   * declaring no skills directory gets none delivered, and an anchor citing a
   * file that was never written is worse than saying nothing — it invites
   * exactly the invention it exists to stop.
   */
  const introduce = driver.skillsPath?.() ? frameShell : undefined
  // The desk owns chat turns; the clock's and the MCP delegation's loops below
  // stay as they are and share the same limiter, so the cap keeps one meaning.
  const desk = new TurnDesk(driver, limiter, introduce)
  const conversations = new ConversationStore(config.dataDir)
  const secrets = deps.secrets ?? new SecretStore(config.dataDir)
  const mcpStore = deps.mcpStore ?? new McpStore(config.dataDir)
  // Sign-in state for the servers that are their own authorization server:
  // one client registration per server, one rotating refresh key per person.
  const mcpSignIn = deps.mcpSignIn ?? new McpSignIn(config.dataDir)
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

  // Memory, composed. One store or several, every route below sees the same
  // shape — and a contradiction between declarations is refused here rather
  // than repaired, because the repair would have to guess which half the
  // operator meant.
  const { stores, issues } = resolveStores(config.workspace.stores, config.workspace.root)
  if (issues.length > 0) throw new ConfigError(issues)

  // Declared to every turn: the agent edits pages with its OWN file tools, so
  // a circle mounted outside its home has to be named or the CLI refuses it.
  const agentRoots = foreignRoots(stores, config.workspace.root)

  const outboundServers = outboundServersOf({ config, plugins, mcpStore })

  // Reported by `/api/instance`, filled once the plugin APIs are mounted below.
  let apiProblems: readonly DiscoveryProblem[] = []

  registerInstance(app, {
    config,
    driver,
    descriptor,
    skin: deps.skin,
    plugins,
    problems: () => [...pluginProblems, ...apiProblems],
    running: () => limiter.running,
  })
  registerInstructions(app, { driver, workspaceRoot: config.workspace.root })
  registerMcpServers(app, { config, driver, descriptor, plugins, mcpStore, mcpSignIn, outboundServers })
  await registerUpload(app, { config, inbox })
  registerConversations(app, { conversations, desk })
  registerTurns(app, {
    config,
    desk,
    conversations,
    inbox,
    mcpSignIn,
    outboundServers,
    agentRoots,
    userTokens,
    shellTools: deps.shellTools,
    asks: deps.asks,
  })
  registerArming(app, { driver, descriptor, secrets, arming })

  /**
   * The loose unattended spawn path — the clock's and the callback wake's.
   *
   * Same limiter as everything else: a person typing must not find the
   * instance busy with work nobody asked for right now, so a full house
   * refuses rather than queues. Unattended, because nobody is at a screen: a
   * question raised in such a turn is refused at once rather than holding a
   * slot for five minutes waiting on a person who was never there.
   */
  const runUnattended = async (prompt: string): Promise<void> => {
    if (!limiter.tryAcquire()) throw new Error('too many turns running')
    try {
      for await (const event of driver.runTurn({
        // The same preamble the desk applies. A scheduled note and a callback
        // wake are the turns nobody reads, so a guess made in one is a guess
        // nobody is there to contradict.
        prompt: introduce ? introduce(prompt) : prompt,
        cwd: config.workspace.root,
        ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
        unattended: true,
      })) {
        if (event.type === 'error' && event.fatal) throw new Error(event.message)
      }
    } finally {
      limiter.release()
    }
  }

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
  apiProblems = await mountPluginApis(app, plugins, {
    workspaceRoot: config.workspace.root,
    pages: pagesService(stores),
    dataDir: config.dataDir,
    scheduleEnabled: config.schedule.enabled,
    secrets: config.secrets,
  })

  // The delegation channel: inbound MCP work runs through the SAME desk as
  // chat — chaining, capacity, session resume — but in its own key family and
  // its own thread store. The separation is the authorization boundary: a
  // task_id resolves only in here, never to a person's chat thread.
  const delegations = new DelegationChannel(desk, {
    dataDir: config.dataDir,
    cwd: config.workspace.root,
    ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
  })

  registerMcp(app, { config: config.mcp, channel: delegations })

  /**
   * The delegations screen's two questions: what ran here, and what did it
   * say. Read-only on purpose — these threads belong to the CALLING agents'
   * conversations, and a person typing into one would inject a turn into a
   * thread its owner believes it holds alone. Gated like every other /api
   * route: any signed-in human may look, which is rather the point.
   */
  app.get('/api/delegations', async () => ({ delegations: await delegations.list() }))

  app.get<{ Params: { caller: string; id: string } }>(
    '/api/delegations/:caller/:id',
    async (request, reply) => {
      let thread
      try {
        thread = await delegations.read(request.params.caller, request.params.id)
      } catch {
        // An unsafe caller segment throws in the store's last-line guard;
        // from this side it is the same answer as a thread that is not there.
        thread = undefined
      }
      if (!thread) return reply.code(404).send({ error: 'no such delegation' })
      return { caller: request.params.caller, ...thread }
    },
  )

  registerCallback(app, {
    servers: outboundServers,
    // The clock's spawn path exactly: unattended, loose, capped. A callback
    // wake is nobody at a screen either.
    runTurn: (prompt) => runUnattended(prompt),
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
  ;(app as FastifyInstance & { adestiaRunTurn?: unknown }).adestiaRunTurn = runUnattended

  return app
}
