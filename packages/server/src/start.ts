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
import { resolve } from 'node:path'

import { ClaudeCodeDriver, type Driver } from '@antorfr/golem-drivers'
import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'
import { ConfigError, parseConfig, type GolemConfig } from './config.js'
import { discoverPlugins, discoverSkins } from './extensions.js'

export const DEFAULT_CONFIG_FILE = 'golem.config.yaml'

export interface StartOptions {
  readonly configPath?: string
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
  close(): Promise<void>
}

export async function loadConfigFile(path: string): Promise<GolemConfig> {
  try {
    return parseConfig(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing config file is a legitimate first run: defaults give a
      // single-user instance on loopback. Inventing a file would be worse.
      return parseConfig('')
    }
    throw error
  }
}

async function buildDriver(config: GolemConfig): Promise<Driver> {
  if (config.driver.id !== 'claude-code') {
    // Named loudly rather than falling back to the default engine: silently
    // running a different CLI than the operator configured is indefensible.
    throw new ConfigError([
      `driver.id "${config.driver.id}" is not available in this build (have: claude-code)`,
    ])
  }
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  return new ClaudeCodeDriver({
    query: query as unknown as ConstructorParameters<typeof ClaudeCodeDriver>[0]['query'],
    models: config.driver.models,
  })
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

  if (config.extensions.skin !== 'default' && !skins.some((s) => s.manifest.id === config.extensions.skin)) {
    // Not fatal — the shell falls back — but silence here means running under
    // another body's name and icon without ever being told.
    log(`skin "${config.extensions.skin}" is configured but was not found; using the default`)
  }

  const driver = options.driverFactory
    ? await options.driverFactory(config)
    : await buildDriver(config)

  // One resolved config from here on. The absolute workspace path means a turn
  // never depends on the server's cwd at spawn — and returning the same object
  // the app runs on keeps callers from reading a different truth.
  const resolved: GolemConfig = {
    ...config,
    workspace: { ...config.workspace, root: workspaceRoot },
  }

  const app = await buildApp({ config: resolved, driver, plugins, pluginProblems: problems })
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

  return {
    app,
    config: resolved,
    url,
    close: () => app.close(),
  }
}
