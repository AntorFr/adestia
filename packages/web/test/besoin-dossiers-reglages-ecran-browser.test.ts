/**
 * `adestia-dossiers-reglages-ecran` seen from its need (B-39, B-40; P-23; E-39, E-3, E-4), through a driven browser
 * on the bench instance (`bench/launch.mjs`, scripted engine, seed `besoin-dossiers-reglages-ecran`: `chaudiere` two
 * pages « Résumé chaudière » and « Entretien » plus a PDF, no settings; `cuisine` whose `.folder.md` already names its
 * page `plan.md`; `garage` two pages; `fantome` whose `page` names a file that does not exist; `gele` in a directory
 * of mode 555; `voyage` owned by the `voyages` plugin with a `page` too). Expectations are written by hand from the
 * sheet's criterion, docs/parcours.md (B-39, B-40, P-23) and docs/ecrans.md (E-39, E-3, E-4); the effect (what ends
 * in `.folder.md`) is read at its door, `GET /api/pages/index` (`folderSettings`) and `PUT /api/folders/settings`.
 *
 * Plan (need -> case -> proof):
 *   P-23 1-2 chaudiere: Folder settings, name « Chaudière », icon image, colour Green, attachments off, page
 *            « Résumé chaudière », Save -> the door reads the five keys; the sheet closes
 *   P-23 3   reopening chaudiere shows the page with the link Folder -> `#/section/chaudiere?classic`; the classic
 *            view has no Attachments block any more (it had one before) and no Folder link
 *   P-23 3   cuisine opens its page; Folder -> classic view; Folder settings -> « None — the classic view », Save ->
 *            the key `page` is gone at the door and the folder opens classic
 *   B-40     a `page` pointing at a missing file opens the classic view, no Folder link, no error; E-39 shows it missing
 *   P-23 4   voyage (app + page): the plugin screen wins, with the link Folder; the link leads to the classic view
 *            whence Folder settings opens E-39, which says « Opens as the voyages screen »
 *   P-23     gele (not writable): no Folder settings button, and the door refuses a write
 *   P-23 f.  garage: a refused write keeps the sheet and its entries with the error line, a retry saves; Cancel and
 *            Escape write nothing; offline disables Save with « You are offline. »
 *   E-4 / fr the Folder link reads « Dossier » in French
 *   E-39     light/dark x desk/phone captures (`REGLAGES_SHOTS=<dir>`); on a phone the button keeps its name, loses its word
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(120_000) })

const SHOTS = process.env.REGLAGES_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)
const visit = (browser: BrowserOf, base: string, route: string, size: Size = 'desk', theme: 'light' | 'dark' = 'light', locale = 'en') =>
  open(browser, base, { theme, size, locale, route }) as Promise<{ context: any; page: any }>
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
const hash = (page: any): Promise<string> => page.evaluate(() => location.hash)
const isSettingsPut = (r: any) => r.url().includes('/api/folders/settings') && r.request().method() === 'PUT'

describe.skipIf(!playwright)('E-39, E-3, E-4: a folder is set up from the interface (P-23)', () => {
  let instance: Instance
  let browser: BrowserOf
  const settingsOf = async (folder: string): Promise<Record<string, unknown> | undefined> => {
    const index = (await (await fetch(`${instance.url}/api/pages/index`)).json()) as { folderSettings: Record<string, Record<string, unknown>> }
    return index.folderSettings[folder]
  }
  const openSheet = async (page: any) => {
    await page.getByRole('button', { name: 'Folder settings' }).click({ timeout: T(30_000) })
    await page.getByRole('dialog').waitFor({ timeout: T(10_000) })
  }
  const save = async (page: any) => {
    const [answer] = await Promise.all([page.waitForResponse(isSettingsPut, { timeout: T(20_000) }), page.getByRole('button', { name: 'Save', exact: true }).click()])
    return answer
  }

  beforeAll(async () => {
    instance = await launch('besoin-dossiers-reglages-ecran', '', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('P-23 steps 1-3 (B-39, B-40): icon, colour, name, attachments off and a page are saved, and the folder reopens on that page with the Folder link', async () => {
    // red if the sheet drops one of the entries, writes them elsewhere than .folder.md, or the replacement page does not open
    const { context, page } = await visit(browser, instance.url, '/section/chaudiere')
    await page.getByText('Résumé chaudière', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('Attachments', { exact: false }).first().waitFor({ timeout: T(10_000) }) // before: the brick shows facture.pdf
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Chaudière')
    await page.getByRole('radiogroup', { name: 'Icon' }).getByRole('radio', { name: 'image', exact: true }).click()
    await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Green', exact: true }).click()
    await page.getByRole('switch', { name: 'Show attachments' }).click()
    await page.getByLabel('Replacement page').selectOption({ label: 'Résumé chaudière' })
    await shot(page, 'e39-rempli')
    const answer = await save(page)
    expect(answer.status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    const saved = await settingsOf('chaudiere')
    expect(saved).toMatchObject({ title: 'Chaudière', ico: 'image', couleur: 'vert', attachments: false, page: 'resume.md' })

    // reopening the folder (a fresh load of its address)
    await page.goto(`${instance.url}/#/`, { waitUntil: 'domcontentloaded' })
    await page.goto(`${instance.url}/#/section/chaudiere`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Chaudière gaz, révisée chaque octobre.', { exact: false }).first().waitFor({ timeout: T(30_000) })
    const link = page.getByRole('link', { name: 'Folder', exact: true })
    expect(await link.getAttribute('href')).toBe('#/section/chaudiere?classic')
    await shot(page, 'e4-page-de-remplacement')

    // the link leads to the classic view: cards, no Attachments block, no Folder link
    await link.click()
    await page.getByText('Entretien', { exact: true }).first().waitFor({ timeout: T(20_000) })
    expect(await hash(page)).toBe('#/section/chaudiere?classic')
    expect(await page.getByText('facture.pdf', { exact: false }).count()).toBe(0)
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    await context.close()
  })

  it('P-23 step 3 (B-40): from the classic view, « None — the classic view » then Save clears the page and the folder opens classic', async () => {
    // red if clearing leaves `page` in the file, or the folder still opens the page
    const { context, page } = await visit(browser, instance.url, '/section/cuisine')
    await page.getByText('Quatre meubles hauts, deux bas.', { exact: false }).first().waitFor({ timeout: T(30_000) })
    await page.getByRole('link', { name: 'Folder', exact: true }).click()
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(20_000) })
    expect(await hash(page)).toBe('#/section/cuisine?classic')
    await openSheet(page)
    expect(await page.getByLabel('Replacement page').inputValue()).toBe('plan.md')
    await page.getByLabel('Replacement page').selectOption({ label: 'None — the classic view' })
    expect((await save(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    const saved = await settingsOf('cuisine')
    expect(saved).toMatchObject({ title: 'Cuisine' })
    expect(saved).not.toHaveProperty('page')
    await page.goto(`${instance.url}/#/section/cuisine`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('Plan de la cuisine', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.getByText('Quatre meubles hauts, deux bas.', { exact: false }).count()).toBe(0)
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    await context.close()
  })

  it('B-40: a page pointing at a missing file opens the classic view with no error and no Folder link; the sheet shows the page as missing', async () => {
    // red if the missing file opens an error screen, or the sheet silently shows None
    const { context, page } = await visit(browser, instance.url, '/section/fantome')
    await page.getByText('Note fantôme', { exact: true }).first().waitFor({ timeout: T(30_000) })
    expect(await hash(page)).toBe('#/section/fantome')
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    expect(await page.getByText(/could not|not found|error/i).count()).toBe(0)
    await openSheet(page)
    const chosen: string = await page.getByLabel('Replacement page').evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent ?? '')
    expect(chosen).toMatch(/disparu.*\(missing\)/)
    await shot(page, 'e39-page-introuvable')
    await context.close()
  })

  it('P-23 step 4 (B-39, B-40): on the screen of a plugin that owns the folder the Folder link leads to the classic view, whence Folder settings opens E-39', async () => {
    // red if the plugin screen has no link, the replacement page wins over the plugin, or the classic view offers no settings
    const { context, page } = await visit(browser, instance.url, '/section/voyage')
    const link = page.getByRole('link', { name: 'Folder', exact: true })
    await link.waitFor({ timeout: T(30_000) })
    expect(await page.getByText('Texte de la page choisie.', { exact: false }).count()).toBe(0) // order: plugin screen, then page
    expect(await link.getAttribute('href')).toBe('#/section/voyage?classic')
    await shot(page, 'e-plugin-lien-dossier')
    await link.click()
    await page.getByText('Note du voyage', { exact: true }).first().waitFor({ timeout: T(20_000) })
    expect(await hash(page)).toBe('#/section/voyage?classic')
    await openSheet(page)
    await page.getByText('Opens as the voyages screen', { exact: false }).first().waitFor({ timeout: T(10_000) })
    await shot(page, 'e39-dossier-de-plugin')
    await context.close()
  })

  it('P-23 (B-39): a folder that cannot be written offers no Folder settings, and the door refuses a write', async () => {
    // red if the button is drawn on a read-only folder, or the route writes there
    const { context, page } = await visit(browser, instance.url, '/section/gele')
    await page.getByText('Fiche gelée', { exact: true }).first().waitFor({ timeout: T(30_000) })
    expect(await page.getByRole('button', { name: 'Folder settings' }).count()).toBe(0)
    const refused = await fetch(`${instance.url}/api/folders/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'gele', settings: { title: 'Forcé' } }) })
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(refused.status).toBeLessThan(500)
    expect(await settingsOf('gele')).toBeUndefined()
    await context.close()
  })

  it('P-23 failure paths: a refused write keeps the sheet and its entries with the error line, and a retry saves', async () => {
    // red if the sheet closes on a refused write, empties its fields or shows no line
    const { context, page } = await visit(browser, instance.url, '/section/garage')
    await page.getByText('Outils', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Garage refusé')
    await page.route('**/api/folders/settings', (route: any) => (route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue()))
    const refused = await save(page)
    expect(refused.status()).toBe(500)
    await page.getByText('The settings could not be written. Try again.', { exact: true }).waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('textbox', { name: 'Name shown' }).inputValue()).toBe('Garage refusé')
    expect(await page.getByRole('dialog').count()).toBe(1)
    expect(await settingsOf('garage')).toBeUndefined()
    await shot(page, 'e39-ecriture-refusee')
    await page.unroute('**/api/folders/settings')
    expect((await save(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect(await settingsOf('garage')).toMatchObject({ title: 'Garage refusé' })
    await context.close()
  })

  it('E-39: Cancel and Escape change nothing, and a reopening starts from the stored values', async () => {
    // red if Cancel or Escape writes, or the sheet keeps what was typed
    const { context, page } = await visit(browser, instance.url, '/section/cuisine?classic')
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(30_000) })
    const before = JSON.stringify(await settingsOf('cuisine'))
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Jamais écrit')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    await openSheet(page)
    expect(await page.getByRole('textbox', { name: 'Name shown' }).inputValue()).toBe('Cuisine')
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Jamais écrit non plus')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect(JSON.stringify(await settingsOf('cuisine'))).toBe(before)
    await context.close()
  })

  it('E-39 offline: the sheet stays open with its entries, Save is disabled with « You are offline. »', async () => {
    // red if Save stays enabled while the server does not answer, or the sheet closes and loses the entries
    const own = await launch('besoin-dossiers-reglages-ecran', '', 'en')
    try {
      const { context, page } = await visit(browser, own.url, '/section/garage?classic')
      await page.getByText('Outils', { exact: true }).first().waitFor({ timeout: T(30_000) })
      await openSheet(page)
      await page.getByRole('textbox', { name: 'Name shown' }).fill('Garage hors ligne')
      await own.stop()
      await page.getByText('You are offline.', { exact: false }).first().waitFor({ timeout: T(60_000) })
      expect(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true)
      expect(await page.getByRole('textbox', { name: 'Name shown' }).inputValue()).toBe('Garage hors ligne')
      await shot(page, 'e39-hors-ligne')
      await context.close()
    } finally {
      await own.stop()
    }
  })

  it('E-4 (fr): the shell names the link « Dossier » on a replacement page', async () => {
    // red if the French label is missing or the English one leaks
    const own = await launch('besoin-dossiers-reglages-ecran', '', 'fr')
    try {
      const { context, page } = await visit(browser, own.url, '/section/voyage', 'desk', 'light', 'fr')
      const link = page.getByRole('link', { name: 'Dossier', exact: true })
      await link.waitFor({ timeout: T(30_000) })
      expect(await link.getAttribute('href')).toBe('#/section/voyage?classic')
      await context.close()
    } finally {
      await own.stop()
    }
  })

  it('E-39 on a phone: the header button keeps its name without its word, the sheet rises from the bottom', async () => {
    // red if the label is not folded away at 390 px, or the sheet is not a bottom sheet
    const { context, page } = await visit(browser, instance.url, '/section/garage?classic', 'phone')
    await page.getByText('Outils', { exact: true }).first().waitFor({ timeout: T(30_000) })
    const button = page.getByRole('button', { name: 'Folder settings' })
    await button.waitFor({ timeout: T(10_000) })
    expect(((await button.innerText()) as string).trim()).toBe('')
    await button.click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ timeout: T(10_000) })
    const box = await dialog.boundingBox()
    expect(box.y + box.height).toBeGreaterThan(844 - 4)
    expect(box.width).toBeLessThanOrEqual(390)
    await context.close()
  })

  it.each([
    ['desk', 'light'],
    ['desk', 'dark'],
    ['phone', 'light'],
    ['phone', 'dark'],
  ] as const)('E-39 %s %s: the sheet draws its fields, none of them wider than the screen', async (size, theme) => {
    // red if the sheet overflows horizontally or one of the six labelled fields is missing
    const { context, page } = await visit(browser, instance.url, '/section/cuisine?classic', size, theme)
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    for (const label of ['Name shown', 'Icon', 'Colour', 'Show attachments', 'Replacement page']) await page.getByText(label, { exact: true }).first().waitFor({ timeout: T(10_000) })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
    await shot(page, `e39-${size}-${theme}`)
    await context.close()
  })
})
