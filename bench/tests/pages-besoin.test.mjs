/**
 * The pages' screens against the need: E-2 Home, E-3 Section, E-4 Reader and Editor, E-5 page properties,
 * E-6 block settings, E-7 collection, E-8 missing page, E-20 inactive app, and the shell's backs
 * (B-7, B-8, B-9; P-4, P-5, P-6, P-11), through a real browser on a real instance of the `pages` seed
 * (scripted engine, as the bench does).
 *
 *   npm run build && node --test bench/tests/pages-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment (`/usr/lib/node_modules` or `npm root -g`).
 * `BESOIN_SKINS=alfred,dobby` and `BESOIN_LOCALES=fr` narrow the matrix; pictures land in
 * `bench/shots-besoin/` (ignored by git). Every expected word below is written by hand from
 * docs/parcours.md and docs/ecrans.md, never from what the screen printed. Content the tests need
 * beyond the seed (a page with six siblings, a conflict) is written into the instance's workspace the
 * way the agent writes it: a file on disk.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile, utimes } from 'node:fs/promises'
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

/** Words the need names (docs/parcours.md P-4, P-6, P-11; docs/ecrans.md), by locale. */
const W = {
  en: { home: 'Home', loading: 'Loading…', highlights: 'Highlights', refreshPrompt: 'Refresh my highlights', notActive: 'That app is not active on this instance.', conflict: 'The agent changed this page. Reload to see its version.', noPage: 'There is no page at this address.' },
  fr: { home: 'Accueil', loading: 'Chargement…', highlights: 'À la une', refreshPrompt: 'Rafraîchis ma une', notActive: null, conflict: null, noPage: null },
}

/** the file the editor writes lands a moment after its status says so */
async function onDisk(file, re) {
  for (let i = 0; i < 40; i++) { if (re.test(readFileSync(file, 'utf8'))) return; await new Promise((r) => setTimeout(r, 250)) }
  assert.match(readFileSync(file, 'utf8'), re)
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))

function startInstance(seed, skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-pages-'))
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

/** What the seed wrote is the user's content, not interface (the seeds are plain files). */
const corpus = readdirSync(join(root, 'bench/seed')).map((name) => readFileSync(join(root, 'bench/seed', name), 'utf8')).join('\n').toLowerCase()
const segments = (line) => line
  .split(/\s[·—→–|]\s|,\s|[:()]|\s{2,}|\t|[“”«»]|\.\s|\n/u)
  .map((part) => part.replace(/[\p{Extended_Pictographic}️↗↺✦▶▸◆]/gu, '').replace(/^[·\s-]+/, '').trim())
  .filter((part) => part.length > 2)
const FRENCH_MARK = /[àâçéèêëîïôûùüœ]|\b(le|la|les|des|du|une|pour|avec|vous|dans|sans|sur|aucun|aucune|rien|ligne)\b/i
const ENGLISH_MARK = /\b(the|of|and|with|for|your|you|will|has|have|is|are|be|not|this|that|there|no|nothing|none|yet|ignored|attribute|loading|empty|add|leave|close|cancel|clear|remove|open|show|hide|retry|reload|refresh|dismiss|restore|search|ask|new|home|back|settings|edit|done|saved|saving|delete|move|block|line|fresh|brief|folder|above|address|matches)\b/i
/** Block names, icons and frontmatter keys are the product's vocabulary and the author's data (docs/ecrans.md: « block names and `ico` remain data »). */
const DATA_WORDS = /^(callout|row|gallery|content|figures|bloc-table|table|list|app|bench-noview|code|image|math|type|title|ico|frame|w|fiche|index|collection|projet|voyage|chantier|archive)$/i

async function words(page, scope) {
  return page.evaluate((sel) => {
    const roots = [...document.querySelectorAll(sel)]
    const lines = []
    for (const rootEl of roots) {
      const clone = rootEl.cloneNode(true)
      // the problems bands (E-19) carry server and plugin sentences: another tranche's screen
      clone.querySelectorAll('[role=status]:has(h2), script, style, option, .adestia-tile__ico').forEach((el) => el.remove())
      lines.push(...[...clone.querySelectorAll('*')].filter((el) => el.children.length === 0).map((el) => el.textContent.trim()).filter(Boolean))
      lines.push(...[...clone.querySelectorAll('[aria-label], [title], [placeholder]')].flatMap((el) => ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a)).filter(Boolean)))
    }
    return lines
  }, scope)
}

function leaks(lines, locale) {
  const mark = locale === 'en' ? FRENCH_MARK : ENGLISH_MARK
  const found = new Set()
  for (const line of lines) {
    for (const part of segments(line)) {
      if (DATA_WORDS.test(part)) continue
      if (!mark.test(part)) continue
      if (corpus.includes(part.toLowerCase())) continue
      found.add(part)
    }
  }
  return [...found]
}

/** Controls drawn by the browser instead of by the charter's classes (docs/charte.md § 4). */
async function nativeControls(page, scope) {
  return page.evaluate((sel) => {
    const out = []
    const defaults = new Set(['rgb(239, 239, 239)', 'rgb(107, 107, 107)', 'rgb(59, 59, 59)'])
    for (const rootEl of document.querySelectorAll(sel)) {
      for (const el of rootEl.querySelectorAll('button, select, input, textarea')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        const cs = getComputedStyle(el)
        const label = `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} "${(el.getAttribute('aria-label') || el.textContent || el.name || '').trim().slice(0, 30)}"`
        if (el.tagName === 'BUTTON' && defaults.has(cs.backgroundColor) && cs.backgroundImage === 'none') out.push(`${label}: browser-grey button background ${cs.backgroundColor}`)
        if (el.tagName === 'BUTTON' && /outset|inset|groove|ridge/.test(cs.borderTopStyle)) out.push(`${label}: ${cs.borderTopStyle} border`)
        if (el.tagName === 'SELECT' && cs.appearance !== 'none') out.push(`${label}: appearance ${cs.appearance}`)
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && /inset|outset/.test(cs.borderTopStyle)) out.push(`${label}: ${cs.borderTopStyle} border`)
        if (el.type === 'checkbox' && el.getAttribute('role') !== 'switch' && cs.appearance !== 'none') out.push(`${label}: native checkbox`)
      }
    }
    return out
  }, scope)
}

