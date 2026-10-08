/**
 * The Dobby livery once the contract let it be what it was drawn as: the
 * signed-in name on the bookplate, the apparatus in small capitals while code
 * keeps its typewriter, the crest and the send as wax seals, and a gilt
 * initial on the answer.
 *
 * The bench runs without OIDC, so the name is put in `/api/instance` the way
 * an OIDC instance would serve it — the shell's rule, not the server's, is
 * what is being looked at.
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const ANSWER = [
  "C'est *Le Maître des illusions*, de Donna Tartt. Vous l'aviez noté le 14 septembre, après une conversation avec votre sœur.",
  '',
  'Dobby l’a rangé dans vos lectures :',
  '',
  '```sh',
  'grep -ri "tartt" memory/lectures/ | head -n 3',
  '```',
  '',
  'Le fichier est `lectures/maitre-des-illusions.md`.',
].join('\n')

async function named(page) {
  // In the page rather than with `page.route`: the shell's service worker
  // answers `/api/instance` before playwright's interception ever sees it.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await original(input, init)
      if (!String(input).startsWith('/api/instance')) return response
      const body = await response.clone().json()
      return new Response(
        JSON.stringify({
          ...body,
          auth: { ...body.auth, mode: 'oidc' },
          user: { userId: 'sub-jeanne', displayName: 'Jeanne Martin' },
        }),
        { status: response.status, headers: { 'content-type': 'application/json' } },
      )
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  await page.waitForTimeout(900)
}

export default async function scenario(bench) {
  const desk = await bench.open({ theme: 'dark', width: 1280, height: 900 })
  await named(desk)
  await bench.shoot(desk, '1-landing-named')

  const phone = await bench.open({ theme: 'dark', width: 390, height: 844 })
  await phone.waitForTimeout(500)
  await bench.shoot(phone, '2-landing-nobody')

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
    }) +
      bench.line({
        type: 'message',
        id: 'a1',
        role: 'agent',
        text: ANSWER,
        at: '2026-10-01T20:00:20.000Z',
        tools: [{ name: 'Read', target: 'lectures/maitre-des-illusions.md', ok: true }],
      }),
  )
  const thread = await bench.open({ theme: 'dark', width: 1280, height: 900, tab: live.id })
  await thread.locator('.adestia-composer__input').fill('Rappelle-moi de l’emprunter samedi.')
  await thread.waitForTimeout(400)
  await bench.shoot(thread, '3-thread-seal')

  const fonts = await thread.evaluate(() => {
    const face = (selector) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).fontFamily : 'absent'
    }
    const send = document.querySelector('.adestia-composer__send')
    const cap = document.querySelector('.adestia-bubble--agent .adestia-prose > p:first-child')
    return {
      code: face('.adestia-prose pre code') ,
      inlineCode: face('.adestia-prose p code'),
      trace: face('.adestia-trace__item'),
      send: send ? getComputedStyle(send).borderRadius + ' / ' + getComputedStyle(send).backgroundImage.slice(0, 40) : 'absent',
      sendGlyph: send ? send.innerHTML.slice(0, 40) : 'absent',
      crest: getComputedStyle(document.querySelector('.adestia-crest')).borderRadius,
      dropCap: cap ? getComputedStyle(cap, '::first-letter').float + ' ' + getComputedStyle(cap, '::first-letter').fontSize : 'absent',
    }
  })
  console.log('COMPUTED', JSON.stringify(fonts))

  const phoneThread = await bench.open({ theme: 'dark', width: 390, height: 844, tab: live.id })
  await bench.shoot(phoneThread, '4-thread-phone')

  const day = await bench.open({ theme: 'light', width: 1280, height: 900, tab: live.id })
  await day.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await day.waitForTimeout(500)
  await bench.shoot(day, '5-thread-day')
}
