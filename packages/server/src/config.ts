/**
 * Instance configuration — one declarative file, `golem.config.yaml`.
 *
 * The predecessor was configured by some thirty environment variables, which
 * is how a homelab tool is configured, not a product: nothing could be read as
 * a whole, and every default was a magic string in a Dockerfile.
 *
 * Here, the file describes the instance and env vars override only what is
 * deployment-specific or secret. Unknown keys are reported, never ignored: a
 * typo in a config file is a setting you believe is on and is not.
 */

import { parse as parseYaml } from 'yaml'

export type AuthMode = 'none' | 'oidc' | 'proxy'

export interface OidcConfig {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  /** Claim carrying group membership; roles are derived from it at each login. */
  readonly groupsClaim: string
  /** Groups allowed in at all. Empty means any authenticated user. */
  readonly allowedGroups: readonly string[]
}

export interface ProxyAuthConfig {
  /** Header the trusted reverse proxy sets. Nothing else is believed. */
  readonly userHeader: string
  readonly groupsHeader?: string | undefined
}

export interface AuthConfig {
  readonly mode: AuthMode
  readonly oidc?: OidcConfig | undefined
  readonly proxy?: ProxyAuthConfig | undefined
}

export interface WorkspaceConfig {
  /** The agent's home: instructions in its CLI's own dialect, plus content. */
  readonly root: string
  readonly pages: string
  readonly memory: string
  readonly planif: string
}

export interface DriverConfig {
  readonly id: string
  readonly models: readonly { id: string; label?: string }[]
  /**
   * The binary to run, when the driver spawns one. Worth pinning to an exact
   * path in a container: the Copilot CLI self-updates, so "whatever is on
   * PATH" is not a version anyone can reason about.
   */
  readonly command?: string | undefined
}

export interface ExtensionsConfig {
  readonly pluginsDir: string
  readonly skinsDir: string
  /** Presence in a directory is discovery, never activation. */
  readonly apps: readonly string[]
  readonly features: readonly string[]
  readonly tools: readonly string[]
  readonly skin: string
}

export interface GolemConfig {
  readonly host: string
  readonly port: number
  readonly dataDir: string
  readonly auth: AuthConfig
  readonly workspace: WorkspaceConfig
  readonly driver: DriverConfig
  readonly extensions: ExtensionsConfig
  /** Concurrent turns across all conversations. Subscription limits are real. */
  readonly maxConcurrentTurns: number
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

const KNOWN_KEYS = new Set([
  'host',
  'port',
  'dataDir',
  'auth',
  'workspace',
  'driver',
  'extensions',
  'maxConcurrentTurns',
])

const DEFAULTS = {
  /**
   * Loopback, deliberately. With `auth: none` the instance has no gate at all,
   * and a product that binds an ungated agent to every interface by default is
   * a product that ships a mistake to everyone who skips the docs.
   */
  host: '127.0.0.1',
  port: 8730,
  dataDir: './data',
  maxConcurrentTurns: 3,
} as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown, field: string, issues: string[]): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    issues.push(`${field} must be a list of strings`)
    return []
  }
  return value as readonly string[]
}

function requireString(
  raw: Record<string, unknown>,
  key: string,
  field: string,
  issues: string[],
): string {
  const value = raw[key]
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`${field} is required`)
    return ''
  }
  return value
}

function parseAuth(raw: unknown, issues: string[]): AuthConfig {
  if (raw === undefined) return { mode: 'none' }
  if (!isObject(raw)) {
    issues.push('auth must be an object')
    return { mode: 'none' }
  }

  const mode = raw['mode'] ?? 'none'
  if (mode !== 'none' && mode !== 'oidc' && mode !== 'proxy') {
    issues.push(`auth.mode must be one of none, oidc, proxy (got ${JSON.stringify(mode)})`)
    return { mode: 'none' }
  }

  if (mode === 'oidc') {
    const oidc = raw['oidc']
    if (!isObject(oidc)) {
      issues.push('auth.oidc is required when auth.mode is "oidc"')
      return { mode }
    }
    return {
      mode,
      oidc: {
        issuer: requireString(oidc, 'issuer', 'auth.oidc.issuer', issues),
        clientId: requireString(oidc, 'clientId', 'auth.oidc.clientId', issues),
        clientSecret: requireString(oidc, 'clientSecret', 'auth.oidc.clientSecret', issues),
        redirectUri: requireString(oidc, 'redirectUri', 'auth.oidc.redirectUri', issues),
        groupsClaim: typeof oidc['groupsClaim'] === 'string' ? oidc['groupsClaim'] : 'groups',
        allowedGroups: stringList(oidc['allowedGroups'], 'auth.oidc.allowedGroups', issues),
      },
    }
  }

  if (mode === 'proxy') {
    const proxy = isObject(raw['proxy']) ? raw['proxy'] : {}
    return {
      mode,
      proxy: {
        userHeader:
          typeof proxy['userHeader'] === 'string' ? proxy['userHeader'] : 'remote-user',
        groupsHeader:
          typeof proxy['groupsHeader'] === 'string' ? proxy['groupsHeader'] : undefined,
      },
    }
  }

  return { mode }
}

/**
 * Environment overrides — deployment-specific values only.
 *
 * The line this draws matters: the FILE describes the instance (what it is,
 * which plugins, which driver), the ENVIRONMENT describes where it happens to
 * run and what secrets it holds. The predecessor put everything in env vars,
 * and nothing about it could be read as a whole.
 *
 * Container images need exactly this much: a Dockerfile cannot mount a
 * different config for `host` alone, and hardcoding 0.0.0.0 into the file
 * would carry that binding to a laptop.
 */
