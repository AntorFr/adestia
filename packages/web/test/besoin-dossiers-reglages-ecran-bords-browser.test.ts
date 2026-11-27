/**
 * `adestia-dossiers-reglages-ecran`, third pass from its need (B-39, B-40; P-23; E-39, E-3, E-4), on the bench instance of
 * seed `besoin-dossiers-reglages-ecran-bords` (the seed of the two other files plus `verrou` and `retrait`). Expectations are
 * written by hand from docs/parcours.md (B-39, B-40, P-23) and docs/ecrans.md (E-39 « The Folder link », « The sheet »);
 * the effect is read at its door, `GET /api/pages/index` (`folderSettings`) and `PUT /api/folders/settings`.
 *
 *   E-4      the Folder link is drawn on a replacement page and on no other page, and carries the folder's name as tooltip
 *   E-4      a read-only folder: its replacement page opens, the Folder link is shown, the classic view offers no Folder settings
 *   B-39     the name shown dresses the E-3 header once saved; an empty name writes no `title` and the folder's own name returns
 *   E-39     a folder with no setting: the sheet opens on the defaults, Save is enabled, writes, and nothing visible changes
 *   P-23 f.  the right to write withdrawn while the sheet is open: « You can no longer change this folder. », Save disabled, nothing written
 */
import { chmod } from 'node:fs/promises'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(120_000) })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)
const isSettingsPut = (r: any) => r.url().includes('/api/folders/settings') && r.request().method() === 'PUT'

