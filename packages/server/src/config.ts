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
  /**
   * Signs session cookies. Absent means one is generated per boot, which
   * signs everyone out on restart — fine for a single instance, wrong the
   * moment there are two behind a load balancer.
   */
  readonly sessionSecret?: string | undefined
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

/**
 * The instance's language, when its operator has one in mind.
 *
 * Absent, the shell asks the BROWSER — so a household gets its own language
 * with no configuration, and a visitor gets theirs on the same instance.
 * Setting it here is how an operator overrules that.
 */
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

/**
 * When the agent must ask, and what happens when nobody answers.
 *
 * The default is to ask for everything and refuse on silence. An agent that
 * proceeds because nobody was watching is an agent that did something nobody
 * approved — and unlike a turn that stalls, that is not recoverable.
 */
export interface PermissionsConfig {
  /** Tools that never ask. Matched exactly, never by prefix. */
  readonly autoAllow: readonly string[]
  readonly autoDeny: readonly string[]
  readonly timeoutMs: number
  readonly whenUnattended: 'allow' | 'deny'
}

/**
 * Scheduled turns.
 *
 * OFF by default, deliberately. A note that runs the agent while nobody is
 * watching spends a subscription and acts on a workspace; that has to be
 * something an operator turned on, never something they inherited.
 */
export interface ScheduleConfig {
  readonly enabled: boolean
  readonly tickMs?: number | undefined
}

export interface AttachmentsConfig {
  readonly maxBytes: number
  readonly maxFiles: number
  /** Age past which an unclaimed attachment is swept, in ms. `0` never sweeps. */
  readonly ttlMs: number
}

/**
 * Inbound MCP: letting other agents delegate work here.
 *
 * Off by default and refused without a token. An endpoint other machines can
 * reach that runs agent turns is a remote shell; an instance must never grow
 * one because a setting was left blank.
 */
/**
 * An MCP server the agent may CALL — the outbound direction.
 *
 * Either a `command` (stdio, launched by the CLI) or a `url` (http), never
 * both: they are two transports, and a server declaring both leaves the driver
 * guessing which one an operator meant.
 *
 * `env` values go through the same `${VAR}` substitution as everything else,
 * so a token lives in the environment and the committed file holds the wiring.
 */
export interface McpServerConfig {
  readonly name: string
  readonly command?: string | undefined
  readonly args?: readonly string[] | undefined
  readonly url?: string | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
  readonly headers?: Readonly<Record<string, string>> | undefined
  /**
   * Credentials for a hub that wants a short-lived OAuth token.
   *
   * The product mints and refreshes it per turn. Declared here rather than
   * pasted as a `headers.Authorization`, because a bearer written into a
   * config file works for one hour and then quietly stops.
   */
  readonly auth?: {
    readonly tokenUrl: string
    readonly clientId: string
    readonly clientSecret: string
    readonly scope?: string | undefined
    readonly audience?: string | undefined
  } | undefined
}

export interface McpInConfig {
  readonly enabled: boolean
  readonly token?: string | undefined
  readonly agentName: string
  readonly maxPending: number
  readonly ttlMs: number
}

export interface GolemConfig {
  readonly host: string
  readonly port: number
  readonly dataDir: string
  /** `fr`, `en`… Absent means: let the browser decide. */
  readonly locale?: string | undefined
  /**
   * Named secrets available to plugins that DECLARE them.
   *
   * Written as `NAME: ${ENV_VAR}` so the value stays in the environment and
   * the file an operator commits holds only the wiring. One entry serves
   * every plugin that names it — a key shared by two consumers is rotated in
   * one place.
   */
  readonly secrets: Readonly<Record<string, string>>
  readonly auth: AuthConfig
  readonly workspace: WorkspaceConfig
  readonly driver: DriverConfig
  readonly extensions: ExtensionsConfig
  readonly permissions: PermissionsConfig
  readonly schedule: ScheduleConfig
  readonly attachments: AttachmentsConfig
  readonly mcp: McpInConfig
  /**
   * Outbound MCP servers, the OPERATOR layer.
   *
   * One of three sources the design names, and the canonical one: a plugin may
   * bring its own, and the CLI's native config stays the user's business. This
   * layer wins a name conflict, loudly.
   */
  readonly mcpServers: readonly McpServerConfig[]
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
  'locale',
  'secrets',
  'auth',
  'workspace',
  'driver',
  'extensions',
  'permissions',
  'schedule',
  'attachments',
  'mcp',
  'maxConcurrentTurns',
])

