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
  ClaudeCodeDriver,
  CopilotDriver,
  PermissionBroker,
  createSetupTokenFlow,
  type Driver,
} from '@antorfr/golem-drivers'
import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'
import { ConfigError, parseConfig, type GolemConfig } from './config.js'
import { Clock, scheduleStatePath } from './clock.js'
import { discoverPlugins, discoverSkins } from './extensions.js'
import { runSetups } from './plugin-host.js'
import { SecretStore } from './secrets.js'
import { collectSkills, deliverSkills } from './skills.js'

export const DEFAULT_CONFIG_FILE = 'golem.config.yaml'

export interface StartOptions {
  readonly configPath?: string
  /** Built shell bundle; discovered next to the server package by default. */
  readonly webRoot?: string
  /** Where relative config paths resolve from. */
  readonly cwd?: string
  /** Injected in tests; production builds the driver from the config. */
  readonly driverFactory?: (config: GolemConfig) => Driver | Promise<Driver>
  readonly log?: (message: string) => void
}

export interface StartedInstance {
  readonly app: FastifyInstance
  readonly config: GolemConfig
  readonly url: string
  readonly clock: Clock | undefined
  close(): Promise<void>
}

export async function loadConfigFile(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GolemConfig> {
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
  config: GolemConfig,
  dataDir: string,
  permissions: PermissionBroker,
): Promise<Driver> {
  switch (config.driver.id) {
    case 'claude-code': {
      const { query } = await import('@anthropic-ai/claude-agent-sdk')
      return new ClaudeCodeDriver({
        query: query as unknown as ConstructorParameters<typeof ClaudeCodeDriver>[0]['query'],
        models: config.driver.models,
        // The terminal flow, so a token can be armed from the interface rather
        // than requiring a shell inside the container.
        armingFlow: createSetupTokenFlow(),
        permissions,
      })
    }

    case 'copilot-cli':
      return new CopilotDriver({
        // Driver-owned: config, MCP servers, session store and its SQLite all
        // land here rather than in whatever HOME the process happens to have.
        home: join(dataDir, 'copilot-home'),
        models: config.driver.models,
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
    // is Golem's to own, unlike a plugins folder someone mounts deliberately.
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

  const dataDir = resolve(cwd, config.dataDir)
  const permissions = new PermissionBroker(config.permissions)
  const driver = options.driverFactory
    ? await options.driverFactory(config)
    : await buildDriver(config, dataDir, permissions)

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
  const resolved: GolemConfig = {
    ...config,
    workspace: { ...config.workspace, root: workspaceRoot },
  }

  const webRoot = options.webRoot ?? (await findWebRoot())
  if (!webRoot) {
    // Not fatal: `golem` is useful as an API in development, where Vite serves
    // the shell. But an operator who expected a web page deserves to know why
    // they are looking at JSON.
    log('no built web shell found; serving the API only (run `npm run build:web`)')
  }

  const app = await buildApp({
    config: { ...resolved, dataDir: resolve(cwd, resolved.dataDir) },
    driver,
    plugins,
    pluginProblems: [...problems, ...setupProblems],
    secrets,
    permissions,
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
  })
  await app.listen({ host: resolved.host, port: resolved.port })

  // The bound port, not the configured one: with `port: 0` they differ, and
  // printing 0 tells the operator nothing they can open.
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : resolved.port
  const url = `http://${resolved.host}:${port}`
  log(`Golem listening on ${url} (auth: ${resolved.auth.mode})`)
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
    const runTurn = (app as FastifyInstance & { golemRunTurn(prompt: string): Promise<void> })
      .golemRunTurn
    clock = new Clock({
      dir: join(workspaceRoot, resolved.workspace.planif),
      statePath: scheduleStatePath(dataDir),
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
    },
  }
}
