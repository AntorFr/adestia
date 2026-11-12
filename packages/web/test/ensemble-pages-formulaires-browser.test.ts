/**
 * `adestia-pages-blocs-formulaires`, seen from its need (B-25, B-26, B-27; P-18; E-6, E-34, E-35; AD-33, AD-35)
 * through a driven browser on the bench instance (seed `besoin-pages-formulaires`, scripted engine). Every expected
 * word and every expected byte is written by hand from docs/parcours.md and docs/ecrans.md; the reference files
 * (`fixtures/besoin-formulaires/*.md`) are written by hand in the format the product wrote before the epic
 * (`- Label: value — caption`, `- Phase: 2026-01-15 → 2026-03-01`), not recorded from a run.
 *
 * PLAN (besoin · cas · attendu)
 *  B-26 nominal   figures settings, choose « inline »            → the block redraws in place (no bar), file says view=inline
 *  B-26 bords     choose the variant already in force            → nothing is written
 *  B-26 bords     figures with an unknown `view`                 → drawn as tiles, no error (AD-35)
 *  B-26 exclusion no stray attribute listed by default           → no « Other attributes » heading; fr shows no English group name
 *  B-26 exclusion timeline settings                              → no Look group (its variants are tranche 4's)
 *  B-27 nominal   Edit data, add a figure, Apply                 → file == figures-apres.md, byte for byte (en and fr)
 *  B-27 nominal   Edit data, add a phase on a timeline           → file == timeline-apres.md, byte for byte
 *  B-27 nominal   Raw shows the lines the rows say; typing a line there and Apply → same bytes as the form
 *  B-27 bords     reorder, remove, remove all, cancel, Escape    → file as the rows say / unchanged
 *  B-27 échec     « three » as a value, a row with no label, due before start → refused under the field, Apply disabled
 *  B-27 exclusion a line the form cannot read                    → « Kept as written », written back where it was
 *  B-27 list      add a row to a written list                    → file == liste-apres.md
 *  B-24 / P-17.4  gallery: Figures opens E-35 on one empty row; a variant picked on the card is inserted;
 *                 Callout opens no form; on a project page Timeline opens E-35, Edit data adds a line, Raw writes the same file
 *
 * Needs Playwright and Chromium (skipped without) and `npm run build`. `FORMULAIRES_SHOTS=<dir>` writes one capture per state.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const SHOTS = process.env.FORMULAIRES_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ref = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/besoin-formulaires/${name}`, import.meta.url)), 'utf8')

const W = {
  en: { edit: 'Edit', done: 'Done', settings: 'Block settings', data: 'Edit data', raw: 'Raw', apply: 'Apply', cancel: 'Cancel', add: 'Add', remove: 'Remove row' },
  fr: { edit: 'Modifier', done: 'Terminé', settings: 'Réglages du bloc', data: 'Modifier les données', raw: 'Brut', apply: 'Appliquer', cancel: 'Annuler', add: 'Ajouter', remove: 'Retirer la ligne' },
} as const
type Locale = keyof typeof W

const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

describe.skipIf(!playwright)('adestia-pages-blocs-formulaires, from the need', () => {
  let en: Instance
  let fr: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    ;[en, fr] = await Promise.all([launch('besoin-pages-formulaires', '', 'en'), launch('besoin-pages-formulaires', '', 'fr')])
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await en?.stop()
    await fr?.stop()
  })

  const base = (l: Locale) => (l === 'fr' ? fr : en).url
  const fileOf = (page: any, path: string): Promise<string> =>
    page.evaluate(async (p: string) => (await (await fetch(`/api/pages/${p}`)).json()).markdown as string, path)

  /** Opens `route` in editing, once the page's own blocks are drawn. */
  async function edit(l: Locale, route: string, size: 'desk' | 'phone' = 'desk', theme: 'light' | 'dark' = 'light') {
    const { context, page } = (await open(browser, base(l), {
      theme,
      size,
      locale: l,
      route,
      before: async (p: any) => {
        p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
      },
    })) as { context: any; page: any }
    expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
    await page.getByRole('button', { name: W[l].edit, exact: true }).click()
    await page.getByRole('button', { name: W[l].done, exact: true }).waitFor({ timeout: 20_000 })
    await page.locator('.ProseMirror').first().waitFor({ timeout: 20_000 })
    await page.locator('.ProseMirror[contenteditable="true"]').first().waitFor({ timeout: 20_000 })
    return { context, page }
  }
  async function settings(l: Locale, page: any, kind: string) {
    const block = page.locator(`.adestia-edblock[data-block="${kind}"]`).first()
    await block.hover()
    await block.getByRole('button', { name: W[l].settings }).click()
    await page.getByRole('dialog', { name: new RegExp(`${kind}`) }).waitFor({ timeout: 10_000 })
    return block
  }
  async function form(l: Locale, page: any, kind: string) {
    await settings(l, page, kind)
    await page.getByRole('button', { name: W[l].data, exact: true }).click()
    await page.locator('.adestia-blockform').waitFor({ timeout: 10_000 })
  }
  /** Apply, leave editing, and wait for the answer to the save that carries the new text. */
  async function applyAndSave(l: Locale, page: any, path: string, marker: RegExp) {
    const saved = page.waitForResponse((r: any) => r.request().method() === 'PUT' && marker.test(r.request().postData() ?? '') && r.url().includes(`/api/pages/${path.replace(/\.md$/, '')}`), { timeout: 30_000 })
    await page.getByRole('button', { name: W[l].apply, exact: true }).click()
    await saved // the autosave answered: only then leave editing
    await page.getByRole('button', { name: W[l].done, exact: true }).click()
    await page.getByRole('button', { name: W[l].edit, exact: true }).waitFor({ timeout: 15_000 })
  }
  const rows = (page: any) => page.locator('.adestia-blockform__row')
  const cells = (page: any, row: number) => rows(page).nth(row).locator('input')
  const rowValues = async (page: any): Promise<string[][]> =>
    page.evaluate(() => [...document.querySelectorAll('.adestia-blockform__row')].map((r) => [...r.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value)))

  // ── B-26: variants chosen from the settings ──────────────────────────────
  // Breaks if choosing « inline » no longer redraws the block behind the popover or no longer writes `view=inline`.
  it('variante_inline_redessine_le_bloc_en_place_et_ecrit_view', async () => {
    const { context, page } = await edit('en', '/page/chiffres-variante')
    const block = await settings('en', page, 'figures')
    expect(await block.locator('[role="meter"]').count(), 'tiles draw a bar for 62 %').toBe(1)
    await shot(page, 'variante-avant')
    const saved = page.waitForResponse((r: any) => r.request().method() === 'PUT' && /view=\\?"?inline/.test(r.request().postData() ?? ''), { timeout: 30_000 })
    await page.getByRole('radio', { name: 'inline' }).click()
    await block.locator('.adestia-figures--inline').waitFor({ timeout: 10_000 })
    expect(await block.locator('[role="meter"]').count(), 'inline draws no bar').toBe(0)
    expect(await block.innerText()).toContain('62 %')
    await shot(page, 'variante-apres')
    await saved
    await page.getByRole('button', { name: 'Close' }).first().click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
    // whether the serializer quotes `inline` is not the need's business: both spellings are the same attribute
    expect((await fileOf(page, 'chiffres-variante.md')).replace('view="inline"', 'view=inline')).toBe(ref('figures-avant.md').replace(':::figures\n', ':::figures{view=inline}\n'))
    await context.close()
  }, 90_000)

  // Breaks if a click on the variant already in force writes the default into the file.
  it('variante_deja_en_vigueur_n_ecrit_rien', async () => {
    const { context, page } = await edit('en', '/page/chiffres-lecture')
    await settings('en', page, 'figures')
    await page.getByRole('radio', { name: 'tiles' }).click()
    await page.getByRole('button', { name: 'Close' }).first().click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
    expect(await fileOf(page, 'chiffres-lecture.md')).toBe(ref('figures-avant.md'))
    await context.close()
  }, 60_000)

  // AD-35 (docs/donnees.md): an unknown value of `view` falls back to the block's default view, never to an error.
  // Breaks if the page is refused (read-only, « attribute "view" is … ») instead of drawn as tiles.
  it('view_inconnu_est_dessine_en_tuiles_sans_erreur', async () => {
    const { context, page } = (await open(browser, base('en'), { theme: 'light', size: 'desk', locale: 'en', route: '/page/chiffres-inconnu' })) as { context: any; page: any }
    await page.getByText('Valeur inconnue').first().waitFor({ timeout: 20_000 })
    await page.getByText('Retards').first().waitFor({ timeout: 20_000 }).catch(() => null) // the page's own words, drawn or listed raw
    await shot(page, 'view-inconnu')
    await expect.poll(() => page.locator('[role="meter"]').count(), { timeout: 10_000 }).toBe(1)
    expect(await page.locator('[role="meter"]').first().getAttribute('aria-valuenow')).toBe('62')
    expect(await page.locator('.adestia-figures--inline').count()).toBe(0)
    expect(await page.locator('body').innerText()).not.toMatch(/read-only|accepted: tiles, inline/)
    expect(await page.getByRole('button', { name: 'Edit', exact: true }).count()).toBe(1)
    await context.close()
  }, 60_000)

  // B-26 « no raw attribute by default ». Breaks if the popover of a block with no stray attribute lists « Other attributes ».
  for (const l of ['en', 'fr'] as const)
    it(`reglages_sans_attribut_brut_et_dans_la_langue_${l}`, async () => {
      const { context, page } = await edit(l, '/page/chiffres-lecture')
      await settings(l, page, 'figures')
      const dialog = page.locator('.adestia-blockset')
      const text: string = await dialog.innerText()
      expect(text).not.toMatch(/Other attributes|Autres attributs/)
      expect(await dialog.locator('input[name]').count()).toBe(0)
      expect(await dialog.getByRole('button', { name: W[l].data, exact: true }).count()).toBe(1)
      if (l === 'fr') for (const english of ['Layout', 'Title and icon', 'Show a box', 'Edit data', 'Width']) expect(text, english).not.toContain(english)
      await shot(page, `reglages-${l}`)
      await context.close()
    }, 60_000)

  // « Look » only where there are several views: callout has one redraw and no `view`; a timeline's variants are tranche 4's.
  it('reglages_timeline_sans_groupe_look_et_callout_sans_edit_data', async () => {
    const { context, page } = await edit('en', '/page/planning-invalide')
    await settings('en', page, 'timeline')
    const dialog = page.locator('.adestia-blockset')
    expect(await dialog.getByRole('radiogroup', { name: 'Look' }).count()).toBe(0)
    expect(await dialog.getByRole('button', { name: 'Edit data', exact: true }).count()).toBe(1)
    await context.close()
    const c = await edit('en', '/page/six-bords')
    await settings('en', c.page, 'callout')
    expect(await c.page.locator('.adestia-blockset').getByRole('button', { name: 'Edit data', exact: true }).count()).toBe(0)
    expect(await c.page.locator('.adestia-blockset').getByRole('radiogroup', { name: 'Look' }).count()).toBe(0)
    await c.context.close()
  }, 90_000)

  // B-25/B-26: `list` has three views, picked as pictures; the choice is written.
  it('variante_cards_d_une_liste_choisie_depuis_les_reglages', async () => {
    const { context, page } = await edit('en', '/page/equipe-variante')
    await settings('en', page, 'list')
    expect(await page.getByRole('radiogroup', { name: 'Look' }).getByRole('radio').count()).toBe(3)
    const saved = page.waitForResponse((r: any) => r.request().method() === 'PUT' && /view=\\?"?cards/.test(r.request().postData() ?? ''), { timeout: 30_000 })
    await page.getByRole('radio', { name: 'cards' }).click()
    await saved
    await shot(page, 'liste-cards')
    await page.getByRole('button', { name: 'Close' }).first().click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
    expect((await fileOf(page, 'equipe-variante.md')).replace('view="cards"', 'view=cards')).toBe(ref('liste-avant.md').replace(':::list\n', ':::list{view=cards}\n'))
    await context.close()
  }, 90_000)

  // ── B-27: the figures form ───────────────────────────────────────────────
  for (const l of ['en', 'fr'] as const)
    it(`formulaire_ajoute_une_ligne_et_ecrit_le_fichier_de_reference_${l}`, async () => {
      const { context, page } = await edit(l, `/page/chiffres-form-ajout${l === 'fr' ? '-fr' : ''}`)
      await form(l, page, 'figures')
      expect(await rowValues(page)).toEqual([['Avancement', '62 %', '8 lots sur 13'], ['Retards', '3', '']])
      await page.getByRole('button', { name: W[l].add, exact: true }).click()
      await expect.poll(() => rows(page).count()).toBe(3)
      await cells(page, 2).nth(0).fill('Budget consommé')
      await cells(page, 2).nth(1).fill('41 %')
      await cells(page, 2).nth(2).fill('dont la TVA')
      await shot(page, `form-ajout-${l}`)
      await applyAndSave(l, page, `chiffres-form-ajout${l === 'fr' ? '-fr' : ''}.md`, /Budget consommé/)
      expect(await fileOf(page, `chiffres-form-ajout${l === 'fr' ? '-fr' : ''}.md`)).toBe(ref('figures-apres.md'))
      await context.close()
    }, 90_000)

  // Breaks if the order of the rows in the form is not the order of the lines.
  it('formulaire_reordonne_une_ligne_avec_move_down', async () => {
    const { context, page } = await edit('en', '/page/chiffres-form-ordre')
    await form('en', page, 'figures')
    await rows(page).nth(0).getByRole('button', { name: 'Move down' }).click()
    await expect.poll(() => rowValues(page)).toEqual([['Retards', '3', ''], ['Avancement', '62 %', '8 lots sur 13']])
    await applyAndSave('en', page, 'chiffres-form-ordre.md', /Retards: 3\\n[-*] Avancement/)
    expect(await fileOf(page, 'chiffres-form-ordre.md')).toBe(
      '---\ntitle: Chiffres du chantier\n---\n\n# Chiffres du chantier\n\n:::figures\n- Retards: 3\n- Avancement: 62 % — 8 lots sur 13\n:::\n\nLa suite est à écrire.\n',
    )
    await context.close()
  }, 90_000)

  // Breaks if « Remove row » removes another row than the one it sits on.
  it('formulaire_supprime_la_ligne_choisie', async () => {
    const { context, page } = await edit('en', '/page/chiffres-form-suppr')
    await form('en', page, 'figures')
    await rows(page).nth(0).getByRole('button', { name: 'Remove row' }).click()
    await expect.poll(() => rowValues(page)).toEqual([['Retards', '3', '']])
    await applyAndSave('en', page, 'chiffres-form-suppr.md', /Retards/)
    expect(await fileOf(page, 'chiffres-form-suppr.md')).toBe(
      '---\ntitle: Chiffres du chantier\n---\n\n# Chiffres du chantier\n\n:::figures\n- Retards: 3\n:::\n\nLa suite est à écrire.\n',
    )
    await context.close()
  }, 90_000)

  // Breaks if the form lets a non-number through, or says it elsewhere than under the field, or in the wrong language.
  const INVALID = {
    en: { number: 'Write a number, with its unit if any', required: 'Fill this in' },
    fr: { number: 'Écris un nombre, avec son unité s’il y en a une', required: 'À remplir' },
  } as const
  for (const l of ['en', 'fr'] as const)
    it(`formulaire_refuse_un_nombre_invalide_sous_son_champ_${l}`, async () => {
      const { context, page } = await edit(l, `/page/chiffres-form-invalide${l === 'fr' ? '-fr' : ''}`)
      await form(l, page, 'figures')
      await page.getByRole('button', { name: W[l].add, exact: true }).click()
      await expect.poll(() => rows(page).count()).toBe(3)
      await cells(page, 2).nth(0).fill('Lots')
      await cells(page, 2).nth(1).fill('three')
      const field = rows(page).nth(2).locator('.adestia-field').nth(1)
      await expect.poll(() => field.innerText()).toContain(INVALID[l].number)
      expect(await page.getByRole('button', { name: W[l].apply, exact: true }).isDisabled()).toBe(true)
      await shot(page, `form-invalide-${l}`)
      await cells(page, 2).nth(1).fill('3')
      await expect.poll(() => page.getByRole('button', { name: W[l].apply, exact: true }).isDisabled()).toBe(false)
      expect(await field.innerText()).not.toContain(INVALID[l].number)
      // a value typed with no label: required, said under the label's field
      await cells(page, 2).nth(0).fill('')
      const label = rows(page).nth(2).locator('.adestia-field').nth(0)
      await expect.poll(() => label.innerText()).toContain(INVALID[l].required)
      expect(await page.getByRole('button', { name: W[l].apply, exact: true }).isDisabled()).toBe(true)
      await context.close()
    }, 90_000)

  // Bords: « Cancel », ✕ and Escape discard; the file is the file of before.
  for (const how of ['cancel', 'escape'] as const)
    it(`formulaire_${how}_ne_change_pas_le_fichier`, async () => {
      const { context, page } = await edit('en', `/page/chiffres-form-annule`)
      await form('en', page, 'figures')
      await rows(page).nth(0).getByRole('button', { name: 'Remove row' }).click()
      await expect.poll(() => rows(page).count()).toBe(1)
      if (how === 'cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      else await page.keyboard.press('Escape')
      await page.locator('.adestia-blockform').waitFor({ state: 'detached', timeout: 10_000 })
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
      expect(await fileOf(page, 'chiffres-form-annule.md')).toBe(ref('figures-avant.md'))
      await context.close()
    }, 90_000)

  // Empty state: no row yet → one sentence and Add (E-35 « empty »).
  it('formulaire_sans_ligne_dit_rien_ici_et_propose_ajouter', async () => {
    for (const l of ['en', 'fr'] as const) {
      const { context, page } = await edit(l, '/page/chiffres-form-vide')
      await form(l, page, 'figures')
      await rows(page).nth(0).getByRole('button', { name: W[l].remove }).click()
      await rows(page).nth(0).getByRole('button', { name: W[l].remove }).click()
      await expect.poll(() => rows(page).count()).toBe(0)
      const text = await page.locator('.adestia-blockform').innerText()
      expect(text).toContain(l === 'en' ? 'Nothing here yet.' : 'Rien ici pour l’instant.')
      expect(await page.getByRole('button', { name: W[l].add, exact: true }).count()).toBe(1)
      await shot(page, `form-vide-${l}`)
      await context.close()
    }
  }, 90_000)

  // ── Raw ──────────────────────────────────────────────────────────────────
  // « The raw lines … say the same thing ». Breaks if Raw shows other lines than the rows say.
  it('brut_montre_les_lignes_que_disent_les_lignes_du_formulaire', async () => {
    const { context, page } = await edit('en', '/page/chiffres-brut-meme')
    await form('en', page, 'figures')
    await page.getByRole('button', { name: 'Raw', exact: true }).click()
    const area = page.locator('.adestia-blockform textarea')
    await area.waitFor({ timeout: 10_000 })
    expect((await area.inputValue()).replace(/^[-*] /gm, '- ')).toBe('- Avancement: 62 % — 8 lots sur 13\n- Retards: 3')
    await shot(page, 'brut')
    // back to the form: the same two rows
    await page.getByRole('button', { name: 'Raw', exact: true }).click()
    await expect.poll(() => rowValues(page)).toEqual([['Avancement', '62 %', '8 lots sur 13'], ['Retards', '3', '']])
    // Apply with nothing changed writes the file it found
    const before = await fileOf(page, 'chiffres-brut-meme.md')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 15_000 })
    expect(await fileOf(page, 'chiffres-brut-meme.md')).toBe(before)
    expect(before).toBe(ref('figures-avant.md'))
    await context.close()
  }, 90_000)

  // Breaks if a line typed in Raw is written differently from the same line made by the form.
  it('brut_ecrit_le_meme_fichier_que_le_formulaire', async () => {
    const { context, page } = await edit('en', '/page/chiffres-brut-ecrit')
    await form('en', page, 'figures')
    await page.getByRole('button', { name: 'Raw', exact: true }).click()
    await page.locator('.adestia-blockform textarea').fill('- Avancement: 62 % — 8 lots sur 13\n- Retards: 3\n- Budget consommé: 41 % — dont la TVA')
    await applyAndSave('en', page, 'chiffres-brut-ecrit.md', /Budget consommé/)
    expect(await fileOf(page, 'chiffres-brut-ecrit.md')).toBe(ref('figures-apres.md'))
    await context.close()
  }, 90_000)

  // E-35 « unreadable lines »: kept verbatim, listed, written back where they were.
  it('ligne_illisible_est_conservee_et_ecrite_a_sa_place', async () => {
    const { context, page } = await edit('en', '/page/illisible')
    await form('en', page, 'figures')
    expect(await page.locator('.adestia-blockform').innerText()).toContain('Kept as written')
    expect(await page.locator('.adestia-blockform').innerText()).toContain('Un commentaire que personne ne sait lire')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(() => rows(page).count()).toBe(3)
    await cells(page, 2).nth(0).fill('Budget')
    await cells(page, 2).nth(1).fill('41 %')
    await shot(page, 'illisible')
    await applyAndSave('en', page, 'illisible.md', /Budget: 41/)
    // the line nobody can read stays between the two figures it sat between, its words untouched, the new figure after them
    const block = (await fileOf(page, 'illisible.md')).split(':::figures\n')[1]!.split('\n:::')[0]!
    expect(block.split('\n').filter((l: string) => l.trim() !== '').map((l: string) => l.trim().replace(/^[-*] /, '- '))).toEqual([
      '- Avancement: 62 % — 8 lots sur 13',
      'Un commentaire que personne ne sait lire',
      '- Retards: 3',
      '- Budget: 41 %',
    ])
    await context.close()
  }, 90_000)

  // ── the other blocks with data ───────────────────────────────────────────
  it('formulaire_de_liste_ajoute_une_ligne_ecrite', async () => {
    const { context, page } = await edit('en', '/page/equipe-form-ajout')
    await form('en', page, 'list')
    expect(await rowValues(page)).toEqual([['Pilote', 'Camille'], ['Relecture', 'Noé']])
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(() => rows(page).count()).toBe(3)
    await cells(page, 2).nth(0).fill('Support')
    await cells(page, 2).nth(1).fill('Aïcha')
    await applyAndSave('en', page, 'equipe-form-ajout.md', /Support: Aïcha/)
    expect(await fileOf(page, 'equipe-form-ajout.md')).toBe(ref('liste-apres.md'))
    await context.close()
  }, 90_000)

  it('formulaire_de_frise_ajoute_une_phase_et_ecrit_le_fichier_de_reference', async () => {
    const { context, page } = await edit('en', '/page/planning-form-ajout')
    await form('en', page, 'timeline')
    expect(await rowValues(page)).toEqual([['Cadrage', '2026-01-15', '2026-03-01'], ['Recette', '', '2026-06-01']])
    expect(await page.locator('.adestia-blockform').innerText()).not.toMatch(/Status/)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(() => rows(page).count()).toBe(3)
    await cells(page, 2).nth(0).fill('Livraison')
    await cells(page, 2).nth(1).fill('2026-07-01')
    await cells(page, 2).nth(2).fill('2026-09-30')
    await shot(page, 'frise-form')
    await applyAndSave('en', page, 'planning-form-ajout.md', /Livraison/)
    expect(await fileOf(page, 'planning-form-ajout.md')).toBe(ref('timeline-apres.md'))
    await context.close()
  }, 90_000)

  it('brut_de_frise_ecrit_le_meme_fichier_que_le_formulaire', async () => {
    const { context, page } = await edit('en', '/page/planning-brut-ecrit')
    await form('en', page, 'timeline')
    await page.getByRole('button', { name: 'Raw', exact: true }).click()
    const area = page.locator('.adestia-blockform textarea')
    // the bullet character is the serializer's business; the two lines say the same thing
    expect((await area.inputValue()).replace(/^[-*] /gm, '- ')).toBe('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01')
    await area.fill('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n- Livraison: 2026-07-01 → 2026-09-30')
    await applyAndSave('en', page, 'planning-brut-ecrit.md', /Livraison/)
    expect(await fileOf(page, 'planning-brut-ecrit.md')).toBe(ref('timeline-apres.md'))
    await context.close()
  }, 90_000)

  // Breaks if a due before its start is accepted, or said away from the due field.
  it('frise_refuse_une_echeance_avant_le_debut_sous_le_champ_echeance', async () => {
    for (const l of ['en', 'fr'] as const) {
      const { context, page } = await edit(l, '/page/planning-invalide')
      await form(l, page, 'timeline')
      await page.getByRole('button', { name: W[l].add, exact: true }).click()
      await expect.poll(() => rows(page).count()).toBe(3)
      await cells(page, 2).nth(0).fill('Fin')
      await cells(page, 2).nth(1).fill('2026-05-01')
      await cells(page, 2).nth(2).fill('2026-04-01')
      const due = rows(page).nth(2).locator('.adestia-field').nth(2)
      await expect.poll(() => due.innerText()).toContain(l === 'en' ? 'Due is before start' : 'L’échéance précède le début')
      expect(await page.getByRole('button', { name: W[l].apply, exact: true }).isDisabled()).toBe(true)
      await shot(page, `frise-invalide-${l}`)
      await context.close()
    }
  }, 90_000)

  // ── the gallery opens the form ───────────────────────────────────────────
  async function gallery(page: any) {
    await page.getByRole('button', { name: 'Add block', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
    await page.locator('.adestia-blockcard').first().waitFor({ timeout: 10_000 })
  }

  it('galerie_figures_ouvre_son_formulaire_sur_une_ligne_vide', async () => {
    const { context, page } = await edit('en', '/page/vide')
    await gallery(page)
    await page.getByRole('option', { name: 'Figures', exact: true }).click()
    await page.locator('.adestia-blockform').waitFor({ timeout: 10_000 })
    expect(await rowValues(page)).toEqual([['', '', '']])
    await shot(page, 'galerie-figures')
    await cells(page, 0).nth(0).fill('Retards')
    await cells(page, 0).nth(1).fill('3')
    await applyAndSave('en', page, 'vide.md', /Retards/)
    expect(await fileOf(page, 'vide.md')).toBe('---\ntitle: Page vide\n---\n\nDu texte.\n\n:::figures\n- Retards: 3\n:::\n')
    await context.close()
  }, 90_000)

  // The card shows the variants as pictures; the one picked is the one inserted.
  it('galerie_insere_la_variante_choisie_sur_la_carte_et_ouvre_le_formulaire', async () => {
    const { context, page } = await edit('en', '/page/vide-liste')
    await gallery(page)
    const cell = page.locator('.adestia-blockcell').filter({ has: page.getByRole('option', { name: 'List', exact: true }) })
    expect(await cell.getByRole('radio').count()).toBe(3)
    await cell.getByRole('radio', { name: 'cards' }).click()
    await page.getByRole('option', { name: 'List', exact: true }).click()
    await page.locator('.adestia-blockform').waitFor({ timeout: 10_000 })
    await cells(page, 0).nth(0).fill('Pilote')
    await cells(page, 0).nth(1).fill('Camille')
    await applyAndSave('en', page, 'vide-liste.md', /view=\\?"?cards/)
    expect((await fileOf(page, 'vide-liste.md')).replace('view="cards"', 'view=cards')).toBe('---\ntitle: Page vide liste\n---\n\nDu texte.\n\n:::list{view=cards}\n- Pilote: Camille\n:::\n')
    await context.close()
  }, 90_000)

  // Exclusion: a block with no data opens no form.
  it('galerie_callout_n_ouvre_pas_de_formulaire', async () => {
    const { context, page } = await edit('en', '/page/vide-callout')
    await gallery(page)
    await page.getByRole('option', { name: 'Callout', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 })
    expect(await page.locator('.adestia-blockform').count()).toBe(0)
    expect(await page.locator('.adestia-edblock[data-block="callout"]').count()).toBe(1)
    await context.close()
  }, 60_000)

  // Exclusion: Timeline's card has no variant pictures (tranche 4), but opens its form on a project page.
  it('galerie_frise_sur_page_projet_ouvre_le_formulaire_et_edit_data_ajoute_une_ligne', async () => {
    const { context, page } = await edit('en', '/page/vide-projet')
    await gallery(page)
    const cell = page.locator('.adestia-blockcell').filter({ has: page.getByRole('option', { name: 'Timeline', exact: true }) })
    expect(await cell.getByRole('radio').count()).toBe(0)
    await page.getByRole('option', { name: 'Timeline', exact: true }).click()
    await page.locator('.adestia-blockform').waitFor({ timeout: 10_000 })
    expect(await rowValues(page)).toEqual([['', '', '']])
    await cells(page, 0).nth(0).fill('Cadrage')
    await cells(page, 0).nth(1).fill('2026-01-15')
    await cells(page, 0).nth(2).fill('2026-03-01')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(() => rows(page).count()).toBe(2)
    await cells(page, 1).nth(0).fill('Recette')
    await cells(page, 1).nth(2).fill('2026-06-01')
    await shot(page, 'galerie-frise')
    await applyAndSave('en', page, 'vide-projet.md', /Recette/)
    expect(await fileOf(page, 'vide-projet.md')).toBe(
      '---\ntitle: Projet vide\ntype: project-management\n---\n\nDu texte.\n\n:::timeline\n- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n:::\n',
    )
    await context.close()
  }, 90_000)

  it('galerie_frise_puis_brut_ecrit_le_meme_fichier_qu_avant', async () => {
    const { context, page } = await edit('en', '/page/vide-projet-2')
    await gallery(page)
    await page.getByRole('option', { name: 'Timeline', exact: true }).click()
    await page.locator('.adestia-blockform').waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Raw', exact: true }).click()
    await page.locator('.adestia-blockform textarea').fill('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01')
    await applyAndSave('en', page, 'vide-projet-2.md', /Recette/)
    expect(await fileOf(page, 'vide-projet-2.md')).toBe(
      '---\ntitle: Projet vide 2\ntype: project-management\n---\n\nDu texte.\n\n:::timeline\n- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n:::\n',
    )
    await context.close()
  }, 90_000)

  // Phone: the form is a bottom sheet that stays inside the viewport, with Apply reachable.
  it('formulaire_sur_telephone_reste_dans_l_ecran', async () => {
    const { context, page } = await edit('en', '/page/chiffres-form-vide', 'phone', 'dark')
    await form('en', page, 'figures')
    const box = await page.getByRole('button', { name: 'Apply', exact: true }).boundingBox()
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await shot(page, 'telephone-form')
    await context.close()
  }, 90_000)
})