/**
 * What may appear inside `mcp:`.
 *
 * Two directions in one block: `servers` is what the agent may CALL, the rest
 * is the endpoint other agents call HERE. Kept together because that is where
 * an operator looks for anything MCP, and told apart in the example config.
 */
const MCP_KEYS = new Set(['servers', 'enabled', 'token', 'agentName', 'maxPending', 'ttlMs'])

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
        ...(typeof oidc['sessionSecret'] === 'string'
          ? { sessionSecret: oidc['sessionSecret'] }
          : {}),
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

/**
 * Kubernetes injects `<SERVICE>_PORT=tcp://10.43.0.1:8730` for every service
 * in the namespace. A deployment whose service is named `golem` therefore
 * hands us a `GOLEM_PORT` nobody wrote, and the obvious name is the one
 * everybody picks.
 *
 * Ignored rather than parsed: it is not an operator's intent, it is the
 * platform talking about itself. Refusing to boot over it — which is what
 * happened, with an error blaming the port — makes the product unusable on
 * the platform it is meant to run on, for the crime of being named after
 * itself.
 */
const SERVICE_LINK = /^[a-z]+:\/\//

/**
 * The instance's secret table.
 *
 * Names are checked against the same shape a manifest must declare, and a
 * value left as an un-substituted `${VAR}` is REFUSED rather than handed to a
 * plugin: a key that is literally the string "${GOOGLE_MAPS_API_KEY}" fails
 * somewhere far away, in a request nobody is watching.
 */
function readSecrets(raw: unknown, issues: string[]): Readonly<Record<string, string>> {
  if (raw === undefined) return {}
  if (!isObject(raw)) {
    issues.push('secrets must be a mapping of NAME to value')
    return {}
  }
  const secrets: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) {
      issues.push(`secrets: "${name}" is not a secret name (A-Z, digits and underscores)`)
      continue
    }
    if (typeof value !== 'string' || value === '') {
      issues.push(`secrets.${name} must be a non-empty string`)
      continue
    }
    if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value)) {
      issues.push(`secrets.${name} is still "${value}" — that variable is not set`)
      continue
    }
    secrets[name] = value
  }
  return secrets
}

/**
 * The outbound MCP servers an operator declared.
 *
 * Every refusal here is a server the agent would otherwise be missing without
 * knowing it. Before this existed the block was accepted and IGNORED — an
 * instance booted clean and the agent simply never saw the servers somebody
 * had configured, which is the worst way for a feature to be absent.
 */
/**
 * The OAuth identity a server may declare.
 *
 * Returns `false` — distinct from `undefined` — when the block is present and
 * wrong: the caller then skips the server entirely rather than wiring one that
 * will be refused on every call.
 */
function readMcpAuth(
  raw: unknown,
  where: string,
  issues: string[],
): McpServerConfig['auth'] | false {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    issues.push(`${where}.auth must be a mapping`)
    return false
  }

  const fields: Record<string, string> = {}
  for (const field of ['tokenUrl', 'clientId', 'clientSecret'] as const) {
    const value = raw[field]
    if (typeof value !== 'string' || value === '') {
      issues.push(`${where}.auth.${field} is required`)
      return false
    }
    if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value)) {
      // Same rule as a secret: a literal placeholder reaching a token endpoint
      // fails as `invalid_client`, which reads as a wrong secret rather than
      // as a variable nobody set.
      issues.push(`${where}.auth.${field} is still "${value}" — that variable is not set`)
      return false
    }
    fields[field] = value
  }

  const optional: Record<string, string> = {}
  for (const field of ['scope', 'audience'] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || value === '') {
      issues.push(`${where}.auth.${field} must be a non-empty string`)
      return false
    }
    optional[field] = value
  }

  return {
    tokenUrl: fields['tokenUrl']!,
    clientId: fields['clientId']!,
    clientSecret: fields['clientSecret']!,
    ...(optional['scope'] ? { scope: optional['scope'] } : {}),
    ...(optional['audience'] ? { audience: optional['audience'] } : {}),
  }
}

