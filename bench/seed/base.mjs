/**
 * The populated instance without a visible configuration: pages, sections,
 * a collection, conversations in every state, MCP servers in every health,
 * instructions and catalogues, delegations, a stored credential, a refused
 * plugin. Started by the launcher without a settings route (E-14 « n'expose
 * pas sa configuration »). See `_base.mjs` for the content.
 */
import { MCP_HEALTH, configFor, populate, storeToken } from './_base.mjs'
import { chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
/** `none`: no `configPath` — the launcher hides `/api/settings`. */
export const config = { file: 'none' }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  return configFor(ctx)
}
