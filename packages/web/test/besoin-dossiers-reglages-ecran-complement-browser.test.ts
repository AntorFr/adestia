/**
 * `adestia-dossiers-reglages-ecran`, second pass from its need (B-39, B-40; P-23 failure paths; E-39), on the bench
 * instance of seed `besoin-dossiers-reglages-ecran` (same seed as besoin-dossiers-reglages-ecran-browser.test.ts, one
 * instance of its own here so the cases do not depend on each other's writes). Expectations are written by hand from
 * docs/parcours.md (P-23), docs/ecrans.md (E-39 « a single Tab stop, arrows choose », twelve hues plus None, six
 * pictograms plus None) and the sheet's criterion; the effect is read at its door (`GET /api/pages/index`).
 *
 *   P-23 f.  the settings changed meanwhile: Save says so, Reload starts again from what is saved, then Save writes
 *   P-23 f.  a folder with no page: the choice is disabled and says so, the other settings save
 *   P-23 f.  the replacement page cannot be read: E-8 error, the Folder link still leads to the classic view
 *   E-39     radiogroups: seven icon radios, thirteen colour radios, one Tab stop each, arrows choose
 *   B-39     attachments off then on again: the brick returns and the file does not keep `attachments: false`
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(120_000) })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)
const isSettingsPut = (r: any) => r.url().includes('/api/folders/settings') && r.request().method() === 'PUT'

describe.skipIf(!playwright)('E-39, E-3, E-4: folder settings, failure paths and bords (P-23)', () => {
  let instance: Instance
  let browser: BrowserOf
  const visit = (route: string) => open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', route }) as Promise<{ context: any; page: any }>
  const entryOf = async (folder: string): Promise<Record<string, any> | undefined> => {
    const index = (await (await fetch(`${instance.url}/api/pages/index`)).json()) as { folderSettings: Record<string, Record<string, any>> }
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

  it('P-23 failure: settings changed meanwhile: Save says so, Reload restarts from what is saved, then Save writes', async () => {
    // red if the stale write overwrites the other change, or Reload keeps the typed entries
    const { context, page } = await visit('/section/cuisine?classic')
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Ma cuisine')
    const seen = await entryOf('cuisine')
    const meanwhile = await fetch(`${instance.url}/api/folders/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'cuisine', settings: { title: 'Ailleurs', page: 'plan.md' }, revision: seen?.revision }),
    })
    expect(meanwhile.status).toBe(200)
    expect((await save(page)).status()).toBe(409)
    await page.getByText(/The folder settings changed\./).waitFor({ timeout: T(10_000) })
    expect((await entryOf('cuisine'))?.title).toBe('Ailleurs')
    await page.getByRole('button', { name: 'Reload' }).click()
    await page.getByText(/The folder settings changed\./).waitFor({ state: 'detached', timeout: T(10_000) })
    await page.waitForFunction(() => (document.querySelector('[role=dialog] input[type=text], [role=dialog] input:not([type])') as HTMLInputElement | null)?.value === 'Ailleurs', undefined, { timeout: T(10_000) })
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Ma cuisine')
    expect((await save(page)).status()).toBe(200)
    expect((await entryOf('cuisine'))?.title).toBe('Ma cuisine')
    await context.close()
  })

  it('P-23 failure: a folder holding no page disables the replacement choice and says so, and the other settings save', async () => {
    // red if the choice stays usable, or the empty folder cannot save its colour
    const made = await fetch(`${instance.url}/api/folders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'vide' }) })
    expect(made.status).toBeLessThan(300)
    const { context, page } = await visit('/section/vide')
    await openSheet(page)
    expect(await page.getByLabel('Replacement page').isDisabled()).toBe(true)
    await page.getByText('This folder holds no page yet.', { exact: true }).waitFor({ timeout: T(10_000) })
    await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'Green', exact: true }).click()
    expect((await save(page)).status()).toBe(200)
    const saved = await entryOf('vide')
    expect(saved).toMatchObject({ couleur: 'vert' })
    expect(saved).not.toHaveProperty('page')
    await context.close()
  })

  it('P-23 failure: a replacement page that cannot be read shows E-8 with the Folder link, which leads to the classic view', async () => {
    // red if the page error hides the link, or the folder falls back silently to the classic view
    const { context, page } = await visit('/section/cuisine')
    await page.route('**/api/pages/cuisine/plan.md*', (route: any) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    await page.goto(`${instance.url}/#/`, { waitUntil: 'domcontentloaded' })
    await page.goto(`${instance.url}/#/section/cuisine`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const link = page.getByRole('link', { name: 'Folder', exact: true })
    await link.waitFor({ timeout: T(30_000) })
    expect(await link.getAttribute('href')).toBe('#/section/cuisine?classic')
    expect(await page.getByText('Quatre meubles hauts, deux bas.', { exact: false }).count()).toBe(0)
    expect(await page.getByText('Autre fiche', { exact: true }).count()).toBe(0)
    await page.unroute('**/api/pages/cuisine/plan.md*')
    await link.click()
    await page.getByText('Autre fiche', { exact: true }).first().waitFor({ timeout: T(20_000) })
    await context.close()
  })

  it('E-39: the icon and colour pickers are radiogroups with None first, one Tab stop, and arrows choose', async () => {
    // red if a picker offers another count, tabs through every swatch, or ignores the arrows
    const { context, page } = await visit('/section/garage?classic')
    await page.getByText('Outils', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    const icons = page.getByRole('radiogroup', { name: 'Icon' }).getByRole('radio')
    const hues = page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio')
    expect(await icons.count()).toBe(7)
    expect(await hues.count()).toBe(13)
    for (const group of [icons, hues]) {
      const stops = await group.evaluateAll((els: HTMLElement[]) => els.filter((el) => el.tabIndex >= 0).length)
      expect(stops).toBe(1)
    }
    expect(await icons.first().getAttribute('aria-checked')).toBe('true')
    expect(await page.getByRole('radiogroup', { name: 'Icon' }).getByRole('radio', { name: 'None', exact: true }).getAttribute('aria-checked')).toBe('true')
    await icons.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => icons.nth(1).getAttribute('aria-checked'), { timeout: T(10_000) }).toBe('true')
    expect(await icons.first().getAttribute('aria-checked')).toBe('false')
    expect(await icons.nth(1).getAttribute('aria-checked')).toBe('true')
    await context.close()
  })

  it('B-39: attachments switched off then on again bring the brick back and leave no `attachments: false`', async () => {
    // red if the switch cannot be turned back on, or the file keeps false
    const { context, page } = await visit('/section/chaudiere?classic')
    await page.getByText('facture.pdf', { exact: false }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    await page.getByRole('switch', { name: 'Show attachments' }).click()
    expect((await save(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect((await entryOf('chaudiere'))?.attachments).toBe(false)
    await page.getByText('facture.pdf', { exact: false }).waitFor({ state: 'detached', timeout: T(10_000) })
    await openSheet(page)
    expect(await page.getByRole('switch', { name: 'Show attachments' }).isChecked()).toBe(false)
    await page.getByRole('switch', { name: 'Show attachments' }).click()
    expect((await save(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect((await entryOf('chaudiere'))?.attachments).not.toBe(false)
    await page.getByText('facture.pdf', { exact: false }).first().waitFor({ timeout: T(10_000) })
    await context.close()
  })
})
