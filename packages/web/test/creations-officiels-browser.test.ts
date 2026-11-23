/**
 * The + of the home with the official plugins on (B-34, P-21 step 4, E-36, E-38), through a driven browser on
 * the bench instance with the ten bundled plugins (`plugins` seed). Expectations are from the need: the list
 * names New folder, Journal, Task list, Project status; Task list opens E-36 with the Folder field and writes
 * a page whose checklist adds a task in the folder of the page; Journal writes a cover typed journal; with
 * Journal off it leaves the list. Skipped without Playwright; needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(120_000) })

const markdown = async (base: string, path: string): Promise<string | undefined> => {
  const r = await fetch(`${base}/api/pages/${path}`)
  return r.ok ? ((await r.json()) as { markdown: string }).markdown : undefined
}

describe.skipIf(!playwright)('official creations from the home', () => {
  let on: Instance
  let off: Instance
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    on = await launch('plugins', '', 'en')
    off = await launch('officiels-sans-journal', '', 'en')
    browser = await newBrowser()
  }, patience(240_000))
  afterAll(async () => {
    await browser?.close()
    await on?.stop()
    await off?.stop()
  })

  const home = async (base: string) => {
    const { context, page } = (await open(browser, base, { theme: 'light', size: 'desk', locale: 'en', route: '/' })) as { context: any; page: any }
    await page.getByRole('button', { name: 'New…', exact: true }).waitFor({ timeout: patience(30_000) })
    return { context, page }
  }
  const entries = async (page: any): Promise<string[]> => {
    await page.getByRole('button', { name: 'New…', exact: true }).click()
    const list = page.getByRole('dialog').or(page.getByRole('menu')).first()
    await list.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    return (await list.getByRole('button').or(list.getByRole('menuitem')).allInnerTexts()).map((t: string) => t.split('\n')[0]!.trim())
  }

  it('le_plus_liste_new_folder_journal_task_list_project_status_et_rien_d_autre', async () => {
    const { context, page } = await home(on.url)
    const labels = await entries(page)
    for (const l of ['New folder', 'Journal', 'Task list', 'Project status']) expect(labels).toContain(l)
    expect(labels.filter((l) => l !== '')).toHaveLength(4)
    await context.close()
  })

  it('journal_desactive_ne_figure_plus_dans_la_liste', async () => {
    const { context, page } = await home(off.url)
    const labels = await entries(page)
    expect(labels).not.toContain('Journal')
    for (const l of ['New folder', 'Task list', 'Project status']) expect(labels).toContain(l)
    await context.close()
  })

  it('task_list_depuis_l_accueil_ouvre_e36_avec_le_champ_folder_et_la_page_ajoute_une_tache_dans_son_dossier', async () => {
    const { context, page } = await home(on.url)
    await entries(page)
    await page.locator('.adestia-action-row', { hasText: 'Task list' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    expect(await sheet.getByText('Folder', { exact: true }).count()).toBeGreaterThan(0)
    // The root comes first and is checked; file the page in a folder, so the task has a folder to follow.
    const select = sheet.locator('select.adestia-select')
    expect(await select.locator('option').first().getAttribute('value')).toBe('')
    expect(await select.locator('option').count()).toBeGreaterThan(1)
    await select.selectOption({ index: 1 })
    await sheet.getByRole('textbox').first().fill('Courses du soir')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/#\/page\/.*courses-du-soir/, { timeout: 20_000 })
    const path = new URL(page.url()).hash.replace(/^#\/page\//, '')
    const text = await markdown(on.url, `${path}.md`)
    expect(text).toMatch(/:::checklist/)
    expect(text).not.toMatch(/^template:/m)
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const field = page.locator('.todo-block__add input').first()
    await field.waitFor({ timeout: 20_000 })
    await field.fill('Acheter du pain')
    await field.press('Enter')
    await page.waitForTimeout(3000)
    const index = (await (await fetch(`${on.url}/api/pages/index`)).json()) as { entries: { path: string }[] }
    const made = index.entries.filter((p) => /acheter-du-pain/.test(p.path))
    expect(made.length).toBe(1)
    expect(folder).not.toBe('')
    expect(made[0]!.path.startsWith(folder)).toBe(true)
    await context.close()
  })

  it('journal_ecrit_une_page_de_couverture_typee_journal_sans_creer_de_dossier', async () => {
    const { context, page } = await home(on.url)
    const before = ((await (await fetch(`${on.url}/api/pages/index`)).json()) as { entries: { path: string }[] }).entries.length
    await entries(page)
    await page.locator('.adestia-action-row', { hasText: 'Journal' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').first().fill('Carnet de bord')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/#\/page\/.*carnet-de-bord/, { timeout: 20_000 })
    const path = new URL(page.url()).hash.replace(/^#\/page\//, '')
    expect(await markdown(on.url, `${path}.md`)).toMatch(/^type: journal$/m)
    const after = ((await (await fetch(`${on.url}/api/pages/index`)).json()) as { entries: { path: string }[] }).entries
    expect(after.length).toBe(before + 1)
    await context.close()
  })
})
