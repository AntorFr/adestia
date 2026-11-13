/**
 * `adestia-pages-blocs-formulaires`, recette depuis le besoin (B-25, B-26, B-27; P-18; E-6, E-35), seed
 * `recette-formulaires`. Les attendus sont les fichiers écrits à la main au format d'avant l'epic, dans
 * `fixtures/recette-formulaires/` (comparés octet pour octet). Needs Playwright and Chromium, and `npm run build`.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const here = dirname(fileURLToPath(import.meta.url))
const ref = (name: string) => readFileSync(join(here, 'fixtures', 'recette-formulaires', name), 'utf8')

async function editing(browser: BrowserOf, base: string, slug: string, locale: 'en' | 'fr' = 'en') {
  const { context, page } = (await open(browser, base, { theme: 'light', size: 'desk', locale, route: `/page/${slug}` })) as { context: any; page: any }
  await page.getByRole('button', { name: locale === 'fr' ? 'Modifier' : 'Edit', exact: true }).click()
  await page.getByRole('button', { name: locale === 'fr' ? 'Terminé' : 'Done', exact: true }).waitFor({ timeout: 20_000 })
  if (locale === 'fr') await page.locator('.adestia-edblock').first().waitFor({ timeout: 20_000 })
  else await page.getByRole('button', { name: 'Add block', exact: true }).waitFor({ timeout: 20_000 })
  return { context, page }
}
const fileOf = (page: any, slug: string): Promise<string> =>
  page.evaluate(async (s: string) => (await (await fetch(`/api/pages/${s}.md`)).json()).markdown, slug)
/** The page file once the server holds the wanted text (a save is the signal, not a delay). */
async function savedAs(page: any, slug: string, wanted: string): Promise<string> {
  let text = ''
  for (let i = 0; i < 60; i++) {
    text = await fileOf(page, slug)
    if (text === wanted) break
    await page.waitForTimeout(500)
  }
  return text
}
async function openSettings(page: any) {
  await page.locator('.adestia-edblock').first().hover()
  await page.getByRole('button', { name: /^(Block settings|Réglages du bloc)$/ }).first().click()
  return page.getByRole('dialog', { name: /^(Block settings|Réglages du bloc)/ })
}
async function openForm(page: any, fr = false) {
  const settings = await openSettings(page)
  await settings.getByRole('button', { name: fr ? 'Modifier les données' : 'Edit data', exact: true }).click()
  const form = page.getByRole('dialog', { name: /data|données/ })
  await form.waitFor({ timeout: 10_000 })
  return form
}
const rows = (form: any) => form.locator('[data-row]')
/** Done, once the block behind shows the applied change (`shows`: a regexp its text must match). */
async function done(page: any, fr = false, shows?: RegExp) {
  if (shows)
    await page.waitForFunction(
      ([source]: [string]) => new RegExp(source).test(document.querySelector('.adestia-edblock__preview')?.textContent ?? ''),
      [shows.source],
      { timeout: 10_000 },
    )
  // the editor's own signal that the file is written: its status line says so
  await page.getByText(fr ? /^Enregistré/ : /^Saved/).first().waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: fr ? 'Terminé' : 'Done', exact: true }).click()
}
/** Done pressed at once, with no wait for the save. */
async function doneAtOnce(page: any) {
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}
async function insert(page: any, card: string, variant?: string) {
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
  if (variant)
    await page.locator('.adestia-blockcell', { has: page.getByRole('option', { name: card, exact: true }) }).getByRole('radio', { name: variant }).click()
  await page.getByRole('option', { name: card, exact: true }).click()
}

