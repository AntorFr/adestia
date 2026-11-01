/**
 * Independent check of the pages' tranche against the need (docs/parcours.md B-7 B-8 B-9 B-11, P-4 P-5 P-6 P-11;
 * docs/ecrans.md E-2 to E-8 and E-20), through a real browser on a real instance of the `pages` and `plugins`
 * seeds (scripted engine, as the bench does). Written from the need, not from the code: every expected word
 * below is a literal taken from the docs.
 *
 *   npm run build && node --test bench/tests/pages-verify.test.mjs
 *
 * `VERIF_SKINS=alfred,dobby` narrows the four-skin sweep. Pictures land in `bench/shots-verify/` (ignored by git).
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const shots = join(root, 'bench/shots-verify')

const { chromium } = loadPlaywright()

const SKINS = (process.env.VERIF_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')

function startInstance(seed, skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'verif-pages-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', seed, '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({
          url: match[1],
          pages: join(data, 'workspace', 'pages'),
          stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })),
        })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

const fm = (title) => `---\ntitle: ${title}\n---\n\n# ${title}\n\nUn texte.\n`
async function put(pagesDir, rel, text) { const file = join(pagesDir, rel); await mkdir(dirname(file), { recursive: true }); await writeFile(file, text) }
async function until(fn, ms = 15_000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) { try { const v = await fn(); if (v) return v } catch (e) { last = e } await new Promise((r) => setTimeout(r, 250)) }
  throw last ?? new Error('condition not met in time')
}

// The words the need gives, by locale (docs/parcours.md P-4, P-6, P-11 and docs/ecrans.md).
const W = {
  en: { loading: 'Loading…', highlights: 'Highlights', refresh: 'Refresh my highlights', home: 'Home', notActive: 'That app is not active on this instance.', conflict: 'The agent changed this page. Reload to see its version.', noPage: 'There is no page at this address.', edit: 'Edit', pageProps: 'Page properties', blockSettings: 'Block settings', backToChat: 'Back to the chat', folderUp: 'Open the folder above' },
  fr: { loading: 'Chargement…', highlights: 'À la une', refresh: 'Rafraîchis ma une', home: 'Accueil' },
}
// Interface words of the OTHER language that must not appear in the chrome of a screen (B-8). Hand-written.
const FRENCH_CHROME = /\b(Accueil|Modifier|Terminé|Enregistr\w+|Chargement|Réglages|Fermer|Annuler|Rechercher|Retour|Supprimer|Déplacer|Propriétés|Ouvrir|Rafraîchis|Actualiser|Aucun\w*|Fichiers? joints?)\b/
const ENGLISH_CHROME = /\b(Home|Edit|Done|Saving|Saved|Loading|Settings|Close|Cancel|Search|Delete|Move block|Page properties|Block settings|Open the folder|Nothing to show|Refresh|Arrange|Highlights|Attachments)\b/

/** Text a screen's chrome speaks: buttons, accessible names, tooltips, placeholders, status and empty states, summaries, breadcrumbs. */
function chromeWords(page) {
  return page.evaluate(() => {
    const out = []
    const scope = [...document.querySelectorAll('main, .adestia-canvas, .adestia-popover, .milkdown-slash-menu, [role=dialog]')]
    const seen = new Set()
    for (const s of scope) {
      for (const el of s.querySelectorAll('button, summary, label, legend, [role=status], .adestia-empty, .adestia-crumbs, kbd, [aria-label], [title], [placeholder]')) {
        if (seen.has(el)) continue
        seen.add(el)
        if (el.closest('article, .adestia-tile, .adestia-problems, .adestia-brief__item, .ProseMirror p')) continue
        if (el.closest('.adestia-edblock') && !el.matches('button, [aria-label], [title]')) continue
        const text = el.matches('button, summary, label, legend, [role=status], .adestia-empty, .adestia-crumbs, kbd') ? el.innerText : ''
        for (const v of [text, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder')]) if (v && v.trim()) out.push(v.trim())
      }
    }
    return out
  })
}

async function nativeControls(page) {
  return page.evaluate(() => {
    const out = []
    const uaGrey = new Set(['rgb(239, 239, 239)', 'rgb(233, 233, 237)', 'rgb(240, 240, 240)'])
    for (const el of document.querySelectorAll('main button, main select, main input, main textarea, .adestia-popover button, .adestia-popover select, .adestia-popover input, .adestia-popover textarea')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const cs = getComputedStyle(el)
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.name || '').trim().slice(0, 30)}"`
      if (el.tagName === 'BUTTON' && uaGrey.has(cs.backgroundColor)) out.push(`${name}: browser-grey background`)
      if (el.tagName === 'BUTTON' && /outset|inset|groove|ridge/.test(cs.borderTopStyle)) out.push(`${name}: ${cs.borderTopStyle} border`)
      if (el.tagName === 'SELECT' && cs.appearance !== 'none') out.push(`${name}: native select (appearance ${cs.appearance})`)
      if (el.type === 'checkbox' && cs.appearance !== 'none') out.push(`${name}: native checkbox`)
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && /inset|outset/.test(cs.borderTopStyle)) out.push(`${name}: ${cs.borderTopStyle} border`)
    }
    return out
  })
}

