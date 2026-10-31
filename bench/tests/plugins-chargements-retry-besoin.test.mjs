/**
 * B-18 for the plugins' screens (E-25, E-28): what the Retry does once pressed, written from
 * docs/ecrans.md § « Loading and failure » and « E-25 and E-28: loading and Retry, in detail »,
 * against a real instance of the `plugins` seed in a real browser. It complements
 * plugins-chargements-besoin.test.mjs (it does not change it).
 *
 *   npm run build && node --test bench/tests/plugins-chargements-retry-besoin.test.mjs
 *
 * Cases: Retry from the keyboard; Retry cannot be pressed twice (one fetch per press); a Retry whose answer is a 404 or
 * a refusal gives the message without a second Retry; a Retry that fails again gives the failure back.
 * `BESOIN_SKINS` and `BESOIN_LOCALES` narrow the matrix; pictures go to the ignored
 * `bench/shots-besoin-chargements/`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin-chargements')

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

const WORDS = {
  en: { loading: 'Loading…', retry: 'Retry', hub: 'The Workshop is unavailable.', workbook: 'Unreadable workbook.', route: 'Unreadable route.' },
  fr: { loading: 'Chargement…', retry: 'Réessayer', hub: 'Atelier indisponible.', workbook: 'Workbook illisible.', route: 'Parcours illisible.' },
}
const HUB_DATA = 'Meuble à tiroirs — bureau (caisson seul)'
const ROUTE_DATA = 'Le Val sans Retour — boucle depuis le gîte'
const SCREENS = [
  { name: 'E-25 hub', hash: 'atelier', read: /\/api\/plugin\/atelier\/workbooks(\?|$)/, message: 'hub', data: HUB_DATA },
  { name: 'E-25 workbook', hash: 'atelier/projets/caisson', read: /\/api\/plugin\/atelier\/workbook\?/, message: 'workbook', data: '.shopmode' },
  { name: 'E-28 own screen', hash: 'parcours/balades/assets/val-sans-retour.parcours.json', read: /\/val-sans-retour\.parcours\.json(\?|$)/, message: 'route', data: ROUTE_DATA, parcours: true },
  { name: 'E-28 block in a page', hash: 'page/balades/val-sans-retour', read: /\/val-sans-retour\.parcours\.json(\?|$)/, message: 'route', data: ROUTE_DATA, parcours: true },
  { name: 'E-28 link view', hash: 'page/balades/week-end', read: /\/val-sans-retour\.parcours\.json(\?|$)/, message: 'route', data: ROUTE_DATA, parcours: true },
]

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-retry-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'plugins', '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({ url: match[1], stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

/** Takes over the GETs of one read: 'pass', 'hold' (until set('pass')), 'abort', or a status number. */
async function gate(page, re, mode = 'pass') {
  const waiting = []
  const state = { mode, hits: 0 }
  await page.route(re, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    state.hits += 1
    if (state.mode === 'pass') return route.continue()
    if (state.mode === 'hold') { await new Promise((release) => waiting.push(release)); return route.continue() }
    if (state.mode === 'abort') return route.abort('failed')
    return route.fulfill({ status: state.mode, contentType: 'application/json', body: JSON.stringify({ error: 'bench-raw-server-sentence' }) })
  })
  state.set = (next) => { state.mode = next; if (next === 'pass') waiting.splice(0).forEach((release) => release()) }
  return state
}

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`plugins Retry behaviour on skin ${skin}, ${locale}`, () => {
      const w = WORDS[locale]
      let instance
      let browser
      let page
      const loading = () => page.getByText(w.loading, { exact: true })
      const retry = () => page.getByRole('button', { name: w.retry, exact: true })
      const sentence = (s) => page.getByText(w[s.message], { exact: true })
      const dataOf = (s) => (s.data.startsWith('.') ? page.locator(s.data) : page.getByText(s.data))
      const go = async (hash) => { await page.goto('about:blank'); await page.goto(`${instance.url}/#/${hash}`) }
      const fresh = async () => {
        await page?.context().close()
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale, colorScheme: 'light' })
        await context.addInitScript(() => { try { localStorage.setItem('adestia.theme', 'light') } catch { /* refused */ } })
        page = await context.newPage()
      }
      before(async () => { instance = await startInstance(skin, locale); browser = await chromium.launch() })
      after(async () => { await browser?.close(); await instance?.stop() })

      for (const screen of SCREENS) {
        // nominal (keyboard). Breaks if Retry is a div/link without keyboard activation.
        test(`${screen.name}: Retry pressed from the keyboard (focus, Enter) fetches again and shows the data`, async () => {
          await fresh()
          const read = await gate(page, screen.read, 500)
          await go(screen.hash)
          await retry().waitFor({ state: 'visible' })
          read.set('pass')
          await retry().focus()
          await page.keyboard.press('Enter')
          await dataOf(screen).first().waitFor({ state: 'visible' })
          assert.equal(await sentence(screen).count(), 0)
          assert.equal(await retry().count(), 0)
        })

        // exclusion: the button cannot be pressed twice. Breaks if Retry stays in place while it fetches.
        test(`${screen.name}: two quick presses on Retry make one fetch`, async () => {
          await fresh()
          const read = await gate(page, screen.read, 500)
          await go(screen.hash)
          await retry().waitFor({ state: 'visible' })
          const before = read.hits
          read.set('hold')
          await retry().dblclick()
          await loading().waitFor({ state: 'visible' })
          assert.equal(await retry().count(), 0)
          read.set('pass')
          await dataOf(screen).first().waitFor({ state: 'visible' })
          assert.equal(read.hits, before + 1, 'one press, one fetch')
        })

        // échec: Retry answered by a failure again gives back the failure, and never loading + failure together.
        test(`${screen.name}: a Retry that fails again gives the message and Retry back`, async () => {
          await fresh()
          const read = await gate(page, screen.read, 500)
          await go(screen.hash)
          await retry().waitFor({ state: 'visible' })
          const before = read.hits
          const answered = page.waitForResponse((r) => screen.read.test(r.url()))
          await retry().click()
          assert.equal((await answered).status(), 500)
          await sentence(screen).waitFor({ state: 'visible' })
          await retry().waitFor({ state: 'visible' })
          assert.equal(read.hits, before + 1)
          assert.equal(await loading().count(), 0)
          assert.equal(await dataOf(screen).count(), 0)
        })
      }

      for (const screen of SCREENS.filter((s) => s.parcours)) {
        // exclusion: the route cannot change on a 404 or a refusal, so after Retry no second Retry is offered.
        for (const refusal of [404, 403]) {
          test(`${screen.name}: a Retry answered ${refusal} shows the message without Retry`, async () => {
            await fresh()
            const read = await gate(page, screen.read, 500)
            await go(screen.hash)
            await retry().waitFor({ state: 'visible' })
            read.set(refusal)
            const answered = page.waitForResponse((r) => screen.read.test(r.url()))
            await retry().click()
            assert.equal((await answered).status(), refusal)
            await sentence(screen).waitFor({ state: 'visible' })
            assert.equal(await retry().count(), 0)
            assert.equal(await loading().count(), 0)
          })
        }
      }
    })
  }
}