/** Characters the product used as icons before the sprite (docs/ecrans.md Q-11, Q-14). */
const GLYPHS = /[‹›✎⚙↺▥▤✕✓✗×⠿▸▾▴★☆⌕⋮＋↑■◆]/u
async function glyphControls(page, scope) {
  return page.evaluate(({ sel, src }) => {
    const re = new RegExp(src, 'u')
    const out = []
    for (const rootEl of document.querySelectorAll(sel)) {
      for (const el of rootEl.querySelectorAll('button, a, summary, [role=button], [role=menuitem]')) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        if (el.closest('.adestia-tile')) continue // a tile's icon is the author's emoji or tested apart
        const text = (el.textContent || '').trim()
        if (re.test(text)) out.push(`${el.tagName.toLowerCase()} "${text.slice(0, 30)}"`)
      }
    }
    return out
  }, { sel: scope, src: GLYPHS.source })
}

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`pages on skin ${skin}, ${locale}`, () => {
      const w = W[locale]
      let instance
      let browser
      let page
      const shot = async (name) => { await mkdir(join(shots, skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) }) }
      const settle = (ms = 1500) => page.waitForTimeout(ms)
      const ready = async () => {
        await page.locator('.adestia-loading').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {})
        await settle(700)
      }
      /** hash navigation inside the page, then wait for a visible mark of the screen */
      const open = async (route, mark) => {
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#${route}`)
        await page.locator(mark).first().waitFor({ state: 'visible', timeout: 20_000 })
        await ready()
      }
      const hashIs = (re) => page.waitForFunction((src) => new RegExp(src).test(location.hash), re.source, { timeout: 20_000 })
      const pencil = () => page.locator('main button:has(use[href$="#adestia-i-pencil"])').first()
      const openEditor = async (route) => {
        await open(route, 'article')
        await pencil().click()
        await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible', timeout: 20_000 })
        await settle(800)
      }

      /** the screens of the pages' tranche, each with the way to reach it */
      const SCREENS = {
        home: () => open('/', 'h1'),
        section: () => open('/section/voyages', 'text=Lisbonne, avril'),
        reader: () => open('/page/editeur/blocs', 'text=En chiffres'),
        readonly: () => open('/page/blocs/vocabulaire-casse', 'main article, main pre, .adestia-editor__readonly'),
        collection: () => open('/page/projets/INDEX', 'text=Menuiserie'),
        missing: () => open('/page/voyages/nope', '.adestia-empty'),
        inactive: () => open('/bench-noview', '.adestia-empty'),
        editor: () => openEditor('/page/editeur/blocs'),
        properties: async () => { await openEditor('/page/editeur/blocs'); await page.locator('.adestia-editor__meta-gear').click(); await page.locator('.adestia-popover').first().waitFor({ state: 'visible' }) },
        blocksettings: async () => { await openEditor('/page/editeur/blocs'); await page.locator('.adestia-edblock__gear').first().click({ force: true }); await page.locator('.adestia-popover').first().waitFor({ state: 'visible' }) },
        slash: async () => {
          await openEditor('/page/editeur/blocs')
          await page.locator('[contenteditable=true]').first().click()
          await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); await page.keyboard.type('/')
          await page.locator('.milkdown-slash-menu').first().waitFor({ state: 'visible' })
        },
      }
      const SCOPE = 'main, .adestia-popover, .milkdown-slash-menu, [role=dialog]'

      before(async () => {
        instance = await startInstance('pages', skin, locale)
        browser = await chromium.launch()
        page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale })
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      // ── B-8 · every screen speaks one language ──────────────────────────────────────────
      for (const [name, go] of Object.entries(SCREENS)) {
        // If the editor, reader or home string went back to a literal of the other language, this fails on it.
        test(`B-8 · ${name}: no word of the other language on a ${locale} instance`, async () => {
          await go()
          await shot(name)
          const found = leaks(await words(page, SCOPE), locale)
          assert.deepEqual(found, [], `strings in the other language on ${name}`)
        })

        // If a control went back to the browser's grey, or lost its sprite for a glyph, this fails.
        test(`B-7 · ${name}: no browser-native control and no glyph used as an icon`, async () => {
          await go()
          assert.deepEqual(await nativeControls(page, SCOPE), [], `native controls on ${name}`)
          assert.deepEqual(await glyphControls(page, SCOPE), [], `glyph icons on ${name}`)
        })
      }

      // B-7 · the home's tiles are navigation items: icon set or the author's emoji, not a product glyph
      test('B-7 · home: a tile without an authored icon shows a sprite icon, not a character', async () => {
        await SCREENS.home()
        const bad = await page.evaluate(() => [...document.querySelectorAll('.adestia-tile')].filter((t) => !/^plug/.test(t.textContent.trim()) && !t.querySelector('svg') && !/\p{Extended_Pictographic}/u.test(t.textContent)).map((t) => t.textContent.trim().slice(0, 30)))
        assert.deepEqual(bad, [], 'tiles with neither a sprite icon nor an authored emoji')
      })

      // B-7 · visible keyboard focus everywhere
      for (const screen of ['home', 'section', 'collection']) {
        test(`B-7 · ${screen}: every control reached by Tab shows a focus indicator`, async () => {
          await SCREENS[screen]()
          await page.locator('body').click({ position: { x: 5, y: 5 } })
          const none = []
          for (let i = 0; i < 14; i++) {
            await page.keyboard.press('Tab')
            const state = await page.evaluate(() => {
              const el = document.activeElement
              if (!el || el === document.body || el.closest('.adestia-chat')) return null
              const cs = getComputedStyle(el)
              const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
              return { ring, name: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25)}"` }
            })
            if (state && !state.ring) none.push(state.name)
          }
          assert.deepEqual(none, [], 'controls with no focus ring')
        })
      }

      if (skin === 'alfred') {
        // ── E-2 · P-4 steps 1–2 ────────────────────────────────────────────────────────────
        test('P-4 · home: Ctrl K and Meta K and a click on the ask bar put the cursor in the composer', async () => {
          await SCREENS.home()
          const composer = page.locator('.adestia-chat textarea, .adestia-chat [role=textbox]').first()
          const bar = page.locator('main button', { hasText: 'Ctrl K' }).first()
          assert.ok(await bar.isVisible(), 'the ask bar labels its shortcut « Ctrl K » off Apple platforms')
          assert.equal(await page.locator('main button', { hasText: '⌘K' }).count(), 0)
          await page.locator('main h1').click()
          await page.keyboard.press('Control+k')
          assert.ok(await composer.evaluate((el) => el === document.activeElement), 'Ctrl+K focuses the composer')
          await page.locator('main h1').click()
          await page.keyboard.press('Meta+k')
          assert.ok(await composer.evaluate((el) => el === document.activeElement), 'Meta+K focuses the composer')
          await page.locator('main h1').click()
          await bar.click()
          assert.ok(await composer.evaluate((el) => el === document.activeElement), 'a click on the bar focuses the composer')
        })

        test('P-4 · home: the brief shows its four entries under its heading, and an entry opens its target', async () => {
          await SCREENS.home()
          assert.ok(await page.getByRole('heading', { name: new RegExp(w.highlights) }).isVisible())
          for (const entry of ['Lisbonne dans 12 jours', 'Étagère du salon', 'Semaine du 12', 'Impôts']) {
            assert.ok(await page.getByRole('button', { name: entry }).isVisible(), entry)
          }
          await page.getByRole('button', { name: 'Lisbonne dans 12 jours' }).click()
          await hashIs(/#\/page\/voyages\/lisbonne/)
          await SCREENS.home()
          await page.getByRole('button', { name: 'Semaine du 12' }).click()
          await hashIs(/#\/section\/voyages/)
        })

        test('P-4 · home: the refresh control asks the agent for a fresh brief in the instance language', async () => {
          await SCREENS.home()
          await page.locator('main h2 button:has(use[href$="#adestia-i-rotate-ccw"])').click()
          await page.locator('.adestia-chat').getByText(w.refreshPrompt, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
        })

        // Q-23 · the home says it is loading, instead of « Nothing to show yet. »
        test('Q-23 · home: while the first index request is pending, a status row says Loading and the greeting stays', async () => {
          let release
          const held = new Promise((r) => { release = r })
          await page.route('**/api/pages/index', async (route) => { await held; await route.continue() })
          try {
            await page.goto('about:blank')
            await page.goto(`${instance.url}/#/`)
            const row = page.getByRole('status').filter({ hasText: w.loading })
            await row.waitFor({ state: 'visible', timeout: 20_000 })
            await shot('home-loading')
            assert.ok(await page.locator('main h1').isVisible(), 'the greeting stays visible')
            assert.equal(await page.getByText('Nothing to show yet.').count(), 0)
            assert.equal(await page.locator('.adestia-tile').count(), 0, 'no tile before the index answered')
            release()
            await page.locator('.adestia-tile').first().waitFor({ state: 'visible', timeout: 20_000 })
            assert.equal(await page.getByRole('status').filter({ hasText: w.loading }).count(), 0, 'the loading row is gone')
          } finally { release(); await page.unroute('**/api/pages/index') }
        })

        // Q-23 · failure path: a failed index request still ends the loading
        test('Q-23 · home: when the index request fails the loading ends and the Settings tile is drawn', async () => {
          await page.route('**/api/pages/index', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
          try {
            await page.goto('about:blank')
            await page.goto(`${instance.url}/#/`)
            await page.locator('main h1').waitFor({ state: 'visible' })
            await settle(3000)
            assert.equal(await page.getByRole('status').filter({ hasText: w.loading }).count(), 0, 'the loading row stays forever')
            assert.ok(await page.locator('.adestia-tile', { hasText: locale === 'en' ? 'Settings' : 'Réglages' }).first().isVisible())
          } finally { await page.unroute('**/api/pages/index') }
        })

        test('P-4 · home: Arrange switches the mosaic to arranging and the same control ends it', async () => {
          await SCREENS.home()
          const toggle = page.locator('main h2 button').last()
          const before = (await toggle.textContent()).trim()
          await toggle.click()
          const during = (await toggle.textContent()).trim()
          assert.notEqual(during, before)
          if (locale === 'en') { assert.equal(before, 'Arrange'); assert.equal(during, 'Done') }
          await toggle.click()
          assert.equal((await toggle.textContent()).trim(), before)
        })

        test('P-11 · an address whose app is not active falls through to Home', async () => {
          await open('/not-an-app', 'h1')
          assert.ok(await page.locator('.adestia-tile').first().isVisible(), 'the Domains mosaic of E-2')
        })

        // ── E-3 · P-4 steps 5–7 ────────────────────────────────────────────────────────────
        test('P-4 · section: exactly five pages show no search field; facet chips filter by state and toggle back', async () => {
          await SCREENS.section()
          assert.equal(await page.locator('main input[type=search], main input[type=text], main [role=searchbox]').count(), 0, 'no search at five pages')
          const chip = page.locator('button.adestia-chip', { hasText: 'en cours' })
          assert.equal(await chip.getAttribute('aria-pressed'), 'false')
          await chip.click()
          assert.equal(await chip.getAttribute('aria-pressed'), 'true')
          assert.ok(await page.getByRole('button', { name: /Lisbonne, avril/ }).isVisible())
          assert.ok(await page.getByRole('button', { name: /^Voyage Italie en cours/ }).isVisible())
          assert.equal(await page.getByRole('button', { name: /Week-end Vercors/ }).count(), 0, 'a page « à décider » is filtered out')
          assert.equal(await page.getByRole('button', { name: /Baden 2026/ }).count(), 0)
          await chip.click()
          assert.equal(await chip.getAttribute('aria-pressed'), 'false')
          assert.ok(await page.getByRole('button', { name: /Week-end Vercors/ }).isVisible())
        })

        test('P-4 · section: past five pages a search field appears; a miss shows the shared empty state', async () => {
          const dir = join(instance.pages, 'besoin-six')
          await mkdir(dir, { recursive: true })
          for (const [i, t] of ['Pomme', 'Poire', 'Prune', 'Cerise', 'Abricot', 'Figue'].entries()) {
            await writeFile(join(dir, `fruit-${i}.md`), `---\ntitle: ${t}\ntype: fiche\n---\n\nUn fruit.\n`)
          }
          await open('/section/besoin-six', 'text=Abricot')
          const search = page.locator('main input').first()
          await search.waitFor({ state: 'visible' })
          assert.ok(await page.locator('main use[href$="#adestia-i-search"]').count() >= 1, 'the search icon')
          await search.fill('Poire')
          assert.ok(await page.getByRole('button', { name: /^Poire/ }).isVisible())
          assert.equal(await page.getByRole('button', { name: /^Pomme/ }).count(), 0)
          await search.fill('zzzz')
          const empty = page.locator('.adestia-empty')
          await empty.waitFor({ state: 'visible' })
          assert.ok(await empty.locator('use[href$="#adestia-i-search-x"]').count() === 1, 'search-x icon')
          if (locale === 'en') assert.ok((await empty.innerText()).includes('Nothing matches.'))
          await search.fill('')
          assert.ok(await page.getByRole('button', { name: /^Figue/ }).isVisible())
        })

        test('P-4 · section: finished pages are folded, closed, under a summary', async () => {
          await open('/section/maison', 'h1')
          const fold = page.locator('main details').first()
          assert.equal(await fold.getAttribute('open'), null, 'closed by default')
          if (locale === 'en') assert.match(await fold.locator('summary').textContent(), /Finished/)
          await fold.locator('summary').click()
          assert.ok(await page.getByRole('button', { name: /Rangement du garage/ }).isVisible())
        })

        test('P-4 · the breadcrumb walks back up and Home leads to the landing canvas', async () => {
          await open('/page/editeur/blocs', 'article')
          await page.locator('nav').getByRole('button', { name: w.home }).click()
          await hashIs(/^(#\/?)?$/)
          await open('/page/editeur/blocs', 'article')
          await page.locator('nav').getByRole('button', { name: 'Editeur' }).click()
          await hashIs(/#\/section\/editeur/)
        })

        // ── E-4 reading · P-5 ──────────────────────────────────────────────────────────────
        test('P-5 · reader: typed blocks are drawn with their titles and content, and a wikilink opens its page', async () => {
          await SCREENS.reader()
          for (const title of ['À savoir', 'En chiffres', 'Fichiers', 'À gauche', 'À droite']) {
            assert.ok(await page.getByRole('heading', { name: title }).isVisible(), title)
          }
          const cell = page.getByRole('cell', { name: 'Tasseau' })
          assert.ok(await cell.isVisible()); assert.ok(await page.getByRole('cell', { name: '14', exact: true }).isVisible())
          assert.ok(await page.getByText('62 %').isVisible())
          await page.getByRole('button', { name: 'projet#servante' }).click()
          await hashIs(/#\/page\/blocs\/servante/)
          await page.getByText('Un projet cible des liens.').waitFor({ state: 'visible', timeout: 15_000 })
        })

        test('P-5 · reader: a lost wikilink is not a link', async () => {
          await SCREENS.reader()
          assert.equal(await page.getByRole('button', { name: 'projet#introuvable' }).count(), 0)
          assert.equal(await page.getByRole('link', { name: 'projet#introuvable' }).count(), 0)
          assert.ok(await page.getByText('projet#introuvable').first().isVisible())
        })

        test('P-5 · reader: a block that asks for an absent plugin says so in an inline note with the shared form', async () => {
          await SCREENS.reader()
          const note = page.locator('.adestia-empty--inline').filter({ hasText: 'disparu' })
          await note.first().waitFor({ state: 'visible' })
          assert.ok(await note.first().locator('svg').count() >= 1, 'an icon beside the sentence')
        })

        test('P-5 · reader: a page the vocabulary refuses opens read-only with a lock, its raw source and its diagnostics', async () => {
          await SCREENS.readonly()
          assert.ok(await page.locator('main use[href$="#adestia-i-lock"]').count() >= 1, 'lock icon')
          const text = await page.locator('main').innerText()
          assert.ok(text.includes(':::table{w=beaucoup}'), 'raw source shown')
          assert.ok(await page.locator('main li').filter({ hasText: /w/ }).count() >= 1, 'a diagnostic is listed')
          assert.equal(await page.locator('[contenteditable=true]').count(), 0, 'nothing editable')
        })

        test('P-5 · reader: the attachments strip lists files the body does not show', async () => {
          const dir = join(instance.pages, 'besoin-pj')
          await mkdir(join(dir, 'assets'), { recursive: true })
          await writeFile(join(dir, 'fiche.md'), '---\ntitle: Fiche avec pièces\ntype: fiche\n---\n\n![Vue](assets/vue.png)\n\nTexte.\n')
          await writeFile(join(dir, 'assets', 'vue.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64'))
          await writeFile(join(dir, 'assets', 'devis-unique.pdf'), '%PDF-1.4\n')
          await open('/page/besoin-pj/fiche', 'article')
          await page.getByText('devis-unique.pdf').first().waitFor({ state: 'visible', timeout: 15_000 })
          assert.equal(await page.getByText('vue.png').count(), 0, 'the image the body already shows is not listed again')
        })

        test('P-5 · reader: when the agent writes the page the open text is not replaced under the reader', async () => {
          const dir = join(instance.pages, 'besoin-live')
          await mkdir(dir, { recursive: true })
          const file = join(dir, 'vivante.md')
          await writeFile(file, '---\ntitle: Vivante\ntype: fiche\n---\n\nAvant la réécriture.\n')
          await open('/page/besoin-live/vivante', 'text=Avant la réécriture.')
          await page.evaluate(() => { window.__still_here = true })
          await writeFile(file, '---\ntitle: Vivante\ntype: fiche\n---\n\nAprès la réécriture.\n')
          await settle(3000)
          // Known defect (ARCHITECTURE.md): only the index follows the agent; the open page is left alone so unsaved words are safe.
          assert.equal(await page.evaluate(() => window.__still_here), true, 'the page was not reloaded')
          assert.equal(await page.getByText('Avant la réécriture.').count() > 0, true, 'the open text is kept')
        })

        // ── E-8 · P-5 step 8 ───────────────────────────────────────────────────────────────
        test('P-5 · missing page: a 404 names the path, uses file-question, and the link leads to the folder above', async () => {
          await SCREENS.missing()
          const empty = page.locator('.adestia-empty')
          assert.equal(await empty.locator('use[href$="#adestia-i-file-question"]').count(), 1)
          assert.ok((await page.locator('main').innerText()).includes('voyages/nope.md'), 'names the path')
          if (locale === 'en') assert.ok((await empty.innerText()).includes(w.noPage))
          assert.ok(await page.locator('main use[href$="#adestia-i-folder-open"]').count() >= 1, 'folder-open icon on the link')
          await page.locator('main a, main .adestia-empty button').filter({ hasNot: page.locator('nav') }).last().click()
          await hashIs(/#\/section\/voyages/)
        })

        for (const [status, icon, label] of [[403, 'lock', 'out of reach'], [401, 'lock', 'session'], [500, 'circle-alert', 'server error']]) {
          test(`P-5 · missing page: a ${status} (${label}) shows ${icon} and does not say the page does not exist`, async () => {
            await page.route('**/api/pages/voyages/lisbonne.md*', (route) => route.fulfill({ status, contentType: 'application/json', body: '{"error":"x"}' }))
            try {
              await page.goto('about:blank')
              await page.goto(`${instance.url}/#/page/voyages/lisbonne`)
              const empty = page.locator('.adestia-empty')
              await empty.waitFor({ state: 'visible', timeout: 20_000 })
              assert.equal(await empty.locator(`use[href$="#adestia-i-${icon}"]`).count(), 1)
              assert.ok((await page.locator('main').innerText()).includes('voyages/lisbonne'), 'names the path')
              if (locale === 'en') assert.ok(!(await empty.innerText()).includes(w.noPage), 'it is not the 404 sentence')
            } finally { await page.unroute('**/api/pages/voyages/lisbonne.md*') }
          })
        }
        test('P-5 · missing page: the three failures say three different things', async () => {
          const said = []
          for (const status of [404, 403, 500]) {
            await page.route('**/api/pages/voyages/lisbonne.md*', (route) => route.fulfill({ status, contentType: 'application/json', body: '{"error":"x"}' }))
            await page.goto('about:blank')
            await page.goto(`${instance.url}/#/page/voyages/lisbonne`)
            await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
            said.push((await page.locator('.adestia-empty .adestia-empty__text').first().innerText()).trim())
            await page.unroute('**/api/pages/voyages/lisbonne.md*')
          }
          assert.equal(new Set(said).size, 3, said.join(' / '))
        })

        // ── E-20 · P-11 ────────────────────────────────────────────────────────────────────
        test('P-11 · inactive app: the shared empty state with a plug icon says the app is not active, and Home leads home', async () => {
          await SCREENS.inactive()
          const empty = page.locator('.adestia-empty')
          assert.equal(await empty.locator('use[href$="#adestia-i-plug"]').count(), 1)
          if (locale === 'en') assert.ok((await empty.innerText()).includes(w.notActive))
          const home = page.getByRole('button', { name: w.home, exact: true }).last()
          assert.ok(await home.locator('use[href$="#adestia-i-chevron-left"]').count() >= 1 || await empty.locator('use[href$="#adestia-i-chevron-left"]').count() >= 1, 'the Home action carries the chevron-left icon')
          await page.locator('main button', { hasText: w.home }).last().click()
          await hashIs(/^(#\/?)?$/)
        })

        // ── E-7 · P-5 step 4 ───────────────────────────────────────────────────────────────
        test('P-5 · collection: members are grouped in facet cards with count chips; the page counts them', async () => {
          await SCREENS.collection()
          if (locale === 'en') {
            assert.ok(await page.getByText('2 pages · 1 archived').isVisible())
            assert.ok(await page.getByRole('button', { name: 'Jardin 1 page' }).isVisible())
            assert.ok(await page.getByRole('button', { name: 'Menuiserie 1 page 1 archived' }).isVisible())
          }
          assert.ok(await page.getByRole('button', { name: /^Menuiserie/ }).locator('.adestia-chip').count() >= 1, 'count chips are the shared chip')
        })

        test('P-5 · collection: the ask button (plus icon) sends the agent a request; absent when the collection has no into:', async () => {
          await SCREENS.collection()
          const ask = page.locator('main button:has(use[href$="#adestia-i-plus"])')
          assert.equal(await ask.count(), 1)
          await ask.click()
          await page.locator('.adestia-chat').getByText('projets/membres', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
          const dir = join(instance.pages, 'besoin-coll')
          await mkdir(dir, { recursive: true })
          await writeFile(join(dir, 'INDEX.md'), '---\ntitle: Sans destination\ntype: collection\nof: bidule\n---\n\nPas de into.\n')
          await writeFile(join(dir, 'a.md'), '---\ntitle: Un bidule\ntype: bidule\nstatus: en-cours\n---\n\nx\n')
          await open('/page/besoin-coll/INDEX', 'text=Pas de into.')
          assert.equal(await page.locator('main button:has(use[href$="#adestia-i-plus"])').count(), 0)
        })

        test('P-5 · collection: a facet whose members are all finished shows the shared empty state with a check', async () => {
          const dir = join(instance.pages, 'besoin-fin')
          await mkdir(dir, { recursive: true })
          await writeFile(join(dir, 'INDEX.md'), '---\ntitle: Fin\ntype: collection\nof: tache\ngroupBy: cat\ninto: besoin-fin\n---\n\nPar famille.\n')
          await writeFile(join(dir, 'a.md'), '---\ntitle: Peinture\ntype: tache\ncat: mur\nstatus: clos\n---\n\nx\n')
          await writeFile(join(dir, 'b.md'), '---\ntitle: Toiture\ntype: tache\ncat: toit\nstatus: en-cours\n---\n\nx\n')
          await open('/page/besoin-fin/INDEX', 'text=Par famille.')
          await page.getByRole('button', { name: /^mur/i }).click()
          const empty = page.locator('.adestia-empty')
          await empty.waitFor({ state: 'visible' })
          assert.equal(await empty.locator('use[href$="#adestia-i-check"]').count(), 1)
        })

        // ── E-4 editing · E-5 · E-6 · P-6 ──────────────────────────────────────────────────
        test('P-6 · editor: typing saves by itself after a pause, to the file, and Done returns to reading', async () => {
          const file = join(instance.pages, 'besoin-ed', 'ecrire.md')
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, '---\ntitle: Ecrire\ntype: fiche\n---\n\nLe début.\n')
          await openEditor('/page/besoin-ed/ecrire')
          await page.locator('[contenteditable=true]').first().click()
          await page.keyboard.press('Control+End')
          await page.keyboard.type(' Et la suite écrite.')
          const status = page.locator('.adestia-save').first()
          await status.waitFor({ state: 'visible', timeout: 15_000 })
          await page.waitForFunction(() => /Saved|Enregistr/i.test(document.querySelector('.adestia-save')?.textContent ?? ''), null, { timeout: 15_000 })
          assert.ok(await status.locator('use[href$="#adestia-i-check"]').count() === 1, 'a check beside the status')
          if (locale === 'en') assert.ok((await status.innerText()).startsWith('Saved'))
          await onDisk(file, /Et la suite écrite\./)
          await page.locator('.adestia-editor__save').click()
          await page.locator('article').first().waitFor({ state: 'visible' })
          assert.ok(await page.getByText('Et la suite écrite.').isVisible())
        })

        test('P-6 · editor: when the agent wrote the file meanwhile, a warning says so, the editor keeps the text and nothing more is saved', async () => {
          const file = join(instance.pages, 'besoin-ed', 'conflit.md')
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, '---\ntitle: Conflit\ntype: fiche\n---\n\nTexte de départ.\n')
          await openEditor('/page/besoin-ed/conflit')
          const agentVersion = '---\ntitle: Conflit\ntype: fiche\n---\n\nVersion de l’agent.\n'
          await writeFile(file, agentVersion)
          const later = new Date(Date.now() + 5000); await utimes(file, later, later)
          await page.locator('[contenteditable=true]').first().click()
          await page.keyboard.press('Control+End')
          await page.keyboard.type(' Ma frappe tardive.')
          const warn = page.locator('.adestia-save--warn')
          await warn.waitFor({ state: 'visible', timeout: 20_000 })
          assert.equal(await warn.locator('use[href$="#adestia-i-triangle-alert"]').count(), 1)
          if (locale === 'en') assert.equal((await warn.innerText()).trim(), w.conflict)
          else assert.ok(!/agent changed/i.test(await warn.innerText()), 'French on a French instance')
          assert.ok((await page.locator('[contenteditable=true]').first().innerText()).includes('Ma frappe tardive.'), 'the editor keeps the typed text')
          await settle(4000)
          assert.equal(readFileSync(file, 'utf8'), agentVersion, 'nothing more is saved')
        })

        test('P-6 · editor: the slash menu offers the blocks that have a body, and not app', async () => {
          await SCREENS.slash()
          const menu = (await page.locator('.milkdown-slash-menu').first().innerText()).toLowerCase()
          for (const name of ['callout', 'row', 'gallery', 'content', 'figures', 'list']) assert.ok(menu.includes(name), name)
          assert.ok(/\btable\b/.test(menu), 'table')
          assert.ok(!/\bapp\b/.test(menu), 'app has no body and is not offered')
        })

        test('P-6 · page properties: a popover over the frontmatter; Escape closes it and returns focus to its settings control', async () => {
          await SCREENS.properties()
          const popover = page.locator('.adestia-popover').first()
          assert.equal(await popover.getAttribute('role'), 'dialog')
          assert.equal(await popover.locator('input.adestia-input').first().inputValue(), 'Tous les blocs, éditable')
          await page.keyboard.press('Escape')
          await popover.waitFor({ state: 'detached' })
          assert.ok(await page.locator('.adestia-editor__meta-gear').evaluate((el) => el === document.activeElement), 'focus back on the anchor')
          await page.locator('.adestia-editor__meta-gear').click()
          await popover.waitFor({ state: 'visible' })
          const h1 = await page.locator('h1').first().boundingBox()
          await page.mouse.click(h1.x + 4, h1.y + h1.height / 2)
          await popover.waitFor({ state: 'detached' })
        })

        test('P-6 · page properties: editing the title rewrites the frontmatter and keeps the lines it does not know', async () => {
          const file = join(instance.pages, 'besoin-ed', 'props.md')
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, '---\ntitle: Avant\ntype: projet\nstatus: en cours\ninconnu: gardé tel quel\n---\n\nCorps.\n')
          await openEditor('/page/besoin-ed/props')
          await page.locator('.adestia-editor__meta-gear').click()
          const title = page.locator('.adestia-popover input.adestia-input').first()
          await title.fill('Après le changement')
          await title.blur()
          await page.waitForFunction(() => /Saved|Enregistr/i.test(document.querySelector('.adestia-save')?.textContent ?? ''), null, { timeout: 15_000 })
          await onDisk(file, /title: Après le changement/)
          const disk = readFileSync(file, 'utf8')
          assert.match(disk, /inconnu: gardé tel quel/)
          assert.match(disk, /status: en cours/)
        })

        test('P-6 · block settings: Escape closes the popover and focus returns to the block\'s settings control; the form edits the block', async () => {
          const file = join(instance.pages, 'besoin-ed', 'bloc.md')
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, '---\ntitle: Bloc\ntype: fiche\n---\n\n:::callout{title="Avant"}\nCorps du bloc.\n:::\n')
          await openEditor('/page/besoin-ed/bloc')
          const gear = page.locator('.adestia-edblock__gear').first()
          await gear.click({ force: true })
          const popover = page.locator('.adestia-popover').first()
          await popover.waitFor({ state: 'visible' })
          await page.keyboard.press('Escape')
          await popover.waitFor({ state: 'detached' })
          assert.ok(await gear.evaluate((el) => el === document.activeElement), 'focus back on the gear')
          await gear.click({ force: true })
          await page.locator('.adestia-popover input.adestia-input').first().fill('Après')
          await page.waitForFunction(() => /Saved|Enregistr/i.test(document.querySelector('.adestia-save')?.textContent ?? ''), null, { timeout: 15_000 })
          await onDisk(file, /:::callout\{[^}]*title="?Après"?/)
        })

        test('P-6 · E-5 and E-6 on a 360 px phone stay inside the viewport with 8 px margins', async () => {
          const phone = await browser.newPage({ viewport: { width: 360, height: 740 }, locale })
          try {
            await phone.goto('about:blank'); await phone.goto(`${instance.url}/#/page/editeur/blocs`)
            await phone.locator('article').waitFor({ state: 'visible', timeout: 20_000 })
            await phone.waitForTimeout(1500)
            await phone.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
            await phone.locator('[contenteditable=true]').first().waitFor({ state: 'visible' })
            await phone.waitForTimeout(800)
            for (const open of [() => phone.locator('.adestia-editor__meta-gear').click(), () => phone.locator('.adestia-edblock__gear').first().click({ force: true })]) {
              await open()
              const pop = phone.locator('.adestia-popover').first()
              await pop.waitFor({ state: 'visible' })
              const box = await pop.boundingBox()
              assert.ok(box.x >= 7.5 && box.x + box.width <= 360 - 7.5, `horizontal margins: ${JSON.stringify(box)}`)
              assert.ok(box.y >= 7.5 && box.y + box.height <= 740 - 7.5, `vertical margins: ${JSON.stringify(box)}`)
              await phone.screenshot({ path: join(shots, `${skin}-${locale}-phone-popover.png`) }).catch(() => {})
              await phone.keyboard.press('Escape')
              await pop.waitFor({ state: 'detached' })
            }
          } finally { await phone.close() }
        })

        // ── the phone's canvas header ─────────────────────────────────────────────────────
        test('P-4 · on a phone the canvas header returns to the conversation', async () => {
          const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, locale })
          try {
            await phone.goto('about:blank'); await phone.goto(`${instance.url}/#/section/voyages`)
            await phone.locator('h1').waitFor({ state: 'visible', timeout: 20_000 })
            const header = phone.locator('.adestia-canvas__header')
            const back = header.getByRole('button').first()
            const label = (await back.innerText()).trim()
            if (locale === 'en') assert.equal(label, 'Chat')
            assert.ok(!label.includes('‹'), 'no glyph')
            assert.ok(await back.locator('use[href$="#adestia-i-chevron-left"]').count() >= 1, 'chevron-left')
            await back.click()
            await phone.waitForFunction(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'chat')
          } finally { await phone.close() }
        })
        test('P-4 · on a desk the canvas header has no Chat return', async () => {
          await open('/section/voyages', 'h1')
          assert.equal(await page.locator('.adestia-canvas__header').getByRole('button', { name: 'Chat', exact: true }).isVisible().catch(() => false), false)
        })
      }
    })
  }
}

// ── E-2 with nothing in the instance ────────────────────────────────────────────────────────
for (const locale of LOCALES) {
  describe(`empty instance, ${locale}`, () => {
    let instance; let browser; let page
    before(async () => { instance = await startInstance('empty', 'alfred', locale); browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale }) })
    after(async () => { await browser?.close(); await instance?.stop() })
    test('Q-23 · home: nothing held, loading has ended: the Settings tile and the shared empty state with a folder-open icon show', async () => {
      await page.goto(`${instance.url}/#/`)
      await page.locator('main h1').waitFor({ state: 'visible', timeout: 20_000 })
      await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
      assert.equal(await page.locator('.adestia-empty use[href$="#adestia-i-folder-open"]').count(), 1)
      assert.ok(await page.locator('.adestia-tile', { hasText: locale === 'en' ? 'Settings' : 'Réglages' }).first().isVisible())
      assert.equal(await page.getByRole('status').filter({ hasText: locale === 'en' ? 'Loading…' : 'Chargement…' }).count(), 0)
      const found = leaks(await words(page, 'main'), locale)
      assert.deepEqual(found, [])
    })
  })
}