/** controls whose text holds a typographic character standing for an icon (docs/charte.md: one icon set, no glyph) */
async function glyphControls(page) {
  return page.evaluate(() => {
    const re = /[‹›✎⚙↺▥▤✕✓✗×⠿▸▾▴★☆⌕⋮＋↑■◆]/u
    const out = []
    for (const el of document.querySelectorAll('main button, main summary, main a, .adestia-popover button')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      if (el.closest('.adestia-tile')) continue // a tile's icon is the author's emoji
      const text = (el.textContent || '').trim()
      if (re.test(text)) out.push(`${el.tagName.toLowerCase()} "${text}"`)
    }
    return out
  })
}

const gc = (ms = 700) => new Promise((r) => setTimeout(r, ms))

/* ───────────────────────── the browser tests, per skin and language ───────────────────────── */

for (const locale of ['en', 'fr']) {
  describe(`pages (${locale}, alfred)`, () => {
    let instance
    let browser
    let page
    const w = W[locale]
    const shot = async (name) => { await mkdir(join(shots, locale), { recursive: true }); await page.screenshot({ path: join(shots, locale, `${name}.png`) }) }
    const go = async (route, mark) => {
      await page.goto('about:blank')
      await page.goto(`${instance.url}/#${route}`)
      if (mark) await page.locator(mark).first().waitFor({ state: 'visible', timeout: 20_000 })
      await gc(900)
    }
    before(async () => {
      instance = await startInstance('pages', 'alfred', locale)
      browser = await chromium.launch()
      page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale })
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    // B-8 / P-4 step 1 / Q-23 · the loading state of E-2
    test(`P-4 · home shows "${w.loading}" in a status row and keeps the greeting while the index is pending, then the content`, async () => {
      let release
      const held = new Promise((r) => { release = r })
      await page.route('**/api/pages/index*', async (route) => { await held; await route.continue() })
      await page.goto('about:blank')
      await page.goto(`${instance.url}/#/`)
      const row = page.locator('[role=status]', { hasText: w.loading })
      await row.first().waitFor({ state: 'visible', timeout: 20_000 })
      assert.equal(await page.locator('.adestia-home__greeting').first().isVisible(), true, 'greeting stays visible while loading')
      assert.equal(await page.locator('.adestia-tile').count(), 0, 'no tile before the index settled')
      assert.equal(/Nothing to show yet|Rien à afficher/.test(await page.locator('.adestia-home').innerText()), false, 'no « Nothing to show yet. » while loading')
      await shot('home-loading')
      release()
      await page.locator('.adestia-tile').first().waitFor({ state: 'visible', timeout: 20_000 })
      assert.equal(await page.locator('[role=status]', { hasText: w.loading }).count(), 0, 'the loading row is gone once content shows')
      await page.unroute('**/api/pages/index*')
    })

    // bord: the index request FAILS: the loading ends (no timeout, "including failure") and Settings is still drawn
    test('P-4 · home leaves the loading state when the index request fails, and still draws a Settings tile', async () => {
      await page.route('**/api/pages/index*', (route) => route.fulfill({ status: 500, body: 'boom' }))
      await go('/', '.adestia-home__greeting')
      await until(async () => (await page.locator('[role=status]', { hasText: w.loading }).count()) === 0)
      assert.ok((await page.locator('.adestia-tile').count()) >= 1, 'at least the Settings tile')
      await shot('home-index-failed')
      await page.unroute('**/api/pages/index*')
    })

    test('P-4 · Ctrl+K puts the cursor in the composer; the ask bar says Ctrl K off Apple platforms', async () => {
      await go('/', '.adestia-home__ask')
      assert.equal((await page.locator('.adestia-home__ask-kbd').innerText()).trim(), 'Ctrl K')
      await page.locator('.adestia-tile').first().waitFor({ state: 'visible' })
      await page.locator('.adestia-home__greeting').first().click()
      await page.keyboard.press('Control+k')
      await until(() => page.locator('.adestia-composer__input').evaluate((el) => el === document.activeElement))
    })

    test('P-4 · the ask bar labels its shortcut ⌘K on a Mac and Meta+K focuses the composer', async () => {
      const mac = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' })
      const mp = await mac.newPage()
      await mp.addInitScript(() => { Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }) })
      await mp.goto(`${instance.url}/#/`)
      await mp.locator('.adestia-home__ask-kbd').waitFor({ state: 'visible', timeout: 20_000 })
      assert.equal((await mp.locator('.adestia-home__ask-kbd').innerText()).trim(), '⌘K')
      await mp.locator('.adestia-tile').first().waitFor({ state: 'visible' })
      await mp.locator('.adestia-home__greeting').first().click()
      await mp.keyboard.press('Meta+k')
      await until(() => mp.locator('.adestia-composer__input').evaluate((el) => el === document.activeElement))
      await mac.close()
    })

    test(`P-4 · the brief is headed "${w.highlights}", shows at most four entries, and its refresh sends "${w.refresh}"`, async () => {
      await go('/', '.adestia-brief')
      assert.match(await page.locator('.adestia-home').innerText(), new RegExp(w.highlights, 'i'))
      const n = await page.locator('.adestia-brief__item').count()
      assert.ok(n >= 1 && n <= 4, `brief entries: ${n}`)
      await page.locator('.adestia-section__refresh').click()
      await until(async () => (await page.locator('.adestia-chat__conversation').innerText()).includes(w.refresh))
    })

    // exclusion: home/ is left out of Domains, Settings always drawn
    test('P-4 · Domains leaves the home/ folder out and always ends with the Settings tile', async () => {
      await put(instance.pages, 'home/note.md', fm('Une note'))
      await put(instance.pages, 'zeta/une.md', fm('Une page de zeta'))
      await go('/', '.adestia-tile')
      await until(async () => (await page.locator('.adestia-tile__label', { hasText: /^zeta$/i }).count()) === 1)
      const labels = (await page.locator('.adestia-tile__label').allInnerTexts()).map((s) => s.trim().toLowerCase())
      assert.equal(labels.includes('home'), false, `tile labels: ${labels}`)
      assert.ok(labels.includes('zeta'))
      assert.ok(labels.length >= 2)
    })

    test('P-4 · Arrange then Done keep the tiles and leave arranging mode', async () => {
      if (locale !== 'en') return
      await go('/', '.adestia-tile')
      const before = await page.locator('.adestia-tile__label').allInnerTexts()
      await page.getByRole('button', { name: 'Arrange' }).click()
      await page.getByRole('button', { name: 'Done' }).waitFor({ state: 'visible' })
      await shot('home-arranging')
      await page.getByRole('button', { name: 'Done' }).click()
      await page.getByRole('button', { name: 'Arrange' }).waitFor({ state: 'visible' })
      assert.deepEqual(await page.locator('.adestia-tile__label').allInnerTexts(), before)
    })

    // E-3
    test('P-4 · a section of five pages has no search field, a sixth page makes it appear, and a miss shows an empty state', async () => {
      await go('/section/blocs', 'main .adestia-section')
      assert.equal(await page.getByRole('searchbox').count() + await page.locator('main input[type=search], main input[type=text]').count(), 0, 'five pages: no search')
      await put(instance.pages, 'blocs/sixieme.md', fm('Sixième page'))
      await until(async () => { await go('/section/blocs', 'main .adestia-section'); return (await page.locator('main input').count()) >= 1 }, 20_000)
      const input = page.locator('main input').first()
      await input.fill('zzzzzz-introuvable')
      await page.locator('.adestia-empty').first().waitFor({ state: 'visible' })
      assert.equal(await page.locator('main a[href*="#/page/"]').count(), 0, 'no card left on a miss')
      await shot('section-no-match')
      await input.fill('Sixième')
      await until(async () => (await page.locator('main', { hasText: 'Sixième page' }).count()) === 1)
      assert.equal(await page.locator('.adestia-empty').count(), 0)
    })

    // E-8
    for (const [status, icon] of [[404, 'file-question'], [403, 'lock'], [401, 'lock'], [500, 'circle-alert']]) {
      test(`P-5 · a page answered ${status} shows the missing-page state, names its path, uses ${icon} and links to the folder above`, async () => {
        if (status !== 404) await page.route('**/api/pages/voyages/lisbonne*', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) }))
        await go(status === 404 ? '/page/voyages/nope' : '/page/voyages/lisbonne', '.adestia-empty')
        const empty = page.locator('.adestia-empty').first()
        assert.match(await page.locator('main').innerText(), status === 404 ? /voyages\/nope\.md/ : /voyages\/lisbonne/)
        assert.equal(await empty.locator(`use[href$="#adestia-i-${icon}"]`).count(), 1, `icon ${icon}`)
        if (locale === 'en' && status === 404) {
          assert.match(await empty.innerText(), new RegExp(w.noPage))
          await page.locator('.adestia-missing').getByText(w.folderUp).click()
          await page.waitForFunction(() => location.hash === '#/section/voyages')
        } else {
          await page.locator('.adestia-missing a, .adestia-missing button').last().click()
          await page.waitForFunction(() => location.hash.startsWith('#/section/voyages'))
        }
        await shot(`missing-${status}`)
        await page.unroute('**/api/pages/voyages/lisbonne*')
      })
    }

    // E-20 + B-9
    test('P-11 · an app without a view says it is not active, offers Home, and Home leads to the landing canvas', async () => {
      await go('/bench-noview', '.adestia-empty')
      if (locale === 'en') assert.match(await page.locator('.adestia-empty').first().innerText(), new RegExp(w.notActive))
      assert.equal(await page.locator('.adestia-empty use[href$="#adestia-i-plug"]').count(), 1)
      await shot('inactive')
      const back = page.locator('main button', { has: page.locator('use[href$="#adestia-i-chevron-left"]'), hasText: w.home }).first()
      await back.waitFor({ state: 'visible' })
      await back.click()
      await page.waitForFunction(() => location.hash === '#/' || location.hash === '')
      await page.locator('.adestia-home__greeting').waitFor({ state: 'visible' })
    })

    test('P-11 · a route no plugin owns falls through to the landing canvas', async () => {
      await go('/no-such-plugin-xyz', null)
      await page.locator('.adestia-home__greeting').waitFor({ state: 'visible', timeout: 20_000 })
    })

    // P-5 / P-6
    test('P-6 · typing saves after a pause, the status goes Saving… then Saved, and the file holds the text', async () => {
      await put(instance.pages, 'editeur/sauvegarde.md', fm('Sauvegarde'))
      await go('/page/editeur/sauvegarde', 'article')
      await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
      const ed = page.locator('[contenteditable=true]').first()
      await ed.waitFor({ state: 'visible' })
      await gc(800)
      await ed.click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' MARQUEUR-VERIF')
      await until(() => /MARQUEUR-VERIF/.test(readFileSync(join(instance.pages, 'editeur/sauvegarde.md'), 'utf8')), 20_000)
      await shot('editor-saved')
      assert.equal(await page.locator('main use[href$="#adestia-i-check"]').count() >= 1, true, 'a check icon shows the saved status')
      if (locale === 'en') assert.match(await page.locator('main').innerText(), /Saved/)
    })

    test(`P-6 · when the agent wrote the file meanwhile, the editor stays open, says "${w.conflict ?? '(fr)'}" and the user's text is not saved`, async () => {
      await put(instance.pages, 'editeur/conflit.md', fm('Conflit'))
      await go('/page/editeur/conflit', 'article')
      await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
      const ed = page.locator('[contenteditable=true]').first()
      await ed.waitFor({ state: 'visible' })
      await gc(800)
      // the agent writes the file
      await new Promise((r) => setTimeout(r, 1200))
      await put(instance.pages, 'editeur/conflit.md', `${fm('Conflit')}\nVERSION-AGENT\n`)
      await gc(800)
      await ed.click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' TEXTE-UTILISATEUR')
      await gc(4000)
      const disk = readFileSync(join(instance.pages, 'editeur/conflit.md'), 'utf8')
      assert.match(disk, /VERSION-AGENT/)
      assert.doesNotMatch(disk, /TEXTE-UTILISATEUR/, 'nothing more is saved after the 409')
      assert.equal(await page.locator('[contenteditable=true]').first().isVisible(), true, 'the editor stays open')
      assert.match(await page.locator('[contenteditable=true]').first().innerText(), /TEXTE-UTILISATEUR/, 'the text stays in the editor')
      assert.equal(await page.locator('main use[href$="#adestia-i-triangle-alert"]').count() >= 1, true, 'conflict icon triangle-alert')
      if (locale === 'en') assert.match(await page.locator('main').innerText(), new RegExp(w.conflict.replace('.', '\\.')))
      else assert.doesNotMatch(await page.locator('main').innerText(), /The agent changed|Reload to see/)
      await shot('editor-conflict')
    })

    // E-5 / E-6
    test('P-6 · Escape and an outside click close page properties and block settings, and focus returns to the settings control', async () => {
      await go('/page/editeur/blocs', 'article')
      await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
      await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible' })
      await gc(900)
      const gear = page.locator('.adestia-editor__meta-gear')
      await gear.click()
      await page.locator('.adestia-popover').first().waitFor({ state: 'visible' })
      await shot('page-properties')
      await page.keyboard.press('Escape')
      await until(async () => (await page.locator('.adestia-popover').count()) === 0)
      assert.equal(await gear.evaluate((el) => el === document.activeElement), true, 'focus back on Page properties')
      await gear.click()
      await page.locator('.adestia-popover').first().waitFor({ state: 'visible' })
      await page.mouse.click(5, 450)
      await until(async () => (await page.locator('.adestia-popover').count()) === 0)

      const blockGear = page.locator('.adestia-edblock__gear').first()
      await blockGear.click({ force: true })
      await page.locator('.adestia-popover').first().waitFor({ state: 'visible' })
      await shot('block-settings')
      await page.keyboard.press('Escape')
      await until(async () => (await page.locator('.adestia-popover').count()) === 0)
      assert.equal(await blockGear.evaluate((el) => el === document.activeElement), true, 'focus back on Block settings')
    })

    // the conflict cannot hide a block settings pop-up: the pencil, then Done leaves editing
    test('P-6 · Done returns to the reading mode of the same page', async () => {
      await go('/page/editeur/blocs', 'article')
      await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
      await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible' })
      await gc(900)
      await page.locator('.adestia-editor__save').click()
      await page.locator('main article').first().waitFor({ state: 'visible' })
      assert.equal(await page.locator('main button:has(use[href$="#adestia-i-pencil"])').count() >= 1, true)
    })
  })
}

