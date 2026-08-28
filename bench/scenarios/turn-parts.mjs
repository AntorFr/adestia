/**
 * A turn that speaks, goes back to work, and speaks again.
 *
 * The worked example, and the scenario that caught the pair of defects it is
 * named after: the working indicator used to be the ALTERNATIVE to the text
 * (so the first sentence killed it), and the whole turn used to land in one
 * bubble (so the second answer arrived glued under the first).
 *
 * Copy it for the next change: seed what the thread needs, script the events
 * the server would have sent, and take a picture at each state worth a look.
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
  // A thread for the live turn, created through the API so the store writes
  // its own metadata, and given the question the turn answers.
  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Fiche voyages' }),
  })
  const threads = await threadsDir(bench.dataDir)
  await appendFile(
    join(threads, `${live.id}.jsonl`),
    line({
      type: 'message',
      id: 'u1',
      role: 'user',
      text: "Regarde la fiche du voyage à Baden et dis-moi l'heure de départ.",
      at: '2026-08-28T09:00:00.000Z',
    }),
  )

  // And a second thread written straight to disk as the two agent messages a
  // finished turn leaves — the RELOAD half, which no live stream can prove.
  const stored = 'b2b2b2b2-0000-4000-8000-000000000002'
  await writeFile(
    join(threads, `${stored}.jsonl`),
    [
      { type: 'meta', id: stored, title: 'Deux réponses, un tour', updatedAt: '2026-08-28T09:10:00.000Z' },
      { type: 'message', id: 'u1', role: 'user', text: 'Combien de pages parlent du garage ?', at: '2026-08-28T09:10:00.000Z' },
      { type: 'message', id: 'a1', role: 'agent', text: "Je cherche dans l'atelier.", at: '2026-08-28T09:10:01.000Z' },
      {
        type: 'message',
        id: 'a2',
        role: 'agent',
        text: "Trois pages : le **plan**, le devis et la liste d'outillage. La dernière visite est datée du 19:30:59 — un horaire, pas une syntaxe.",
        at: '2026-08-28T09:10:09.000Z',
        tools: [
          { name: 'Grep', target: 'garage', ok: true },
          { name: 'Read', target: 'atelier/plan.md', ok: true },
        ],
        usage: { contextTokens: 4200 },
      },
    ]
      .map(line)
      .join(''),
  )

  // ── The turn, watched as it happens ───────────────────────────────────────
  const page = await bench.open({ tab: live.id })
  await bench.attached()

  bench.emit({ type: 'text-delta', text: 'Je regarde la fiche.' })
  await page.waitForTimeout(600)
  // The indicator must still be up UNDER the sentence: this is the picture
  // the bug was invisible in until somebody looked.
  await bench.shoot(page, '1-first-answer-still-working')

  bench.emit({ type: 'tool-use', name: 'Read', target: 'voyages/baden.md' })
  await page.waitForTimeout(400)
  await bench.shoot(page, '2-back-to-work-after-speaking')

  bench.emit({ type: 'tool-result', name: 'Read', ok: true })
  bench.emit({ type: 'text-delta', text: 'Le départ est à **19:30:59**, ' })
  bench.emit({ type: 'text-delta', text: 'retour le 3 à 7:15.' })
  await page.waitForTimeout(600)
  await bench.shoot(page, '3-second-answer-still-working')

  bench.emit({ type: 'result', sessionId: 's1', stopped: false, usage: { contextTokens: 4200 } })
  bench.endTurn()
  await page.waitForTimeout(900)
  await bench.shoot(page, '4-settled')

  // ── And the same shape, read back from the store ─────────────────────────
  for (const theme of ['light', 'dark']) {
    const reloaded = await bench.open({ theme, tab: stored })
    await bench.shoot(reloaded, `5-from-the-store-${theme}`)
  }
  const phone = await bench.open({ tab: stored, width: 390, height: 844 })
  await bench.shoot(phone, '6-from-the-store-phone')
}
