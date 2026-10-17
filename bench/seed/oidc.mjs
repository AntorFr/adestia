/**
 * The populated instance behind a sign-in (E-1's gates, sign-out in E-15).
 *
 * The identity provider is `bench/oidc-stub.mjs`, started here and closed with
 * the launcher. `alice` (group `famille`) signs in; `visiteur` (group
 * `invites`) is refused by `allowedGroups`. The session secret is fixed, so a
 * check or a sweep can forge a cookie for a person the provider would not let
 * through — the only way to reach the « refused group » gate with a session.
 * The conversations belong to Alice (`bench-alice`).
 */
import { CLIENT_ID, CLIENT_SECRET, startOidcStub } from '../oidc-stub.mjs'
import { MCP_HEALTH, SESSION_SECRET, configFor, populate, storeToken } from './_base.mjs'
import { chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'writable' }
export { SESSION_SECRET }

export default async function seed(ctx) {
  const stub = await startOidcStub()
  ctx.onClose(stub.close)
  await populate(ctx, 'bench-alice')
  await storeToken(ctx.dataDir)
  return configFor(ctx).replace(
    'auth:\n  mode: none\n',
    `auth:
  mode: oidc
  oidc:
    issuer: ${stub.issuer}
    clientId: ${CLIENT_ID}
    clientSecret: ${CLIENT_SECRET}
    redirectUri: http://127.0.0.1:${ctx.port}/auth/callback
    groupsClaim: groups
    allowedGroups: [famille]
    sessionSecret: ${SESSION_SECRET}
`,
  )
}
