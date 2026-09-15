/**
 * The agent renames its own conversation mid-turn.
 *
 * What the pictures must prove: the tab keeps its stale name WHILE the turn
 * runs (the local copy is the tab's truth until settle), then follows the new
 * title the moment the turn settles — no reload — and the thread list says
 * the same thing. The engine is the one thing the bench fakes, so the rename
 * the tool would have performed lands through the same server route the
 * handler calls.
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function scenario(bench) {
  // Named the way every thread is named today: the first 48 characters of
  // whatever the person typed — the very problem the tool exists to fix.
  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'donne un vrai nom à ce fil, on ne le retrouve …' }),
  })
  await appendFile(
    join(await bench.threadsDir(), `${live.id}.jsonl`),
    bench.line({
      type: 'message',
      id: 'u1',
      role: 'user',
      text: 'Donne un vrai nom à ce fil, on ne le retrouve jamais dans la liste.',
      at: '2026-08-30T09:00:00.000Z',
    }),
  )

  const page = await bench.open({ tab: live.id })
  await bench.attached()

  bench.emit({ type: 'text-delta', text: 'Bonne idée — je le renomme.' })
  bench.emit({ type: 'tool-use', name: 'rename_conversation' })
  await bench.api(`/api/conversations/${live.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Chauffe-eau du garage' }),
  })
  bench.emit({ type: 'tool-result', name: 'rename_conversation', ok: true })
  bench.emit({ type: 'text-delta', text: 'Fait : « Chauffe-eau du garage ».' })
  await page.waitForTimeout(600)
  // Mid-turn: the SERVER already holds the new name, the tab still shows the
  // old one — the stale copy is only allowed to survive until settle.
  await bench.shoot(page, '1-renamed-server-side-tab-still-stale')

  // The desk files the turn BEFORE it ends the stream — exactly the lines its
  // finish closure appends — and the shell reads them back at settle: what
  // stays on screen after a turn is what the store holds, never the fragment.
  await appendFile(
    join(await bench.threadsDir(), `${live.id}.jsonl`),
    [
      { type: 'message', id: 'a1', role: 'agent', text: 'Bonne idée — je le renomme.', at: '2026-08-30T09:00:02.000Z' },
      {
        type: 'message',
        id: 'a2',
        role: 'agent',
        text: 'Fait : « Chauffe-eau du garage ».',
        at: '2026-08-30T09:00:04.000Z',
        tools: [{ name: 'rename_conversation', ok: true }],
      },
      { type: 'session', sessionId: 's1', at: '2026-08-30T09:00:04.001Z' },
    ]
      .map(bench.line)
      .join(''),
  )
  bench.emit({ type: 'result', sessionId: 's1', stopped: false })
  bench.endTurn()
  await page.waitForTimeout(900)
  // Settled: the tab follows, without a reload.
  await bench.shoot(page, '2-settled-tab-follows')

  // And the list agrees — the surface the whole feature exists for.
  await page.click('button[aria-label="Conversations"]')
  await page.waitForTimeout(400)
  await bench.shoot(page, '3-list-agrees')

  const dark = await bench.open({ theme: 'dark', tab: live.id })
  await bench.shoot(dark, '4-settled-dark')
}
