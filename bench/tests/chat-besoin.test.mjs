/**
 * The chat rail, its thread, its composer and the two dialogs it opens (E-16, E-17, E-18) against
 * the need (B-7, B-8, B-10, B-11; P-2, P-3), through a real browser on a real instance (scripted
 * engine, as the bench does). Every expectation is written by hand from docs/parcours.md,
 * docs/ecrans.md § « The chat's screens, as built » and the feature's exit criterion.
 *
 *   npm run build && node --test bench/tests/chat-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment. `BESOIN_SKINS=alfred,dobby` and
 * `BESOIN_LOCALES=fr` narrow the matrix; pictures land in `bench/shots-besoin/` (ignored by git).
 * The real-Claude turn of the exit criterion needs `CLAUDE_CODE_OAUTH_TOKEN` and is skipped without.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const shots = join(root, 'bench/shots-besoin')

const { chromium } = loadPlaywright()

const SKINS = (process.env.BESOIN_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BESOIN_LOCALES ?? 'en,fr').split(',')
const ORIGIN = 'https://signatures.bench.invalid'
const BRAND = { alfred: 'Alfred', dobby: 'Dobby', nestor: 'Nestor', skippy: 'Skippy' }

/** What the chat says, by locale. English: docs/ecrans.md and docs/parcours.md. French: the words of today (B-1). */
const W = {
  en: {
    newConversation: 'New conversation', refuse: 'Refuse', once: 'Just this once', always: 'Always', sign: 'Sign',
    tab: 'Open in a tab', calls: (n) => `${n} tool call${n > 1 ? 's' : ''}`, noRule: 'No lasting rule for this one — the engine proposed none.',
    empty: 'No conversation yet.', close: 'Close',
    other: /\b(Envoyer|Arrêter|Refuser|Cette fois|Toujours|Signer|Fermer|Nouvelle conversation|Joindre|appels? d.outil|jusqu.à|Aucune conversation|Archiver|Non lu)\b/i,
  },
  fr: {
    newConversation: 'Nouvelle conversation', refuse: 'Refuser', once: 'Cette fois', always: 'Toujours', sign: 'Signer',
    tab: 'Ouvrir dans un onglet', calls: (n) => `${n} appel${n > 1 ? 's' : ''} d’outil`, noRule: null,
    empty: null, close: 'Fermer',
    other: /\b(Send|Stop|Refuse|Just this once|Always|Sign|Close|New conversation|Attach|tool calls?|until|No conversation|Archive|Unread|Working|Open apps|Remove)\b/,
  },
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

function startInstance(seed, skin, locale, prepare) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chat-'))
    await prepare?.(data)
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', seed, '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /listening on (http:\/\/\S+)\n/.exec(log)
      if (match && !/Adestia listening on/.test(match[0])) {
        clearTimeout(timer)
        resolveStart({ url: match[1], data, stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

// What the seeds and the scripted engine write is content, not interface.
const corpusFiles = [
  ...readdirSync(join(root, 'bench/seed')).map((name) => join(root, 'bench/seed', name)),
  join(root, 'bench/fake-engine.mjs'),
]
const corpus = corpusFiles.filter((file) => statSync(file).isFile()).map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase()
const segments = (line) => line.split(/\s[·—→–|]\s|,\s|[:()]|\s{2,}|\t/u).map((part) => part.replace(/[\p{Extended_Pictographic}️]/gu, '').trim()).filter((part) => part.length > 2)
const FRENCH_MARK = /[àâçéèêëîïôûùüœ]|\b(le|la|les|des|du|une|pour|avec|vous|dans|sans|sur|aucun|aucune|rien|votre|vos|jusqu|demande|attend|autorisation|connexion|ouvrir|onglet|nouvelle|fermer|envoyer|arrêter|refuser|toujours|cette|fois|signer|appels?)\b/i
const ENGLISH_MARK = /\b(the|of|and|with|for|your|you|add|leave|close|cancel|clear|remove|loading|empty|nothing|none|yet|new|open|show|hide|retry|reload|refresh|dismiss|restore|search|send|stop|refuse|always|sign|signed|tool|calls?|until|waits?|held|needs|connection|working|attach|archive|unread)\b/i

/** Everything the chat says: visible text, accessible names, tooltips, alt and placeholders — minus what is content. */
const INTERFACE_WORDS = () => {
  const scopes = [...document.querySelectorAll('.adestia-chat, [role=dialog], .adestia-sheet')]
  const lines = []
  for (const scope of scopes) {
    const clone = scope.cloneNode(true)
    clone.querySelectorAll('script, style, svg, .adestia-bubble, .adestia-ask__text, .adestia-ask__reason, .adestia-model, .adestia-sheet__frame, iframe').forEach((el) => el.remove())
    for (const el of [...clone.querySelectorAll('*'), clone]) {
      if (el.children.length === 0 && el.textContent.trim()) lines.push(el.textContent.trim())
      for (const a of ['aria-label', 'title', 'alt', 'placeholder']) { const v = el.getAttribute?.(a); if (v) lines.push(v) }
    }
  }
  return lines
}

function leaks(lines, locale) {
  const mark = locale === 'en' ? FRENCH_MARK : ENGLISH_MARK
  const found = new Set()
  for (const line of lines) for (const part of segments(line)) {
    if (!mark.test(part)) continue
    if (corpus.includes(part.toLowerCase())) continue
    found.add(part)
  }
  return [...found]
}

/** What the page draws as an icon but is a text glyph: in text, in a pseudo-element, in a one-character control. */
const GLYPHS = () => {
  const bad = /[\p{Extended_Pictographic}×‹›←-⇿⌀-⏿■-◿☀-➿⬀-⯿]/u
  const out = []
  const scopes = [...document.querySelectorAll('.adestia-chat, [role=dialog], .adestia-sheet')]
  for (const scope of scopes) for (const el of [scope, ...scope.querySelectorAll('*')]) {
    if (el.closest('.adestia-bubble, .adestia-ask__text, .adestia-ask__reason, iframe')) continue
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    const where = `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`
    if (own && bad.test(own)) out.push(`${where} text « ${own} »`)
    if (el.matches('button, [role=button], a') && /^[^\p{L}\p{N}]{1,2}$/u.test(el.textContent.trim()) && el.textContent.trim()) out.push(`${where} control « ${el.textContent.trim()} »`)
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(el, pseudo).content
      if (content && content !== 'none' && content !== 'normal' && bad.test(content)) out.push(`${where}${pseudo} ${content}`)
    }
  }
  return out
}

async function contrastOf(locator) {
  return locator.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgb = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 1, 1)
    const chain = []
    for (let c = node; c; c = c.parentElement) chain.unshift(c)
    for (const a of chain) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = getComputedStyle(a).backgroundColor; ctx.fillRect(0, 0, 1, 1) }
    const bg = rgb()
    ctx.fillStyle = getComputedStyle(node).color
    ctx.fillRect(0, 0, 1, 1)
    const fg = rgb()
    const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = lum(fg), b = lum(bg)
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fg, bg }
  })
}