/* ───────────────────────── four skins × two languages · B-7, B-8, B-10 ───────────────────────── */

const SCREENS = {
  home: { route: '/', mark: '.adestia-home .adestia-tile' },
  section: { route: '/section/voyages', mark: 'main .adestia-section' },
  reader: { route: '/page/editeur/blocs', mark: 'article' },
  collection: { route: '/page/projets/INDEX', mark: 'main article, main .adestia-section' },
  missing: { route: '/page/voyages/nope', mark: '.adestia-empty' },
  inactive: { route: '/bench-noview', mark: '.adestia-empty' },
  editor: { route: '/page/editeur/blocs', mark: 'article', edit: true },
}

for (const skin of SKINS) {
  for (const locale of ['en', 'fr']) {
    describe(`every pages screen, skin ${skin}, ${locale}`, () => {
      let instance
      let browser
      let page
      before(async () => {
        instance = await startInstance('pages', skin, locale)
        browser = await chromium.launch()
        page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale })
      })
      after(async () => { await browser?.close(); await instance?.stop() })
      const reach = async (screen) => {
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#${screen.route}`)
        await page.locator(screen.mark).first().waitFor({ state: 'visible', timeout: 20_000 })
        await gc(1200)
        if (screen.edit) {
          await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
          await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible', timeout: 20_000 })
          await gc(900)
        }
      }

      for (const [name, screen] of Object.entries(SCREENS)) {
        test(`B-8 · ${name}: the chrome speaks ${locale} only`, async () => {
          await reach(screen)
          await mkdir(join(shots, skin, locale), { recursive: true })
          await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) })
          const words = await chromeWords(page)
          const other = locale === 'en' ? FRENCH_CHROME : ENGLISH_CHROME
          assert.deepEqual(words.filter((s) => other.test(s)), [], `other-language chrome on ${name}`)
        })
        test(`B-7 · ${name}: no browser-grey control and no typographic glyph standing for an icon`, async () => {
          await reach(screen)
          assert.deepEqual(await nativeControls(page), [])
          assert.deepEqual(await glyphControls(page), [])
        })
      }

      test('B-7 · keyboard focus is visible on every control Tab reaches in the home, a section and the reader', async () => {
        const bad = []
        for (const name of ['home', 'section', 'reader']) {
          await reach(SCREENS[name])
          for (let i = 0; i < 25; i++) {
            await page.keyboard.press('Tab')
            const r = await page.evaluate(() => {
              const el = document.activeElement
              if (!el || el === document.body) return null
              const cs = getComputedStyle(el)
              const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
              const wrapper = el.closest('.adestia-tile, label, .adestia-chip')
              const wcs = wrapper ? getComputedStyle(wrapper) : null
              const wring = wcs && ((wcs.outlineStyle !== 'none' && parseFloat(wcs.outlineWidth) > 0) || (wcs.boxShadow && wcs.boxShadow !== 'none'))
              const box = el.getBoundingClientRect()
              return { visible: box.width > 0 && box.height > 0, ring: Boolean(ring || wring), label: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25)}"` }
            })
            if (r && r.visible && !r.ring) bad.push(`${name}: ${r.label}`)
          }
        }
        assert.deepEqual([...new Set(bad)], [])
      })
    })
  }
}