// ── B-9 · the shell's back above a plugin ──────────────────────────────────────────────────
for (const locale of LOCALES) {
  describe(`shell back above a plugin, ${locale}`, () => {
    let instance; let browser; let page
    before(async () => { instance = await startInstance('plugins', 'alfred', locale); browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale }) })
    after(async () => { await browser?.close(); await instance?.stop() })
    const home = locale === 'en' ? 'Home' : 'Accueil'
    test('B-9 · the back above a plugin says Home with a chevron, and goes to the landing canvas', async () => {
      await page.goto(`${instance.url}/#/todo`)
      await page.locator('.todo-task__title').first().waitFor({ state: 'visible', timeout: 20_000 })
      const back = page.locator('.adestia-switch').first()
      assert.equal((await back.innerText()).trim(), home)
      assert.ok(!(await back.innerText()).includes('‹'), 'no ‹ character')
      assert.equal(await back.locator('use[href$="#adestia-i-chevron-left"]').count(), 1)
      await back.click()
      await page.waitForFunction(() => /^(#\/?)?$/.test(location.hash), null, { timeout: 20_000 })
      await page.locator('main h1').waitFor({ state: 'visible' })
    })
    test('B-9 · opening a task keeps the shell back (Home) beside the plugin\'s own back, which names where it leads', async () => {
      await page.goto(`${instance.url}/#/todo`)
      await page.locator('.todo-task__title').first().click()
      await page.locator('.todo-back').waitFor({ state: 'visible' })
      assert.equal((await page.locator('.adestia-switch').first().innerText()).trim(), home)
      assert.equal((await page.locator('.todo-back').innerText()).trim(), 'Todo')
    })
  })
}

