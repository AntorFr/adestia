/** E-17/E-18: both engine questions and every stored signature outcome. */
import { MCP_HEALTH, configFor, populate, storeToken } from './_base.mjs'
import { at, conversation, said, userDirectory } from './_lib.mjs'
import { chatScripts, SIGNATURE_ORIGIN } from './_scripts.mjs'
import { untilStopped } from '../fake-engine.mjs'

export const THREADS = Object.fromEntries(['light-desk', 'light-phone', 'dark-desk', 'dark-phone'].map((key, i) => [key, `00000000-0000-4000-8000-00000000010${i}`]))

export const scripts = [
  ...[true, false].map((remembering) => ({
    when: remembering ? 'permission durable' : 'permission once',
    events: async function* (_prompt, request) {
      yield { type: 'permission-request', id: `permission-${remembering}`, tool: 'Bash', title: 'Run `cat pages/plan.md`?', reason: 'Seeded engine explanation.', remembering }
      await untilStopped(request.signal)
    },
  })),
  ...chatScripts,
]
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'none' }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const signature = (id, kind = 'consent', expiresAt = '2099-01-01T10:00:00Z') => ({ id, kind, url: `${SIGNATURE_ORIGIN}/${kind}/${id}`, expiresAt })
  for (const id of Object.values(THREADS)) await conversation(ctx.dataDir, userDirectory('local'), {
    id, title: 'Seeded decisions', updatedAt: at(17),
    messages: [said('agent', 'Seeded signatures.', {
      signatures: [signature('pending'), signature('signed'), signature('denied'), signature('expired', 'grant', '2020-01-01T10:00:00Z'), signature('grant', 'grant')],
    })],
  })
  return configFor(ctx, 'maxConcurrentTurns: 8\npermissions:\n  mode: ask\n')
}
