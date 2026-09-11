/**
 * The ■, pressed.
 *
 * The defect this is named after: the button posted the ENGINE's session id,
 * which only comes back when the turn is OVER. On a thread's first turn the
 * browser had none — the handler returned on the spot, no request left, and a
 * user pressed a live-looking button at a turn that kept going.
 *
 * What a picture adds to the tests: that the press LEAVES A MARK. A stop takes
 * a moment to reach an engine, and a button that looks untouched for that
 * moment is a button somebody presses again.
 */
import { appendFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const line = (entry) => `${JSON.stringify(entry)}\n`

/** Where the store keeps this instance's threads — one user, one directory. */
async function threadsDir(dataDir) {
  const root = join(dataDir, 'conversations')
  const [user] = await readdir(root)
  return join(root, user)
}

export default async function scenario(bench) {
  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Arrêter un tour' }),
  })
  const threads = await threadsDir(bench.dataDir)
  await appendFile(
    join(threads, `${live.id}.jsonl`),
    line({
      type: 'message',
      id: 'u1',
      role: 'user',
      text: 'Range les fiches de voyage par date de départ.',
      at: '2026-09-11T09:00:00.000Z',
    }),
  )

  // A thread that already carries an interruption, for the reload half: the
  // bench's server has no engine, so no turn it ran could leave one.
  const stored = 'c3c3c3c3-0000-4000-8000-000000000003'
  await writeFile(
    join(threads, `${stored}.jsonl`),
    [
      { type: 'meta', id: stored, title: 'Un tour arrêté', updatedAt: '2026-09-11T08:30:00.000Z' },
      {
        type: 'message',
        id: 'u1',
        role: 'user',
        text: 'Renomme toutes les fiches du garage.',
        at: '2026-09-11T08:30:00.000Z',
      },
      {
        type: 'message',
        id: 'a1',
        role: 'agent',
        text: "J'ai commencé par la liste d'outillage, puis",
        at: '2026-09-11T08:30:06.000Z',
        tools: [{ name: 'Read', target: 'atelier/outillage.md', ok: true }],
        stopped: true,
      },
    ]
      .map(line)
      .join(''),
  )

  const page = await bench.open({ tab: live.id })
  await bench.attached()

  // The server behind this bench has no engine, so its desk has no turn to
  // stop and would answer 409. Answered here the way a server with one does —
  // the point of the shot is what the BROWSER draws with that answer.
  const stops = []
  await page.route('**/api/turn/stop', async (route) => {
    stops.push(JSON.parse(route.request().postData() ?? '{}'))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stopped: true }),
    })
  })

  bench.emit({ type: 'text-delta', text: 'Je regarde les fiches.' })
  bench.emit({ type: 'tool-use', name: 'Read', target: 'voyages/baden.md' })
  await page.waitForTimeout(600)
  await bench.shoot(page, '1-running-stop-offered')

  await page.click('.adestia-composer__stop')
  await page.waitForTimeout(500)
  // Red and live, then spent and grey: the press is visible before the engine
  // has answered anything at all.
  await bench.shoot(page, '2-pressed-and-taken')

  // What the press actually SENT — the whole of the fix, in one line.
  console.log('STOP', JSON.stringify(stops))
  if (stops.length !== 1 || stops[0].conversation !== live.id) {
    throw new Error(`the stop must name the conversation, got ${JSON.stringify(stops)}`)
  }

  bench.emit({ type: 'result', sessionId: 's1', stopped: true })
  bench.endTurn()
  await page.waitForTimeout(900)
  await bench.shoot(page, '3-landed-and-marked')

  // The same interruption as it comes back from the store, in both themes and
  // on a phone: a marker nobody can read in the dark is not a marker.
  for (const theme of ['light', 'dark']) {
    const reloaded = await bench.open({ theme, tab: stored })
    await bench.shoot(reloaded, `4-from-the-store-${theme}`)
  }
  const phone = await bench.open({ tab: stored, width: 390, height: 844, touch: true })
  await bench.shoot(phone, '5-from-the-store-phone')
}
