/** The rail's finished, interrupted and failed turns, plus a genuinely long list. */
import { MCP_HEALTH, CONVERSATIONS, configFor, populate, storeToken, ready as baseReady } from './_base.mjs'
import { at, conversation, said, userDirectory } from './_lib.mjs'
import { chatScripts } from './_scripts.mjs'

export const WAITING = '00000000-0000-4000-8000-000000000008'
export async function ready({ url }) {
  await baseReady({ url })
  const response = await fetch(`${url}/api/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'permission', conversationId: WAITING }) })
  if (!response.ok) throw new Error(`Waiting seed refused: ${response.status}`)
  const reader = response.body.getReader()
  await reader.read()
  await reader.cancel()
}
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed', models: [
  { id: 'bench-long', label: 'A deliberately very long model name for the narrow header' },
] }
export const config = { file: 'none' }

export async function railThreads(dataDir) {
  const owner = userDirectory('local')
  await conversation(dataDir, owner, {
    id: CONVERSATIONS.rich, title: 'Rail — finished, interrupted, failed', updatedAt: at(16),
    messages: [
      said('user', 'Check the pages.'),
      said('agent', 'The first page is ready.', { tools: [{ name: 'Read', target: 'pages/plan.md', ok: true }], usage: { contextTokens: 150000 } }),
      said('agent', 'The next step was interrupted.', { stopped: true }),
      said('agent', '', { error: 'Seeded engine error.' }),
      said('agent', 'Two more tool calls.', { tools: [{ name: 'Read', target: 'pages/next.md', ok: false }, { name: 'Glob', target: 'pages/*.md' }], usage: { contextTokens: 150000 } }),
    ],
  })
  await conversation(dataDir, owner, { id: WAITING, title: 'Seeded waiting conversation', updatedAt: at(16), messages: [said('user', 'permission')] })
  for (let i = 10; i < 40; i++) {
    await conversation(dataDir, owner, {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      title: `Seeded conversation ${i} — a deliberately long title`, updatedAt: at(8),
      messages: [said('user', `Seeded question ${i}.`)],
    })
  }
}

export default async function seed(ctx) {
  await populate(ctx)
  await railThreads(ctx.dataDir)
  await storeToken(ctx.dataDir)
  return configFor(ctx, 'maxConcurrentTurns: 8\n')
}
