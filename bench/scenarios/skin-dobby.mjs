/**
 * The Dobby livery, looked at: the landing on a desk and on a phone, the
 * candle while a turn runs, and the parchment day on explicit request.
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function scenario(bench) {
  const home = await bench.open({ theme: 'dark', width: 1280, height: 900 })
  await home.waitForTimeout(800)
  await bench.shoot(home, '1-landing-desk')

  const phone = await bench.open({ theme: 'dark', width: 390, height: 844 })
  await phone.waitForTimeout(800)
  await bench.shoot(phone, '2-landing-phone')

  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Le roman du collège' }),
  })
  await appendFile(
    join(await bench.threadsDir(), `${live.id}.jsonl`),
    bench.line({
      type: 'message',
      id: 'u1',
      role: 'user',
      text: "Tu peux me retrouver le roman dont je t'ai parlé, celui avec le collège en Nouvelle-Angleterre ?",
      at: '2026-10-01T20:00:00.000Z',
    }),
  )
  const thread = await bench.open({ theme: 'dark', width: 390, height: 844, tab: live.id })
  await bench.attached()
  bench.emit({ type: 'text-delta', text: "C'est *Le Maître des illusions*, de Donna Tartt. " })
  await thread.waitForTimeout(700)
  await bench.shoot(thread, '3-thread-candle')
  bench.emit({ type: 'tool-use', name: 'Read', target: 'lectures/maitre-des-illusions.md' })
  await thread.waitForTimeout(500)
  await bench.shoot(thread, '4-thread-working')

  // The explicit day: the theme button writes the choice, the root carries it.
  const day = await bench.open({ theme: 'light', width: 1280, height: 900 })
  await day.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await day.waitForTimeout(500)
  await bench.shoot(day, '5-landing-day')
}