describe.skipIf(!playwright)('E-39, E-3, E-4: folder settings, the edges of the need (P-23)', () => {
  let instance: Instance
  let browser: BrowserOf
  const visit = (route: string) => open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', route }) as Promise<{ context: any; page: any }>
  const settingsOf = async (folder: string): Promise<Record<string, any> | undefined> => {
    const index = (await (await fetch(`${instance.url}/api/pages/index`)).json()) as { folderSettings: Record<string, Record<string, any>> }
    return index.folderSettings[folder]
  }
  const openSheet = async (page: any) => {
    await page.getByRole('button', { name: 'Folder settings' }).click({ timeout: T(30_000) })
    await page.getByRole('dialog').waitFor({ timeout: T(10_000) })
  }
  const clickSave = async (page: any) => {
    const [answer] = await Promise.all([page.waitForResponse(isSettingsPut, { timeout: T(20_000) }), page.getByRole('button', { name: 'Save', exact: true }).click()])
    return answer
  }

  beforeAll(async () => {
    instance = await launch('besoin-dossiers-reglages-ecran-bords', '', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('E-4: the Folder link is on the replacement page with the folder name as tooltip, and on no other page', async () => {
    // red if the shell draws the link on every page of a folder, or omits it on the replacement page opened by its own address
    const { context, page } = await visit('/page/cuisine/plan')
    await page.getByText('Quatre meubles hauts, deux bas.', { exact: false }).first().waitFor({ timeout: T(30_000) })
    const link = page.getByRole('link', { name: 'Folder', exact: true })
    await link.waitFor({ timeout: T(30_000) })
    expect(await link.count()).toBe(1)
    expect(await link.getAttribute('href')).toBe('#/section/cuisine?classic')
    expect(await link.getAttribute('title')).toBe('Cuisine')

    await page.goto(`${instance.url}/#/page/cuisine/autre`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Texte.', { exact: true }).first().waitFor({ timeout: T(30_000) })
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)

    await page.goto(`${instance.url}/#/page/garage/etabli`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Texte.', { exact: true }).first().waitFor({ timeout: T(30_000) })
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    await context.close()
  })

  it('E-4: in a read-only folder the replacement page opens with the Folder link, and the classic view offers no Folder settings', async () => {
    // red if the link is hidden where the folder cannot be written, or the settings button is drawn there
    const { context, page } = await visit('/section/verrou')
    await page.getByText('Texte de la page du dossier verrouillé.', { exact: false }).first().waitFor({ timeout: T(30_000) })
    const link = page.getByRole('link', { name: 'Folder', exact: true })
    expect(await link.getAttribute('href')).toBe('#/section/verrou?classic')
    expect(await page.getByRole('button', { name: 'Folder settings' }).count()).toBe(0)
    await link.click()
    await page.getByText('Note du verrou', { exact: true }).first().waitFor({ timeout: T(20_000) })
    expect(await page.evaluate(() => location.hash)).toBe('#/section/verrou?classic')
    expect(await page.getByRole('button', { name: 'Folder settings' }).count()).toBe(0)
    await context.close()
  })

  it('B-39: the name shown dresses the E-3 header once saved, and an empty name writes no title so the folder name returns', async () => {
    // red if the name is not written as `title`, is not shown, or an emptied field leaves a title behind
    const { context, page } = await visit('/section/garage')
    await page.getByText('Outils', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Atelier du garage')
    expect((await clickSave(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect(await settingsOf('garage')).toMatchObject({ title: 'Atelier du garage' })
    await page.getByRole('heading', { name: 'Atelier du garage' }).first().waitFor({ timeout: T(20_000) })

    await openSheet(page)
    expect(await page.getByRole('textbox', { name: 'Name shown' }).inputValue()).toBe('Atelier du garage')
    await page.getByRole('textbox', { name: 'Name shown' }).fill('')
    expect((await clickSave(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect((await settingsOf('garage')) ?? {}).not.toHaveProperty('title')
    await page.getByRole('heading', { name: 'Garage', exact: true }).first().waitFor({ timeout: T(20_000) })
    expect(await page.getByRole('heading', { name: 'Atelier du garage' }).count()).toBe(0)
    await context.close()
  })

  it('E-39: a folder with no setting opens the sheet on the defaults, and saving them changes nothing visible', async () => {
    // red if the defaults differ (icon, colour, attachments, page), Save is disabled, or saving the defaults hides something
    const { context, page } = await visit('/section/chaudiere')
    await page.getByText('Résumé chaudière', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('facture.pdf', { exact: false }).first().waitFor({ timeout: T(20_000) })
    await openSheet(page)
    expect(await page.getByRole('radiogroup', { name: 'Icon' }).getByRole('radio', { name: 'None' }).isChecked()).toBe(true)
    expect(await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'None' }).isChecked()).toBe(true)
    expect(await page.getByRole('switch', { name: 'Show attachments' }).isChecked()).toBe(true)
    expect(await page.getByLabel('Replacement page').inputValue()).toBe('')
    expect(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled()).toBe(true)
    expect((await clickSave(page)).status()).toBe(200)
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: T(10_000) })
    expect(await page.evaluate(() => location.hash)).toBe('#/section/chaudiere')
    await page.getByText('Entretien', { exact: true }).first().waitFor({ timeout: T(10_000) })
    await page.getByText('facture.pdf', { exact: false }).first().waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('link', { name: 'Folder', exact: true }).count()).toBe(0)
    await context.close()
  })

  it('P-23 failure: the right to write withdrawn while the sheet is open says so, disables Save and writes nothing', async () => {
    // red if the server writes anyway, or the sheet shows another line, or Save stays enabled
    const dir = (await (await fetch(`${instance.url}/api/files/retrait/chemin.txt`)).text()).trim()
    expect(dir).toBeTruthy()
    const { context, page } = await visit('/section/retrait')
    await page.getByText('Fiche du retrait', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await openSheet(page)
    await page.getByRole('textbox', { name: 'Name shown' }).fill('Jamais écrit')
    await chmod(dir, 0o555)
    try {
      const answer = await clickSave(page)
      expect(answer.status()).toBe(403)
      await page.getByText('You can no longer change this folder.', { exact: false }).first().waitFor({ timeout: T(10_000) })
      expect(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true)
      expect(await page.getByRole('dialog').count()).toBe(1)
      expect(await page.getByRole('textbox', { name: 'Name shown' }).inputValue()).toBe('Jamais écrit')
      expect(await settingsOf('retrait')).toBeUndefined()
    } finally {
      await chmod(dir, 0o755)
      await context.close()
    }
  })
})
