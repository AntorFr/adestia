/** `base`, plus a delegated conversation whose transcript carries two signature requests (E-13 is read-only, P-13 step 7). */
import { join } from 'node:path'
import { MCP_HEALTH, configFor, populate, storeToken } from './_base.mjs'
import { at, conversation, said } from './_lib.mjs'
import { SIGNATURE_ORIGIN, chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'none' }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  await conversation(join(ctx.dataDir, 'delegations'), 'gaston', {
    id: '10000000-0000-4000-8000-00000000000a', title: 'Réserve la salle du conseil', updatedAt: at(14, 5),
    messages: [
      said('user', 'Réserve la salle du conseil', { at: at(14, 4) }),
      said('agent', 'Une signature attend, une autre a expiré.', {
        at: at(14, 5), turn: 'turn-sig',
        signatures: [
          { id: 'consent-deleg', kind: 'consent', url: `${SIGNATURE_ORIGIN}/consent/consent-deleg`, expiresAt: '2099-01-01T10:00:00Z' },
          { id: 'grant-deleg', kind: 'grant', url: `${SIGNATURE_ORIGIN}/grant/grant-deleg`, expiresAt: '2020-01-01T10:00:00Z' },
        ],
      }),
    ],
  })
  return configFor(ctx)
}