const VIEWS = [
  ['desk-light', { width: 1440, height: 900 }, 'light'],
  ['desk-dark', { width: 1440, height: 900 }, 'dark'],
  ['phone-light', { width: 360, height: 740 }, 'light'],
  ['phone-dark', { width: 360, height: 740 }, 'dark'],
]

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`chat on skin ${skin}, ${locale}`, () => {
      const w = W[locale]
      let instance, browser, context, page
      const shot = async (name) => { await mkdir(join(shots, skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) }) }
      const chat = () => page.locator('.adestia-chat')
      const settle = () => page.waitForTimeout(500)
      const send = async (word) => {
        await page.locator('.adestia-composer__input').fill(word)
        await page.locator('.adestia-composer__send').click()
      }
      const inViews = async (fn) => {
        for (const [name, size, scheme] of VIEWS) {
          await page.setViewportSize(size)
          await page.emulateMedia({ colorScheme: scheme })
          await settle()
          await fn(name)
        }
        await page.setViewportSize(VIEWS[0][1]); await page.emulateMedia({ colorScheme: 'light' }); await settle()
      }
      const openThread = async (title) => {
        if (await page.locator('[role=dialog]').count()) { await page.keyboard.press('Escape'); await settle() }
        const target = page.locator('.adestia-chat').getByText(title, { exact: true }).first()
        if (!(await target.isVisible())) await page.getByRole('button', { name: /^Conversations$/ }).click()
        await target.click()
        await settle()
      }

      before(async () => {
        instance = await startInstance('chat-permission', skin, locale)
        browser = await chromium.launch()
        context = await browser.newContext({ viewport: VIEWS[0][1], locale })
        // the signature façade does not exist: a still page stands in for the ceremony
        await context.route(`${ORIGIN}/**`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>ceremony</title><p>ceremony</p>' }))
        await context.addInitScript(() => { if (!localStorage.getItem('adestia.signatures')) localStorage.setItem('adestia.signatures', JSON.stringify({ signed: 'signed', denied: 'denied' })) })
        page = await context.newPage()
        await page.goto(instance.url)
        await chat().waitFor()
        // the thread of the exit criterion: a finished turn, a tool trace, an error, then a turn that waits on a permission question
        for (const word of ['fini', 'outil', 'erreur', 'permission']) {
          await send(word)
          // the turn is over when Stop is gone — or it waits on the question
          await page.waitForFunction(() => document.querySelector('.adestia-ask') || !document.querySelector('.adestia-composer__stop'), null, { timeout: 15_000 })
          await page.waitForTimeout(word === 'permission' ? 1200 : 900)
        }
        await page.locator('.adestia-ask').waitFor()
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      // B-8, P-2 · nominal: a scripted turn shows in full — every part of it
      test('a finished turn, a tool trace, an error and a question all show in full', async () => {
        const text = await chat().innerText()
        assert.match(text, /Voici la liste des courses de la semaine\./)
        assert.match(text, /Rien ne manque pour samedi\./)
        assert.match(text, /Je regarde la page\./)
        assert.match(text, /La recherche a échoué, mais la page se lit\./)
        assert.match(text, /The engine stopped: rate limit reached, try again later\./)
        assert.match(text, /Je dois lancer une commande\./)
        assert.ok(text.includes(w.calls(2)), `the trace says « ${w.calls(2)} »`)
        await shot('thread-desk')
      })

      // B-7 · nominal: the tool trace opens on its own chevron
      test('the tool trace opens on its toggle and names the two tools it ran', async () => {
        const toggle = chat().locator('.adestia-trace__toggle').first()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        assert.equal(await toggle.locator('svg').count(), 1)
        const before = await toggle.locator('use').getAttribute('href')
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
        assert.notEqual(await toggle.locator('use').getAttribute('href'), before, 'the chevron turns when open')
        const text = await chat().innerText()
        assert.match(text, /pages\/voyages\/lisbonne\.md/)
        assert.match(text, /grep -r vol pages/)
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      })

      // B-7, E-17 · nominal and exclusion: three answers, drawn buttons, one accent, an icon on the card
      test('E-17: the question offers the three answers as drawn buttons, only « always » in accent, with the alert icon', async () => {
        const ask = page.locator('.adestia-ask')
        const buttons = ask.getByRole('button')
        assert.deepEqual(await buttons.allInnerTexts(), [w.refuse, w.once, w.always])
        for (let i = 0; i < 3; i++) assert.match(await buttons.nth(i).getAttribute('class'), /adestia-btn/)
        assert.match(await buttons.nth(2).getAttribute('class'), /adestia-btn--accent/)
        for (let i = 0; i < 2; i++) assert.doesNotMatch(await buttons.nth(i).getAttribute('class'), /adestia-btn--(accent|danger)/)
        assert.equal(await ask.locator('svg use[href="#adestia-i-triangle-alert"]').count(), 1)
        assert.equal(await ask.getAttribute('role'), 'alertdialog')
      })

      // P-2 step 5 · bords: while the question waits the composer stays blocked — a typed message cannot be sent
      test('E-17: while the question waits, a typed message cannot be sent', async () => {
        const field = page.locator('.adestia-composer__input')
        await field.fill('hello while blocked')
        const sends = page.locator('.adestia-composer__send')
        assert.equal(await sends.count(), 1)
        assert.equal(await sends.isDisabled(), true)
        await field.press('Enter')
        await page.waitForTimeout(400)
        assert.equal(await chat().locator('.adestia-bubble', { hasText: 'hello while blocked' }).count(), 0, 'no bubble, held or sent')
        await field.fill('')
      })

      // B-7 · exclusion: no text glyph stands for an icon, in any state, theme or size
      test('no Unicode glyph or emoji stands for an icon in the rail, the question, the cards or the sheet', async () => {
        await inViews(async (view) => {
          assert.deepEqual(await page.evaluate(GLYPHS), [], `glyphs in ${view}`)
          for (const button of await chat().locator('button').all()) {
            if (!(await button.isVisible())) continue
            const label = ((await button.innerText()).trim())
            if (label === '') assert.ok(await button.locator('svg').count() >= 1, `icon-only button without icon in ${view}: ${await button.getAttribute('class')}`)
          }
        })
      })

      // B-7 · exclusion: icon-only controls are named and carry a tooltip, through the locale
      test('every icon-only control of the rail has an accessible name and a tooltip', async () => {
        for (const button of await chat().locator('button').all()) {
          if (!(await button.isVisible())) continue
          if ((await button.innerText()).trim() !== '') continue
          const label = await button.getAttribute('aria-label')
          assert.ok(label && label.trim(), `unnamed icon button ${await button.getAttribute('class')}`)
          assert.ok(await button.getAttribute('title'), `no tooltip on « ${label} »`)
        }
      })

      // B-8 · exclusion: nothing in the other language, in any theme and size
      test('the rail speaks one language: no word of the other one in text, labels, tooltips or alt', async () => {
        await inViews(async (view) => {
          const lines = await page.evaluate(INTERFACE_WORDS)
          assert.ok(lines.length > 5, 'the rail says something')
          assert.deepEqual(leaks(lines, locale), [], `leaks in ${view}`)
          const joined = lines.join('\n')
          const other = joined.match(w.other)
          assert.equal(other, null, `a word of the other language in ${view}: ${other?.[0]}`)
        })
      })

      // B-8 · nominal: the own-language words of the three answers and the new-conversation control
      test('the new-conversation control and the three answers speak the instance language', async () => {
        assert.ok(await page.getByRole('button', { name: w.newConversation }).count() >= 1, `« ${w.newConversation} »`)
        const ask = page.locator('.adestia-ask')
        for (const word of [w.refuse, w.once, w.always]) assert.equal(await ask.getByRole('button', { name: word, exact: true }).count(), 1, word)
        await shot('question')
      })

      // B-7 · exclusion: one form of closing — the x icon, the same drawing, on every close control
      test('every close control of the rail and of the sheet is the same x icon', async () => {
        const closes = chat().locator('.adestia-tab__tool[aria-label*="eme"], .adestia-connect__hide, .adestia-tab__tool').filter({ has: page.locator('svg') })
        const icons = new Set()
        for (const c of await closes.all()) {
          const use = await c.locator('use').getAttribute('href')
          const label = (await c.getAttribute('aria-label')) ?? ''
          if (/arch/i.test(label)) continue
          icons.add(use)
        }
        assert.deepEqual([...icons], ['#adestia-i-x'])
        assert.ok((await chat().locator('.adestia-connect__hide').count()) >= 1, 'the MCP connect prompt has its dismiss control')
      })

      // B-7 · bords: archive is its own icon
      test('the tab archive control carries the archive icon, the tab close control the x', async () => {
        const archive = chat().locator('.adestia-tab__tool').filter({ has: page.locator('use[href="#adestia-i-archive"]') })
        const close = chat().locator('.adestia-tab__tool').filter({ has: page.locator('use[href="#adestia-i-x"]') })
        assert.ok(await archive.count() >= 1)
        assert.ok(await close.count() >= 1)
      })

      // B-10 · bords: nothing breaks at 360 px in either theme; targets are at least 24 px
      test('at 360 px the rail stays inside the screen with every control at least 24 px, in both themes', async () => {
        for (const [name, size, scheme] of VIEWS.filter(([n]) => n.startsWith('phone'))) {
          await page.setViewportSize(size); await page.emulateMedia({ colorScheme: scheme }); await settle()
          const bad = await page.evaluate(() => {
            const out = []
            const rail = document.querySelector('.adestia-chat')
            if (rail.scrollWidth > rail.clientWidth + 1) out.push(`rail scrolls sideways: ${rail.scrollWidth} > ${rail.clientWidth}`)
            for (const el of rail.querySelectorAll('button, select, textarea, a')) {
              const r = el.getBoundingClientRect()
              if (r.width === 0 || r.height === 0) continue
              if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push(`${el.className} outside: ${Math.round(r.left)}..${Math.round(r.right)}`)
              if ((r.width < 24 || r.height < 24) && el.tagName !== 'A') out.push(`${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`)
            }
            return out
          })
          assert.deepEqual(bad, [], name)
          await shot(`thread-${name}`)
        }
        await page.setViewportSize(VIEWS[0][1]); await page.emulateMedia({ colorScheme: 'light' }); await settle()
      })

      // B-10 · bords: the skin keeps its identity in the rail
      test('the header carries the skin\'s own name', async () => {
        assert.match(await chat().locator('header, .adestia-chat__head, .adestia-brand').first().innerText(), new RegExp(BRAND[skin], 'i'))
      })

      // B-10 · legibility: the words of the question, the trace and the bubbles read against their ground
      test('the question, the trace and the bubbles are legible in both themes (4.5:1)', async () => {
        await openThread('fini')
        await page.locator('.adestia-ask').waitFor()
        const targets = ['.adestia-ask__text', '.adestia-ask__reason', '.adestia-trace__toggle', '.adestia-bubble', '.adestia-ask__always', '.adestia-ask__actions .adestia-btn:first-child']
        await inViews(async (view) => {
          for (const selector of targets) {
            const el = page.locator(selector).first()
            assert.ok(await el.count(), `${selector} is on screen`)
            const { ratio, fg, bg } = await contrastOf(el)
            assert.ok(ratio >= 4.5, `${selector} in ${view}: ${ratio.toFixed(2)} (${fg} on ${bg})`)
          }
        })
      })

      // P-3, E-18 · nominal, exclusion: signature cards in every state, each with its icon and a text label
      test('P-3: a thread of signatures shows pending, signed, denied, expired and standing cards with icon and words', async () => {
        await openThread('Seeded decisions')
        const cards = page.locator('.adestia-sign')
        await cards.first().waitFor()
        assert.equal(await cards.count(), 5)
        const states = await cards.evaluateAll((els) => els.map((el) => ({ cls: el.className, text: el.innerText, icons: [...el.querySelectorAll('use')].map((u) => u.getAttribute('href')), sign: el.querySelectorAll('.adestia-sign__go').length })))
        const by = (re) => states.find((s) => re.test(s.cls))
        const signed = by(/--signed/), denied = by(/--denied/), expired = by(/--expired/), pending = by(/--pending/)
        assert.ok(signed && denied && expired && pending, JSON.stringify(states.map((s) => s.cls)))
        assert.ok(signed.icons.includes('#adestia-i-check'), `signed icons ${signed.icons}`)
        assert.ok(denied.icons.includes('#adestia-i-x'), `denied icons ${denied.icons}`)
        assert.ok(expired.icons.includes('#adestia-i-clock'), `expired icons ${expired.icons}`)
        assert.ok(pending.icons.includes('#adestia-i-pen-line'), `pending icons ${pending.icons}`)
        for (const s of [signed, denied, expired]) { assert.equal(s.sign, 0, 'a settled card offers no Sign'); assert.ok(s.text.replace(/\s+/g, ' ').trim().length > 10, 'a text label, not colour alone') }
        assert.equal(pending.sign, 1)
        assert.match(pending.text, /signatures\.bench\.invalid/)
        assert.match(pending.text, /(2099|1\/1\/99)/, 'the deadline shows while pending')
        assert.doesNotMatch(signed.text, /(2099|1\/1\/99)/, 'a signed card shows no deadline')
        await shot('signatures-desk')
      })

      // B-8 · nominal: the card words — pending/standing are told apart; locale has the "until" word
      test('P-3: the pending card says « until » in the instance language and a grant says it is a standing authorisation', async () => {
        await openThread('Seeded decisions')
        await chat().locator('.adestia-sign').first().waitFor()
        const text = await chat().locator('.adestia-sign--pending').first().innerText()
        assert.match(text, locale === 'en' ? /\buntil\b/ : /jusqu/)
        const all = await chat().innerText()
        assert.match(all, locale === 'en' ? /standing authorisation/i : /autorisation à l.avance/i)
      })

      // B-8 · exclusion: the same language rule on the cards, all themes and sizes
      test('the signature cards speak one language in both themes and both sizes', async () => {
        await openThread('Seeded decisions')
        await chat().locator('.adestia-sign').first().waitFor()
        await inViews(async (view) => {
          const lines = await page.evaluate(INTERFACE_WORDS)
          assert.deepEqual(leaks(lines, locale), [], view)
          assert.equal(lines.join('\n').match(w.other), null, view)
          assert.deepEqual(await page.evaluate(GLYPHS), [], view)
        })
      })

      // B-10 · legibility of the cards
      test('the signature cards and the Sign button are legible in both themes (4.5:1)', async () => {
        await openThread('Seeded decisions')
        await chat().locator('.adestia-sign').first().waitFor()
        await inViews(async (view) => {
          for (const selector of ['.adestia-sign--pending', '.adestia-sign--signed', '.adestia-sign--denied', '.adestia-sign--expired', '.adestia-sign__go']) {
            const el = page.locator(selector).first()
            assert.ok(await el.count(), `${selector} is on screen`)
            const { ratio, fg, bg } = await contrastOf(el)
            assert.ok(ratio >= 4.5, `${selector} in ${view}: ${ratio.toFixed(2)} (${fg} on ${bg})`)
          }
        })
      })

      // B-7, E-18 · nominal: the ceremony sheet is the shared dialog — scrim, Escape, focus back, one close
      test('E-18: Sign opens the sheet (origin with lock, Open in a tab, one close x), Escape closes it and returns the focus to Sign', async () => {
        await openThread('Seeded decisions')
        await chat().locator('.adestia-sign').first().waitFor()
        const sign = page.locator('.adestia-sign__go').first()
        await sign.focus()
        await sign.click()
        const dialog = page.locator('[role=dialog]')
        await dialog.waitFor({ state: 'visible' })
        assert.equal(await dialog.getAttribute('aria-modal'), 'true')
        assert.ok(await dialog.getAttribute('aria-labelledby'))
        assert.equal(await dialog.locator('use[href="#adestia-i-lock"]').count(), 1)
        assert.match(await dialog.innerText(), /signatures\.bench\.invalid/)
        const tab = dialog.getByRole('link', { name: w.tab })
        assert.equal(await tab.count(), 1)
        assert.equal(await tab.locator('use[href="#adestia-i-external-link"]').count(), 1)
        assert.equal(await tab.getAttribute('target'), '_blank')
        const closes = dialog.getByRole('button', { name: w.close, exact: true })
        assert.equal(await closes.count(), 1, 'one closing control')
        assert.equal(await closes.locator('use[href="#adestia-i-x"]').count(), 1)
        assert.ok(await page.locator('.adestia-sheet').count() >= 1)
        await shot('sheet-desk')
        assert.deepEqual(await page.evaluate(GLYPHS), [])
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(await sign.evaluate((el) => el === document.activeElement), true, 'focus back on the Sign button')
      })

      // B-7, E-18 · bords: closing by the close control and by the scrim; on a phone the sheet sits at the bottom
      test('E-18: the close control closes the sheet; on a phone it is a bottom sheet', async () => {
        await openThread('Seeded decisions')
        await chat().locator('.adestia-sign').first().waitFor()
        const sign = page.locator('.adestia-sign__go').first()
        await sign.click()
        const dialog = page.locator('[role=dialog]')
        await dialog.waitFor({ state: 'visible' })
        await dialog.getByRole('button', { name: w.close, exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.setViewportSize(VIEWS[2][1]); await settle()
        await sign.click()
        await dialog.waitFor({ state: 'visible' })
        const box = await dialog.boundingBox()
        assert.ok(Math.abs(box.y + box.height - 740) <= 2, `the sheet rests on the bottom edge: ${box.y + box.height}`)
        assert.ok(box.width <= 360.5)
        await shot('sheet-phone')
        assert.deepEqual(leaks(await page.evaluate(INTERFACE_WORDS), locale), [])
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await page.setViewportSize(VIEWS[0][1]); await settle()
      })

      // P-2 step 5 · nominal: answering the question removes it; the composer is free again
      test('E-17: answering « Refuse » closes the question and frees the composer', async () => {
        await openThread('fini')
        const ask = page.locator('.adestia-ask')
        if (!(await ask.count())) test.skip?.('the question was already answered')
        await ask.getByRole('button', { name: w.refuse, exact: true }).click()
        await ask.waitFor({ state: 'detached', timeout: 10_000 })
        await page.locator('.adestia-composer__input').fill('bonjour')
        assert.equal(await page.locator('.adestia-composer__input').inputValue(), 'bonjour')
      })

      // P-2 step 9 · nominal: the gestures stay — archive removes the conversation from the list
      test('an archived conversation leaves the list', async () => {
        await page.getByRole('button', { name: w.newConversation, exact: true }).click()
        await send('ping')
        await page.waitForFunction(() => !document.querySelector('.adestia-composer__stop'), null, { timeout: 15_000 })
        await page.waitForTimeout(800)
        const tab = chat().locator('.adestia-tab').filter({ hasText: 'ping' }).first()
        await tab.hover()
        await tab.locator('.adestia-tab__tool').filter({ has: page.locator('use[href="#adestia-i-archive"]') }).click()
        await settle()
        assert.equal(await chat().locator('.adestia-tab__pick', { hasText: /^ping$/ }).count(), 0, 'the tab is gone')
        await page.getByRole('button', { name: /^Conversations$/ }).click()
        await settle()
        assert.equal(await chat().getByText('ping', { exact: true }).count(), 0, 'the list no longer shows it')
      })
    })
  }
}

// B-8, E-16 · échec/bords: the empty list says so in the shared empty state
for (const locale of LOCALES) {
  describe(`empty chat, ${locale}`, () => {
    let instance, browser, page
    before(async () => {
      instance = await startInstance('empty', 'alfred', locale)
      browser = await chromium.launch()
      page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale })).newPage()
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    test('E-16: with no conversation the list says so, in the instance language, through the shared empty state', async () => {
      await page.getByRole('button', { name: /^Conversations$/ }).click()
      const empty = page.locator('.adestia-chat .adestia-empty, .adestia-chat [class*=empty]').first()
      await empty.waitFor({ timeout: 5000 })
      const text = (await empty.innerText()).trim()
      if (locale === 'en') assert.equal(text, W.en.empty)
      else { assert.ok(text.length > 5); assert.doesNotMatch(text, /No conversation/i) }
      await mkdir(join(shots, 'alfred', locale), { recursive: true })
      await page.screenshot({ path: join(shots, 'alfred', locale, 'list-empty.png') })
    })
  })
}

