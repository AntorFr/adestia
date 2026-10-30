/**
 * B-17 against the need: the page that is open follows what the agent writes (P-16 steps 1 and 2, E-4, E-8,
 * AD-21), through a real browser on a real instance of the `page-suivie` seed (scripted engine, as the bench
 * does). The agent is played the way the real one acts: it writes, moves or deletes the page's file on disk.
 *
 *   npm run build && node --test bench/tests/page-suivie-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment (`/usr/lib/node_modules` or `npm root -g`).
 * `BESOIN_SKINS=alfred,dobby` and `BESOIN_LOCALES=fr` narrow the matrix; pictures land in
 * `bench/shots-besoin/` (ignored by git). Every expected word is written by hand from docs/parcours.md
 * (B-17, P-16) and docs/ecrans.md (E-4 "the page that follows the agent"), never from what the screen printed.
 * The pages the tests use are their own files (`besoin-suivi/…`), written into the instance's workspace.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, unlink, utimes, writeFile } from 'node:fs/promises'
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

/** The words the need names (docs/ecrans.md, E-4), by locale. */
const W = {
  en: { banner: 'The page changed.', reload: 'Reload', conflict: 'The agent changed this page. Reload to see its version.', noPage: 'There is no page at this address.' },
  fr: { banner: 'La page a changé.', reload: 'Recharger', conflict: null, noPage: null },
}

