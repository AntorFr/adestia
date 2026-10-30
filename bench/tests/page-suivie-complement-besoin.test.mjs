/**
 * B-17 complement (P-16 step 2, E-4 "the page that follows the agent"): the editing cases the first file leaves out —
 * a page of the second store in editing, a page moved while edited, Done refused with the banner up.
 *
 *   npm run build && node --test bench/tests/page-suivie-complement-besoin.test.mjs
 *
 * Same instance (seed `page-suivie`, scripted engine), same environment variables as page-suivie-besoin.test.mjs
 * (`BESOIN_SKINS`, `BESOIN_LOCALES`). Expected words are written by hand from docs/ecrans.md.
 */
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
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
const W = { en: { banner: 'The page changed.', reload: 'Reload' }, fr: { banner: 'La page a changé.', reload: 'Recharger' } }

function startInstance({ skin, locale }) {
  return new Promise(async (resolveStart, reject) => {
    const base = await mkdtemp(join(tmpdir(), 'besoin-suivie-c-'))
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
const later = (() => { let n = 5000; return () => new Date(Date.now() + 1000 * (n += 10)) })()
async function agentWrites(file, contents) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents)
  const t = later()
  await utimes(file, t, t)
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`page followed in editing, complement, skin ${skin}, ${locale}`, () => {
      const w = W[locale]
      let instance
      let browser
      let page
      let n = 0
      const shot = async (name) => { await mkdir(join(shots, 'suivie-complement', skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, 'suivie-complement', skin, locale, `${name}.png`) }) }
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

      test('B-17 · editing a page of the second store: the agent writes, the banner rises, the typed text stays', async () => {
        const file = await open(instance.second, 'famille-edition', 'Début chez la famille.', '?store=famille')
        await editor().click()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(' Frappe famille.')
        await agentWrites(file, doc('Titre famille-edition', 'Version de l’agent chez la famille.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.ok((await editor().innerText()).includes('Frappe famille.'))
        assert.ok(!(await editor().innerText()).includes('Version de l’agent chez la famille.'))
        await shot('second-magasin-bandeau')
        await reloadButton().click()
        await page.waitForFunction(() => document.body.innerText.includes('Version de l’agent chez la famille.'), null, { timeout: 20_000 })
        assert.equal(await banner().count(), 0)
      })

      test('B-17 · editing: the agent moves the page, the banner rises first and the text stays; Reload leads to E-8', async () => {
        const file = await open(instance.pages, 'deplace-edition', 'Page éditée puis déplacée.')
        await editor().click()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(' Frappe avant déplacement.')
        await mkdir(join(instance.pages, 'besoin-suivi', 'ailleurs'), { recursive: true })
        await rename(file, join(instance.pages, 'besoin-suivi', 'ailleurs', `deplace-edition-${n}.md`))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.locator('.adestia-empty').count(), 0, 'E-8 does not show before Reload')
        assert.ok((await editor().innerText()).includes('Frappe avant déplacement.'))
        await reloadButton().click()
        await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Frappe avant déplacement.').count(), 0)
        await shot('deplace-e8')
      })

      test('B-17 · editing: Done with the banner up and a refused save keeps the editor open, the typed text and the banner', async () => {
        const file = await open(instance.pages, 'termine-refuse', 'Début du Done refusé.')
        await agentWrites(file, doc('Titre termine-refuse', 'Version de l’agent avant Done.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await editor().click()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(' Frappe du Done refusé.')
        // the autosave is refused first (the save-time line), then the user presses Done
        await page.locator('.adestia-save--warn').filter({ hasNotText: w.banner }).waitFor({ state: 'visible', timeout: 20_000 })
        await page.locator('.adestia-editor__save').click()
        await pause(3000)
        assert.equal(await page.locator('[contenteditable=true]').count() > 0, true, 'the editor stays open')
        assert.ok((await editor().innerText()).includes('Frappe du Done refusé.'))
        assert.equal(await banner().count(), 1, 'the banner stays')
        assert.equal(readFileSync(file, 'utf8'), doc('Titre termine-refuse', 'Version de l’agent avant Done.'), 'the agent’s file is not overwritten')
        await shot('done-refuse')
      })
    })
  }
}
