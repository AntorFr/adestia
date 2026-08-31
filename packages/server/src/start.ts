/**
 * Boot — from a config file to a listening server.
 *
 * The order here is the product's contract with its operator: read the config,
 * discover what is mounted, build the driver, then listen. Anything wrong with
 * the first three is reported before the port opens, because a server that
 * accepts requests while half-configured is a server that fails per-request,
 * at the worst possible moment, in front of a user.
 */

import { mkdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AskDesk,
  ClaudeCodeDriver,
  CopilotDriver,
  SHELL_TOOLS_SERVER_NAME,
  createOAuthFlow,
  type Driver,
  type ShellToolsHandle,
} from '@antorfr/adestia-drivers'
import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'
import { ConfigError, parseConfig, type AdestiaConfig } from './config.js'
import { ConversationStore } from './conversations.js'
import { ShellToolsService } from './shell-tools.js'
import { Clock, scheduleStatePath } from './clock.js'
import {
  claimedTypeCollisions,
  discoverPlugins,
  discoverSkins,
  mcpServersFor,
  registerPluginVocabulary,
  unmatchedActivations,
  type McpServer,
} from './extensions.js'
import { FileRefreshStore } from './mcp-refresh.js'
import { McpStore } from './mcp-store.js'
import { runSetups } from './plugin-host.js'
import { UserTokens } from './user-tokens.js'
import { SecretStore } from './secrets.js'
import { baseManifest, mergeSkinManifest, withInstanceName } from './webmanifest.js'
import { collectSkills, deliverSkills } from './skills.js'

export const DEFAULT_CONFIG_FILE = 'adestia.config.yaml'

export interface StartOptions {
  readonly configPath?: string
  /** Built shell bundle; discovered next to the server package by default. */
  readonly webRoot?: string
  /** Where relative config paths resolve from. */
  readonly cwd?: string
  /** Injected in tests; production builds the driver from the config. */
  readonly driverFactory?: (config: AdestiaConfig) => Driver | Promise<Driver>
  readonly log?: (message: string) => void
}

export interface StartedInstance {
  readonly app: FastifyInstance
  readonly config: AdestiaConfig
  readonly url: string
  readonly clock: Clock | undefined
  close(): Promise<void>
}

export async function loadConfigFile(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdestiaConfig> {
  try {
    return parseConfig(await readFile(path, 'utf8'), env)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing config file is a legitimate first run: defaults give a
      // single-user instance on loopback — and the environment can still
      // override, which is how the container image works with no file at all.
      return parseConfig('', env)
    }
    throw error
  }
}

const AVAILABLE_DRIVERS = ['claude-code', 'copilot-cli'] as const

