/**
 * The outbound MCP servers an operator declared.
 *
 * Every refusal here is a server the agent would otherwise be missing without
 * knowing it. Before this existed the block was accepted and IGNORED — an
 * instance booted clean and the agent simply never saw the servers somebody
 * had configured, which is the worst way for a feature to be absent.
 */

import type { McpServerConfig } from './types.js'
import { isObject } from './values.js'

/**
 * The OAuth identity a server may declare.
 *
 * Returns `false` — distinct from `undefined` — when the block is present and
 * wrong: the caller then skips the server entirely rather than wiring one that
 * will be refused on every call.
 */
export function readMcpAuth(
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
  for (const field of ['tokenUrl', 'clientId'] as const) {
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

  // A confidential client presents `clientSecret` (client_credentials); a
  // public client presents a `refreshToken` minted once through an interactive
  // authorization-code flow. One of the two is required, never neither.
  const creds: Record<string, string> = {}
  for (const field of ['clientSecret', 'refreshToken'] as const) {
    const value = raw[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || value === '') {
      issues.push(`${where}.auth.${field} must be a non-empty string`)
      return false
    }
    if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value)) {
      issues.push(`${where}.auth.${field} is still "${value}" — that variable is not set`)
      return false
    }
    creds[field] = value
  }
  if (!creds['clientSecret'] && !creds['refreshToken']) {
    issues.push(
      `${where}.auth needs either "clientSecret" (client_credentials) or "refreshToken" (a token from an interactive login)`,
    )
    return false
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
    ...(creds['clientSecret'] ? { clientSecret: creds['clientSecret'] } : {}),
    ...(creds['refreshToken'] ? { refreshToken: creds['refreshToken'] } : {}),
    ...(optional['scope'] ? { scope: optional['scope'] } : {}),
    ...(optional['audience'] ? { audience: optional['audience'] } : {}),
  }
}

/**
 * One MCP server entry, validated.
 *
 * Split out of the list reader so ONE grammar governs the two places a server
 * may now be declared: the operator's YAML, and the overlay the shell writes
 * (`mcp-store.ts`). A looser second validator on the write path would be a way
 * to store, from a browser, a server the config file itself would have refused.
 */
export function readMcpServer(
  entry: unknown,
  where: string,
  issues: string[],
): McpServerConfig | undefined {
  if (!isObject(entry)) {
    issues.push(`${where} must be a mapping`)
    return undefined
  }

  const name = entry['name']
  if (typeof name !== 'string' || !/^[a-zA-Z][\w-]{0,63}$/.test(name)) {
    issues.push(`${where}.name is required (letters, digits, dashes and underscores)`)
    return undefined
  }

  const command = typeof entry['command'] === 'string' ? entry['command'] : undefined
  const url = typeof entry['url'] === 'string' ? entry['url'] : undefined
  if (!command && !url) {
    issues.push(`${where}: needs either "command" (stdio) or "url" (http)`)
    return undefined
  }
  if (command && url) {
    issues.push(`${where}: has both "command" and "url" — pick one transport`)
    return undefined
  }

  const args = entry['args']
  if (args !== undefined && !(Array.isArray(args) && args.every((a) => typeof a === 'string'))) {
    issues.push(`${where}.args must be a list of strings`)
    return undefined
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
  if (bad) return undefined

  const identity = entry['identity']
  if (identity !== undefined && identity !== 'machine' && identity !== 'user') {
    issues.push(`${where}.identity must be "machine" or "user"`)
    return undefined
  }

  const auth = readMcpAuth(entry['auth'], where, issues)
  if (auth === false) return undefined
  if (identity === 'user' && !url) {
    issues.push(`${where}.identity: user needs "url" — a local process has no caller to act as`)
    return undefined
  }
  if (auth && !url) {
    // A stdio server is a local process; there is nobody to present a bearer
    // to. Accepting it would mint a token every turn and hand it to nothing.
    issues.push(`${where}.auth needs "url" — a stdio server has nobody to authenticate to`)
    return undefined
  }

  const signIn = entry['signIn']
  if (signIn !== undefined && signIn !== 'oauth') {
    issues.push(`${where}.signIn must be "oauth"`)
    return undefined
  }
  if (signIn && identity !== 'user') {
    // The whole point of signIn is per-person tokens; on a machine server it
    // would mean nothing and silently behave as one more unauthenticated URL.
    issues.push(`${where}.signIn needs identity: user — connecting is something a PERSON does`)
    return undefined
  }
  if (signIn && auth) {
    issues.push(`${where}: has both "signIn" and "auth" — one token source per server`)
    return undefined
  }

  return {
    name,
    ...(identity ? { identity } : {}),
    ...(signIn ? { signIn } : {}),
    ...(auth ? { auth } : {}),
    ...(command ? { command } : {}),
    ...(args ? { args: args as readonly string[] } : {}),
    ...(url ? { url } : {}),
    ...(maps.env ? { env: maps.env } : {}),
    ...(maps.headers ? { headers: maps.headers } : {}),
  }
}

export function readMcpServers(raw: unknown, issues: string[]): readonly McpServerConfig[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    issues.push('mcp.servers must be a list')
    return []
  }

  const servers: McpServerConfig[] = []
  const seen = new Set<string>()

  for (const [index, entry] of raw.entries()) {
    const server = readMcpServer(entry, `mcp.servers[${index}]`, issues)
    if (!server) continue
    if (seen.has(server.name)) {
      // Two servers with one name is a config whose meaning depends on order.
      issues.push(`mcp.servers[${index}]: "${server.name}" is declared twice`)
      continue
    }
    seen.add(server.name)
    servers.push(server)
  }

  return servers
}