/* ───────────────────────── phone width ───────────────────────── */

describe('pages at phone width (en, alfred)', () => {
  let instance
  let browser
  let page
  before(async () => {
    instance = await startInstance('pages', 'alfred', 'en')
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'en' })
  })
  after(async () => { await browser?.close(); await instance?.stop() })
  const go = async (route, mark) => { await page.goto('about:blank'); await page.goto(`${instance.url}/#${route}`); await page.locator(mark).first().waitFor({ state: 'visible', timeout: 20_000 }); await gc(1200) }

  for (const [name, route, mark] of [['home', '/', '.adestia-home__greeting'], ['section', '/section/voyages', 'main .adestia-section'], ['reader', '/page/editeur/blocs', 'article'], ['missing', '/page/voyages/nope', '.adestia-empty']]) {
    test(`B-10 · ${name} does not scroll sideways at 360 px`, async () => {
      await go(route, mark)
      await mkdir(join(shots, 'phone'), { recursive: true })
      await page.screenshot({ path: join(shots, 'phone', `${name}.png`) })
      const over = await page.evaluate(() => {
        const canvas = document.querySelector('.adestia-canvas__body') ?? document.body
        return Math.max(document.documentElement.scrollWidth - innerWidth, canvas.scrollWidth - canvas.clientWidth)
      })
      assert.ok(over <= 1, `horizontal overflow ${over}px`)
    })
  }

  test('P-4 · on a phone the canvas header says Chat, named "Back to the chat", and returns to the conversation', async () => {
    await go('/', '.adestia-home__greeting')
    const back = page.getByRole('button', { name: 'Back to the chat' })
    await back.waitFor({ state: 'visible' })
    assert.equal((await back.innerText()).trim(), 'Chat')
    await back.click()
    await page.locator('.adestia-composer__input').waitFor({ state: 'visible' })
  })

  test('P-6 · at 360 px the page-properties popover stays inside the viewport with an 8 px margin', async () => {
    await go('/page/editeur/blocs', 'article')
    await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
    await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible' })
    await gc(900)
    await page.locator('.adestia-editor__meta-gear').click()
    const pop = page.locator('.adestia-popover').first()
    await pop.waitFor({ state: 'visible' })
    await gc(400)
    await page.screenshot({ path: join(shots, 'phone', 'properties.png') })
    const box = await pop.boundingBox()
    assert.ok(box.x >= 7.5, `left margin ${box.x}`)
    assert.ok(box.x + box.width <= 360 - 7.5, `right edge ${box.x + box.width}`)
    assert.ok(box.y >= 7.5, `top margin ${box.y}`)
    assert.ok(box.y + box.height <= 740 - 7.5, `bottom edge ${box.y + box.height}`)
  })
})

