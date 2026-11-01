/**
 * B-17 sequels (P-16 step 2, E-4 "the page that follows the agent"): the banner after the user's own save, and
 * the banner again after a Reload — the user's own save must not blind the page to the agent's next write.
 *
 *   npm run build && node --test bench/tests/page-suivie-suites-besoin.test.mjs
 *
 * Same instance (seed `page-suivie`, scripted engine) and variables (`BESOIN_SKINS`, `BESOIN_LOCALES`) as
 * page-suivie-besoin.test.mjs. Expected words are written by hand from docs/parcours.md and docs/ecrans.md.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin')

const { chromium } = loadPlaywright()

const SKINS = (process.env.BESOIN_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BESOIN_LOCALES ?? 'en,fr').split(',')
const W = { en: { banner: 'The page changed.', reload: 'Reload' }, fr: { banner: 'La page a changé.', reload: 'Recharger' } }

function startInstance({ skin, locale }) {
  return new Promise(async (resolveStart, reject) => {
    const base = await mkdtemp(join(tmpdir(), 'besoin-suivie-s-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'page-suivie', '--skin', skin, '--locale', locale, '--data', base], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({
          url: match[1],
          pages: join(base, 'workspace', 'pages'),
          second: join(base, 'famille'),
          stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(base, { recursive: true, force: true })),
        })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

const doc = (title, body) => `---\ntitle: ${title}\ntype: fiche\n---\n\n${body}\n`
const later = (() => { let n = 9000; return () => new Date(Date.now() + 1000 * (n += 10)) })()
async function agentWrites(file, contents) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents)
  const t = later()
  await utimes(file, t, t)
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`page followed in editing, sequels, skin ${skin}, ${locale}`, () => {
      const w = W[locale]
      let instance
      let browser
      let page
      let n = 0
      const shot = async (name) => { await mkdir(join(shots, 'suivie-suites', skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, 'suivie-suites', skin, locale, `${name}.png`) }) }
      const banner = () => page.getByRole('status').filter({ hasText: w.banner })
      const reloadButton = () => page.getByRole('button', { name: w.reload, exact: true })
      const editor = () => page.locator('[contenteditable=true]').first()
      const pencil = () => page.locator('main button:has(use[href$="#adestia-i-pencil"])').first()
      const open = async (dir, name, text, query = '') => {
        const file = join(dir, 'besoin-suivi', `${name}-${++n}.md`)
        await agentWrites(file, doc(`Titre ${name}`, text))
        await pause(1200)
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#/page/besoin-suivi/${name}-${n}${query}`)
        await page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        await pencil().click()
        await editor().waitFor({ state: 'visible', timeout: 20_000 })
        await pause(800)
        return file
      }

      before(async () => {
        instance = await startInstance({ skin, locale })
        browser = await chromium.launch()
        page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      const typeMore = async (words) => {
        await editor().click()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(words)
      }
      const onDisk = (file, re) => readFileSync(file, 'utf8').match(re) !== null

      test('B-17 · editing: after the user’s own save, the agent writes and the banner rises, the typed text stays', async () => {
        const file = await open(instance.pages, 'apres-sauvegarde', 'Début après sauvegarde.')
        await typeMore(' Ma sauvegarde.')
        for (let i = 0; i < 60 && !onDisk(file, /Ma sauvegarde\./); i++) await pause(250)
        assert.ok(onDisk(file, /Ma sauvegarde\./), 'the user’s save reached the disk')
        await pause(3000)
        assert.equal(await banner().count(), 0, 'no banner from one’s own save')
        await agentWrites(file, doc('Titre apres-sauvegarde', 'Réécriture de l’agent après ma sauvegarde.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.ok((await editor().innerText()).includes('Ma sauvegarde.'))
        assert.ok(!(await editor().innerText()).includes('Réécriture de l’agent après ma sauvegarde.'))
        await shot('apres-sauvegarde')
      })

      test('B-17 · editing: after Reload, a second write by the agent raises the banner again', async () => {
        const file = await open(instance.pages, 'deux-fois', 'Début deux fois.')
        await agentWrites(file, doc('Titre deux-fois', 'Première version de l’agent.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await reloadButton().click()
        await page.waitForFunction(() => document.body.innerText.includes('Première version de l’agent.'), null, { timeout: 20_000 })
        assert.equal(await banner().count(), 0)
        await pause(1500)
        await typeMore(' Ma frappe entre deux.')
        await agentWrites(file, doc('Titre deux-fois', 'Seconde version de l’agent.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.ok((await editor().innerText()).includes('Ma frappe entre deux.'))
        await shot('deuxieme-bandeau')
      })
    })
  }
}
