/**
 * The phone that slept through a turn.
 *
 * Seen on a real instance: a thread's first turn was running when the phone
 * went to sleep. The desk finished it and wrote the answer; the page woke to a
 * dead stream and drew a lone tool call over the browser's network error —
 * the answer nowhere on screen, and the next message posted without the
 * engine session, so the thread forgot its first turn.
 *
 * What a picture adds to the tests: that on a phone the page that wakes shows
 * the answer the desk wrote, and no error left behind. One pass only: the
 * bench serves its scripted stream once per run, and a second page would wait
 * for an attachment that never comes.
 */
import { appendFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const line = (entry) => `${JSON.stringify(entry)}\n`
const ANSWER = 'Référence Festool : 200051'
const THEME = 'light'

/** Where the store keeps this instance's threads — one user, one directory. */
async function threadsDir(dataDir) {
  const root = join(dataDir, 'conversations')
  const [user] = await readdir(root)
  return join(root, user)
}

export default async function scenario(bench) {
  const thread = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Tuyau Festool' }),
  })
  const file = join(await threadsDir(bench.dataDir), `${thread.id}.jsonl`)
  await appendFile(
    file,
    line({
      type: 'message',
      id: 'u1',
      role: 'user',
      text: "Retrouve dans mes mails la référence de l'extension de tuyau d'aspiration Festool.",
      at: '2026-09-14T18:32:32.000Z',
    }),
  )

  const page = await bench.open({ theme: THEME, tab: thread.id, width: 390, height: 844, touch: true })
  await bench.attached()
  bench.emit({ type: 'tool-use', name: 'search_mail', target: 'Festool', id: 't1' })
  await page.waitForTimeout(600)
  await bench.shoot(page, `1-running-${THEME}`)

  // While the phone sleeps, the desk finishes the turn and writes it —
  // exactly the lines its finish closure would append.
  await appendFile(
    file,
    line({
      type: 'message',
      id: 'a1',
      role: 'agent',
      text: `Monsieur, retrouvé — un seul achat dans Gmail.\n\n${ANSWER}`,
      at: '2026-09-14T18:33:35.000Z',
      tools: [{ name: 'search_mail', target: 'Festool', ok: true }],
    }) + line({ type: 'session', sessionId: 'engine-1', at: '2026-09-14T18:33:35.001Z' }),
  )
  bench.cutTurn()
  await page.waitForTimeout(1200)
  await bench.shoot(page, `2-woken-${THEME}`)

  const text = await page.locator('.adestia-chat').innerText()
  console.log(`WOKEN ${THEME}: answer shown=${text.includes(ANSWER)}`)
  if (!text.includes(ANSWER)) {
    throw new Error(`the page woke without the answer the desk wrote:\n${text}`)
  }
}