// B-11 · Delegations keeps its behaviour: a delegated thread shows its text and trace but no signature card
for (const locale of LOCALES) {
  describe(`delegations thread, ${locale}`, () => {
    let instance, browser, page
    const id = 'cccccccc-0000-4000-8000-000000000001'
    before(async () => {
      instance = await startInstance('base', 'alfred', locale, async (data) => {
        const dir = join(data, 'data', 'delegations', 'conversations', 'skippy')
        await mkdir(dir, { recursive: true })
        const at = new Date().toISOString()
        const lines = [
          { type: 'meta', id, title: 'Demande signée', updatedAt: at },
          { type: 'session', sessionId: `s-${id}` },
          { type: 'message', id: 'm1', role: 'user', text: 'Lance la commande tenue.', at },
          { type: 'message', id: 'm2', role: 'agent', text: 'La commande attend une signature.', at, tools: [{ name: 'Read', target: 'pages/plan.md', ok: true }],
            signatures: [{ id: 'sig1', kind: 'consent', url: `${ORIGIN}/consent/sig1`, expiresAt: '2099-01-01T10:00:00Z' }] },
        ].map((l) => JSON.stringify(l)).join('\n') + '\n'
        await writeFile(join(dir, `${id}.jsonl`), lines)
      })
      browser = await chromium.launch()
      page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale })).newPage()
      await page.goto(`${instance.url}/#/settings/delegations/skippy/${id}`)
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    test('E-13: an opened delegation shows its words and its tool trace, and no signature card', async () => {
      await page.getByText('La commande attend une signature.').waitFor({ timeout: 15_000 })
      const text = await page.locator('main').innerText()
      assert.match(text, /Lance la commande tenue\./)
      assert.ok(text.includes(W[locale].calls(1)), `trace « ${W[locale].calls(1)} »`)
      assert.equal(await page.locator('.adestia-sign').count(), 0)
      assert.equal(await page.locator('.adestia-sign__go').count(), 0)
    })
  })
}

