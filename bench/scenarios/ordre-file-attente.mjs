/**
 * A message sent during a turn, read back in the order it was said.
 *
 * Seen on a real instance: a follow-up typed while the agent was answering
 * reappeared, once the turn ended, right under the first question — and the
 * two answers stacked below both. The follow-up is filed on arrival, the
 * answer it waited behind only when its turn ends, so the file holds them out
 * of order; the store must read them back as they were said.
 *
 * Seeded exactly as the desk files it: question, follow-up (naming the turn it
 * waited behind), first answer, merged answer.
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const THEME = process.env.BENCH_THEME ?? 'light'

export default async function scenario(bench) {
  const thread = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'File d’attente' }),
  })
  const file = join(await bench.threadsDir(), `${thread.id}.jsonl`)
  const at = (s) => `2026-09-30T14:00:${String(s).padStart(2, '0')}.000Z`
  await appendFile(
    file,
    bench.line({ type: 'message', id: 'u1', role: 'user', text: 'Premier message', at: at(0) }) +
      bench.line({ type: 'message', id: 'u2', role: 'user', text: 'Second message, envoyé pendant le tour', at: at(5), after: 't1' }) +
      bench.line({ type: 'message', id: 'a1', role: 'agent', text: 'Réponse au premier', at: at(10), turn: 't1' }) +
      bench.line({ type: 'message', id: 'a2', role: 'agent', text: 'Réponse au second', at: at(15), turn: 't2' }),
  )

  const page = await bench.open({ theme: THEME, tab: thread.id, width: 390, height: 844, touch: true })
  await page.waitForSelector('text=Réponse au second')
  await page.waitForTimeout(400)
  await bench.shoot(page, `1-relu-${THEME}`)

  const bubbles = await page.locator('.adestia-bubble').allInnerTexts()
  const order = ['Premier message', 'Réponse au premier', 'Second message', 'Réponse au second'].map((text) =>
    bubbles.findIndex((bubble) => bubble.includes(text)),
  )
  console.log(`ORDER ${THEME}: ${JSON.stringify(order)}`)
  if (order.some((index, i) => index < 0 || (i > 0 && index <= order[i - 1]))) {
    throw new Error(`read back out of order:\n${bubbles.join('\n---\n')}`)
  }
}
