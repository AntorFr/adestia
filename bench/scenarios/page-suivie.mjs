/**
 * The open page follows what the agent writes — E-4, on each skin × language ×
 * theme × desk/phone (4 × 2 × 2 × 2 variants), and E-8 when the agent deletes it.
 *
 *   npm run build && node bench/scenarios/page-suivie.mjs
 *
 * Starts its own instance per skin × language
 * (`node bench/launch.mjs --engine fake --seed page-suivie --data <dir> …`).
 * The engine is the fake one, so the scenario is the agent: it writes and
 * deletes the files on the instance's disk, as a real turn would. Per variant:
 *
 *  - READING: the agent rewrites the open page → the new text shows with no
 *    action; the agent deletes it → E-8.
 *  - A page of the SECOND store (`?store=famille`) is refreshed the same way.
 *  - EDITING: the agent rewrites the page → the banner rises, the typed text
 *    stays; Reload puts the agent's version in the editor and drops the banner;
 *    the user's own save leaves no banner; the agent deletes the page → the
 *    banner, then E-8 at Reload.
 *  - WATCH OFF (one instance, desk/light, per locale): nothing moves, in
 *    reading or in editing.
 *
 * Pictures: `BENCH_OUT` (default `bench/shots-page-suivie`, ignored by git):
 *
 *   <skin>/<locale>/<theme>-<viewport>/E-4-<state>.png
 *
 * `BENCH_SKINS=alfred,dobby`, `BENCH_LOCALES=fr` and `BENCH_SIZES=desk` narrow
 * the run; `BENCH_URL` is not offered, since the scenario writes to the disk of
 * the instance it starts. Exit 1 names each failed expectation. The pictures
 * are for LOOKING at.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile, unlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-page-suivie'))

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

const SKINS = (process.env.BENCH_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BENCH_LOCALES ?? 'en,fr').split(',')
const THEMES = ['light', 'dark']
const ALL_SIZES = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}
const SIZES = (process.env.BENCH_SIZES ?? 'desk,phone').split(',')
const WORDS = {
  en: { edit: 'Edit', banner: 'The page changed.', reload: 'Reload', missing: 'There is no page at this address.' },
  fr: { edit: 'Modifier', banner: 'La page a changé.', reload: 'Recharger', missing: 'Il n’y a aucune page à cette adresse.' },
}
const ORIGINAL = 'Version d’origine de la page.'
const AGENT = 'Version réécrite par l’agent.'
const TYPED = 'texte tapé par la personne'

function launch(skin, locale, base, env = {}) {
  const child = spawn(process.execPath, [join(root, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'page-suivie', '--skin', skin, '--locale', locale, '--data', base], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const url = new Promise((resolveUrl, reject) => {
    let seen = ''
    child.stdout.on('data', (chunk) => {
      seen += chunk
      const found = /listening on (\S+)/.exec(seen)
      if (found) resolveUrl(found[1])
    })
    child.once('exit', (code) => reject(new Error(`the launcher exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
  })
  const stop = () => new Promise((done) => {
    if (child.exitCode !== null) return done()
    child.once('exit', done)
    child.kill('SIGTERM')
  })
  return { url, stop }
}

const failures = []
const fail = (where, why) => {
  console.error(`FAIL ${where}: ${why}`)
  failures.push(`${where}: ${why}`)
}

/** What the agent does to a page: write it, or delete it. */
const agent = (base) => ({
  async write(store, name, text) {
    const dir = store === 'famille' ? join(base, 'famille', 'suivi') : join(base, 'workspace', 'pages', 'suivi')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${name}.md`), `---\ntitle: Suivi ${name}\n---\n\n${text}\n`)
  },
  async remove(store, name) {
    const dir = store === 'famille' ? join(base, 'famille', 'suivi') : join(base, 'workspace', 'pages', 'suivi')
    await unlink(join(dir, `${name}.md`))
  },
})

async function toPage(page, size, url, name, store) {
  const query = store ? `?store=${store}` : ''
  await page.goto(`${url}/#/page/suivi/${name}.md${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  if (size === 'phone') {
    if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
      await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
    }
    await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
  }
}

