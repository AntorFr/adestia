/**
 * Plugin screens E-22 to E-31 against the need (B-8, B-9, B-10; P-11, P-12), through a
 * real browser on a real instance of the `plugins` seed (scripted engine, as the bench does).
 *
 *   npm run build && node --test bench/tests/plugins-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment (`/usr/lib/node_modules` or `npm root -g`).
 * `BESOIN_SKINS=alfred,dobby` and `BESOIN_LOCALES=fr` narrow the matrix; pictures land in
 * `bench/shots-besoin/` (ignored by git). Every expected word below is written by hand from
 * docs/ecrans.md and docs/parcours.md (B-9: « Exact words of the names given to backs and exits »).
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const shots = join(root, 'bench/shots-besoin')

function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()) } catch { /* fixed root only */ }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(`${dir}/`)(name) } catch { /* not here */ }
    }
  }
  throw new Error('playwright not found in the environment')
}
const { chromium } = loadPlaywright()

const SKINS = (process.env.BESOIN_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BESOIN_LOCALES ?? 'en,fr').split(',')

/** What the plugin writes on its backs and exits, by locale (docs/ecrans.md § Backs). */
const WORDS = {
  en: { todo: 'Todo', journals: 'Journals', bench: 'Leave the bench mode', walk: 'Leave walking mode', close: 'Close', clear: 'Clear', cancel: 'Cancel' },
  fr: { todo: 'Todo', journals: 'Journaux', bench: 'Quitter le mode atelier', walk: 'Quitter le mode balade', close: 'Fermer', clear: 'Effacer', cancel: 'Annuler' },
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'plugins', '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /listening on (http:\/\/\S+)/.exec(log)
      if (match && log.includes('listening on ' + match[1] + '\n') && !/Adestia listening on/.test(match[0])) {
        clearTimeout(timer)
        // what the seed wrote in the instance (pages, workbook data, queues) is the user's content
        const written = walk(data).filter((f) => !f.includes('/.claude/') && !f.endsWith('.png') && !f.endsWith('.pdf') && !f.includes('seed-plugins')).map((f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }).join('\n').toLowerCase()
        resolveStart({ url: match[1], corpus: written, stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

// ── what the seed wrote is content, not interface ───────────────────────────
const corpusFiles = [
  ...readdirSync(join(root, 'bench/seed')).map((name) => join(root, 'bench/seed', name)),
  ...readdirSync(join(root, 'plugins'), { withFileTypes: true }).flatMap((entry) => {
    const dir = join(root, 'plugins', entry.name, 'exemples')
    return entry.isDirectory() && existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : []
  }),
]
/** The atelier's derivation engine writes the workbook's data (step labels, piece names) in French: stored content, not interface. */
corpusFiles.push(...walk(join(root, 'plugins/atelier/moteur')))
const corpus = corpusFiles.filter((file) => statSync(file).isFile()).map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase()
const segments = (line) => line
  .split(/\s[·—→–|]\s|,\s|[:()]|\s{2,}|\t/u)
  .map((part) => part.replace(/[\p{Extended_Pictographic}️↗↺✦▶▸◆]/gu, '').trim())
  .filter((part) => part.length > 2)

/** Docs (P-12 step 6, Known defects): the sentences the server gives for a note's problem stay English. */
const SERVER_SENTENCES = /every|the note is empty|15-minute floor|its body is the prompt|carries both|unreadable|invalid/i
const FRENCH_MARK = /[àâçéèêëîïôûùüœ]|\b(le|la|les|des|du|une|pour|avec|vous|dans|sans|sur|aucun|aucune|rien|écarter|étapes)\b/i
const ENGLISH_MARK = /\b(the|of|and|with|for|your|you|add|leave|close|cancel|clear|remove|loading|empty|nothing|none|yet|ask|new|open|show|hide|retry|reload|refresh|dismiss|restore|search)\b/i

/** The visible words of the plugin region (not the shell's back, not user content), plus labels. */
async function words(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main.adestia-canvas') ?? document.body
    const clone = main.cloneNode(true)
    clone.querySelectorAll('.adestia-switch, nav, header, script, style, svg text').forEach((el) => el.remove())
    const lines = [...clone.querySelectorAll('*')].filter((el) => el.children.length === 0).map((el) => el.textContent.trim()).filter(Boolean)
    const attrs = [...document.querySelectorAll('main [aria-label], main [title], main [placeholder], [role=dialog] [aria-label], [role=dialog] [title]')]
      .filter((el) => !el.closest('.adestia-switch'))
      .flatMap((el) => ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a)).filter(Boolean))
    const svg = [...document.querySelectorAll('main svg text')].map((el) => el.textContent.trim()).filter(Boolean)
    const dialogs = [...document.querySelectorAll('[role=dialog]')].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed').map((el) => el.innerText)
    return [...lines, ...attrs, ...svg, ...dialogs.flatMap((t) => t.split(/\n+/))]
  })
}

