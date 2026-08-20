/**
 * Identity — three modes, no local user database, ever.
 *
 * Golem never stores passwords and never owns accounts. Identity either comes
 * from outside (an OIDC issuer, a trusted reverse proxy) or nobody asks
 * (`none`, for a single-user machine). Roles are derived from group membership
 * at each request or login — the identity provider stays the source of truth,
 * and anything Golem keeps is a cache.
 *
 * This module resolves identity only. The OIDC login dance itself lives in its
 * own module; here is what every request goes through.
 */

import type { AuthConfig } from './config.js'

export interface Identity {
  readonly userId: string
  readonly displayName: string
  readonly groups: readonly string[]
}

/** The implicit single user of an ungated instance. */
export const LOCAL_USER: Identity = {
  userId: 'local',
  displayName: 'Local user',
  groups: [],
}

export type AuthOutcome =
  | { readonly ok: true; readonly identity: Identity }
  | { readonly ok: false; readonly status: 401 | 403; readonly reason: string }

export interface RequestLike {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  /** Set by the session layer once a user has completed an OIDC login. */
  readonly session?: { readonly identity?: Identity } | undefined
}

function header(request: RequestLike, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    // Two values for an identity header means something upstream is confused,
    // or someone is trying to smuggle one past the proxy. Neither is a request
    // to serve.
    return undefined
  }
  return value
}

function allowed(identity: Identity, allowedGroups: readonly string[]): boolean {
  if (allowedGroups.length === 0) return true
  return identity.groups.some((group) => allowedGroups.includes(group))
}

export function resolveIdentity(request: RequestLike, config: AuthConfig): AuthOutcome {
  switch (config.mode) {
    case 'none':
      return { ok: true, identity: LOCAL_USER }

    case 'proxy': {
      const proxy = config.proxy
      if (!proxy) return { ok: false, status: 401, reason: 'proxy auth is not configured' }

      const user = header(request, proxy.userHeader)
      if (!user) {
        // No fallback to an anonymous identity: in proxy mode a missing header
        // means the proxy is bypassed, which is exactly when you must not
        // serve the request.
        return { ok: false, status: 401, reason: `missing ${proxy.userHeader} header` }
      }

      const rawGroups = proxy.groupsHeader ? header(request, proxy.groupsHeader) : undefined
      const groups = rawGroups
        ? rawGroups
            .split(',')
            .map((group) => group.trim())
            .filter((group) => group.length > 0)
        : []

      return { ok: true, identity: { userId: user, displayName: user, groups } }
    }

    case 'oidc': {
      const identity = request.session?.identity
      if (!identity) return { ok: false, status: 401, reason: 'not signed in' }
      if (!allowed(identity, config.oidc?.allowedGroups ?? [])) {
        return { ok: false, status: 403, reason: 'not a member of an allowed group' }
      }
      return { ok: true, identity }
    }
  }
}

/**
 * Routes served before identity is known. Deliberately tiny and explicit: a
 * public-path prefix rule ("anything under /public") is how an endpoint ends
 * up unauthenticated by accident.
 */
export const PUBLIC_ROUTES = new Set(['/api/health', '/auth/login', '/auth/callback', '/auth/logout'])

export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.has(path)
}
