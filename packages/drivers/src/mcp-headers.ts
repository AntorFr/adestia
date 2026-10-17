import type { McpServer } from './contract.js'
import type { McpTokens } from './mcp-oauth.js'

/** HTTP headers for this turn; undefined means the server must be omitted. */
export async function mcpHeaders(
  server: McpServer,
  tokens: McpTokens,
  callerToken?: string,
  serverTokens?: Readonly<Record<string, string>>,
): Promise<Record<string, string> | undefined> {
  const headers: Record<string, string> = { ...server.headers }
  if (server.identity === 'user') {
    // Somebody's own data. Without a person's token there is nobody to act
    // as, so the server is absent from this turn rather than reached with
    // the instance's identity — which would be a different person's data,
    // or a flat refusal read as a broken tool. The caller's token when the
    // turn has one; else the per-server token the core minted (only for
    // `background` servers, only on clock and callback turns). A `signIn`
    // server takes ONLY its own per-turn token: the rebound one is foreign
    // currency there, and presenting it would read as "failed" where the
    // truthful state is "this caller never connected".
    const token = server.signIn
      ? serverTokens?.[server.name]
      : (callerToken ?? serverTokens?.[server.name])
    if (!token) return undefined
    headers['Authorization'] = `Bearer ${token}`
  } else if (server.auth) {
    const token = await tokens.for(server.auth)
    // A server whose token could not be minted is OMITTED rather than sent
    // unauthenticated: the hub would refuse every call, and the agent would
    // read a wall of 401s as "the tool is broken" instead of "I am not
    // logged in". Absent, the CLI simply has one tool fewer.
    if (!token) return undefined
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
