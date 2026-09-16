/**
 * Instance configuration — one declarative file, `adestia.config.yaml`.
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

import { readMcpServers } from './config/mcp.js'
import { isObject, parseUmask, requireString, stringList } from './config/values.js'
import type {
  AdestiaConfig,
  AttachmentsConfig,
  AuthConfig,
  ExtensionsConfig,
  McpInConfig,
  PermissionsConfig,
  ScheduleConfig,
  WorkspaceConfig,
} from './config/types.js'
import type { StoreDeclaration } from './stores.js'

export * from './config/types.js'
export { readMcpServer } from './config/mcp.js'

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

/**
 * How long a session lasts when the operator names no duration: half a day.
 *
 * Long enough that a person working through an afternoon is not interrupted,
 * short enough that a browser left open somewhere is not a standing door.
 * An instance that wants otherwise says so — see `auth.oidc.sessionTtlMs`.
 */
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** Minutes, at least: a session shorter than the login round trip is a loop. */
function sessionTtl(raw: unknown, issues: string[]): number {
  if (raw === undefined) return DEFAULT_SESSION_TTL_MS
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 60_000) {
    issues.push('auth.oidc.sessionTtlMs must be a number of milliseconds, at least 60000')
    return DEFAULT_SESSION_TTL_MS
  }
  return raw
}

const KNOWN_KEYS = new Set([
  'host',
  'port',
  'dataDir',
  'name',
  'locale',
  'secrets',
  'auth',
  'workspace',
  'driver',
  'extensions',
  // Tolerated and ignored: the interactive-permission layer was removed
  // (2026-08-26), and a config written for an earlier version must not brick
  // the instance over a block that no longer means anything.
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
const MCP_KEYS = new Set([
  'servers',
  'enabled',
  'token',
  'agentName',
  'description',
  'maxPending',
  'ttlMs',
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

const STORE_KEYS = new Set(['id', 'path', 'at', 'label', 'hue', 'default'])

function parseStores(
  raw: unknown,
  pages: string,
  issues: string[],
): readonly StoreDeclaration[] {
  const fallback: readonly StoreDeclaration[] = [{ id: 'perso', path: pages, default: true }]
  if (raw === undefined) return fallback
  if (!Array.isArray(raw)) {
    issues.push('workspace.stores must be a list of stores')
    return fallback
  }
  if (raw.length === 0) {
    // An empty list is a mistake with a plausible reading — "no stores" — and
    // that reading is an instance with no memory at all. Refused rather than
    // interpreted.
    issues.push('workspace.stores is empty: remove the key to keep the single store')
    return fallback
  }

  const declared: StoreDeclaration[] = []
  raw.forEach((entry, index) => {
    if (!isObject(entry)) {
      issues.push(`workspace.stores[${index}] must be an object`)
      return
    }
    for (const key of Object.keys(entry)) {
      if (!STORE_KEYS.has(key)) {
        // Same rule as everywhere here: a typo is a setting the operator
        // believes is applied and is not — a store silently unlabelled, or
        // mounted at the root when they meant a subfolder.
        issues.push(
          `workspace.stores[${index}].${key} is not a setting — known keys: ${[...STORE_KEYS].join(', ')}`,
        )
      }
    }
    const id = entry['id']
    const path = entry['path']
    if (typeof id !== 'string' || id === '') {
      issues.push(`workspace.stores[${index}].id is required`)
      return
    }
    if (typeof path !== 'string' || path === '') {
      issues.push(`workspace.stores.${id}.path is required`)
      return
    }
    for (const key of ['at', 'label', 'hue'] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== 'string') {
        issues.push(`workspace.stores.${id}.${key} must be text`)
      }
    }
    if (entry['default'] !== undefined && typeof entry['default'] !== 'boolean') {
      issues.push(`workspace.stores.${id}.default must be true or false`)
    }
    declared.push({
      id,
      path,
      ...(typeof entry['at'] === 'string' ? { at: entry['at'] } : {}),
      ...(typeof entry['label'] === 'string' ? { label: entry['label'] } : {}),
      ...(typeof entry['hue'] === 'string' ? { hue: entry['hue'] } : {}),
      ...(entry['default'] === true ? { default: true } : {}),
    })
  })

  return declared.length > 0 ? declared : fallback
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
        sessionTtlMs: sessionTtl(oidc['sessionTtlMs'], issues),
        ...(typeof oidc['sessionSecret'] === 'string'
          ? { sessionSecret: oidc['sessionSecret'] }
          : {}),
        ...(oidc['reboundAudience'] !== undefined
          ? {
              reboundAudience: stringList(
                oidc['reboundAudience'],
                'auth.oidc.reboundAudience',
                issues,
              ),
            }
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
  ADESTIA_HOST: 'host',
  ADESTIA_PORT: 'port',
  ADESTIA_DATA_DIR: 'dataDir',
  ADESTIA_WORKSPACE: 'workspace.root',
  ADESTIA_PLUGINS_DIR: 'extensions.pluginsDir',
  ADESTIA_SKINS_DIR: 'extensions.skinsDir',
} as const

/**
 * `${VAR}` in a config VALUE is replaced by the environment.
 *
 * This is what keeps a secret out of the file an operator commits: the OIDC
 * client secret lives in the environment, and the config says where it goes.
 * An undefined variable is left as written rather than blanked, so the error
 * names the placeholder instead of "invalid client".
 */
function interpolate(source: string, env: NodeJS.ProcessEnv): string {
  return source.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    env[name] ?? whole,
  )
}

/**
 * Kubernetes injects `<SERVICE>_PORT=tcp://10.43.0.1:8730` for every service
 * in the namespace. A deployment whose service is named `adestia` therefore
 * hands us a `ADESTIA_PORT` nobody wrote, and the obvious name is the one
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
 * The instance's name, which ends up on somebody's home screen.
 *
 * Refused rather than trimmed into something else: a name is displayed, in a
 * launcher that gives it about a dozen characters, and every rejection here is
 * a value that would have looked like a bug in the shell instead of a typo in
 * the file.
 */
function readInstanceName(value: unknown, issues: string[]): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    issues.push('name must be a string')
    return undefined
  }
  const name = value.trim()
  if (name === '') {
    // A blank name is not "no name": it is a manifest whose `name` is empty,
    // which some launchers show as an unnamed icon rather than falling back.
    issues.push('name must not be blank — remove the setting to use the default')
    return undefined
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    issues.push('name must not contain control characters')
    return undefined
  }
  if (name.length > 60) {
    issues.push(`name is ${name.length} characters; 60 is the most a name can usefully be`)
    return undefined
  }
  return name
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
    target[key] = variable === 'ADESTIA_PORT' ? Number.parseInt(value, 10) : value
  }
}