// B-11, exit criterion · the code carries each idea once: greps on the sources
describe('sources of the chat', () => {
  const read = (file) => readFileSync(join(root, file), 'utf8')
  const sheets = ['chat.css', 'conversations.css', 'attachments.css'].map((n) => `packages/web/src/app/styles/${n}`)
  const allCss = () => walk(join(root, 'packages/web/src')).filter((f) => f.endsWith('.css'))
  const stripFallbacks = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/var\((?:[^()]|\([^()]*\))*\)/g, 'var()')

  test('no token is used in chat.css, conversations.css or attachments.css without being defined', () => {
    const defined = new Set()
    for (const f of allCss()) for (const m of readFileSync(f, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
    for (const f of walk(join(root, 'packages/web/src')).filter((x) => /\.(tsx?|ts)$/.test(x))) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](--[\w-]+)['"`]/g)) defined.add(m[1])
    const missing = []
    for (const sheet of sheets) for (const m of read(sheet).matchAll(/var\(\s*(--[\w-]+)\s*(,|\))/g)) if (!defined.has(m[1]) && m[2] === ')') missing.push(`${sheet} ${m[1]}`)
    assert.deepEqual([...new Set(missing)], [])
    for (const sheet of sheets) assert.doesNotMatch(read(sheet), /--radius-md/, sheet)
  })

  test('no colour is written outside a var() fallback in the three sheets', () => {
    const found = []
    for (const sheet of sheets) {
      const css = stripFallbacks(read(sheet))
      for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/gi)) found.push(`${sheet}: ${m[0]}`)
      for (const m of css.matchAll(/:\s*(?:white|black|red|blue|green|gray|grey|orange|yellow)\b/gi)) found.push(`${sheet}: ${m[0]}`)
    }
    assert.deepEqual(found, [])
  })

  test('no font size or radius is written as a literal in the three sheets', () => {
    const found = []
    for (const sheet of sheets) {
      const css = stripFallbacks(read(sheet))
      for (const m of css.matchAll(/font-size\s*:\s*[^;}]*/g)) if (/[\d.]+(px|rem|em)\b/.test(m[0])) found.push(`${sheet}: ${m[0]}`)
      for (const m of css.matchAll(/border-radius\s*:\s*[^;}]*/g)) if (/[\d.]+(px|rem|em)\b/.test(m[0])) found.push(`${sheet}: ${m[0]}`)
      for (const m of css.matchAll(/border-(?:top|bottom)-(?:left|right)-radius\s*:\s*[^;}]*/g)) if (/[\d.]+(px|rem|em)\b/.test(m[0])) found.push(`${sheet}: ${m[0]}`)
    }
    assert.deepEqual(found, [])
  })

  test('no chat source calls fetchImpl( directly', () => {
    const found = walk(join(root, 'packages/web/src/chat')).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.')).filter((f) => /\bfetchImpl\(/.test(readFileSync(f, 'utf8')))
    assert.deepEqual(found.map((f) => f.slice(root.length + 1)), [])
  })

  test('toMessage is defined once in packages/web/src', () => {
    const defs = walk(join(root, 'packages/web/src')).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((l) => /(function\s+toMessage\b|(const|let)\s+toMessage\b)/.test(l)).map(() => f))
    assert.equal(defs.length, 1, defs.join(', '))
  })

  test('Chat, useConversations and Composer hold no function longer than 250 lines', () => {
    const out = execFileSync('node', ['bench/long-functions.mjs', 'packages/web/src/chat'], { cwd: root, encoding: 'utf8' })
    const hits = out.split('\n').filter((l) => /(Chat|useConversations|Composer)\.tsx?:/.test(l))
    assert.deepEqual(hits, [])
  })
})

// exit criterion · a real turn of Claude, sent from the composer, shows in full
describe('a real Claude turn', { skip: process.env.CLAUDE_CODE_OAUTH_TOKEN ? false : 'CLAUDE_CODE_OAUTH_TOKEN is not set' }, () => {
  test('a turn sent from the composer comes back in full', async () => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chat-live-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'claude', '--seed', 'empty', '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    let log = ''
    const url = await new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error(log)), 120_000)
      child.stdout.on('data', (c) => { log += c; const m = /listening on (http:\/\/\S+)\n/.exec(log); if (m && !/Adestia listening/.test(m[0])) { clearTimeout(t); ok(m[1]) } })
    })
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(url)
      await page.locator('.adestia-composer__input').fill('Reply with exactly the word: ZEPHYR-4417')
      await page.locator('.adestia-composer__send').click()
      await page.getByText('ZEPHYR-4417').first().waitFor({ timeout: 90_000 })
      await page.locator('.adestia-composer__send:not([disabled])').waitFor({ timeout: 90_000 })
    } finally {
      await browser.close(); child.kill('SIGTERM'); await rm(data, { recursive: true, force: true })
    }
  })
})