// ── Critère de sortie · the code (R-11, R-12) ──────────────────────────────────────────────
describe('code criteria of the pages tranche', () => {
  const web = join(root, 'packages/web/src')
  const styles = join(web, 'app/styles')
  const read = (file) => readFileSync(join(web, file), 'utf8')
  const sheets = ['reader.css', 'editor.css', 'home.css', 'mobile.css', 'missing-page.css']
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

  /** colour literals that are not the fallback of a var() */
  function colourLiterals(css) {
    const hits = []
    stripComments(css).split('\n').forEach((line, i) => {
      // drop every var(--x, fallback) so only literals outside a fallback remain
      let rest = line
      let prev
      do { prev = rest; rest = rest.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '') } while (rest !== prev)
      if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/.test(rest)) hits.push(`${i + 1}: ${line.trim()}`)
    })
    return hits
  }
  const declarations = (css, property) => stripComments(css).split('\n').flatMap((line, i) => {
    const m = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;}]*)`).exec(line)
    return m ? [{ n: i + 1, value: m[1].trim(), line: line.trim() }] : []
  })

  for (const sheet of sheets) {
    test(`${sheet}: no colour outside a var() fallback`, () => { assert.deepEqual(colourLiterals(readFileSync(join(styles, sheet), 'utf8')), []) })
    test(`${sheet}: no literal font size`, () => {
      const bad = declarations(readFileSync(join(styles, sheet), 'utf8'), 'font-size').filter((d) => /\d(?:\.\d+)?(px|rem|em|pt)\b/.test(d.value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ''))).map((d) => d.line)
      assert.deepEqual(bad, [])
    })
    test(`${sheet}: no literal radius`, () => {
      const bad = declarations(readFileSync(join(styles, sheet), 'utf8'), 'border(?:-[a-z]+)*-radius').filter((d) => !/^(var\(|inherit|initial|unset|0\b)/.test(d.value)).map((d) => d.line)
      assert.deepEqual(bad, [])
    })
    test(`${sheet}: no outline: none without a replacement ring in the same rule`, () => {
      const css = stripComments(readFileSync(join(styles, sheet), 'utf8'))
      const bad = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /outline\s*:\s*(none|0)\b/.test(body) && !/box-shadow\s*:|outline\s*:\s*[^;]*(solid|dashed|auto)/.test(body)).map(([, sel]) => sel.trim())
      assert.deepEqual(bad, [])
    })
  }

  test('prettify and folderOf are defined once in packages/web/src', () => {
    const files = walk(web).filter((f) => /\.tsx?$/.test(f))
    for (const name of ['prettify', 'folderOf']) {
      const defs = files.flatMap((f) => (readFileSync(f, 'utf8').match(new RegExp(`(?:function\\s+${name}\\b|(?:const|let)\\s+${name}\\s*=)`, 'g')) ?? []).map(() => f))
      assert.equal(defs.length, 1, `${name} is defined in ${defs.join(', ')}`)
    }
  })

  test('no fetchImpl( call in the pages files outside the shared request helper', () => {
    const named = ['app/Home.tsx', 'app/Section.tsx', 'app/Collection.tsx', 'app/MissingPage.tsx', 'app/App.tsx', 'app/usePage.ts', 'app/live.ts', 'plugins/PageEditor.tsx']
    const files = [...named.map((f) => join(web, f)), ...walk(join(web, 'editor')).filter((f) => /\.tsx?$/.test(f))]
    const hits = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (/\bfetchImpl\s*\(/.test(line) ? [`${f.slice(web.length + 1)}:${i + 1}`] : [])))
    assert.deepEqual(hits, [])
  })

  test('Reader.tsx, Editor.tsx, App.tsx and Home.tsx hold no function longer than 250 lines', async () => {
    const ts = (await import(pathToUrlTs())).default
    const long = []
    for (const file of ['editor/Reader.tsx', 'editor/Editor.tsx', 'app/App.tsx', 'app/Home.tsx']) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node) => {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
          const start = source.getLineAndCharacterOfPosition(node.getStart()).line
          const end = source.getLineAndCharacterOfPosition(node.getEnd()).line
          if (end - start + 1 > 250) long.push(`${file}:${start + 1} (${end - start + 1} lines)`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    assert.deepEqual(long, [])
  })
})

function pathToUrlTs() { return 'file://' + join(root, 'node_modules/typescript/lib/typescript.js') }