const canvas = (page) => page.locator('.adestia-shell')
const shows = (page, text, timeout = 15_000) => canvas(page).getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
const textStays = async (page, text, ms = 4_000) => {
  await page.waitForTimeout(ms)
  return (await canvas(page).getByText(text, { exact: false }).count()) > 0
}

async function startEditing(page, w) {
  await page.getByRole('button', { name: w.edit, exact: true }).click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 20_000 })
  await page.waitForTimeout(500)
}

async function variant({ skin, locale, theme, size, url, base, dir }) {
  const w = WORDS[locale]
  const where = `${skin}/${locale}/${theme}-${size}`
  const disk = agent(base)
  const shot = (page, name) => page.screenshot({ path: join(dir, `E-4-${name}.png`) })
  const context = await browserOf.newContext({ ...ALL_SIZES[size], colorScheme: theme, locale })
  const page = await context.newPage()
  page.on('pageerror', (error) => fail(where, `page error: ${error.message}`))
  try {
    await context.addInitScript((t) => { try { localStorage.setItem('adestia.theme', t) } catch { /* private mode */ } }, theme)

    // Reading: the rewrite shows with no action.
    await disk.write('perso', 'lecture', ORIGINAL)
    await toPage(page, size, url, 'lecture')
    await shows(page, ORIGINAL)
    await disk.write('perso', 'lecture', AGENT)
    await shows(page, AGENT).catch(() => fail(where, 'reading: the agent’s text did not appear by itself'))
    if ((await canvas(page).getByText(ORIGINAL, { exact: false }).count()) > 0) fail(where, 'reading: the old text is still shown')
    if ((await page.locator('.adestia-editor__changed').count()) > 0) fail(where, 'reading: a banner is up')
    await shot(page, 'lecture-rafraichie')

    // Reading: the agent deletes the page → E-8.
    await disk.remove('perso', 'lecture')
    await shows(page, w.missing).catch(() => fail(where, 'reading: E-8 did not show after the agent deleted the page'))
    await shot(page, 'E-8-supprimee')

    // The second store.
    await disk.write('famille', 'partage', ORIGINAL)
    await toPage(page, size, url, 'partage', 'famille')
    await shows(page, ORIGINAL)
    await disk.write('famille', 'partage', AGENT)
    await shows(page, AGENT).catch(() => fail(where, 'second store: the agent’s text did not appear by itself'))

    // Editing: the banner, the typed text, Reload.
    await disk.write('perso', 'edition', ORIGINAL)
    await toPage(page, size, url, 'edition')
    await shows(page, ORIGINAL)
    await startEditing(page, w)
    const surface = page.locator('.adestia-editor__surface .ProseMirror')
    await surface.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(` ${TYPED}`)
    await disk.write('perso', 'edition', AGENT)
    const banner = page.locator('.adestia-editor__changed')
    await banner.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(where, 'editing: no banner after the agent’s write'))
    if (!(await banner.innerText().catch(() => '')).includes(w.banner)) fail(where, `editing: the banner does not say « ${w.banner} »`)
    if (!(await surface.innerText()).includes(TYPED)) fail(where, 'editing: the typed text was replaced')
    await shot(page, 'bandeau')

    // The user's own save does not lift the banner.
    await page.keyboard.type(' encore')
    await page.locator('.adestia-save--ok, .adestia-save--warn:not(.adestia-editor__changed)').first().waitFor({ timeout: 10_000 }).catch(() => fail(where, 'editing: the user’s save gave no answer'))
    // A 409 line may replace "Saved": the banner is the point either way.
    if ((await banner.count()) === 0) fail(where, 'editing: the user’s save lifted the banner')

    await banner.getByRole('button', { name: w.reload, exact: true }).click()
    await banner.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => fail(where, 'editing: the banner is still up after Reload'))
    const reloaded = await surface.innerText()
    if (!reloaded.includes(AGENT) || reloaded.includes(TYPED)) fail(where, `editing: Reload did not load the agent’s version (« ${reloaded.trim()} »)`)
    await shot(page, 'bandeau-leve')

    // After Reload the user’s own save raises nothing.
    await surface.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' ajout')
    await page.locator('.adestia-save--ok').waitFor({ timeout: 10_000 }).catch(() => fail(where, 'editing: the save after Reload did not complete'))
    await page.waitForTimeout(3_000)
    if ((await banner.count()) > 0) fail(where, 'editing: the user’s own save raised the banner')

    // Editing: the agent deletes the page → the banner, then E-8 at Reload.
    await disk.write('perso', 'disparue-edition', ORIGINAL)
    await toPage(page, size, url, 'disparue-edition')
    await shows(page, ORIGINAL)
    await startEditing(page, w)
    await disk.remove('perso', 'disparue-edition')
    await banner.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => fail(where, 'editing: no banner after the agent deleted the page'))
    await banner.getByRole('button', { name: w.reload, exact: true }).click()
    await shows(page, w.missing).catch(() => fail(where, 'editing: Reload did not lead to E-8'))
    await shot(page, 'E-8-au-rechargement')
  } catch (error) {
    fail(where, error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

/** Watch off: neither mode moves. */
async function watchOff({ skin, locale, url, base }) {
  const w = WORDS[locale]
  const where = `${skin}/${locale}/watch-off`
  const disk = agent(base)
  const context = await browserOf.newContext({ ...ALL_SIZES.desk, locale })
  const page = await context.newPage()
  try {
    await toPage(page, 'desk', url, 'lecture')
    await shows(page, ORIGINAL)
    await disk.write('perso', 'lecture', AGENT)
    if (!(await textStays(page, ORIGINAL))) fail(where, 'reading: the page moved with the watch off')
    await toPage(page, 'desk', url, 'edition')
    await shows(page, ORIGINAL)
    await startEditing(page, w)
    await disk.write('perso', 'edition', AGENT)
    await page.waitForTimeout(4_000)
    if ((await page.locator('.adestia-editor__changed').count()) > 0) fail(where, 'editing: a banner rose with the watch off')
  } catch (error) {
    fail(where, error instanceof Error ? error.message : String(error))
  } finally {
    await context.close()
  }
}

const browserOf = await chromium.launch({ args: ['--no-sandbox'] })
try {
  for (const locale of LOCALES) {
    for (const skin of SKINS) {
      const base = await mkdtemp(join(tmpdir(), 'adestia-page-suivie-'))
      const instance = launch(skin, locale, base)
      try {
        const url = await instance.url
        for (const theme of THEMES) {
          for (const size of SIZES) {
            const dir = join(out, skin, locale, `${theme}-${size}`)
            await mkdir(dir, { recursive: true })
            console.log(`— ${skin} ${locale} ${theme} ${size}`)
            await variant({ skin, locale, theme, size, url, base, dir })
          }
        }
      } finally {
        await instance.stop()
        await rm(base, { recursive: true, force: true })
      }
    }
    // The veille off: once per locale, on the first skin.
    const base = await mkdtemp(join(tmpdir(), 'adestia-page-suivie-'))
    const instance = launch(SKINS[0], locale, base, { BENCH_WATCH: 'off' })
    try {
      console.log(`— watch off ${locale}`)
      await watchOff({ skin: SKINS[0], locale, url: await instance.url, base })
    } finally {
      await instance.stop()
      await rm(base, { recursive: true, force: true })
    }
  }
} finally {
  await browserOf.close()
}

if (failures.length > 0) {
  console.error(`\n${failures.length} expectation(s) failed`)
  process.exit(1)
}
console.log('\nthe open page follows the agent: every expectation held')
