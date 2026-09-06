/**
 * The delegations page — the delegation channel behind a settings tile.
 *
 * What no unit test can say, and what each shot is for:
 *
 * - the settings mosaic grows a THIRD tile, with a counted lede: does the row
 *   still read as one family, and does "3 fils — 1 en cours" fit its card?
 * - the list borrows the chat's thread rows OUT of their dropdown clothes: a
 *   shelf per caller on the settings canvas is a shape nobody has looked at,
 *   and the timestamp pushed to the row's edge is exactly the kind of flex
 *   detail a stylesheet quietly undoes (it has before, on this very list).
 * - an open thread reuses the chat bubbles with NO composer under them — the
 *   screen must read as a window, not as a chat missing its input.
 * - dark, both screens: bubbles sit on a canvas here, not on the chat's
 *   raised column.
 * - a phone, where the rows carry title, dot and date on 390px.
 *
 * The engine is faked as always; nothing here needs it — the channel's
 * threads are the store's, seeded as JSONL exactly as the server writes them.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** One thread, as `delegations.ts` writes it: meta, session, messages. */
function thread(id, title, messages) {
  const lines = [
    JSON.stringify({ type: 'meta', id, title, updatedAt: messages[0].at }),
    JSON.stringify({ type: 'session', sessionId: `s-${id}` }),
    ...messages.map((message) => JSON.stringify({ type: 'message', ...message })),
  ]
  return `${lines.join('\n')}\n`
}

async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  // ── Seed: two callers, threads in every state worth a look ──────────────
  const today = new Date().toISOString()
  const root = join(bench.dataDir, 'delegations', 'conversations')
  await mkdir(join(root, 'skippy'), { recursive: true })
  await mkdir(join(root, 'nestor'), { recursive: true })

  await writeFile(
    join(root, 'skippy', 'aaaaaaaa-0000-4000-8000-000000000001.jsonl'),
    thread('aaaaaaaa-0000-4000-8000-000000000001', 'Vérifie le chart Helm de la coque', [
      {
        id: 'm1',
        role: 'user',
        text: 'Vérifie le chart Helm de la coque : la probe readiness a l’air trop courte.',
        at: today,
      },
      {
        id: 'm2',
        role: 'agent',
        text:
          'La probe readiness est bien à 3 s, trop court pour un premier boot — ' +
          'je l’ai passée à 15 s avec un `initialDelaySeconds` de 10. Chart bumpé en 0.4.2.',
        at: today,
        tools: [
          { name: 'Read', target: 'charts/adestia/values.yaml', ok: true },
          { name: 'Edit', target: 'charts/adestia/values.yaml', ok: true },
        ],
      },
    ]),
  )
  await writeFile(
    join(root, 'skippy', 'aaaaaaaa-0000-4000-8000-000000000002.jsonl'),
    thread('aaaaaaaa-0000-4000-8000-000000000002', 'Range les captures du banc', [
      {
        id: 'm1',
        role: 'user',
        text: 'Range les captures du banc de la semaine dans le classeur des chantiers.',
        at: '2026-09-01T09:12:00.000Z',
      },
      {
        id: 'm2',
        role: 'agent',
        text: '',
        at: '2026-09-01T09:13:00.000Z',
        error: 'the CLI died: no such session',
      },
    ]),
  )
  await writeFile(
    join(root, 'nestor', 'bbbbbbbb-0000-4000-8000-000000000001.jsonl'),
    thread('bbbbbbbb-0000-4000-8000-000000000001', 'La liste des courses du week-end', [
      {
        id: 'm1',
        role: 'user',
        text: 'Prépare la liste des courses du week-end, groupée par rayon.',
        at: '2026-09-04T18:40:00.000Z',
      },
      {
        id: 'm2',
        role: 'agent',
        text: 'Fait — 14 articles sur 4 rayons, la fiche est dans `courses/week-end.md`.',
        at: '2026-09-04T18:41:00.000Z',
      },
    ]),
  )

  // ── The mosaic: three tiles, one counted lede ───────────────────────────
  const page = await bench.open()
  await go(page, '/settings')
  await bench.shoot(page, '1-settings-mosaic')

  // ── The list: a shelf per caller ────────────────────────────────────────
  await go(page, '/settings/delegations')
  await bench.shoot(page, '2-delegations-list')

  // ── An open thread: bubbles, provenance line, and NO composer ───────────
  await go(page, '/settings/delegations/skippy/aaaaaaaa-0000-4000-8000-000000000001')
  await bench.shoot(page, '3-delegation-open')

  // The failed one: the error must land in a bubble, not vanish.
  await go(page, '/settings/delegations/skippy/aaaaaaaa-0000-4000-8000-000000000002')
  await bench.shoot(page, '4-delegation-failed')

  // ── Dark, both shapes ───────────────────────────────────────────────────
  const dark = await bench.open({ theme: 'dark' })
  await go(dark, '/settings/delegations')
  await bench.shoot(dark, '5-delegations-list-dark')
  await go(dark, '/settings/delegations/nestor/bbbbbbbb-0000-4000-8000-000000000001')
  await bench.shoot(dark, '6-delegation-open-dark')

  // ── A phone: title, dot and date on 390px ───────────────────────────────
  const phone = await bench.open({ width: 390, height: 844 })
  await go(phone, '/settings/delegations')
  await phone.click('.adestia-ib[aria-label="Open apps"]')
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '7-delegations-phone')
}