async function buildDriver(
  config: AdestiaConfig,
  dataDir: string,
  mcpServers: () => readonly McpServer[],
  asks: AskDesk | undefined,
  log: (message: string) => void,
): Promise<Driver> {
  // Rotated MCP refresh tokens outlive the process here, beside the credential.
  // The log is threaded in because a write that fails costs nothing NOW — the
  // turn runs on the token in memory — and everything after the next restart.
  const refreshStore = new FileRefreshStore(dataDir, log)
  switch (config.driver.id) {
    case 'claude-code': {
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      // Undeclared in package.json the way the SDK itself is: both belong to
      // this branch alone, resolved from the SDK's own dependency tree.
      const { z } = await import('zod')
      // Loosened once, here: the SDK's `tool` wants a static zod shape, and
      // ours is built from the registry at runtime. The values ARE zod
      // schemas; only the generics cannot know it.
      const tool = sdk.tool as unknown as (
        name: string,
        description: string,
        schema: Record<string, unknown>,
        handler: (args: Record<string, unknown>) => Promise<unknown>,
      ) => never
      /**
       * Hosts a turn's shell tools inside THIS process: the handlers run
       * beside the conversation store, the turn's context travels by closure,
       * and no token exists on the path at all. Measured before relied on
       * (spikes/shell-tools-transport): the SDK accepts a live instance among
       * its `mcpServers`, and the handlers execute in the calling process.
       */
      const toolsHost = (handle: ShellToolsHandle): unknown =>
        sdk.createSdkMcpServer({
          name: SHELL_TOOLS_SERVER_NAME,
          tools: handle.tools.map((spec) =>
            tool(
              spec.name,
              spec.description,
              Object.fromEntries(
                spec.params.map((param) => [
                  param.name,
                  (param.optional ? z.string().optional() : z.string()).describe(
                    param.description,
                  ),
                ]),
              ),
              async (args) => {
                const outcome = await handle.call(spec.name, args)
                return {
                  content: [
                    { type: 'text' as const, text: outcome.ok ? outcome.text : outcome.error },
                  ],
                  ...(outcome.ok ? {} : { isError: true }),
                }
              },
            ),
          ),
        })
      return new ClaudeCodeDriver({
        query: sdk.query as unknown as ConstructorParameters<typeof ClaudeCodeDriver>[0]['query'],
        models: config.driver.models,
        // Arming speaks the OAuth flow itself rather than driving the CLI's
        // terminal screen: same authorization, but every failure comes back
        // as a status code instead of a half-drawn frame.
        armingFlow: createOAuthFlow(),
        ...(asks ? { asks } : {}),
        mcpServers,
        toolsHost,
        refreshStore,
      })
    }

    case 'copilot-cli':
      return new CopilotDriver({
        // Driver-owned: config, MCP servers, session store and its SQLite all
        // land here rather than in whatever HOME the process happens to have.
        home: join(dataDir, 'copilot-home'),
        models: config.driver.models,
        ...(config.driver.agent ? { agent: config.driver.agent } : {}),
        ...(config.driver.shellToolsTransport
          ? { shellToolsTransport: config.driver.shellToolsTransport }
          : {}),
        mcpServers,
        refreshStore,
        ...(config.driver.command ? { command: config.driver.command } : {}),
      })

    default:
      // Named loudly rather than falling back to the default engine: silently
      // running a different CLI than the operator configured is indefensible.
      throw new ConfigError([
        `driver.id "${config.driver.id}" is not available in this build (have: ${AVAILABLE_DRIVERS.join(', ')})`,
      ])
  }
}

/** The web bundle ships beside the server package; found, never configured. */
async function findWebRoot(): Promise<string | undefined> {
  const candidate = fileURLToPath(new URL('../../../web/dist-web/', import.meta.url))
  try {
    await stat(join(candidate, 'index.html'))
    return candidate
  } catch {
    return undefined
  }
}

