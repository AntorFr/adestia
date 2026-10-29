/**
 * The shell tranche of adestia-correctifs, read from the need (B-13, B-15, B-16; P-1, P-7 to P-9, P-11;
 * E-9, E-10, E-12, E-14, E-19, E-20) and driven through a browser against a launched instance
 * (fake engine). Expected values are written by hand from docs/parcours.md and docs/ecrans.md.
 *
 *   npm run build && node --test bench/tests/shell-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment. Pictures land in `bench/shots-besoin/` (ignored).
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin', 'shell')

const { chromium } = loadPlaywright()

function startInstance({ seed, skin, locale }) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-shell-'))
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
          stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })),
        })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

const SIZES = { desk: { width: 1440, height: 900 }, phone: { width: 360, height: 740 } }

/** Opens `route` at the given size and theme, with the canvas in front (a phone shows one screen at a time). */
async function visit(browser, instance, locale, route, { size = 'desk', theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: SIZES[size], locale, colorScheme: theme, hasTouch: size === 'phone' })
  await context.addInitScript((value) => { try { localStorage.setItem('adestia.theme', value) } catch { /* storage refused */ } }, theme)
  const page = await context.newPage()
  await page.goto(`${instance.url}/#${route}`)
  await page.locator('.adestia-shell').waitFor({ state: 'visible', timeout: 20_000 })
  if (size === 'phone' && (await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
    await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
    await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
  }
  // the phone slides the canvas in: measure once it has stopped moving
  await page.evaluate(() => new Promise((done) => {
    let last = -1
    let still = 0
    const tick = () => {
      const left = document.querySelector('.adestia-canvas')?.getBoundingClientRect().left ?? 0
      still = left === last ? still + 1 : 0
      last = left
      if (still >= 8) done(undefined)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  return { page, context }
}

async function shot(page, name) {
  await mkdir(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

/** every .css file under the shell's sources and skins */
async function cssFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') out.push(...(await cssFiles(path))) } else if (entry.name.endsWith('.css')) out.push(path)
  }
  return out
}

test('B-13 · the style sources define .adestia-icon--spin once at top level and @keyframes adestia-icon-spin once', async () => {
  // Panne : le bloc dédoublé revient (le build le fond en une règle : seule la source le voit).
  let rules = 0
  let frames = 0
  for (const file of [...(await cssFiles(join(root, 'packages/web/src'))), ...(await cssFiles(join(root, 'skins')))]) {
    const text = await readFile(file, 'utf8')
    rules += (text.match(/^\.adestia-icon--spin\s*\{/gm) ?? []).length
    frames += (text.match(/@keyframes\s+adestia-icon-spin\b/g) ?? []).length
  }
  assert.equal(rules, 1)
  assert.equal(frames, 1)
})

const SKINS = ['alfred', 'dobby', 'nestor', 'skippy']

for (const locale of ['en', 'fr']) {
  const fr = locale === 'fr'
  let browser
  before(async () => { browser ??= await chromium.launch() })
  after(async () => { await browser?.close(); browser = undefined })

  // ---------------------------------------------------------------- base seed, Nestor
  describe(`shell on the base instance under Nestor, ${locale}`, () => {
    let instance
    before(async () => { browser ??= await chromium.launch(); instance = await startInstance({ seed: 'base', skin: 'nestor', locale }) })
    after(async () => { await instance?.stop() })

    for (const size of ['desk', 'phone']) {
      test(`P-1 · B-16 · Nestor's invitation to the agent has an SVG arrow and no ↑ character, ${size}`, async () => {
        // Panne : l'invitation redevient un glyphe de police « ↑ ».
        const { page, context } = await visit(browser, instance, locale, '/', { size })
        try {
          const invite = page.getByRole('button', { name: fr ? /Confier quelque chose à Nestor/ : /Nestor/ }).filter({ has: page.locator('i') })
          await invite.first().waitFor({ state: 'visible', timeout: 15_000 })
          const found = await invite.first().evaluate((button) => {
            const disc = button.querySelector('i')
            const svg = disc?.querySelector('svg')
            const d = disc?.getBoundingClientRect()
            const s = svg?.getBoundingClientRect()
            return {
              svg: Boolean(svg),
              hasArrowChar: (button.textContent ?? '').includes('↑'),
              inside: Boolean(d && s && s.width > 0 && s.left >= d.left - 0.5 && s.right <= d.right + 0.5 && s.top >= d.top - 0.5 && s.bottom <= d.bottom + 0.5),
              bodyHasArrow: document.body.innerText.includes('↑'),
            }
          })
          await shot(page, `nestor-arrow-${locale}-${size}`)
          assert.equal(found.svg, true, 'the arrow is an <svg> in the disc')
          assert.equal(found.hasArrowChar, false, 'the invitation holds no ↑ character')
          assert.equal(found.inside, true, 'the arrow sits inside its disc')
          assert.equal(found.bodyHasArrow, false, 'no ↑ character is visible anywhere on the screen')
        } finally { await context.close() }
      })
    }

    test('E-9 · E-10 · the MCP tile says the same count in its subtitle and its chip, and E-10 lists as many servers', async () => {
      // Panne : le chip compte une route, le sous-titre l'autre (7 listés par E-10, 6 rapportés par la santé).
      const { page, context } = await visit(browser, instance, locale, '/settings')
      try {
        const tile = page.getByRole('button', { name: fr ? /Serveurs MCP/ : /MCP servers/ })
        await tile.waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForFunction(() => /\d/.test(document.querySelector('.adestia-tile .adestia-chip')?.textContent ?? ''), null, { timeout: 15_000 })
        const subtitle = (await tile.locator('.adestia-tile__subtitle').innerText()).trim()
        const chip = (await tile.locator('.adestia-chip').innerText()).trim()
        await shot(page, `mcp-tile-${locale}-desk`)
        assert.equal(chip, fr ? '7 serveurs' : '7 servers')
        assert.equal(subtitle, fr ? '7 serveurs — 2 à regarder' : '7 servers — 2 need attention')
        await tile.click()
        await page.getByRole('heading', { name: fr ? 'Serveurs MCP' : 'MCP servers' }).waitFor({ state: 'visible', timeout: 15_000 })
        await page.getByText(fr ? 'Ajouter un serveur' : 'Add a server').waitFor({ state: 'visible' })
        const add = fr ? 'Ajouter un serveur' : 'Add a server'
        const cards = await page.locator('.adestia-shell').evaluate((shell, addLabel) => [...shell.querySelectorAll('.adestia-tile')].filter((t) => !(t.textContent ?? '').includes(addLabel)).length, add)
        assert.equal(cards, 7, 'E-10 lists seven servers (six in the instance configuration or UI store, "fichiers" twice by name)')
      } finally { await context.close() }
    })

    test('E-19 · B-16 · a manifest refusal without a code is headed in the user language, its field lines are kept', async () => {
      // Panne : « Invalid plugin manifest » ressort en anglais sous fr (ou la ligne `champ : message` est perdue).
      const { page, context } = await visit(browser, instance, locale, '/')
      try {
        const band = page.getByText(/bench-invalid/).first()
        await band.waitFor({ state: 'visible', timeout: 15_000 })
        const text = await page.locator('.adestia-shell').innerText()
        await shot(page, `problems-${locale}-desk`)
        const heading = fr ? 'Manifeste de plugin invalide pour "bench-invalid"' : 'Invalid plugin manifest for "bench-invalid"'
        assert.ok(text.includes(heading), `heading « ${heading} » in:\n${text}`)
        assert.ok(text.includes('description: must be a non-empty string'), 'the validator line is kept as the server wrote it')
        assert.ok(text.includes('id: is "autre-nom" but the folder is "bench-refused"'), 'the second refusal keeps its line too')
        if (fr) assert.equal(text.includes('Invalid plugin manifest'), false, 'no English heading left under fr')
      } finally { await context.close() }
    })

    test('E-19 · bord · the refusal band reads on a phone and shows both refused folders', async () => {
      const { page, context } = await visit(browser, instance, locale, '/', { size: 'phone' })
      try {
        await page.getByText(/bench-refused/).first().waitFor({ state: 'visible', timeout: 15_000 })
        await shot(page, `problems-${locale}-phone`)
        const text = await page.locator('.adestia-shell').innerText()
        assert.ok(text.includes('bench-invalid') && text.includes('bench-refused'))
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert.ok(overflow <= 0, `no horizontal scroll at 360 px (${overflow})`)
      } finally { await context.close() }
    })

    test('B-13 · the stylesheets hold one .adestia-icon--spin rule and one adestia-icon-spin @keyframes', async () => {
      // Panne : le bloc dédoublé revient dans une feuille.
      const { page, context } = await visit(browser, instance, locale, '/')
      try {
        const counts = await page.evaluate(() => {
          let rules = 0
          let frames = 0
          const walk = (list) => {
            for (const rule of list) {
              if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === 'adestia-icon-spin') frames++
              if (rule.selectorText && rule.selectorText.split(',').some((s) => s.trim() === '.adestia-icon--spin')) rules++
              // a prefers-reduced-motion override is another rule, not a second definition of the spin
              if (rule.cssRules && !(rule.conditionText ?? '').includes('prefers-reduced-motion')) walk(rule.cssRules)
            }
          }
          for (const sheet of document.styleSheets) { try { walk(sheet.cssRules) } catch { /* cross-origin sheet */ } }
          return { rules, frames, sheets: document.styleSheets.length }
        })
        assert.ok(counts.sheets > 0, 'the page has stylesheets')
        assert.equal(counts.rules, 1)
        assert.equal(counts.frames, 1)
      } finally { await context.close() }
    })

    describe('E-12 catalogue pop-in', () => {
      const open = async () => {
        const handle = await visit(browser, instance, locale, '/settings/instructions')
        await handle.page.getByRole('button', { name: 'Catalogues' }).click()
        await handle.page.getByRole('button', { name: /^outils/ }).click()
        await handle.page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).waitFor({ state: 'visible', timeout: 15_000 })
        return handle
      }

      test('the token field is a password field that asks the browser not to fill it in', async () => {
        // Panne : le champ perd son autoComplete (défaut « not reproduced » : déjà off).
        const { page, context } = await visit(browser, instance, locale, '/settings/instructions')
        try {
          await page.getByRole('button', { name: 'Catalogues' }).click()
          const field = page.getByPlaceholder(fr ? 'Jeton (facultatif)' : /^Token/)
          await field.waitFor({ state: 'visible', timeout: 15_000 })
          assert.equal(await field.getAttribute('type'), 'password')
          assert.equal(await field.getAttribute('autocomplete'), 'off')
        } finally { await context.close() }
      })

      test('a refresh that works shows no error', async () => {
        const { page, context } = await open()
        try {
          const done = page.waitForResponse((r) => r.url().endsWith('/refresh') && r.request().method() === 'POST')
          await page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).click()
          assert.equal((await done).status(), 200)
          await page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).waitFor({ state: 'visible' })
          const text = await page.locator('.adestia-sheet').innerText()
          assert.equal(/Failed to fetch|erreur|error/i.test(text), false, text)
        } finally { await context.close() }
      })

      test('a refresh that throws shows the error in the pop-in and gives the button back', async () => {
        // Panne : l'erreur levée par refresh() est avalée, la popin reste muette.
        const { page, context } = await open()
        try {
          await page.route('**/refresh', (route) => route.abort('failed'))
          const failed = new Promise((resolveFail) => page.once('requestfailed', resolveFail))
          await page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).click()
          await failed
          await page.locator('.adestia-sheet').getByText('Failed to fetch').waitFor({ state: 'visible', timeout: 10_000 })
          await shot(page, `catalogue-refresh-error-${locale}`)
          assert.equal(await page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).isEnabled(), true, 'the button is usable again')
        } finally { await context.close() }
      })

      test('a refused refresh (server error) shows its message too', async () => {
        const { page, context } = await open()
        try {
          await page.route('**/refresh', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'upstream exploded' }) }))
          const answered = page.waitForResponse((r) => r.url().endsWith('/refresh'))
          await page.getByRole('button', { name: fr ? 'Rafraîchir' : 'Refresh' }).click()
          await answered
          await page.locator('.adestia-sheet').getByText(/upstream exploded|500/).first().waitFor({ state: 'visible', timeout: 10_000 })
        } finally { await context.close() }
      })
    })
  })

  // ---------------------------------------------------------------- per skin
  for (const skin of SKINS) {
    describe(`E-14 configuration under ${skin}, ${locale}`, () => {
      let instance
      before(async () => { browser ??= await chromium.launch(); instance = await startInstance({ seed: 'config-writable', skin, locale }) })
      after(async () => { await instance?.stop() })

      for (const theme of ['light', 'dark']) {
        test(`B-16 · on a 360 px phone each switch sits on the row of its title, ${theme}`, async () => {
          // Panne : l'interrupteur retombe sous le titre sur le téléphone.
          const { page, context } = await visit(browser, instance, locale, '/settings/config', { size: 'phone', theme })
          try {
            await page.locator('input[role="switch"]').first().waitFor({ state: 'visible', timeout: 15_000 })
            await shot(page, `config-${skin}-${locale}-${theme}-phone`)
            const rows = await page.evaluate(() => [...document.querySelectorAll('input[role="switch"]')].map((sw) => {
              const label = document.querySelector(`label[for="${sw.id}"]`)
              const s = sw.getBoundingClientRect()
              const l = label.getBoundingClientRect()
              return { title: label.textContent, switchTop: s.top, switchBottom: s.bottom, labelTop: l.top, labelBottom: l.bottom, switchRight: s.right }
            }))
            assert.equal(rows.length, 2, 'two switches on the writable configuration')
            for (const r of rows) {
              assert.ok(r.switchTop < r.labelBottom && r.switchBottom > r.labelTop, `« ${r.title} »: switch ${r.switchTop}-${r.switchBottom} vs title ${r.labelTop}-${r.labelBottom}`)
              assert.ok(r.switchRight <= 360, `the switch stays inside the 360 px screen (right edge ${r.switchRight})`)
            }
          } finally { await context.close() }
        })
      }

      test('B-16 · on the desk the switch also sits on the row of its title', async () => {
        const { page, context } = await visit(browser, instance, locale, '/settings/config', { size: 'desk' })
        try {
          await page.locator('input[role="switch"]').first().waitFor({ state: 'visible', timeout: 15_000 })
          const rows = await page.evaluate(() => [...document.querySelectorAll('input[role="switch"]')].map((sw) => {
            const l = document.querySelector(`label[for="${sw.id}"]`).getBoundingClientRect()
            const s = sw.getBoundingClientRect()
            return s.top < l.bottom && s.bottom > l.top
          }))
          assert.deepEqual(rows, [true, true])
        } finally { await context.close() }
      })

      if (skin === 'skippy') {
        for (const theme of ['light', 'dark']) {
          test(`P-9 · Skippy's console band stays on one line at 360 px, ${theme}`, async () => {
            // Panne : le bandeau passe sur deux lignes (≈ 50 px) sur un téléphone.
            const { page, context } = await visit(browser, instance, locale, '/', { size: 'phone', theme })
            try {
              await page.locator('.console').waitFor({ state: 'visible', timeout: 20_000 })
              await shot(page, `skippy-band-${locale}-${theme}-360`)
              const m = await page.locator('.console').evaluate((band) => {
                const box = band.getBoundingClientRect()
                const middle = box.top + box.height / 2
                let off = 0
                for (const child of band.querySelectorAll('*')) {
                  const r = child.getBoundingClientRect()
                  if (r.width > 0 && r.height > 0 && child.children.length === 0 && Math.abs(r.top + r.height / 2 - middle) > 8) off++
                }
                return { height: box.height, off, overflow: band.scrollWidth - band.clientWidth }
              })
              assert.ok(m.height > 0 && m.height < 40, `band is ${m.height}px tall (one line is about 29)`)
              assert.ok(m.overflow <= 1, `the band does not overflow sideways (${m.overflow})`)
              assert.equal(m.off, 0, 'every piece of the band shares the one row')
            } finally { await context.close() }
          })
        }
      }
    })

    describe(`E-20 inactive app under ${skin}, ${locale}`, () => {
      let instance
      before(async () => { browser ??= await chromium.launch(); instance = await startInstance({ seed: 'plugins', skin, locale }) })
      after(async () => { await instance?.stop() })

      for (const size of ['desk', 'phone']) {
        for (const theme of ['light', 'dark']) {
          test(`P-11 · an app with no view shows the shared empty state with a translated Home action, ${size} ${theme}`, async () => {
            const { page, context } = await visit(browser, instance, locale, '/bench-noview', { size, theme })
            try {
              const message = fr ? 'Cette app n’est pas activée sur cette instance.' : 'That app is not active on this instance.'
              await page.getByText(message).waitFor({ state: 'visible', timeout: 15_000 })
              await shot(page, `e20-${skin}-${locale}-${theme}-${size}`)
              // the action sits in the empty state itself, not in the shell's own Home switch
              const home = page.getByText(message).locator('xpath=..').getByRole('button', { name: fr ? 'Accueil' : 'Home' })
              assert.equal(await home.count(), 1, 'a Home action is offered in the empty state')
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
              assert.ok(overflow <= 0, `no horizontal scroll (${overflow})`)
              await home.click()
              await page.getByText(message).waitFor({ state: 'detached', timeout: 10_000 })
            } finally { await context.close() }
          })
        }
      }
    })
  }
}