const ENV_OVERRIDES = {
  GOLEM_HOST: 'host',
  GOLEM_PORT: 'port',
  GOLEM_DATA_DIR: 'dataDir',
  GOLEM_WORKSPACE: 'workspace.root',
  GOLEM_PLUGINS_DIR: 'extensions.pluginsDir',
  GOLEM_SKINS_DIR: 'extensions.skinsDir',
} as const

/**
 * `${VAR}` in a config VALUE is replaced by the environment.
 *
 * This is what keeps a secret out of the file an operator commits: the OIDC
 * client secret lives in the environment, and the config says where it goes.
 * An undefined variable is left as written rather than blanked, so the error
 * names the placeholder instead of "invalid client".
 */
export function interpolate(source: string, env: NodeJS.ProcessEnv): string {
  return source.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    env[name] ?? whole,
  )
}

function applyOverrides(raw: Record<string, unknown>, env: NodeJS.ProcessEnv): void {
  for (const [variable, path] of Object.entries(ENV_OVERRIDES)) {
    const value = env[variable]
    if (value === undefined || value === '') continue

    const segments = path.split('.')
    let target = raw
    for (const segment of segments.slice(0, -1)) {
      if (!isObject(target[segment])) target[segment] = {}
      target = target[segment] as Record<string, unknown>
    }
    const key = segments.at(-1)!
    // Ports arrive as strings from the environment; everything else is a path
    // or a host, which is a string on both sides.
    target[key] = variable === 'GOLEM_PORT' ? Number.parseInt(value, 10) : value
  }
}

export function parseConfig(source: string, env: NodeJS.ProcessEnv = process.env): GolemConfig {
  const issues: string[] = []
  let raw: unknown
  try {
    raw = parseYaml(interpolate(source, env))
  } catch (error) {
    throw new ConfigError([`not valid YAML: ${(error as Error).message}`])
  }
  if (raw === null || raw === undefined) raw = {}
  if (!isObject(raw)) throw new ConfigError(['the config file must be a YAML mapping'])

  applyOverrides(raw, env)

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      // A typo here is a setting the operator believes is on. Silence would
      // make them debug the feature instead of the spelling.
      issues.push(`unknown setting "${key}"`)
    }
  }

  const port = raw['port'] ?? DEFAULTS.port
  // 0 is meaningful, not a mistake: it is the ask-the-OS-for-a-free-port
  // convention, which is how ephemeral and test instances bind.
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
    issues.push('port must be an integer between 0 and 65535 (0 = pick a free port)')
  }

  const maxConcurrentTurns = raw['maxConcurrentTurns'] ?? DEFAULTS.maxConcurrentTurns
  if (
    typeof maxConcurrentTurns !== 'number' ||
    !Number.isInteger(maxConcurrentTurns) ||
    maxConcurrentTurns < 1
  ) {
    issues.push('maxConcurrentTurns must be an integer >= 1')
  }

  const auth = parseAuth(raw['auth'], issues)

  const workspaceRaw = isObject(raw['workspace']) ? raw['workspace'] : {}
  const workspace: WorkspaceConfig = {
    root: typeof workspaceRaw['root'] === 'string' ? workspaceRaw['root'] : './workspace',
    pages: typeof workspaceRaw['pages'] === 'string' ? workspaceRaw['pages'] : 'pages',
    memory: typeof workspaceRaw['memory'] === 'string' ? workspaceRaw['memory'] : 'memory',
    planif: typeof workspaceRaw['planif'] === 'string' ? workspaceRaw['planif'] : 'planif',
  }

  const driverRaw = isObject(raw['driver']) ? raw['driver'] : {}
  const driverId = typeof driverRaw['id'] === 'string' ? driverRaw['id'] : 'claude-code'
  const modelsRaw = driverRaw['models']
  const models: { id: string; label?: string }[] = []
  if (modelsRaw !== undefined) {
    if (!Array.isArray(modelsRaw)) {
      issues.push('driver.models must be a list')
    } else {
      for (const [index, entry] of modelsRaw.entries()) {
        if (typeof entry === 'string') {
          models.push({ id: entry })
        } else if (isObject(entry) && typeof entry['id'] === 'string') {
          models.push(
            typeof entry['label'] === 'string'
              ? { id: entry['id'], label: entry['label'] }
              : { id: entry['id'] },
          )
        } else {
          issues.push(`driver.models[${index}] must be a model id or {id, label}`)
        }
      }
    }
  }

  const extensionsRaw = isObject(raw['extensions']) ? raw['extensions'] : {}
  const extensions: ExtensionsConfig = {
    pluginsDir:
      typeof extensionsRaw['pluginsDir'] === 'string' ? extensionsRaw['pluginsDir'] : './plugins',
    skinsDir: typeof extensionsRaw['skinsDir'] === 'string' ? extensionsRaw['skinsDir'] : './skins',
    apps: stringList(extensionsRaw['apps'], 'extensions.apps', issues),
    features: stringList(extensionsRaw['features'], 'extensions.features', issues),
    tools: stringList(extensionsRaw['tools'], 'extensions.tools', issues),
    skin: typeof extensionsRaw['skin'] === 'string' ? extensionsRaw['skin'] : 'default',
  }

  if (issues.length > 0) throw new ConfigError(issues)

  return {
    host: typeof raw['host'] === 'string' ? raw['host'] : DEFAULTS.host,
    port: port as number,
    dataDir: typeof raw['dataDir'] === 'string' ? raw['dataDir'] : DEFAULTS.dataDir,
    auth,
    workspace,
    driver: {
      id: driverId,
      models,
      ...(typeof driverRaw['command'] === 'string' ? { command: driverRaw['command'] } : {}),
    },
    extensions,
    maxConcurrentTurns: maxConcurrentTurns as number,
  }
}
