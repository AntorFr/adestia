/**
 * What a tool call LOOKS like once it is over.
 *
 * The trace styles each row from `ok` — `--failed`, `--done`, `--running` —
 * and `ok` was never written: a `tool_result` block carries no name, the
 * driver read one off it anyway, and the result matched no pending call. So
 * every tool row in every thread, live or years old, was drawn as still
 * running. Nothing was red, nothing was green, and no test noticed because
 * the fixture invented the name the SDK does not send.
 *
 * This scenario is the picture: a failure that shows as a failure, a success
 * that settles, and — the half no live stream can prove — a thread coming
 * back from the store with its outcomes intact.
 *
 * The engine is faked here (see bench/README.md), so what this proves is the
 * SHELL's half: given the events, does it draw them. The driver's half is
 * pinned by the unit tests in packages/drivers/test.
 */
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const line = (entry) => `${JSON.stringify(entry)}\n`

async function threadsDir(dataDir) {
  const root = join(dataDir, 'conversations')
  const [user] = await readdir(root)
  return join(root, user)
}

/** The trace is folded by default; the outcomes are the point, so open it. */
async function unfold(page) {
  const toggle = await page.$('.adestia-trace__toggle')
  if (toggle) await toggle.click()
  await page.waitForSelector('.adestia-trace__list')
}

export default async function scenario(bench) {
  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Deux lectures, une qui rate' }),
  })
  const threads = await threadsDir(bench.dataDir)

  // The reload half: a settled turn whose tools carry their outcome. Before
  // the fix this record was unreachable — `ok` never reached the store.
  const stored = 'c3c3c3c3-0000-4000-8000-000000000003'
  await writeFile(
    join(threads, `${stored}.jsonl`),
    [
      { type: 'meta', id: stored, title: 'Un tour fini, ses issues', updatedAt: '2026-08-31T20:00:00.000Z' },
      { type: 'message', id: 'u1', role: 'user', text: 'Relis les deux fiches du meuble.', at: '2026-08-31T20:00:00.000Z' },
      {
        type: 'message',
        id: 'a1',
        role: 'agent',
        text: "La seconde fiche n'existe pas — la première dit **1220 mm**.",
        at: '2026-08-31T20:00:09.000Z',
        tools: [
          { name: 'Read', target: 'diy/meuble-tiroirs.md', ok: true },
          { name: 'Read', target: 'diy/meuble-poubelle.md', ok: false },
          { name: 'Grep', target: '1220', ok: true },
        ],
        usage: { contextTokens: 5100 },
      },
    ]
      .map(line)
      .join(''),
  )

  // ── Live: two calls of the SAME tool in flight, the first one failing ────
  const page = await bench.open({ tab: live.id })
  await bench.attached()

  bench.emit({ type: 'text-delta', text: 'Je lis les deux fiches.' })
  bench.emit({ type: 'tool-use', name: 'Read', target: 'diy/meuble-tiroirs.md', id: 'a' })
  bench.emit({ type: 'tool-use', name: 'Read', target: 'diy/meuble-poubelle.md', id: 'b' })
  await page.waitForTimeout(600)
  await unfold(page)
  await bench.shoot(page, '1-two-calls-running')

  // The FIRST one comes back, and it failed. Matched by name this would have
  // marked the second row — the wrong file blamed, indistinguishably.
  bench.emit({ type: 'tool-result', name: 'Read', ok: false, id: 'a' })
  await page.waitForTimeout(500)
  await bench.shoot(page, '2-first-call-failed-second-still-running')

  bench.emit({ type: 'tool-result', name: 'Read', ok: true, id: 'b' })
  bench.emit({ type: 'text-delta', text: ' La seconde est introuvable.' })
  await page.waitForTimeout(500)
  await bench.shoot(page, '3-both-settled')

  bench.emit({ type: 'result', sessionId: 's1', stopped: false, usage: { contextTokens: 5100 } })
  bench.endTurn()
  await page.waitForTimeout(900)
  await bench.shoot(page, '4-turn-settled')

  // ── And the same outcomes, read back from the store, in both themes ──────
  for (const theme of ['light', 'dark']) {
    const reloaded = await bench.open({ theme, tab: stored })
    await unfold(reloaded)
    await bench.shoot(reloaded, `5-from-the-store-${theme}`)
  }
}