/* ───────────────────────── B-9 · the shell's back above a plugin ───────────────────────── */

for (const locale of ['en', 'fr']) {
  describe(`B-9 · the back above a plugin (${locale})`, () => {
    let instance
    let browser
    let page
    before(async () => {
      instance = await startInstance('plugins', 'alfred', locale)
      browser = await chromium.launch()
      page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale })
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    test(`the shell's back above the todo plugin says ${W[locale].home}, has a chevron, and leads home`, async () => {
      await page.goto(`${instance.url}/#/todo`)
      const back = page.locator('main button', { has: page.locator('use[href$="#adestia-i-chevron-left"]'), hasText: W[locale].home }).first()
      await back.waitFor({ state: 'visible', timeout: 25_000 })
      await gc(1500)
      await mkdir(join(shots, 'plugins'), { recursive: true })
      await page.screenshot({ path: join(shots, 'plugins', `back-${locale}.png`) })
      assert.equal(await page.getByText('‹ Back').count(), 0, 'the old « ‹ Back » glyph label is gone')
      await back.click()
      await page.waitForFunction(() => location.hash === '#/' || location.hash === '')
      await page.locator('.adestia-home__greeting').waitFor({ state: 'visible' })
    })
  })
}

/* ───────────────────────── B-11 · the code criteria of the fiche ───────────────────────── */

