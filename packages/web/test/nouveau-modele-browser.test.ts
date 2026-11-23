/**
 * Task `adestia-pages-etat-projet-feuille` (B-30, E-3 button, E-36), from its exit criterion, in a browser:
 * the button is drawn in a writable folder and only there, the sheet creates the page and E-4 opens it,
 * a taken title is refused under the field (by the index, then by the 409 when the index was stale),
 * a title with no useful character is refused at the same place, a refused write keeps sheet and title.
 * Browser on `bench/launch.mjs --seed etat-projet-feuille` (a TEST plugin ships the seeds); needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

const markdown = async (base: string, path: string): Promise<string | undefined> => {
  const r = await fetch(`${base}/api/pages/${path}`)
  return r.ok ? ((await r.json()) as { markdown: string }).markdown : undefined
}

describe.skipIf(!playwright)('New from template (E-3 button, E-36 sheet)', () => {
  let instance: Instance
  let without: Instance
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    instance = await launch('etat-projet-feuille', '', 'en')
    without = await launch('etat-projet-gabarit-sans-plugin', '', 'en')
    browser = await newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
    await without?.stop()
  })

  const visit = async (base: string, folder: string, size: Size = 'desk', before?: Parameters<typeof open>[2]['before']) => {
    const { context, page } = (await open(browser, base, { theme: 'light', size, locale: 'en', route: `/section/${folder}`, before })) as { context: any; page: any }
    await page.locator('.adestia-canvas, .adestia-shell').first().waitFor({ timeout: 20_000 })
    return { context, page }
  }
  const button = (page: any) => page.getByRole('button', { name: 'New from template' })

  it('bouton_present_dans_un_dossier_inscriptible_et_la_feuille_cree_la_page_ouverte', async () => {
    const { context, page } = await visit(instance.url, 'etat/plusieurs')
    await button(page).waitFor({ timeout: 20_000 })
    await button(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    expect(await sheet.getByRole('radio').first().getAttribute('aria-checked')).toBe('true')
    await sheet.getByRole('textbox').fill('Chantier Un')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/#\/page\/etat\/plusieurs\/chantier-un/, { timeout: 15_000 })
    const text = await markdown(instance.url, 'etat/plusieurs/chantier-un.md')
    expect(text).toBeDefined()
    expect(text).not.toMatch(/template:/)
    expect(text).toMatch(/title: Chantier Un/)
    await context.close()
  }, 90_000)

  it('titre_deja_pris_refuse_sous_le_champ_y_compris_index_perime_sans_rien_ecrire', async () => {
    const { context, page } = await visit(instance.url, 'etat/plusieurs')
    await button(page).waitFor({ timeout: 20_000 })
    await button(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    // Known to the index.
    await sheet.getByRole('textbox').fill('Sous 1')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await sheet.locator('.adestia-field__error').waitFor({ timeout: 10_000 })
    // Unknown to the index: the page lands on disk behind the shell's back.
    const stale = await fetch(`${instance.url}/api/pages/etat/plusieurs/derriere.md`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: '---\ntitle: Derriere\n---\nOriginal\n' }),
    })
    expect(stale.ok).toBe(true)
    await sheet.getByRole('textbox').fill('Derriere')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await sheet.locator('.adestia-field__error').waitFor({ timeout: 10_000 })
    expect(await sheet.getByRole('textbox').inputValue()).toBe('Derriere')
    expect(await markdown(instance.url, 'etat/plusieurs/derriere.md')).toMatch(/Original/)
    await context.close()
  }, 90_000)

  it('titre_sans_caractere_utile_refuse_sous_le_champ', async () => {
    const { context, page } = await visit(instance.url, 'etat/plusieurs')
    await button(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill('!!! ???')
    await sheet.locator('.adestia-field__error').waitFor({ timeout: 10_000 })
    expect(await sheet.getByRole('button', { name: 'Create' }).isDisabled()).toBe(true)
    await context.close()
  }, 60_000)

  it('ecriture_refusee_garde_la_feuille_et_le_titre', async () => {
    const { context, page } = await visit(instance.url, 'etat/plusieurs')
    await button(page).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio').first().waitFor({ timeout: 15_000 })
    await page.route('**/api/pages/etat/plusieurs/refusee.md', (route: any) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"no"}' }))
    await sheet.getByRole('textbox').fill('Refusee')
    await sheet.getByRole('button', { name: 'Create' }).click()
    await sheet.getByRole('alert').waitFor({ timeout: 10_000 })
    expect(await sheet.getByRole('textbox').inputValue()).toBe('Refusee')
    expect(await markdown(instance.url, 'etat/plusieurs/refusee.md')).toBeUndefined()
    await context.close()
  }, 60_000)

  it('pas_de_bouton_dans_un_dossier_en_lecture_seule', async () => {
    const { context, page } = await visit(instance.url, 'etat/plusieurs', 'desk', async (p: any) => {
      await p.route('**/api/pages/index*', async (route: any) => {
        const response = await fetch(`${instance.url}/api/pages/index`)
        const body = (await response.json()) as Record<string, unknown>
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...body, writableFolders: [] }) })
      })
    })
    await page.locator('.adestia-section, .adestia-canvas').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    expect(await button(page).count()).toBe(0)
    await context.close()
  }, 60_000)

  it('pas_de_bouton_sans_modele_livre', async () => {
    const { context, page } = await visit(without.url, 'etat/plusieurs')
    await page.waitForTimeout(2500)
    expect(await page.locator('.adestia-section, .adestia-canvas').count()).toBeGreaterThan(0)
    expect(await button(page).count()).toBe(0)
    await context.close()
  }, 60_000)
})

describe.skipIf(!playwright)('Official creations from the home (B-34, P-21 step 4, E-36, E-38)', () => {
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
  }, patience(120_000))

  it('journal_desactive_ne_figure_plus_dans_la_liste', async () => {
    const { context, page } = await home(off.url)
    const labels = await entries(page)
    expect(labels).not.toContain('Journal')
    for (const l of ['New folder', 'Task list', 'Project status']) expect(labels).toContain(l)
    await context.close()
  }, patience(120_000))

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
  }, patience(120_000))

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
  }, patience(120_000))
})