describe.skipIf(!playwright)('recette formulaires, depuis le besoin', () => {
  let instance: Instance
  let instanceFr: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('recette-formulaires', '', 'en')
    instanceFr = await launch('recette-formulaires', '', 'fr')
    browser = await newBrowser()
  }, 120_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
    await instanceFr?.stop()
  })
  const go = (slug: string, locale: 'en' | 'fr' = 'en') => editing(browser, (locale === 'fr' ? instanceFr : instance).url, slug, locale)

  // ── B-25 / B-26 : réglages et variantes ─────────────────────────────────
  it('figures_choisir_inline_redessine_en_place_et_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-chiffres-variante')
    const settings = await openSettings(page)
    expect(await page.locator('.adestia-edblock__preview .adestia-figures--inline').count()).toBe(0)
    await settings.getByRole('radio', { name: 'inline' }).click()
    await page.locator('.adestia-edblock__preview .adestia-figures--inline').waitFor({ timeout: 10_000 })
    expect(await page.getByRole('heading', { name: 'Chiffres du lot' }).count()).toBe(1) // same page, nothing reloaded
    await done(page)
    // The attribute may be written quoted (`view="inline"`) or bare: the need does not say (a gap), both read the same.
    await savedAs(page, 'rf-chiffres-variante', ref('figures-inline.md').replace('view=inline', 'view="inline"'))
    expect((await fileOf(page, 'rf-chiffres-variante')).replace('view="inline"', 'view=inline')).toBe(ref('figures-inline.md'))
    await context.close()
  }, 120_000)

  it('figures_reglages_sans_attribut_brut_et_variantes_en_images', async () => {
    const { context, page } = await go('rf-chiffres-defaut')
    const settings = await openSettings(page)
    expect(await settings.getByRole('radio').count()).toBeGreaterThanOrEqual(2)
    expect(await settings.getByRole('radio', { name: 'tiles' }).getAttribute('aria-checked')).toBe('true')
    expect(await settings.getByText('Other attributes').count()).toBe(0)
    expect(await settings.getByText('Show a box').count()).toBe(1)
    await context.close()
  }, 120_000)

  it('figures_rechoisir_la_variante_en_vigueur_n_ecrit_rien', async () => {
    const { context, page } = await go('rf-chiffres-defaut')
    const settings = await openSettings(page)
    await settings.getByRole('radio', { name: 'tiles' }).click()
    await page.waitForTimeout(3500) // longer than the editor's autosave delay (about 2 s)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForTimeout(1500)
    expect(await fileOf(page, 'rf-chiffres-defaut')).toBe(ref('figures-avant.md'))
    await context.close()
  }, 120_000)

  it('reglages_en_francais_sans_mot_anglais_ni_identifiant', async () => {
    const { context, page } = await go('rf-chiffres-fr', 'fr')
    const settings = await openSettings(page)
    const text: string = await settings.innerText()
    for (const english of ['Layout', 'Title and icon', 'Show a box', 'Edit data', 'Width', 'Look']) expect(text, english).not.toContain(english)
    expect(await settings.getByRole('button', { name: 'Modifier les données', exact: true }).count()).toBe(1)
    await context.close()
  }, 120_000)

  // ── B-27 : formulaire figures ───────────────────────────────────────────
  it('figures_ajouter_une_ligne_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-chiffres-ajout')
    const form = await openForm(page)
    expect(await rows(form).count()).toBe(2)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    expect(await rows(form).count()).toBe(3)
    await form.getByRole('textbox', { name: 'Label' }).nth(2).fill('Avancement')
    await form.getByRole('textbox', { name: 'Value' }).nth(2).fill('62 %')
    await form.getByRole('textbox', { name: 'Caption' }).nth(2).fill('8 lots sur 13')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Avancement/)
    expect(await savedAs(page, 'rf-chiffres-ajout', ref('figures-ajout.md'))).toBe(ref('figures-ajout.md'))
    await context.close()
  }, 120_000)

  it('figures_reordonner_une_ligne_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-chiffres-ordre')
    const form = await openForm(page)
    await rows(form).nth(1).getByRole('button', { name: 'Move up' }).click()
    expect(await rows(form).nth(0).getByRole('textbox').first().inputValue()).toBe('Retards')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Retards[\s\S]*Budget/)
    expect(await savedAs(page, 'rf-chiffres-ordre', ref('figures-ordre.md'))).toBe(ref('figures-ordre.md'))
    await context.close()
  }, 120_000)

  it('figures_supprimer_une_ligne_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-chiffres-suppr')
    const form = await openForm(page)
    await rows(form).nth(0).getByRole('button', { name: 'Remove row' }).click()
    expect(await rows(form).count()).toBe(1)
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /^(?![\s\S]*Budget)[\s\S]*Retards/)
    expect(await savedAs(page, 'rf-chiffres-suppr', ref('figures-suppr.md'))).toBe(ref('figures-suppr.md'))
    await context.close()
  }, 120_000)

  it('figures_nombre_invalide_refuse_sous_son_champ_et_annuler_ne_change_pas_le_fichier', async () => {
    const { context, page } = await go('rf-chiffres-invalide')
    const form = await openForm(page)
    await form.getByRole('textbox', { name: 'Value' }).nth(1).fill('trois')
    await form.getByText('Write a number, with its unit if any').first().waitFor({ timeout: 5_000 })
    expect(await form.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
    // the message is a sibling inside the same row as the refused field, not another row's
    expect(await rows(form).nth(1).getByText('Write a number, with its unit if any').count()).toBe(1)
    expect(await rows(form).nth(0).getByText('Write a number, with its unit if any').count()).toBe(0)
    // a number with its unit is accepted
    await form.getByRole('textbox', { name: 'Value' }).nth(1).fill('14 of 37')
    expect(await form.getByText('Write a number, with its unit if any').count()).toBe(0)
    expect(await form.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(false)
    // an empty label is refused too
    await form.getByRole('textbox', { name: 'Label' }).nth(0).fill('')
    await form.getByText('Fill this in').first().waitFor({ timeout: 5_000 })
    expect(await form.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
    await form.getByRole('button', { name: 'Cancel', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForTimeout(3500) // longer than the editor's autosave delay (about 2 s)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForTimeout(1500)
    expect(await fileOf(page, 'rf-chiffres-invalide')).toBe(ref('figures-avant.md'))
    await context.close()
  }, 120_000)

  it('figures_refus_en_francais_sous_le_champ', async () => {
    const { context, page } = await go('rf-chiffres-fr', 'fr')
    const form = await openForm(page, true)
    await form.getByRole('textbox', { name: 'Valeur' }).nth(1).fill('trois')
    await form.getByText('Écris un nombre, avec son unité s’il y en a une').first().waitFor({ timeout: 5_000 })
    expect(await form.getByRole('button', { name: 'Appliquer', exact: true }).isDisabled()).toBe(true)
    await context.close()
  }, 120_000)

  it('figures_terminer_aussitot_apres_appliquer_ne_perd_pas_la_modification', async () => {
    const { context, page } = await go('rf-chiffres-aussitot')
    const form = await openForm(page)
    await rows(form).nth(0).getByRole('button', { name: 'Remove row' }).click()
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await page.waitForFunction(() => !/Budget/.test(document.querySelector('.adestia-edblock__preview')?.textContent ?? ''), null, { timeout: 10_000 })
    await doneAtOnce(page)
    expect(await savedAs(page, 'rf-chiffres-aussitot', ref('figures-suppr.md'))).toBe(ref('figures-suppr.md'))
    await context.close()
  }, 120_000)

  // ── B-27 : Raw ──────────────────────────────────────────────────────────
  it('raw_montre_les_lignes_du_fichier_et_les_ecrire_donne_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-chiffres-raw')
    const form = await openForm(page)
    await form.getByRole('button', { name: 'Raw', exact: true }).click()
    const area = form.locator('textarea')
    expect(await area.inputValue()).toBe('- Budget: 12 000 € — validé\n- Retards: 3')
    await area.fill('- Budget: 12 000 € — validé\n- Retards: 3\n- Avancement: 62 % — 8 lots sur 13')
    // back to the form: the same line is a row
    await form.getByRole('button', { name: 'Raw', exact: true }).click()
    expect(await rows(form).count()).toBe(3)
    expect(await rows(form).nth(2).getByRole('textbox').first().inputValue()).toBe('Avancement')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page)
    expect(await savedAs(page, 'rf-chiffres-raw', ref('figures-ajout.md'))).toBe(ref('figures-ajout.md'))
    await context.close()
  }, 120_000)

  it('raw_apres_edition_du_formulaire_dit_les_memes_lignes', async () => {
    const { context, page } = await go('rf-chiffres-lecture')
    const form = await openForm(page)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    await form.getByRole('textbox', { name: 'Label' }).nth(2).fill('Avancement')
    await form.getByRole('textbox', { name: 'Value' }).nth(2).fill('62 %')
    await form.getByRole('textbox', { name: 'Caption' }).nth(2).fill('8 lots sur 13')
    await form.getByRole('button', { name: 'Raw', exact: true }).click()
    expect(await form.locator('textarea').inputValue()).toBe('- Budget: 12 000 € — validé\n- Retards: 3\n- Avancement: 62 % — 8 lots sur 13')
    await context.close()
  }, 120_000)

  // ── B-27 : timeline sur une page project-management ─────────────────────
  it('timeline_ajouter_une_ligne_avec_debut_et_echeance_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-planning-ajout')
    const form = await openForm(page)
    expect(await rows(form).count()).toBe(2)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    const last = rows(form).nth(2)
    await last.getByRole('textbox').nth(0).fill('Livraison')
    await last.getByRole('textbox').nth(1).fill('2026-07-01')
    await last.getByRole('textbox').nth(2).fill('2026-09-30')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Livraison/)
    expect(await savedAs(page, 'rf-planning-ajout', ref('timeline-ajout.md'))).toBe(ref('timeline-ajout.md'))
    await context.close()
  }, 120_000)

  it('timeline_echeance_avant_debut_refusee_sous_l_echeance', async () => {
    const { context, page } = await go('rf-planning-ajout')
    const form = await openForm(page)
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    const last = rows(form).nth(2)
    await last.getByRole('textbox').nth(0).fill('Livraison')
    await last.getByRole('textbox').nth(1).fill('2026-09-30')
    await last.getByRole('textbox').nth(2).fill('2026-07-01')
    await last.getByText('Due is before start').waitFor({ timeout: 5_000 })
    expect(await form.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
    await context.close()
  }, 120_000)

  it('timeline_raw_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await go('rf-planning-raw')
    const form = await openForm(page)
    await form.getByRole('button', { name: 'Raw', exact: true }).click()
    expect(await form.locator('textarea').inputValue()).toBe('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01')
    await form.locator('textarea').fill('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n- Livraison: 2026-07-01 → 2026-09-30')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Livraison/)
    expect(await savedAs(page, 'rf-planning-raw', ref('timeline-ajout.md'))).toBe(ref('timeline-ajout.md'))
    await context.close()
  }, 120_000)

  // ── B-24 / B-27 : la galerie ouvre le formulaire ────────────────────────
  it('galerie_la_carte_figures_montre_ses_variantes', async () => {
    const { context, page } = await go('rf-vide-figures')
    await page.getByRole('button', { name: 'Add block', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
    const cell = page.locator('.adestia-blockcell', { has: page.getByRole('option', { name: 'Figures', exact: true }) })
    expect(await cell.getByRole('radio').count()).toBe(2)
    await context.close()
  }, 120_000)

  it('galerie_inserer_figures_ouvre_son_formulaire_sur_une_ligne_vide_et_l_ecrit', async () => {
    const { context, page } = await go('rf-vide-figures')
    await insert(page, 'Figures')
    const form = page.getByRole('dialog', { name: /data/ })
    await form.waitFor({ timeout: 10_000 })
    expect(await page.getByRole('dialog', { name: 'Add block' }).count()).toBe(0)
    expect(await rows(form).count()).toBe(1)
    await form.getByRole('textbox', { name: 'Label' }).fill('Total')
    await form.getByRole('textbox', { name: 'Value' }).fill('5')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Total/)
    let text = ''
    for (let i = 0; i < 40 && !text.includes('- Total: 5'); i++) {
      await page.waitForTimeout(500)
      text = await fileOf(page, 'rf-vide-figures')
    }
    expect(text).toContain(':::figures\n- Total: 5\n:::')
    expect(text).not.toContain('view=')
    await context.close()
  }, 120_000)

  it('galerie_figures_en_variante_inline_ecrit_view_inline', async () => {
    const { context, page } = await go('rf-vide-figures-inline')
    await insert(page, 'Figures', 'inline')
    const form = page.getByRole('dialog', { name: /data/ })
    await form.waitFor({ timeout: 10_000 })
    await form.getByRole('textbox', { name: 'Label' }).fill('Total')
    await form.getByRole('textbox', { name: 'Value' }).fill('5')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Total/)
    let text = ''
    for (let i = 0; i < 40 && !text.includes('- Total: 5'); i++) {
      await page.waitForTimeout(500)
      text = await fileOf(page, 'rf-vide-figures-inline')
    }
    expect(text).toMatch(/:::figures\{view="?inline"?\}\n- Total: 5\n:::/)
    await context.close()
  }, 120_000)

  it('projet_inserer_timeline_ouvre_son_formulaire_edit_data_ajoute_une_ligne_et_raw_ecrit_le_meme_fichier', async () => {
    const { context, page } = await go('rf-vide-pm')
    await insert(page, 'Timeline')
    const form = page.getByRole('dialog', { name: /data/ })
    await form.waitFor({ timeout: 10_000 })
    expect(await rows(form).count()).toBe(1)
    await form.getByRole('button', { name: 'Raw', exact: true }).click()
    await form.locator('textarea').fill('- Cadrage: 2026-01-15 → 2026-03-01')
    await form.getByRole('button', { name: 'Apply', exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 10_000 })
    // Edit data, from the block's settings, adds a line
    const again = await openForm(page)
    expect(await rows(again).count()).toBe(1)
    await again.getByRole('button', { name: 'Add', exact: true }).click()
    const last = rows(again).nth(1)
    await last.getByRole('textbox').nth(0).fill('Recette')
    await last.getByRole('textbox').nth(2).fill('2026-06-01')
    await again.getByRole('button', { name: 'Apply', exact: true }).click()
    await again.waitFor({ state: 'detached', timeout: 10_000 })
    await done(page, false, /Recette/)
    let text = ''
    for (let i = 0; i < 40 && !text.includes('- Recette'); i++) {
      await page.waitForTimeout(500)
      text = await fileOf(page, 'rf-vide-pm')
    }
    expect(text).toContain(':::timeline\n- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n:::')
    await context.close()
  }, 120_000)
})