function startInstance({ skin, locale, watch = true }) {
  return new Promise(async (resolveStart, reject) => {
    const base = await mkdtemp(join(tmpdir(), 'besoin-suivie-'))
    const env = { ...process.env, ...(watch ? {} : { BENCH_WATCH: 'off' }) }
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'page-suivie', '--skin', skin, '--locale', locale, '--data', base], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
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
const later = (() => { let n = 10; return () => new Date(Date.now() + 1000 * (n += 10)) })()
/** what the agent does to a file: write it, with a modification time that surely differs */
async function agentWrites(file, contents) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents)
  const t = later()
  await utimes(file, t, t)
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`the page follows the agent, skin ${skin}, ${locale}`, () => {
      const w = W[locale]
      let instance
      let browser
      let page
      let n = 0
      const shot = async (name) => { await mkdir(join(shots, 'suivie', skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, 'suivie', skin, locale, `${name}.png`) }) }
      const banner = () => page.getByRole('status').filter({ hasText: w.banner })
      const reloadButton = () => page.getByRole('button', { name: w.reload, exact: true })
      const editor = () => page.locator('[contenteditable=true]').first()
      const pencil = () => page.locator('main button:has(use[href$="#adestia-i-pencil"])').first()
      /** a fresh page file of this test, opened in reading */
      const openReading = async (name, text, query = '') => {
        const file = join(instance.pages, 'besoin-suivi', `${name}-${++n}.md`)
        await agentWrites(file, doc(`Titre ${name}`, text))
        await pause(1200)
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#/page/besoin-suivi/${name}-${n}${query}`)
        await page.getByText(text, { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        return file
      }
      const openEditing = async (name, text) => {
        const file = await openReading(name, text)
        await pencil().click()
        await editor().waitFor({ state: 'visible', timeout: 20_000 })
        await pause(800)
        return file
      }
      const type = async (words) => {
        await editor().click()
        await page.keyboard.press('Control+End')
        await page.keyboard.type(words)
      }
      const typed = async () => editor().innerText()

      before(async () => {
        instance = await startInstance({ skin, locale })
        browser = await chromium.launch()
        page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      test('B-17 · reading: when the agent rewrites the page, the new text appears with no action and the old one is gone', async () => {
        const file = await openReading('lecture', 'Texte avant l’agent.')
        await agentWrites(file, doc('Titre lecture', 'Texte réécrit par l’agent.'))
        await page.getByText('Texte réécrit par l’agent.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Texte avant l’agent.').count(), 0)
        assert.equal(await banner().count(), 0, 'reading shows no banner')
        await shot('lecture-reecrite')
      })

      test('B-17 · reading: the agent rewrites twice in a row, the last text is the one shown', async () => {
        const file = await openReading('deux', 'Premier état.')
        await agentWrites(file, doc('Titre deux', 'Deuxième état.'))
        await page.getByText('Deuxième état.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        await agentWrites(file, doc('Titre deux', 'Troisième état.'))
        await page.getByText('Troisième état.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Deuxième état.').count(), 0)
      })

      test('B-17 · reading: a write to another page does not change the open one', async () => {
        const file = await openReading('autre', 'Page ouverte, intacte.')
        const other = join(instance.pages, 'besoin-suivi', 'voisine.md')
        await agentWrites(other, doc('Voisine', 'Voisine réécrite.'))
        await pause(3000)
        assert.equal(await page.getByText('Page ouverte, intacte.', { exact: true }).count(), 1)
        assert.equal(await page.getByText('Voisine réécrite.').count(), 0)
        assert.ok(existsSync(file))
      })

      test('B-17 · reading a page of the second store: it is refreshed too', async () => {
        const file = join(instance.second, 'besoin-suivi', `partagee-${++n}.md`)
        await agentWrites(file, doc('Partagée', 'Avant, chez la famille.'))
        await pause(1200)
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#/page/besoin-suivi/partagee-${n}?store=famille`)
        await page.getByText('Avant, chez la famille.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        await agentWrites(file, doc('Partagée', 'Après, chez la famille.'))
        await page.getByText('Après, chez la famille.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Avant, chez la famille.').count(), 0)
        await shot('second-magasin')
      })

      test('B-17 · reading: the agent deletes the page, E-8 shows and names the path', async () => {
        const file = await openReading('suppr-lecture', 'Bientôt supprimée.')
        await unlink(file)
        await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Bientôt supprimée.').count(), 0)
        await shot('e8-' + n)
        const shown = await page.locator('main').innerText()
        assert.ok(shown.includes(`besoin-suivi/suppr-lecture-${n}`), `E-8 names the path, got: ${shown}`)
        if (locale === 'en') assert.ok(shown.includes(w.noPage), shown)
        await shot('lecture-supprimee')
      })

      test('B-17 · reading: the agent moves the page away, E-8 shows', async () => {
        const file = await openReading('deplacee', 'Bientôt déplacée.')
        await mkdir(join(instance.pages, 'besoin-suivi', 'ailleurs'), { recursive: true })
        await rename(file, join(instance.pages, 'besoin-suivi', 'ailleurs', `deplacee-${n}.md`))
        await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.getByText('Bientôt déplacée.').count(), 0)
      })

      test('B-17 · editing: the agent writes, the banner rises, the typed text stays, no refresh replaces it', async () => {
        const file = await openEditing('edition', 'Début de la page.')
        await type(' Ma frappe en cours.')
        await agentWrites(file, doc('Titre edition', 'Version de l’agent.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await banner().count(), 1)
        assert.ok(await reloadButton().isVisible(), 'a Reload button')
        assert.ok((await typed()).includes('Ma frappe en cours.'), 'the typed text stays')
        assert.ok(!(await typed()).includes('Version de l’agent.'), 'the agent’s text is not poured in')
        await pause(2500)
        assert.ok((await typed()).includes('Ma frappe en cours.'), 'still there later')
        await shot('edition-bandeau')
        // typing on, with the banner up, keeps working and keeps the banner
        await type(' Et encore.')
        assert.ok((await typed()).includes('Et encore.'))
        assert.equal(await banner().count(), 1)
      })

      test('B-17 · editing: the banner has role status, comes before the editor text and sits below the title', async () => {
        const file = await openEditing('place', 'Texte du placement.')
        await agentWrites(file, doc('Titre place', 'Réécrite pour le placement.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        const box = await banner().boundingBox()
        const surface = await editor().boundingBox()
        assert.equal(await banner().getAttribute('role'), 'status')
        assert.ok(box.y + box.height <= surface.y + 1, 'above the editor surface')
      })

      test('B-17 · editing: Reload shows the agent’s version, the banner goes, the typed text is replaced', async () => {
        const file = await openEditing('recharge', 'Début à recharger.')
        await type(' Frappe à perdre.')
        await agentWrites(file, doc('Titre recharge', 'Version finale de l’agent.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await reloadButton().click()
        await page.waitForFunction(() => document.body.innerText.includes('Version finale de l’agent.'), null, { timeout: 20_000 })
        assert.equal(await banner().count(), 0, 'the banner is gone')
        const now = await typed()
        assert.ok(!now.includes('Frappe à perdre.'), 'the typed text is replaced by the user’s own Reload')
        assert.ok(now.includes('Version finale de l’agent.'))
        await shot('edition-recharge')
      })

      test('B-17 · editing: the user’s own save raises no banner', async () => {
        const file = await openEditing('sauvegarde', 'Début à sauvegarder.')
        await type(' Sauvée par moi.')
        await page.waitForFunction(() => /Saved|Enregistr/i.test(document.querySelector('.adestia-save')?.textContent ?? ''), null, { timeout: 20_000 })
        for (let i = 0; i < 40 && !/Sauvée par moi\./.test(readFileSync(file, 'utf8')); i++) await pause(250)
        assert.match(readFileSync(file, 'utf8'), /Sauvée par moi\./)
        await pause(3500)
        assert.equal(await banner().count(), 0, 'no banner after one’s own save')
        // and a second save, after more typing
        await type(' Et une deuxième.')
        for (let i = 0; i < 40 && !/Et une deuxième\./.test(readFileSync(file, 'utf8')); i++) await pause(250)
        assert.match(readFileSync(file, 'utf8'), /Et une deuxième\./)
        await pause(3500)
        assert.equal(await banner().count(), 0, 'no banner after a second own save')
      })

      test('B-17 · editing: with the banner up, a save the server refuses leaves the typed text, the editor and the banner', async () => {
        const file = await openEditing('refus', 'Début du refus.')
        await agentWrites(file, doc('Titre refus', 'Écrit par l’agent avant ma frappe.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await type(' Ma frappe refusée.')
        const warn = page.locator('.adestia-save--warn').filter({ hasText: /agent|Reload to see|agent a modifi|Recharg/i }).filter({ hasNotText: w.banner })
        await warn.waitFor({ state: 'visible', timeout: 20_000 })
        if (locale === 'en') assert.equal((await warn.innerText()).trim(), w.conflict)
        assert.ok((await typed()).includes('Ma frappe refusée.'))
        assert.equal(await banner().count(), 1, 'the banner stays')
        await pause(3000)
        assert.equal(readFileSync(file, 'utf8'), doc('Titre refus', 'Écrit par l’agent avant ma frappe.'), 'the agent’s file is not overwritten')
        await shot('edition-refus')
      })

      test('B-17 · editing: the agent writes three times, there is still one banner', async () => {
        const file = await openEditing('repete', 'Début répété.')
        for (const text of ['Une.', 'Deux.', 'Trois.']) {
          await agentWrites(file, doc('Titre repete', text))
          await pause(300)
        }
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await pause(2000)
        assert.equal(await banner().count(), 1)
        await reloadButton().click()
        await page.waitForFunction(() => document.body.innerText.includes('Trois.'), null, { timeout: 20_000 })
        assert.equal(await banner().count(), 0)
      })

      test('B-17 · editing: Done with the banner up and nothing typed closes the editor and shows the agent’s version', async () => {
        const file = await openEditing('termine', 'Début terminé.')
        await agentWrites(file, doc('Titre termine', 'Version vue après Done.'))
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        await page.locator('.adestia-editor__save').click()
        await page.getByText('Version vue après Done.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.locator('[contenteditable=true]').count(), 0, 'the editor is closed')
        assert.equal(await banner().count(), 0)
      })

      test('B-17 · editing: the agent deletes the page, the banner rises and the text stays; Reload leads to E-8', async () => {
        const file = await openEditing('suppr-edition', 'Page éditée puis supprimée.')
        await type(' Frappe avant suppression.')
        await unlink(file)
        await banner().waitFor({ state: 'visible', timeout: 20_000 })
        assert.equal(await page.locator('.adestia-empty').count(), 0, 'E-8 does not show before Reload')
        assert.ok((await typed()).includes('Frappe avant suppression.'), 'the text stays')
        await shot('edition-supprimee-bandeau')
        await reloadButton().click()
        await page.locator('.adestia-empty').waitFor({ state: 'visible', timeout: 20_000 })
        await shot('e8-' + n)
        const shown = await page.locator('main').innerText()
        assert.ok(shown.includes(`besoin-suivi/suppr-edition-${n}`), shown)
        assert.equal(await page.getByText('Frappe avant suppression.').count(), 0, 'the unsaved text went with the page')
        await shot('edition-supprimee-e8')
      })

      if (locale === 'en') {
        test('B-17 · editing: the banner says exactly « The page changed. » with « Reload »', async () => {
          const file = await openEditing('mots', 'Pour les mots.')
          await agentWrites(file, doc('Titre mots', 'Mots changés.'))
          await banner().waitFor({ state: 'visible', timeout: 20_000 })
          assert.equal(await banner().innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'The page changed. Reload')
        })
      } else {
        test('B-17 · editing: the banner says « La page a changé. » with « Recharger », no English left', async () => {
          const file = await openEditing('mots', 'Pour les mots.')
          await agentWrites(file, doc('Titre mots', 'Mots changés.'))
          await banner().waitFor({ state: 'visible', timeout: 20_000 })
          assert.equal(await banner().innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'La page a changé. Recharger')
        })
      }

      test('B-17 · phone: the banner keeps the page column width and Reload stays reachable under the sentence', async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
        const phone = await context.newPage()
        const file = join(instance.pages, 'besoin-suivi', `mobile-${++n}.md`)
        await agentWrites(file, doc('Titre mobile', 'Début mobile.'))
        await pause(1200)
        await phone.goto(`${instance.url}/#/page/besoin-suivi/mobile-${n}`)
        await phone.getByText('Début mobile.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        await phone.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
        await phone.locator('[contenteditable=true]').first().waitFor({ state: 'visible', timeout: 20_000 })
        await pause(800)
        await agentWrites(file, doc('Titre mobile', 'Réécrite sur mobile.'))
        const bannerPhone = phone.getByRole('status').filter({ hasText: w.banner })
        await bannerPhone.waitFor({ state: 'visible', timeout: 20_000 })
        const box = await bannerPhone.boundingBox()
        const button = await phone.getByRole('button', { name: w.reload, exact: true }).boundingBox()
        const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        assert.ok(overflow <= 0, `no horizontal overflow, got ${overflow}`)
        assert.ok(box.x >= 0 && box.x + box.width <= 390, 'inside the viewport')
        assert.ok(box.width >= 300, `full column width, got ${box.width}`)
        assert.ok(button.x >= 0 && button.x + button.width <= 390, 'Reload inside the viewport')
        assert.ok(button.y >= box.y && button.y + button.height <= box.y + box.height + 1, 'Reload sits inside the banner')
        await mkdir(join(shots, 'suivie', skin, locale), { recursive: true })
        await phone.screenshot({ path: join(shots, 'suivie', skin, locale, 'edition-bandeau-mobile.png') })
        await context.close()
      })
    })
  }
}

describe('the page does not follow the agent when the workspace watch is off', () => {
  let instance
  let browser
  let page
  before(async () => {
    instance = await startInstance({ skin: SKINS[0], locale: 'en', watch: false })
    browser = await chromium.launch()
    page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  })
  after(async () => { await browser?.close(); await instance?.stop() })

  test('B-17 · watch off, reading: the agent rewrites, nothing moves', async () => {
    const file = join(instance.pages, 'besoin-suivi', 'veille-lecture.md')
    await agentWrites(file, doc('Veille lecture', 'Texte de la veille éteinte.'))
    await pause(1200)
    await page.goto(`${instance.url}/#/page/besoin-suivi/veille-lecture`)
    await page.getByText('Texte de la veille éteinte.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await agentWrites(file, doc('Veille lecture', 'Texte que personne ne doit voir.'))
    await pause(5000)
    assert.equal(await page.getByText('Texte de la veille éteinte.', { exact: true }).count(), 1)
    assert.equal(await page.getByText('Texte que personne ne doit voir.').count(), 0)
  })

  test('B-17 · watch off, reading: the agent deletes the page, nothing moves', async () => {
    const file = join(instance.pages, 'besoin-suivi', 'veille-suppr.md')
    await agentWrites(file, doc('Veille suppr', 'Page qui reste affichée.'))
    await pause(1200)
    await page.goto('about:blank')
    await page.goto(`${instance.url}/#/page/besoin-suivi/veille-suppr`)
    await page.getByText('Page qui reste affichée.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await unlink(file)
    await pause(5000)
    assert.equal(await page.getByText('Page qui reste affichée.', { exact: true }).count(), 1)
    assert.equal(await page.locator('.adestia-empty').count(), 0)
  })

  test('B-17 · watch off, editing: the agent writes, no banner', async () => {
    const file = join(instance.pages, 'besoin-suivi', 'veille-edition.md')
    await agentWrites(file, doc('Veille edition', 'Édition sans veille.'))
    await pause(1200)
    await page.goto('about:blank')
    await page.goto(`${instance.url}/#/page/besoin-suivi/veille-edition`)
    await page.getByText('Édition sans veille.', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('main button:has(use[href$="#adestia-i-pencil"])').first().click()
    await page.locator('[contenteditable=true]').first().waitFor({ state: 'visible', timeout: 20_000 })
    await pause(800)
    await agentWrites(file, doc('Veille edition', 'Réécrite sans que personne le sache.'))
    await pause(5000)
    assert.equal(await page.getByRole('status').filter({ hasText: 'The page changed.' }).count(), 0)
  })
})