function leaks(lines, locale, extra = '') {
  const mark = locale === 'en' ? FRENCH_MARK : ENGLISH_MARK
  const found = new Set()
  for (const line of lines) {
    for (const part of segments(line)) {
      if (!mark.test(part)) continue
      if (corpus.includes(part.toLowerCase()) || extra.includes(part.toLowerCase())) continue
      if (SERVER_SENTENCES.test(part)) continue
      found.add(part)
    }
  }
  return [...found]
}

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`plugins on skin ${skin}, ${locale}`, () => {
      const w = WORDS[locale]
      let instance
      let browser
      let page
      const shot = async (name) => { await mkdir(join(shots, skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) }) }
      const open = async (route, wait) => {
        await page.goto('about:blank') // a hash change alone would keep a window of the previous test open
        await page.goto(`${instance.url}/#/${route}`)
        await page.locator(wait).first().waitFor({ state: 'visible', timeout: 20_000 })
      }
      const dialogs = () => page.locator('[role=dialog]:visible')

      before(async () => {
        instance = await startInstance(skin, locale)
        browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
        page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale })
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      // B-9 · nominal: the task sheet's back says where it leads, and leads there
      test('todo: the task sheet back is named « Todo » and returns to the list', async () => {
        await open('todo', '.todo-task__title')
        await page.locator('.todo-task__title', { hasText: /Poncer la porte du garage/ }).click()
        const back = page.locator('.todo-back')
        await back.waitFor({ state: 'visible' })
        assert.equal((await back.innerText()).trim(), w.todo)
        assert.equal(await back.getAttribute('aria-label'), w.todo)
        assert.equal(await back.locator('svg').count(), 1, 'the back carries the chevron icon')
        assert.ok(!(await back.innerText()).includes('‹'), 'no ‹ character in the plugin back')
        await shot('todo-sheet')
        await back.click()
        await page.locator('.todo-task__title').first().waitFor({ state: 'visible' })
        assert.equal(await page.locator('.todo-back').count(), 0, 'the list has no back of its own')
      })

      // B-9 · exclusion: the back is not removed, no second back leads to the same place
      test('todo: opening a task keeps the shell back and the plugin back, with two different names', async () => {
        await open('todo', '.todo-task__title')
        await page.locator('.todo-task__title').first().click()
        await page.locator('.todo-back').waitFor({ state: 'visible' })
        const shellBack = page.locator('.adestia-switch')
        assert.equal(await shellBack.count(), 1)
        assert.notEqual((await shellBack.innerText()).trim(), (await page.locator('.todo-back').innerText()).trim())
      })

      test('journal: the entries back is named « Journals » / « Journaux » and leads to the list of journals', async () => {
        await open('journal', '.journal-add, [class*=journal]')
        await page.getByText(locale === 'fr' ? 'Carnet d’atelier' : 'Carnet d’atelier').first().click()
        const back = page.locator('.journal-back')
        await back.waitFor({ state: 'visible' })
        assert.equal((await back.innerText()).replace(/\s+/g, ' ').trim(), w.journals)
        assert.ok(!(await back.innerText()).includes('‹'), 'the glyph is an icon')
        assert.equal(await back.locator('svg').count(), 1)
        await shot('journal-entries')
        await back.click()
        await page.getByText('Carnet du jardin').first().waitFor({ state: 'visible' })
        assert.ok(page.url().endsWith('#/journal'), page.url())
        assert.equal(await page.locator('.journal-back').count(), 0)
      })

      test('journal: the add button toggles by icons, not by + and × characters', async () => {
        await open('journal', 'main')
        await page.getByText('Carnet d’atelier').first().click()
        await page.locator('.journal-add').first().waitFor({ state: 'visible' })
        const add = page.locator('.journal-add').first()
        const text = (await add.innerText())
        assert.ok(!/[×✕+]/.test(text.replace(/\s/g, '')), `the add button text has a glyph: ${text}`)
        assert.ok(await add.locator('svg').count() >= 1)
      })

      // B-9 · atelier: bench mode is a full-screen dialog with a named exit
      test('atelier: the bench mode exit says « Leave the bench mode », Escape closes it, focus returns to its button', async () => {
        await open('atelier/projets/caisson', '.shopmode')
        const opener = page.locator('.shopmode')
        await opener.click()
        const dialog = dialogs().first()
        await dialog.waitFor({ state: 'visible' })
        assert.equal(await dialog.getAttribute('aria-modal'), 'true')
        const exit = dialog.getByRole('button', { name: w.bench })
        await exit.waitFor({ state: 'visible' })
        assert.equal((await exit.innerText()).trim(), w.bench)
        assert.equal(await exit.locator('svg').count(), 1, 'the exit carries the x icon')
        assert.ok(!(await exit.innerText()).includes('✕'))
        await shot('atelier-bench')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(await opener.evaluate((el) => el === document.activeElement), true, 'focus back on the bench-mode button')
        // and by its own exit button
        await opener.click()
        await dialogs().first().getByRole('button', { name: w.bench }).click()
        await page.locator('[role=dialog]:visible').first().waitFor({ state: 'hidden' })
      })

      test('atelier: no French in english (and no english in french) on the hub, the workbook tabs and the bench mode', async () => {
        const seen = []
        await open('atelier', 'main')
        await page.waitForTimeout(1500)
        seen.push(...await words(page))
        await open('atelier/projets/caisson', '.shopmode')
        await page.waitForTimeout(800)
        seen.push(...await words(page))
        for (const tab of ['.wbtab:nth-of-type(2)', '.wbtab:nth-of-type(3)']) {
          await page.locator(tab).first().click()
          await page.waitForTimeout(500)
          seen.push(...await words(page))
          await shot(`atelier-tab-${tab.slice(-4, -1)}`)
        }
        await page.locator('.shopmode').click()
        await page.waitForTimeout(500)
        seen.push(...await words(page))
        assert.deepEqual(leaks(seen, locale, instance.corpus), [])
      })

      test('atelier: a piece opens a sheet with the shared shape, a close icon named « Close », Escape returns the focus to the piece', async () => {
        await open('atelier/projets/caisson', '.wbtab')
        await page.locator('.wbtab').first().click()
        await page.waitForTimeout(800)
        const target = await page.locator('main svg text', { hasText: /^A1-BAS$/ }).first().elementHandle()
        assert.ok(target, 'the piece A1-BAS is on the cut list')
        await target.click({ force: true })
        const sheet = page.locator('.adestia-sheet:visible')
        await sheet.waitFor({ state: 'visible', timeout: 5000 })
        const panel = sheet.locator('.adestia-sheet__panel')
        assert.equal(await panel.getAttribute('role'), 'dialog')
        assert.equal(await panel.getAttribute('aria-modal'), 'true')
        assert.ok(await panel.getAttribute('aria-labelledby'))
        const close = panel.locator('.adestia-sheet__head').getByRole('button', { name: w.close })
        assert.equal(await close.count(), 1)
        await shot('atelier-piece-sheet')
        await page.keyboard.press('Escape')
        await sheet.waitFor({ state: 'hidden' })
        assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /A1-BAS/, 'focus back on the piece')
      })

      // B-9 · voyages: the card sheet
      test('voyages: a card opens the shared sheet; × named « Close », Escape, scrim and the footer button close it; focus returns to the card', async () => {
        await open('voyages/corse', '.vhub-card')
        const card = page.getByText('Chez Anna').first()
        await card.waitFor({ state: 'visible' })
        const closeBy = {
          escape: async () => page.keyboard.press('Escape'),
          scrim: async () => page.locator('.adestia-sheet').click({ position: { x: 4, y: 4 } }),
          icon: async () => page.locator('.adestia-sheet__head').getByRole('button', { name: w.close }).click(),
          footer: async () => page.locator('.adestia-sheet__foot').getByRole('button', { name: w.close }).click(),
        }
        for (const [how, close] of Object.entries(closeBy)) {
          await card.click()
          const sheet = page.locator('.adestia-sheet:visible')
          await sheet.waitFor({ state: 'visible', timeout: 5000 })
          const panel = sheet.locator('.adestia-sheet__panel')
          assert.equal(await panel.getAttribute('role'), 'dialog', how)
          assert.equal(await panel.getAttribute('aria-modal'), 'true', how)
          if (how === 'escape') await shot('voyages-card-sheet')
          await close()
          await sheet.waitFor({ state: 'hidden', timeout: 5000 })
          const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
          assert.match(focused, /Chez Anna/, `focus back on the card after ${how}`)
        }
      })

      test('voyages: the sheet closes with the view — leaving the trip while it is open leaves no dialog on the page', async () => {
        await open('voyages/corse', '.vhub-card')
        await page.waitForTimeout(800)
          await page.getByText('Chez Anna').first().click()
        await page.locator('.adestia-sheet:visible').waitFor({ state: 'visible' })
        await page.goto(`${instance.url}/#/todo`)
        await page.locator('.todo-task__title').first().waitFor({ state: 'visible' })
        assert.equal(await page.locator('.adestia-sheet:visible').count(), 0)
      })

      test('voyages: no French in english (and no english in french) on the hub, the trip and its sheet', async () => {
        const seen = []
        await open('voyages', '.vhub-card')
        seen.push(...await words(page))
        await open('voyages/corse', '.vhub-card')
        seen.push(...await words(page))
        await page.waitForTimeout(800)
          await page.getByText('Chez Anna').first().click()
        await page.locator('.adestia-sheet:visible').waitFor({ state: 'visible' })
        seen.push(...await words(page))
        await page.keyboard.press('Escape')
        assert.deepEqual(leaks(seen, locale, instance.corpus), [])
      })

      // B-9 · the sheet's shape: one scrim, bottom sheet on a phone, a surface under dark
      for (const scheme of ['light', 'dark']) {
        test(`voyages sheet (${scheme}): the scrim is the shell's and the panel is a centred card at desk width`, async () => {
          await page.emulateMedia({ colorScheme: scheme })
          await open('voyages/corse', '.vhub-card')
          await page.waitForTimeout(800)
          await page.getByText('Chez Anna').first().click()
          const sheet = page.locator('.adestia-sheet:visible')
          await sheet.waitFor({ state: 'visible' })
          const facts = await page.evaluate(() => {
            const el = document.querySelector('.adestia-sheet')
            const probe = document.createElement('div')
            probe.style.background = 'var(--scrim)'
            document.body.append(probe)
            const token = getComputedStyle(probe).backgroundColor
            probe.remove()
            const panel = el.querySelector('.adestia-sheet__panel')
            const box = panel.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return { token, scrim: cs.backgroundColor, position: cs.position, panelBottom: box.bottom, vh: innerHeight, left: box.left, right: box.right, vw: innerWidth, bg: getComputedStyle(panel).backgroundColor }
          })
          await shot(`voyages-sheet-${scheme}-desk`)
          assert.equal(facts.position, 'fixed')
          assert.equal(facts.scrim, facts.token, 'the scrim is the shell token, not a plugin colour')
          assert.notEqual(facts.scrim, 'rgba(0, 0, 0, 0)')
          assert.ok(facts.bg !== 'rgba(0, 0, 0, 0)', 'the panel has a surface')
          assert.ok(facts.panelBottom < facts.vh - 4, 'on a desk the panel floats, it is not a bottom sheet')
          assert.ok(facts.left > 100 && facts.right < facts.vw - 100, 'centred, narrower than the page')
        })
      }

      test('voyages sheet on a phone (820 px down): a bottom sheet whose head and close button stay in view', async () => {
        await page.emulateMedia({ colorScheme: 'light' })
        await page.setViewportSize({ width: 390, height: 844 })
        try {
          await open('voyages/corse', '.vhub-card')
          await page.waitForTimeout(800)
          await page.getByText('Chez Anna').first().click()
          await page.locator('.adestia-sheet:visible').waitFor({ state: 'visible' })
          const facts = await page.evaluate(() => {
            const panel = document.querySelector('.adestia-sheet__panel').getBoundingClientRect()
            const close = document.querySelector('.adestia-sheet__head button').getBoundingClientRect()
            return { bottom: panel.bottom, vh: innerHeight, width: panel.width, vw: innerWidth, closeTop: close.top, closeRight: close.right }
          })
          await shot('voyages-sheet-phone')
          assert.ok(Math.abs(facts.bottom - facts.vh) <= 1, `panel sits on the bottom edge: ${facts.bottom} vs ${facts.vh}`)
          assert.ok(facts.width >= facts.vw - 2, 'full width')
          assert.ok(facts.closeTop >= 0 && facts.closeRight <= facts.vw)
        } finally {
          await page.setViewportSize({ width: 1440, height: 900 })
        }
      })

      // B-9 · meals dish sheet (E-29)
      test('meals: a dish opens the shared sheet with a close icon (« Close »), Escape closes it and the card has the focus', async () => {
        await open('page/sante/septembre', '.meals-dismiss')
        const dish = page.locator('main [class*=meals]').filter({ hasText: /\w{3}/ }).filter({ has: page.locator('.meals-dismiss') }).first()
        const opener = page.locator('.meals-card').first()
        await opener.click()
        const sheet = page.locator('.adestia-sheet:visible')
        await sheet.waitFor({ state: 'visible', timeout: 5000 })
        const close = sheet.locator('.adestia-sheet__head').getByRole('button', { name: w.close })
        assert.equal(await close.count(), 1, 'the dish sheet gets its close button')
        await shot('meals-dish-sheet')
        await page.keyboard.press('Escape')
        await sheet.waitFor({ state: 'hidden' })
        const focus = await page.evaluate(() => document.activeElement?.className ?? '')
        assert.match(focus, /meals/, `the focus is on a meals card, was: ${focus}`)
      })

      // B-9 · parcours: walking mode exit
      test('parcours: the walking HUD exit is named « Leave walking mode » and the map is where it was; Escape leaves too', async () => {
        await open('page/balades/val-sans-retour', '.pc-fond')
        const walk = page.locator('main button', { hasText: locale === 'fr' ? 'Mode balade' : 'Walking mode' })
        for (const how of ['button', 'escape']) {
          await walk.click()
          const exit = page.getByRole('button', { name: w.walk })
          await exit.waitFor({ state: 'visible', timeout: 5000 })
          assert.equal((await exit.innerText()).trim(), w.walk)
          assert.ok(!(await exit.innerText()).includes('✕'))
          if (how === 'button') { await shot('parcours-hud'); await exit.click() } else await page.keyboard.press('Escape')
          await exit.waitFor({ state: 'hidden', timeout: 5000 })
          await walk.waitFor({ state: 'visible' })
        }
      })

      test('parcours: no French in english (and no english in french) on the map page and in the walking HUD', async () => {
        await open('page/balades/val-sans-retour', '.pc-fond')
        const seen = [...await words(page)]
        await page.locator('main button', { hasText: locale === 'fr' ? 'Mode balade' : 'Walking mode' }).click()
        await page.waitForTimeout(800)
        seen.push(...await words(page))
        assert.deepEqual(leaks(seen, locale, instance.corpus), [])
      })

      // B-9 · scan overlay (E-30)
      test('scan: the camera overlay says Cancel / Add to message in the instance language and closes on Escape', async () => {
        await open('todo', '.todo-task__title')
        const opener = page.locator('.adestia-composer__attach').nth(1)
        await opener.click()
        const dialog = dialogs().first()
        await dialog.waitFor({ state: 'visible', timeout: 10_000 })
        const names = (await dialog.getByRole('button').allInnerTexts()).map((s) => s.trim())
        assert.ok(names.includes(w.cancel), `the overlay offers « ${w.cancel} », has ${JSON.stringify(names)}`)
        const add = locale === 'fr' ? /Ajouter .*au message/ : /Add .*to message/
        assert.ok(names.some((n) => add.test(n)), `an add button in the language: ${JSON.stringify(names)}`)
        await shot('scan-overlay')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
      })

      // B-9 · listening post
      test('listening post: the search clear control is named « Clear » / « Effacer », and the dismiss button keeps its word', async () => {
        await open('listening-post', 'main input:not([hidden]):not([type=file])')
        const input = page.locator('main input[type=search]')
        await input.fill('synth')
        await page.locator('main button[type=submit]').first().click()
        const clear = page.locator('main').getByRole('button', { name: w.clear })
        await clear.waitFor({ state: 'visible' })
        assert.ok(!(await clear.innerText()).includes('✕'))
        await shot('listening-search')
        const before = await page.locator('main').innerText()
        await clear.click()
        await page.waitForTimeout(500)
        assert.equal(await clear.count(), 0, 'the clear control goes once the search is cleared')
        assert.notEqual(await page.locator('main').innerText(), before)
        const dismiss = locale === 'fr' ? 'écarter' : 'dismiss'
        assert.ok((await page.locator('main button', { hasText: new RegExp(dismiss, 'i') }).count()) > 0, `a « ${dismiss} » button is on the screen`)
      })

      // B-8 · register: vous
      test('listening post (fr): the source line says « Dans vos flux », never « tes flux »', async () => {
        test.skip = false
        await open('listening-post', 'main input:not([hidden]):not([type=file])')
        await page.waitForTimeout(1000)
        const text = await page.locator('main').innerText()
        if (locale === 'fr') {
          assert.match(text, /Dans vos flux/)
          assert.doesNotMatch(text, /\btes flux\b|\bDans tes\b/)
        } else {
          assert.match(text, /In your sources/i)
        }
      })

      // B-8 · every other plugin screen speaks only the instance's language
      for (const [name, route, wait] of [
        ['todo list', 'todo', '.todo-task__title'],
        ['planif', 'planif', 'main'],
        ['journal list', 'journal', 'main'],
        ['listening post', 'listening-post', 'main input[type=search]'],
        ['meals page', 'page/sante/septembre', '.meals-dismiss'],
        ['project-management page', 'page/renovation/dates-cassees', 'main'],
        ['project-management planning', 'page/petit-chantier/INDEX', 'main'],
      ]) {
        test(`${name}: every word is in the instance's language (${locale})`, async () => {
          await open(route, wait)
          await page.waitForTimeout(1200)
          await shot(`lang-${name.replace(/\W+/g, '-')}`)
          assert.deepEqual(leaks(await words(page), locale, instance.corpus), [])
        })
      }

      test('todo task sheet and journal entry: every word is in the instance language', async () => {
        const seen = []
        await open('todo', '.todo-task__title')
        await page.locator('.todo-task__title').first().click()
        await page.locator('.todo-back').waitFor({ state: 'visible' })
        seen.push(...await words(page))
        await open('journal', 'main')
        await page.getByText('Carnet d’atelier').first().click()
        await page.locator('.journal-back').waitFor({ state: 'visible' })
        seen.push(...await words(page))
        assert.deepEqual(leaks(seen, locale, instance.corpus), [])
      })
    })
  }
}