function readMcpServers(raw: unknown, issues: string[]): readonly McpServerConfig[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    issues.push('mcp.servers must be a list')
    return []
  }

  const servers: McpServerConfig[] = []
  const seen = new Set<string>()

  for (const [index, entry] of raw.entries()) {
    const where = `mcp.servers[${index}]`
    if (!isObject(entry)) {
      issues.push(`${where} must be a mapping`)
      continue
    }

    const name = entry['name']
    if (typeof name !== 'string' || !/^[a-zA-Z][\w-]{0,63}$/.test(name)) {
      issues.push(`${where}.name is required (letters, digits, dashes and underscores)`)
      continue
    }
    if (seen.has(name)) {
      // Two servers with one name is a config whose meaning depends on order.
      issues.push(`${where}: "${name}" is declared twice`)
      continue
    }
    seen.add(name)

    const command = typeof entry['command'] === 'string' ? entry['command'] : undefined
    const url = typeof entry['url'] === 'string' ? entry['url'] : undefined
    if (!command && !url) {
      issues.push(`${where}: needs either "command" (stdio) or "url" (http)`)
      continue
    }
    if (command && url) {
      issues.push(`${where}: has both "command" and "url" — pick one transport`)
      continue
    }

    const args = entry['args']
    if (args !== undefined && !(Array.isArray(args) && args.every((a) => typeof a === 'string'))) {
      issues.push(`${where}.args must be a list of strings`)
      continue
    }

    const maps: Record<'env' | 'headers', Record<string, string> | undefined> = {
      env: undefined,
      headers: undefined,
    }
    let bad = false
    for (const field of ['env', 'headers'] as const) {
      const value = entry[field]
      if (value === undefined) continue
      if (!isObject(value)) {
        issues.push(`${where}.${field} must be a mapping`)
        bad = true
        break
      }
      const table: Record<string, string> = {}
      for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string') {
          issues.push(`${where}.${field}.${key} must be a string`)
          bad = true
          break
        }
        if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(item)) {
          // Same rule as a secret: a literal "${TOKEN}" reaching a server
          // fails later, in a call, blaming the server rather than the config.
          issues.push(`${where}.${field}.${key} is still "${item}" — that variable is not set`)
          bad = true
          break
        }
        table[key] = item
      }
      maps[field] = table
    }
    if (bad) continue

    const auth = readMcpAuth(entry['auth'], where, issues)
    if (auth === false) continue
    if (auth && !url) {
      // A stdio server is a local process; there is nobody to present a bearer
      // to. Accepting it would mint a token every turn and hand it to nothing.
      issues.push(`${where}.auth needs "url" — a stdio server has nobody to authenticate to`)
      continue
    }

    servers.push({
      name,
      ...(auth ? { auth } : {}),
      ...(command ? { command } : {}),
      ...(args ? { args: args as readonly string[] } : {}),
      ...(url ? { url } : {}),
      ...(maps.env ? { env: maps.env } : {}),
      ...(maps.headers ? { headers: maps.headers } : {}),
    })
  }

  return servers
}

