/**
 * Task `adestia-pages-etat-projet-feuille` (B-30, E-3 button, E-36), from its exit criterion, in a browser:
 * the button is drawn in a writable folder and only there, the sheet creates the page and E-4 opens it,
 * a taken title is refused under the field (by the index, then by the 409 when the index was stale),
 * a title with no useful character is refused at the same place, a refused write keeps sheet and title.
 * Browser on `bench/launch.mjs --seed etat-projet-feuille` (a TEST plugin ships the seeds); needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'

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