export async function start(options: StartOptions = {}): Promise<StartedInstance> {
  const cwd = options.cwd ?? process.cwd()
  const log = options.log ?? ((message: string) => console.log(message))
  const configPath = resolve(cwd, options.configPath ?? DEFAULT_CONFIG_FILE)

  const config = await loadConfigFile(configPath)

  // The workspace must exist before a turn is ever attempted. Spawning a CLI
  // into a missing directory fails with a message that blames the BINARY
  // ("native binary ... failed to launch ... does not match this system's
  // libc"), which sends an operator debugging their platform instead of their
  // path. Observed 2026-08-21; failing here costs one line and saves an hour.
  const workspaceRoot = resolve(cwd, config.workspace.root)
  try {
    const info = await stat(workspaceRoot)
    if (!info.isDirectory()) {
      throw new ConfigError([`workspace.root "${workspaceRoot}" exists but is not a directory`])
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Creating it is the friendlier default for a first run: the agent's home
    // is Adestia's to own, unlike a plugins folder someone mounts deliberately.
    await mkdir(workspaceRoot, { recursive: true })
    log(`created workspace at ${workspaceRoot}`)
  }

  const { plugins, problems } = await discoverPlugins(
    resolve(cwd, config.extensions.pluginsDir),
    config.extensions,
  )
  const { skins, problems: skinProblems } = await discoverSkins(
    resolve(cwd, config.extensions.skinsDir),
  )

  for (const problem of [...problems, ...skinProblems]) {
    // Refusals are loud, always: a plugin you believe is loaded and is not
    // costs far more than one that says why it was rejected.
    log(`extension "${problem.id}" refused: ${problem.reason}`)
  }

  for (const miss of unmatchedActivations(plugins, config.extensions)) {
    log(`extensions.${miss.list}: "${miss.id}" activated nothing — ${miss.reason}`)
  }

  // Before anything reads a page: `editable` and the refusal on save both run
  // through the vocabulary, so a block taught late is a page refused early.
  for (const clash of registerPluginVocabulary(plugins)) {
    log(
      `extension "${clash.id}": block ":::${clash.name}" is the core's own and was not taken over`,
    )
  }

  for (const collision of claimedTypeCollisions(plugins)) {
    log(
      `page type "${collision.type}" is claimed by more than one active plugin: ${collision.ids.join(', ')}`,
    )
  }

  const active = plugins.filter((plugin) => plugin.active)
  log(
    `${active.length} of ${plugins.length} plugin(s) active, ${skins.length} skin(s) available`,
  )

  const activeSkin = skins.find((s) => s.manifest.id === config.extensions.skin)
  if (config.extensions.skin !== 'default' && !activeSkin) {
    // Not fatal — the shell falls back — but silence here means running under
    // another body's name and icon without ever being told.
    log(`skin "${config.extensions.skin}" is configured but was not found; using the default`)
  } else if (activeSkin) {
    log(`skin "${activeSkin.manifest.id}" active`)
  }

  /**
   * What the instance is called once it is installed.
   *
   * Read here, at boot, rather than when a browser asks: a fragment that is
   * malformed or half off-contract must be reported beside the other
   * extension problems, not swallowed into a request nobody watches. The
   * product's own manifest is the floor — a skin that ships none, or ships a
   * broken one, still installs.
   */
  const webManifestBase = baseManifest({ locale: config.locale })
  let webManifest = webManifestBase
  if (activeSkin?.manifest.manifest) {
    const path = join(activeSkin.dir, activeSkin.manifest.manifest)
    try {
      const merged = mergeSkinManifest(webManifestBase, JSON.parse(await readFile(path, 'utf8')))
      webManifest = merged.manifest
      if (merged.ignored.length > 0) {
        log(
          `skin "${activeSkin.manifest.id}": web manifest field(s) off contract, ignored: ${merged.ignored.join(', ')}`,
        )
      }
    } catch (error) {
      log(
        `skin "${activeSkin.manifest.id}": web manifest not read (${(error as Error).message}); using the product's`,
      )
    }
  }
  // Applied over the skin's, because the operator is the only one who knows
  // that THIS instance is the workshop's and the other is the kitchen's.
  webManifest = withInstanceName(webManifest, config.name)
  if (config.name) log(`instance named "${config.name}"`)

  const dataDir = resolve(cwd, config.dataDir)
  // The shell's own layer, primed before anything asks for it. Read here
  // rather than lazily so a malformed file is a line in the boot log instead
  // of a surprise on somebody's first turn.
  const mcpStore = new McpStore(dataDir)
  await mcpStore.list()

  /**
   * The layers the product owns, merged — and merged PER CALL rather than
   * once.
   *
   * A driver is still HANDED its servers rather than going looking for them,
   * which is what keeps "where does this server come from" a question with
   * one answer. What changed is that the answer can now change while the
   * process runs: a server added from the settings screen is written to
   * `mcp-servers.json`, and both drivers build their map at the spawn site,
   * so asking again per turn is what makes the button do something before the
   * next restart.
   *
   * The shell's layer goes FIRST, so a name the operator also wrote in the
   * config file wins — the file somebody edited by hand beats the one a
   * screen wrote. The write path refuses that collision outright; this is
   * what happens when the config gains the name afterwards.
   */
  const wiredMcpServers = () =>
    mcpServersFor([...mcpStore.current(), ...config.mcpServers], plugins).servers

  const { problems: mcpProblems } = mcpServersFor(config.mcpServers, plugins)
  for (const problem of mcpProblems) {
    log(`extension "${problem.id}" — ${problem.reason}`)
  }
  const mcpServers = wiredMcpServers()
  if (mcpServers.length > 0) {
    log(`${mcpServers.length} MCP server(s) wired: ${mcpServers.map((s) => s.name).join(', ')}`)
  }

  // Built only in `ask` posture, and handed to the driver so IT can declare
  // `interactivePermissions`. In `open` there is no desk, nothing asks, and
  // the capability is honestly absent.
  const asks = config.permissions.mode === 'ask' ? new AskDesk() : undefined

  const driver = options.driverFactory
    ? await options.driverFactory(config)
    : await buildDriver(config, dataDir, wiredMcpServers, asks, log)

  // The instance's own tools: one registry, hosted in-process by a driver
  // that can and served over a unix socket to every other (shell-tools.ts).
  // Started here, not in buildApp — the app is built bare in tests, and a
  // unix socket must never open as a side effect of building routes.
  const shellTools = new ShellToolsService({
    dataDir,
    conversations: new ConversationStore(dataDir),
    log,
  })
  await shellTools.start()
  log(`shell tools ready (${shellTools.socketPath})`)

  // `ask` on an engine that cannot be asked is refused OUT LOUD rather than
  // degraded. Copilot in programmatic mode has no return channel: every
  // question it raised would become a silent refusal mid-turn, which reads as
  // "the tool is broken" to everyone including the agent. The operator picks
  // `open` themselves, knowing what they pick.
  if (config.permissions.mode === 'ask') {
    const { capabilities } = await driver.describe()
    if (!capabilities.includes('interactivePermissions')) {
      throw new ConfigError([
        `permissions.mode is "ask" but driver "${config.driver.id}" cannot ask: it has no way to reach a person mid-turn, so every question would become a silent refusal. Use permissions.mode: open, or a driver that declares interactivePermissions.`,
      ])
    }
    log('permissions: ask — the engine decides what needs a person, the chat asks it')
  } else {
    log('permissions: open — every tool runs unasked (container and MCP servers are the bounds)')
  }

  // A token armed in a previous run is loaded before the first turn: an
  // instance that forgets its credential on restart is an instance someone
  // has to re-arm every deploy.
  const secrets = new SecretStore(dataDir)
  const stored = await secrets.read(config.driver.id)
  const armable = driver as Driver & {
    credentialVar?: string
    setCredentials?(credentials: Record<string, string>, savedAt?: string): void
  }
  if (stored && armable.credentialVar && armable.setCredentials) {
    armable.setCredentials({ [armable.credentialVar]: stored.value }, stored.savedAt)
    log(`driver credential loaded (armed ${stored.savedAt})`)
  }

  // Setup runs BEFORE the app is built: a plugin's API may depend on whatever
  // its setup wired up, and mounting first would make that ordering luck.
  const setupProblems = await runSetups(plugins, log)
  for (const problem of setupProblems) log(`extension "${problem.id}": ${problem.reason}`)

  // Contracts are refreshed at every boot rather than installed once: a
  // plugin upgraded in place would otherwise leave the agent reading last
  // version's instructions for code that has changed underneath it.
  const skillsPath = (driver as Driver & { skillsPath?(): string | undefined }).skillsPath?.()
  if (skillsPath) {
    const { skills, problems: skillProblems } = await collectSkills(plugins)
    for (const problem of skillProblems) log(`skill not delivered — ${problem}`)
    const { written, removed } = await deliverSkills(join(workspaceRoot, skillsPath), skills)
    log(`${written} agent contract(s) delivered${removed > 0 ? `, ${removed} withdrawn` : ''}`)
  }

  // One resolved config from here on. The absolute workspace path means a turn
  // never depends on the server's cwd at spawn — and returning the same object
  // the app runs on keeps callers from reading a different truth.
  const resolved: AdestiaConfig = {
    ...config,
    workspace: { ...config.workspace, root: workspaceRoot },
  }

  const webRoot = options.webRoot ?? (await findWebRoot())
  if (!webRoot) {
    // Not fatal: `adestia` is useful as an API in development, where Vite serves
    // the shell. But an operator who expected a web page deserves to know why
    // they are looking at JSON.
    log('no built web shell found; serving the API only (run `npm run build:web`)')
  }

  /**
   * Per-user tokens, only where they can exist and are wanted.
   *
   * `oidc` mode with a rebound audience. In `proxy` mode the session lives
   * with the reverse proxy and the product holds nothing to refresh — no
   * amount of configuration changes that, so it is not offered.
   */
  const rebound =
    resolved.auth.mode === 'oidc' && resolved.auth.oidc?.reboundAudience?.length
      ? new UserTokens(dataDir, {
          issuer: resolved.auth.oidc.issuer,
          clientId: resolved.auth.oidc.clientId,
          clientSecret: resolved.auth.oidc.clientSecret,
        })
      : undefined
  if (rebound) {
    log(`user rebound on: turns act as their caller for ${resolved.auth.oidc!.reboundAudience!.join(', ')}`)
  }

  const app = await buildApp({
    config: {
      ...resolved,
      dataDir: resolve(cwd, resolved.dataDir),
      // ⚠️ Resolved for the same reason `dataDir` is: this value becomes the
      // CLI's working directory at the spawn site. Left relative, the driver
      // hands `./workspace` to a subprocess whose own cwd is not this
      // process's — and the agent then writes its files somewhere else
      // entirely (observed 2026-08-26: `pages/essai.md` landed in the
      // launching user's HOME). A container config names an absolute path,
      // which is why this never bit in production.
      workspace: { ...resolved.workspace, root: workspaceRoot },
    },
    driver,
    plugins,
    pluginProblems: [...problems, ...setupProblems],
    ...(rebound ? { userTokens: rebound } : {}),
    secrets,
    // The very same instance the driver is asking: a server added over the
    // API has to be the server the next turn is handed, and two stores
    // reading one file would agree only by luck.
    mcpStore,
    ...(asks ? { asks } : {}),
    shellTools,
    ...(activeSkin
      ? {
          skin: {
            id: activeSkin.manifest.id,
            dir: activeSkin.dir,
            manifest: {
              ...(activeSkin.manifest.styles ? { styles: activeSkin.manifest.styles } : {}),
              ...(activeSkin.manifest.module ? { module: activeSkin.manifest.module } : {}),
              ...(activeSkin.manifest.icon ? { icon: activeSkin.manifest.icon } : {}),
              ...(activeSkin.manifest.scheme ? { scheme: activeSkin.manifest.scheme } : {}),
            },
          },
        }
      : {}),
    ...(webRoot ? { webRoot } : {}),
    webManifest,
  })
  await app.listen({ host: resolved.host, port: resolved.port })

  // The bound port, not the configured one: with `port: 0` they differ, and
  // printing 0 tells the operator nothing they can open.
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : resolved.port
  const url = `http://${resolved.host}:${port}`
  log(`Adestia listening on ${url} (auth: ${resolved.auth.mode})`)
  if (
    resolved.auth.mode === 'none' &&
    resolved.host !== '127.0.0.1' &&
    resolved.host !== 'localhost'
  ) {
    // The one warning worth shouting: an ungated agent reachable from the
    // network is a shell anyone can drive.
    log('WARNING: auth is disabled and the server is not bound to loopback.')
  }

  // The clock runs through the app's own turn function, never its own path.
  let clock: Clock | undefined
  if (resolved.schedule.enabled) {
    const runTurn = (app as FastifyInstance & { adestiaRunTurn(prompt: string): Promise<void> })
      .adestiaRunTurn
    clock = new Clock({
      dir: join(workspaceRoot, resolved.workspace.planif),
      statePath: scheduleStatePath(dataDir),
      // The agent's own memory zone, where a mission's log accumulates.
      missionLogDir: join(workspaceRoot, resolved.workspace.memory, 'missions'),
      runTurn: (prompt) => runTurn(prompt),
      log,
      ...(resolved.schedule.tickMs ? { tickMs: resolved.schedule.tickMs } : {}),
    })
    clock.start()
    log(`scheduled turns enabled (notes in ${resolved.workspace.planif}/)`)
  }

  return {
    app,
    config: resolved,
    url,
    clock,
    close: async () => {
      clock?.stop()
      await app.close()
      await shellTools.close()
    },
  }
}