export function parseConfig(source: string, env: NodeJS.ProcessEnv = process.env): AdestiaConfig {
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
  const watchRaw = isObject(workspaceRaw['watch']) ? workspaceRaw['watch'] : {}
  for (const key of Object.keys(watchRaw)) {
    if (key !== 'enabled' && key !== 'polling' && key !== 'intervalMs') {
      // Same rule as the top level: a typo here is a live refresh the operator
      // believes is configured and is not.
      issues.push(`workspace.watch.${key} is not a setting — known keys: enabled, polling, intervalMs`)
    }
  }
  for (const key of ['enabled', 'polling'] as const) {
    if (watchRaw[key] !== undefined && typeof watchRaw[key] !== 'boolean') {
      issues.push(`workspace.watch.${key} must be true or false`)
    }
  }
  const watchIntervalMs = watchRaw['intervalMs'] ?? 2000
  if (typeof watchIntervalMs !== 'number' || !Number.isInteger(watchIntervalMs) || watchIntervalMs < 100) {
    // Below this, polling a big tree is a CPU spin dressed as a setting.
    issues.push('workspace.watch.intervalMs must be an integer >= 100')
  }
  const pages = typeof workspaceRaw['pages'] === 'string' ? workspaceRaw['pages'] : 'pages'
  const stores = parseStores(workspaceRaw['stores'], pages, issues)
  const umask = parseUmask(workspaceRaw['umask'], issues)

  const workspace: WorkspaceConfig = {
    root: typeof workspaceRaw['root'] === 'string' ? workspaceRaw['root'] : './workspace',
    pages,
    stores,
    memory: typeof workspaceRaw['memory'] === 'string' ? workspaceRaw['memory'] : 'memory',
    planif: typeof workspaceRaw['planif'] === 'string' ? workspaceRaw['planif'] : 'planif',
    ...(umask !== undefined ? { umask } : {}),
    watch: {
      enabled: watchRaw['enabled'] !== false,
      polling: watchRaw['polling'] === true,
      intervalMs: typeof watchIntervalMs === 'number' ? watchIntervalMs : 2000,
    },
  }

  const driverRaw = isObject(raw['driver']) ? raw['driver'] : {}
  const driverId = typeof driverRaw['id'] === 'string' ? driverRaw['id'] : 'claude-code'
  const agent = typeof driverRaw['agent'] === 'string' ? driverRaw['agent'] : undefined
  if (agent !== undefined && !/^[a-zA-Z][\w-]{0,63}$/.test(agent)) {
    issues.push('driver.agent must start with a letter and contain only letters, digits, dashes and underscores')
  }
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

  const shellToolsTransportRaw = driverRaw['shellToolsTransport']
  const shellToolsTransport =
    shellToolsTransportRaw === 'shell' || shellToolsTransportRaw === 'mcp' ? shellToolsTransportRaw : undefined
  if (shellToolsTransportRaw !== undefined && shellToolsTransport === undefined) {
    issues.push('driver.shellToolsTransport must be "mcp" or "shell"')
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
  // Absent means `open`: the posture an instance already runs under, so an
  // upgrade never silently starts asking somebody questions they did not ask
  // for. Legacy keys (autoAllow, timeoutMs, whenUnattended) are ignored —
  // tolerated on purpose, since a config written for an older Adestia must not
  // brick the instance over a block that no longer means anything.
  const permissionMode = permissionsRaw['mode'] ?? 'open'
  if (permissionMode !== 'open' && permissionMode !== 'ask') {
    issues.push('permissions.mode must be "open" or "ask"')
  }
  const permissions: PermissionsConfig = { mode: permissionMode as 'open' | 'ask' }

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
    ...(typeof mcpRaw['description'] === 'string' ? { description: mcpRaw['description'] } : {}),
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
  const name = readInstanceName(raw['name'], issues)

  if (issues.length > 0) throw new ConfigError(issues)

  return {
    mcpServers,
    host: typeof raw['host'] === 'string' ? raw['host'] : DEFAULTS.host,
    port: port as number,
    dataDir: typeof raw['dataDir'] === 'string' ? raw['dataDir'] : DEFAULTS.dataDir,
    ...(name ? { name } : {}),
    ...(typeof raw['locale'] === 'string' ? { locale: raw['locale'] } : {}),
    secrets,
    auth,
    workspace,
    driver: {
      id: driverId,
      ...(agent ? { agent } : {}),
      models,
      ...(shellToolsTransport ? { shellToolsTransport } : {}),
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