describe('code criteria of the pages tranche', () => {
  const src = join(root, 'packages/web/src')
  const sheets = ['reader', 'editor', 'home', 'mobile', 'missing-page'].map((n) => join(src, 'app/styles', `${n}.css`))
  const read = (f) => readFileSync(f, 'utf8')
  /** drop comments, then the text of `var(--x, <fallback>)` fallbacks are allowed colours */
  const stripped = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const sheet of sheets) {
    const name = sheet.split('/').pop()
    test(`${name}: no colour outside a var() fallback, no literal font size, no literal radius, no bare outline: none`, () => {
      assert.ok(existsSync(sheet), `${name} exists`)
      const css = stripped(read(sheet))
      const lines = css.split('\n')
      const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\b(white|black|red|blue|green|gray|grey|orange|purple|yellow)\b\s*[;}\n,)]/
      const found = []
      lines.forEach((line, i) => {
        const noVarFallback = line.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, 'VAR')
        if (colour.test(noVarFallback)) found.push(`${name}:${i + 1} colour: ${line.trim()}`)
        if (/font-size\s*:/.test(line) && /font-size\s*:[^;}]*\d(\.\d+)?(px|rem|em|pt)\b/.test(line.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, 'VAR'))) found.push(`${name}:${i + 1} font-size: ${line.trim()}`)
        // a radius derived from the token (calc(var(--radius) - 1px)) is the token's, not a literal one: see Trous
        if (/radius\s*:/.test(line) && /radius\s*:[^;}]*\d(\.\d+)?(px|rem|em|%)/.test(line.replace(/calc\(\s*var\([^()]*\)\s*[-+]\s*[\d.]+px\s*\)/g, 'VAR').replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, 'VAR'))) found.push(`${name}:${i + 1} radius: ${line.trim()}`)
      })
      // outline: none must sit in a rule that also draws a replacement (outline/box-shadow/border-color…) — checked per rule
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/outline\s*:\s*(none|0)\b/.test(m[2]) && !/(box-shadow\s*:\s*[^;]*\b(var\(|\d)|outline-color|border-color\s*:|outline\s*:\s*[^;]*var\()/.test(m[2])) {
          // a ring may sit in a :focus-visible rule of the same selector: look for it
          const sel = m[1].trim().split(',')[0].replace(/:focus(-visible)?|:focus-within/g, '').trim()
          const ring = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*:focus-visible[^{}]*\\{[^{}]*(outline|box-shadow)`).test(css)
          if (!ring) found.push(`${name}: outline none without a replacement in "${m[1].trim().slice(0, 60)}"`)
        }
      }
      assert.deepEqual(found, [])
    })
  }

  test('prettify and folderOf are defined once in packages/web/src', () => {
    const out = execFileSync('git', ['grep', '-nE', '(function|const|let)\\s+(prettify|folderOf)\\b', '--', 'packages/web/src'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter((l) => l && !/\.test\./.test(l))
    assert.equal(out.filter((l) => /prettify/.test(l)).length, 1, out.join('\n'))
    assert.equal(out.filter((l) => /folderOf/.test(l)).length, 1, out.join('\n'))
  })

  test('no fetchImpl( call in the pages files outside the shared request helper', () => {
    const files = ['app/Home.tsx', 'app/Section.tsx', 'app/Collection.tsx', 'app/MissingPage.tsx', 'app/App.tsx', 'app/usePage.ts', 'app/live.ts', 'plugins/PageEditor.tsx'].map((f) => join(src, f))
    let editorFiles = []
    try { editorFiles = execFileSync('git', ['ls-files', 'packages/web/src/editor'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => join(root, f)) } catch { /* none */ }
    const hits = [...files, ...editorFiles].filter((f) => /\bfetchImpl\(/.test(read(f)))
    assert.deepEqual(hits, [])
  })

  test('Reader.tsx, Editor.tsx, App.tsx and Home.tsx hold no function longer than 250 lines', async () => {
    const ts = createRequire(join(root, 'package.json'))('typescript')
    const files = ['editor/Reader.tsx', 'editor/Editor.tsx', 'app/App.tsx', 'app/Home.tsx'].map((f) => join(src, f))
    const long = []
    for (const f of files) {
      const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node) => {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
          const a = sf.getLineAndCharacterOfPosition(node.getStart()).line
          const b = sf.getLineAndCharacterOfPosition(node.getEnd()).line
          if (b - a + 1 > 250) long.push(`${f.split('/').pop()}:${a + 1} (${b - a + 1} lines)`)
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    assert.deepEqual(long, [])
  })
})
