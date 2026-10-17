/**
 * The populated instance with a configuration file the screen can read: a
 * writable one (E-14). The credential is stored (E-15).
 */
import { MCP_HEALTH, configFor, populate, storeToken } from './_base.mjs'
import { chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'writable' }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  return configFor(ctx)
}
