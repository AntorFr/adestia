/**
 * The sign-in card — a server wants THIS person connected.
 *
 * What no unit test can say, and what each shot is for:
 *
 * - the card sits between the thread and the composer, dressed like the
 *   engine's question. Does the pair read as one family, and does the card
 *   push the composer around?
 * - the settings row on the server page carries a sentence and a button in
 *   one line — a shape that flexbox quietly breaks when a stylesheet above
 *   it wins (it has, on this very list's rows).
 * - dark, both — an accent-tinted card over the chat column is the shape
 *   most likely to melt into it.
 * - a phone: sentence + button on 390px.
 *
 * The engine is faked as always; the failed tool call is seeded as the
 * transcript a finished turn leaves, which is exactly what the card watches.
 */

import { writeFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function threadsDir(dataDir) {
  const root = join(dataDir, 'conversations')
  const [user] = await readdir(root)
  return join(root, user)
}

async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  // A finished turn that tried Home Assistant and was refused: the demand
  // the card answers, exactly as the store records it.
  await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Les volets du salon' }),
  })
  const threads = await threadsDir(bench.dataDir)
  const id = 'c1c1c1c1-0000-4000-8000-000000000001'
  await writeFile(
    join(threads, `${id}.jsonl`),
    [
      { type: 'meta', id, title: 'Les volets du salon', updatedAt: '2026-09-06T18:00:00.000Z' },
      {
        type: 'message',
        id: 'u1',
        role: 'user',
        text: 'Ferme les volets du salon, il fait grand soleil.',
        at: '2026-09-06T18:00:00.000Z',
      },
      {
        type: 'message',
        id: 'a1',
        role: 'agent',
        text:
          "Je n'atteins pas Home Assistant pour l'instant — l'appel a été refusé. " +
          'Dès que la connexion sera établie, je fermerai les volets.',
        at: '2026-09-06T18:00:05.000Z',
        tools: [{ name: 'mcp__home-assistant__close_cover', target: 'salon', ok: false }],
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n') + '\n',
  )

  // ── The card, in the conversation where the need arose ──────────────────
  const page = await bench.open({ tab: id })
  await page.waitForTimeout(600)
  await bench.shoot(page, '1-signin-card')

  const dark = await bench.open({ theme: 'dark', tab: id })
  await dark.waitForTimeout(600)
  await bench.shoot(dark, '2-signin-card-dark')

  // ── The settings row: connect BEFORE the first demand ───────────────────
  await go(page, '/settings/mcp/home-assistant')
  await bench.shoot(page, '3-signin-server-page')

  await go(dark, '/settings/mcp/home-assistant')
  await bench.shoot(dark, '4-signin-server-page-dark')

  // ── A phone: sentence + button on 390px ─────────────────────────────────
  const phone = await bench.open({ width: 390, height: 844, tab: id })
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '5-signin-card-phone')
}