function applyOverrides(raw: Record<string, unknown>, env: NodeJS.ProcessEnv): void {
  for (const [variable, path] of Object.entries(ENV_OVERRIDES)) {
    const value = env[variable]
    if (value === undefined || value === '') continue
    if (SERVICE_LINK.test(value)) continue

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

  const permissionsRaw = isObject(raw['permissions']) ? raw['permissions'] : {}
  const whenUnattended = permissionsRaw['whenUnattended'] ?? 'deny'
  if (whenUnattended !== 'allow' && whenUnattended !== 'deny') {
    issues.push('permissions.whenUnattended must be "allow" or "deny"')
  }
  const timeoutMs = permissionsRaw['timeoutMs'] ?? 300_000
  if (typeof timeoutMs !== 'number' || timeoutMs < 1000) {
    issues.push('permissions.timeoutMs must be a number of milliseconds >= 1000')
  }

  const permissions: PermissionsConfig = {
    autoAllow: stringList(permissionsRaw['autoAllow'], 'permissions.autoAllow', issues),
    autoDeny: stringList(permissionsRaw['autoDeny'], 'permissions.autoDeny', issues),
    timeoutMs: timeoutMs as number,
    whenUnattended: whenUnattended as 'allow' | 'deny',
  }

  const scheduleRaw = isObject(raw['schedule']) ? raw['schedule'] : {}
  const scheduleEnabled = scheduleRaw['enabled'] ?? false
  if (typeof scheduleEnabled !== 'boolean') {
    issues.push('schedule.enabled must be true or false')
  }
  const schedule: ScheduleConfig = {
    enabled: scheduleEnabled === true,
    ...(typeof scheduleRaw['tickMs'] === 'number' ? { tickMs: scheduleRaw['tickMs'] } : {}),
  }

  const attachmentsRaw = isObject(raw['attachments']) ? raw['attachments'] : {}
  const attachments: AttachmentsConfig = {
    maxBytes:
      typeof attachmentsRaw['maxBytes'] === 'number'
        ? attachmentsRaw['maxBytes']
        : 25 * 1024 * 1024,
    maxFiles: typeof attachmentsRaw['maxFiles'] === 'number' ? attachmentsRaw['maxFiles'] : 8,
    ttlMs: typeof attachmentsRaw['ttlMs'] === 'number' ? attachmentsRaw['ttlMs'] : 86_400_000,
  }
  if (attachments.maxBytes < 1 || attachments.maxFiles < 1) {
    issues.push('attachments.maxBytes and attachments.maxFiles must be at least 1')
  }

  const mcpRaw = isObject(raw['mcp']) ? raw['mcp'] : {}
  // Unknown keys are refused at the top level, and were NOT inside a block —
  // which is how `mcp.servers`, the very shape the design documents, could be
  // written, accepted and ignored. This block has two directions in it, so it
  // is the one where a typo costs the most.
  for (const key of Object.keys(mcpRaw)) {
    if (!MCP_KEYS.has(key)) {
      issues.push(`mcp.${key} is not a setting — known keys: ${[...MCP_KEYS].join(', ')}`)
    }
  }
  const mcpServers = readMcpServers(mcpRaw['servers'], issues)
  const mcpEnabled = mcpRaw['enabled'] === true
  const mcp: McpInConfig = {
    enabled: mcpEnabled,
    ...(typeof mcpRaw['token'] === 'string' ? { token: mcpRaw['token'] } : {}),
    agentName: typeof mcpRaw['agentName'] === 'string' ? mcpRaw['agentName'] : 'agent',
    maxPending: typeof mcpRaw['maxPending'] === 'number' ? mcpRaw['maxPending'] : 4,
    ttlMs: typeof mcpRaw['ttlMs'] === 'number' ? mcpRaw['ttlMs'] : 3_600_000,
  }
  if (mcpEnabled && !mcp.token) {
    issues.push('mcp.enabled requires mcp.token — an open inbound endpoint runs agent turns')
  }
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(mcp.agentName)) {
    // It becomes a tool name in another agent's list; anything else produces a
    // tool nobody can call.
    issues.push('mcp.agentName must be lowercase letters, digits and underscores')
  }

  // Before the throw, or its own refusals are collected and never raised —
  // which is how a bad secret name reached a plugin with no complaint.
  const secrets = readSecrets(raw['secrets'], issues)

  if (issues.length > 0) throw new ConfigError(issues)

  return {
    mcpServers,
    host: typeof raw['host'] === 'string' ? raw['host'] : DEFAULTS.host,
    port: port as number,
    dataDir: typeof raw['dataDir'] === 'string' ? raw['dataDir'] : DEFAULTS.dataDir,
    ...(typeof raw['locale'] === 'string' ? { locale: raw['locale'] } : {}),
    secrets,
    auth,
    workspace,
    driver: {
      id: driverId,
      models,
      ...(typeof driverRaw['command'] === 'string' ? { command: driverRaw['command'] } : {}),
    },
    extensions,
    permissions,
    schedule,
    attachments,
    mcp,
    maxConcurrentTurns: maxConcurrentTurns as number,
  }
}
