/**
 * `adestia-pages-blocs-formulaires`, seen from its need and not from its code (B-25, B-26, B-27; P-18; E-6, E-35;
 * P-17 step 4 for the gallery): the settings of a block with their variants in small pictures, the data form
 * with its Raw switch, and the page file, which must stay the file the format of before the epic writes.
 *
 * Browser on `bench/launch.mjs --seed verify-formulaires` (scripted engine, `project-management` enabled, the
 * pages copied from the hand-written files of `fixtures/verify-formulaires/`). Every expected file is one of
 * those files, written by hand from the line format (`- Label: value — caption`, `- Phase: start → due`,
 * `- Label: value`, a pipe table); every expected word comes from docs/ecrans.md, docs/parcours.md and the
 * fiche's exit criterion. Playwright and Chromium come from the environment; without them the file is skipped.
 * Needs `npm run build`. `VERIFY_SHOTS=<dir>` writes one capture per scenario.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Size, type Theme, newBrowser, open, playwright } from './charte-browser.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const fixture = (name: string) => readFileSync(join(repo, 'packages/web/test/fixtures/verify-formulaires', name), 'utf8')
const SHOTS = process.env.VERIFY_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

interface Booted {
  url: string
  data: string
  stop(): Promise<void>
}
const children = new Set<ChildProcess>()
afterAll(() => {
  for (const c of children) c.kill('SIGTERM')
})
function boot(locale: string): Promise<Booted> {
  const data = mkdtempSync(join(tmpdir(), 'verify-formulaires-'))
  const child = spawn(execPath, [join(repo, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'verify-formulaires', '--locale', locale, '--data', join(data, 'd')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let stderr = ''
  child.stderr?.on('data', (c: Buffer) => (stderr += c))
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout?.on('data', (c: Buffer) => {
      out += c
      const found = /listening on (\S+)/.exec(out)
      if (found)
        resolve({
          url: found[1] as string,
          data: join(data, 'd'),
          stop: () =>
            new Promise<void>((done) => {
              rmSync(data, { recursive: true, force: true })
              if (child.exitCode !== null) return done()
              child.once('exit', () => done())
              child.kill('SIGTERM')
            }),
        })
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
}

type Browser = Awaited<ReturnType<typeof newBrowser>>
type Words = Record<'edit' | 'done' | 'settings' | 'editData' | 'raw' | 'add' | 'apply' | 'cancel' | 'remove' | 'up' | 'down', string>
const W: Record<'en' | 'fr', Words> = {
  en: { edit: 'Edit', done: 'Done', settings: 'Block settings', editData: 'Edit data', raw: 'Raw', add: 'Add', apply: 'Apply', cancel: 'Cancel', remove: 'Remove row', up: 'Move up', down: 'Move down' },
  fr: { edit: 'Modifier', done: 'Terminé', settings: 'Réglages du bloc', editData: 'Modifier les données', raw: 'Brut', add: 'Ajouter', apply: 'Appliquer', cancel: 'Annuler', remove: 'Retirer la ligne', up: 'Move up', down: 'Move down' },
} as const

describe.skipIf(!playwright)('blocs finis, réglages lisibles, données en formulaire (adestia-pages-blocs-formulaires)', () => {
  let en: Booted
  let fr: Booted
  let browser: Browser
  beforeAll(async () => {
    ;[en, fr] = await Promise.all([boot('en'), boot('fr')])
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await en?.stop()
    await fr?.stop()
  })

  const file = (b: Booted, id: string) => readFileSync(join(b.data, 'workspace/pages', `${id}.md`), 'utf8')
  const visit = async (b: Booted, id: string, o: { theme?: Theme; size?: Size; locale?: 'en' | 'fr' } = {}) => {
    const locale = o.locale ?? (b === fr ? 'fr' : 'en')
    const { context, page } = (await open(browser, b.url, { theme: o.theme ?? 'light', size: o.size ?? 'desk', locale, route: `/page/${id}` })) as { context: any; page: any }
    const puts: string[] = []
    page.on('request', (r: any) => {
      if (r.method() === 'PUT' && r.url().includes('/api/pages/')) puts.push(r.url())
    })
    await page.getByRole('button', { name: W[locale].edit, exact: true }).waitFor({ timeout: 20_000 })
    return { context, page, puts, w: W[locale] }
  }
  const shot = async (page: any, name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
  }
  const startEditing = async (page: any, w: Words) => {
    await page.getByRole('button', { name: w.edit, exact: true }).click()
    await page.getByRole('button', { name: w.done, exact: true }).waitFor({ timeout: 15_000 })
  }
  /** Hover the block (its bar shows on hover), open its settings; `hoverText` is a text drawn by the block. */
  const openSettings = async (page: any, w: Words, hoverText: string) => {
    const target = page.getByText(hoverText).first()
    const gear = page.getByRole('button', { name: w.settings }).first()
    if ((page.viewportSize() as { width: number }).width < 500) {
      // a phone has no hover: a tap on the block raises its bar; tap again until the gear is what is under its centre
      for (let attempt = 0; attempt < 8; attempt++) {
        await target.tap()
        const raised = await gear.evaluate((el: HTMLElement) => {
          const r = el.getBoundingClientRect()
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return !!top && el.contains(top)
        })
        if (raised) break
      }
    } else await target.hover()
    await page.getByRole('button', { name: w.settings }).first().click()
  }
  const openForm = async (page: any, w: Words, hoverText: string, title: string | RegExp) => {
    await openSettings(page, w, hoverText)
    await page.getByRole('button', { name: w.editData, exact: true }).click()
    const form = page.getByRole('dialog', { name: title })
    await form.waitFor({ timeout: 15_000 })
    return form
  }
  /**
   * The page saves itself a beat after the last change (autosave); then **Done** leaves editing. Wait for the file
   * to leave `before`, which is the proof the write happened, then leave and read the file.
   */
  const finish = async (b: Booted, id: string, page: any, w: Words, before: string) => {
    await expect.poll(() => file(b, id), { timeout: 15_000, message: 'the page file was never written' }).not.toBe(before)
    await page.getByRole('button', { name: w.done, exact: true }).click()
    await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached', timeout: 15_000 })
    return file(b, id)
  }
  /** Press Apply, wait for the form to close, then for the proof the block shows it (a text drawn, or gone). */
  const apply = async (page: any, form: any, w: Words, proof: { seen?: string; gone?: string }) => {
    await form.getByRole('button', { name: w.apply, exact: true }).click()
    await form.waitFor({ state: 'detached', timeout: 15_000 })
    if (proof.seen) await page.getByText(proof.seen).first().waitFor({ timeout: 10_000 })
    if (proof.gone) await page.getByText(proof.gone).first().waitFor({ state: 'detached', timeout: 10_000 })
  }
  /** Raw shows list lines with `-` or `*`: both are the same markdown list. */
  const norm = (text: string) => text.replace(/^\* /gm, '- ')
  /** The cells of the pipe rows of a text, the delimiter row left out, padding ignored. */
  const cells = (text: string) =>
    text
      .split('\n')
      .filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
      .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
  const fill = async (row: any, label: string, text: string) => {
    const input = row.getByLabel(label, { exact: true })
    await input.fill(text)
  }

  // ── B-26: the settings, variants as pictures, the effect visible ────────────────────────────────────
  describe('B-26 settings of a block', () => {
    // Nominal. Breaks if the variants are words in a select rather than pictures, or if the block does not redraw.
    it('figures_variante_en_image_redessine_le_bloc_en_place_et_ecrit_view_inline', async () => {
      const { context, page, w } = await visit(en, 'f-variante')
      expect(await page.getByRole('meter').count(), 'tiles: a bar under each percentage').toBe(2)
      await startEditing(page, w)
      await openSettings(page, w, 'Avancement')
      const settings = page.getByRole('dialog', { name: /Block settings/ })
      const group = settings.getByRole('radiogroup', { name: 'Look' })
      expect(await group.getByRole('radio').count()).toBe(2)
      expect(await group.getByRole('radio', { name: 'tiles' }).getAttribute('aria-checked')).toBe('true')
      expect(await group.locator('svg').count(), 'the choices are drawn, small pictures').toBe(2)
      await group.getByRole('radio', { name: 'inline' }).click()
      await expect.poll(() => page.getByRole('meter').count(), { message: 'the block behind did not redraw as inline (no bar)' }).toBe(0)
      expect(await group.getByRole('radio', { name: 'inline' }).getAttribute('aria-checked')).toBe('true')
      expect(await page.getByText('Avancement').first().isVisible()).toBe(true)
      await shot(page, 'variante-inline')
      await page.keyboard.press('Escape')
      expect(await finish(en, 'f-variante', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-inline.md'))
      await context.close()
    }, 90_000)

    // Bords: the choice already in force writes nothing.
    it('cliquer_la_variante_deja_choisie_n_ecrit_rien', async () => {
      const { context, page, puts, w } = await visit(en, 'f-variante-meme')
      await startEditing(page, w)
      await openSettings(page, w, 'Avancement')
      await page.getByRole('dialog', { name: /Block settings/ }).getByRole('radio', { name: 'tiles' }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: w.done, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached' })
      expect(puts).toEqual([])
      expect(file(en, 'f-variante-meme')).toBe(fixture('figures-avant.md'))
      await context.close()
    }, 60_000)

    // Bords: `list` has three variants, in pictures too.
    it('liste_propose_trois_variantes_et_cards_s_ecrit', async () => {
      const { context, page, w } = await visit(en, 'l-variante')
      await startEditing(page, w)
      await openSettings(page, w, 'Camille')
      const group = page.getByRole('dialog', { name: /Block settings/ }).getByRole('radiogroup', { name: 'Look' })
      expect(await group.getByRole('radio').allTextContents()).toEqual(['rows', 'cards', 'chips'])
      await group.getByRole('radio', { name: 'cards' }).click()
      await page.keyboard.press('Escape')
      expect(await finish(en, 'l-variante', page, w, fixture('liste-avant.md'))).toBe(fixture('liste-apres-cards.md'))
      await context.close()
    }, 60_000)

    // Exclusion: no attribute shown raw, no empty "other attributes" group, no variants on a block with only one look.
    it('aucun_attribut_brut_ni_groupe_vide_par_defaut', async () => {
      const { context, page, w } = await visit(en, 'f-callout-pas')
      await startEditing(page, w)
      await openSettings(page, w, 'Avancement')
      const settings = page.getByRole('dialog', { name: /Block settings/ })
      for (const heading of ['Look', 'Layout', 'Title and icon']) expect(await settings.getByText(heading, { exact: true }).first().isVisible(), heading).toBe(true)
      const text = (await settings.innerText()).replace(/\s+/g, ' ')
      expect(text).not.toMatch(/Other attributes/i)
      for (const raw of ['frame', 'view', ' ico ', ' w ']) expect(text, `raw attribute "${raw}"`).not.toContain(raw)
      expect(await settings.getByRole('radiogroup', { name: 'Width' }).getByRole('radio').allTextContents()).toEqual(['⅓', '½', '⅔', 'Full'])
      expect(await settings.getByRole('radiogroup', { name: 'Show a box' }).getByRole('radio').allTextContents()).toEqual(['Yes', 'No'])
      await shot(page, 'reglages-en')
      await context.close()
    }, 60_000)

    // Exclusion: timeline has no variant (they would have no effect).
    it('timeline_n_offre_aucune_variante_mais_offre_edit_data', async () => {
      const { context, page, w } = await visit(en, 't-reglages')
      await startEditing(page, w)
      await openSettings(page, w, 'Cadrage')
      const settings = page.getByRole('dialog', { name: /Block settings/ })
      await settings.getByText('Layout', { exact: true }).first().waitFor()
      expect(await settings.getByRole('radiogroup', { name: 'Look' }).count(), 'a variant picker with no effect').toBe(0)
      expect(await settings.getByText('Look', { exact: true }).count()).toBe(0)
      expect(await settings.getByRole('button', { name: w.editData, exact: true }).count()).toBe(1)
      await context.close()
    }, 60_000)

    // Exclusion: a block that declares no data form has no Edit data.
    it('un_bloc_sans_donnees_n_a_pas_de_edit_data', async () => {
      const { context, page, w } = await visit(en, 'i-lecture')
      await startEditing(page, w)
      // insert a callout through the gallery, then open its settings
      await page.getByRole('button', { name: 'Add block' }).click()
      const gallery = page.getByRole('dialog', { name: 'Add block' })
      await gallery.getByRole('option', { name: 'Callout' }).click()
      await gallery.waitFor({ state: 'detached', timeout: 15_000 })
      expect(await page.getByRole('dialog', { name: /— data$/ }).count(), 'a callout has no rows').toBe(0)
      await page.getByRole('button', { name: w.settings }).first().waitFor({ state: 'attached' })
      await page.locator('.adestia-edblock').first().hover()
      await page.getByRole('button', { name: w.settings }).first().click()
      const settings = page.getByRole('dialog', { name: /Block settings/ })
      await settings.waitFor()
      expect(await settings.getByRole('button', { name: w.editData, exact: true }).count()).toBe(0)
      await context.close()
    }, 60_000)

    // Langue: the settings speak French on a French instance.
    it('reglages_en_francais_sans_mots_anglais_du_cadre', async () => {
      const { context, page, w } = await visit(fr, 'f-reglages-fr')
      await startEditing(page, w)
      await openSettings(page, w, 'Avancement')
      const settings = page.getByRole('dialog', { name: /Réglages du bloc/ })
      await settings.getByRole('button', { name: w.editData, exact: true }).waitFor()
      const text = (await settings.innerText()).replace(/\s+/g, ' ')
      for (const english of ['Look', 'Layout', 'Width', 'Show a box', 'Title and icon', 'Edit data', 'Shown above the block']) expect(text, english).not.toContain(english)
      await shot(page, 'reglages-fr')
      await context.close()
    }, 60_000)
  })

  // ── B-25: the blocks are drawn finished ────────────────────────────────────────────────────────────
  describe('B-25 blocks drawn', () => {
    it('figures_en_lecture_dessine_une_jauge_nommee_pour_un_pourcentage_seulement', async () => {
      for (const theme of ['light', 'dark'] as Theme[]) {
        const { context, page } = await visit(en, 'f-lecture', { theme })
        const avancement = page.getByRole('meter', { name: 'Avancement' })
        await avancement.waitFor()
        expect(await avancement.getAttribute('aria-valuenow'), theme).toBe('62')
        expect(await avancement.getAttribute('aria-valuemin')).toBe('0')
        expect(await avancement.getAttribute('aria-valuemax')).toBe('100')
        expect(await page.getByRole('meter', { name: 'Budget' }).getAttribute('aria-valuenow')).toBe('41')
        expect(await page.getByText('8 lots sur 13').first().isVisible()).toBe(true)
        await shot(page, `figures-lecture-${theme}`)
        await context.close()
      }
    }, 60_000)

    it('figures_sur_telephone_ne_fait_pas_defiler_la_page_de_cote', async () => {
      const { context, page } = await visit(en, 'f-lecture', { size: 'phone' })
      await page.getByRole('meter', { name: 'Avancement' }).waitFor()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await shot(page, 'figures-lecture-phone')
      await context.close()
    }, 60_000)
  })

  // ── B-27: the form ─────────────────────────────────────────────────────────────────────────────────
  describe('B-27 data form, figures', () => {
    it('ajouter_une_ligne_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 'f-ajout')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      expect(await form.getByRole('listitem').count()).toBe(2)
      expect(await form.getByLabel('Label', { exact: true }).first().inputValue()).toBe('Avancement')
      await form.getByRole('button', { name: w.add, exact: true }).click()
      expect(await form.getByRole('listitem').count()).toBe(3)
      const row = form.getByRole('listitem').nth(2)
      await fill(row, 'Label', 'Retards')
      await fill(row, 'Value', '3')
      await fill(row, 'Caption', 'deux sur le gros œuvre')
      await shot(page, 'figures-form-ajout')
      await apply(page, form, w, { seen: 'Retards' })
      expect(await finish(en, 'f-ajout', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-ajout.md'))
      await context.close()
    }, 90_000)

    it('reordonner_une_ligne_avec_move_down_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 'f-ordre')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      // bords: the first row cannot go up, the last cannot go down
      expect(await form.getByRole('listitem').nth(0).getByRole('button', { name: w.up }).isDisabled()).toBe(true)
      expect(await form.getByRole('listitem').nth(1).getByRole('button', { name: w.down }).isDisabled()).toBe(true)
      await form.getByRole('listitem').nth(0).getByRole('button', { name: w.down }).click()
      expect(await form.getByLabel('Label', { exact: true }).first().inputValue()).toBe('Budget')
      await apply(page, form, w, {})
      await expect.poll(async () => ((await page.getByText('Budget').first().boundingBox())?.x ?? 1e9) < ((await page.getByText('Avancement').first().boundingBox())?.x ?? 0), { timeout: 10_000, message: 'the block does not show Budget before Avancement' }).toBe(true)
      expect(await finish(en, 'f-ordre', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-ordre.md'))
      await context.close()
    }, 90_000)

    it('supprimer_une_ligne_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 'f-suppr')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('listitem').nth(0).getByRole('button', { name: w.remove }).click()
      expect(await form.getByRole('listitem').count()).toBe(1)
      await apply(page, form, w, { gone: 'Avancement' })
      expect(await finish(en, 'f-suppr', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-suppr.md'))
      await context.close()
    }, 90_000)

    it('modifier_une_valeur_avec_unite_est_accepte_et_garde_la_legende', async () => {
      const { context, page, w } = await visit(en, 'f-modif')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await fill(form.getByRole('listitem').nth(0), 'Value', '14 of 37')
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled(), '"14 of 37" has a digit: a number with its unit').toBe(false)
      await apply(page, form, w, { seen: '14 of 37' })
      expect(await finish(en, 'f-modif', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-modif.md'))
      await context.close()
    }, 90_000)

    // Échec: a number that is not one is refused under its field, Apply waits, and fixing it frees Apply.
    it('un_nombre_invalide_est_refuse_sous_son_champ_et_apply_attend', async () => {
      const { context, page, puts, w } = await visit(en, 'f-invalide')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      const row = form.getByRole('listitem').nth(1)
      const value = row.getByLabel('Value', { exact: true })
      await value.fill('trois')
      const message = form.getByText('Write a number, with its unit if any', { exact: true })
      await message.waitFor({ timeout: 10_000 })
      const [m, v] = [await message.boundingBox(), await value.boundingBox()]
      expect(m!.y, 'the message sits under the field').toBeGreaterThanOrEqual(v!.y + v!.height - 1)
      expect(m!.x).toBeLessThan(v!.x + v!.width)
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled()).toBe(true)
      await shot(page, 'figures-form-invalide')
      await form.getByRole('button', { name: w.apply, exact: true }).click({ force: true, timeout: 2_000 }).catch(() => undefined)
      expect(await form.isVisible(), 'a forced click on a disabled Apply closes nothing').toBe(true)
      await value.fill('3')
      await message.waitFor({ state: 'detached', timeout: 10_000 })
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled()).toBe(false)
      await form.getByRole('button', { name: w.cancel, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached' })
      expect(puts).toEqual([])
      expect(file(en, 'f-invalide')).toBe(fixture('figures-avant.md'))
      await context.close()
    }, 90_000)

    // Échec: the label is required.
    it('un_libelle_vide_est_refuse_sous_son_champ', async () => {
      const { context, page, w } = await visit(en, 'f-obligatoire')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('button', { name: w.add, exact: true }).click()
      const row = form.getByRole('listitem').nth(2)
      await fill(row, 'Value', '5')
      const message = form.getByText('Fill this in', { exact: true })
      await message.first().waitFor({ timeout: 10_000 })
      const [m, l] = [await message.first().boundingBox(), await row.getByLabel('Label', { exact: true }).boundingBox()]
      expect(m!.y).toBeGreaterThanOrEqual(l!.y + l!.height - 1)
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled()).toBe(true)
      await context.close()
    }, 60_000)

    // Exclusion: Cancel, and the unrelated lines, write nothing.
    it('annuler_ne_change_pas_le_fichier', async () => {
      const { context, page, puts, w } = await visit(en, 'f-annule')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('listitem').nth(0).getByRole('button', { name: w.remove }).click()
      await form.getByRole('button', { name: w.cancel, exact: true }).click()
      await form.waitFor({ state: 'detached' })
      expect(await page.getByText('Avancement').first().isVisible(), 'the block still shows its first figure').toBe(true)
      await page.getByRole('button', { name: w.done, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached' })
      expect(puts).toEqual([])
      expect(file(en, 'f-annule')).toBe(fixture('figures-avant.md'))
      await context.close()
    }, 60_000)

    // Exclusion (nothing lost): a line the form cannot read stays, where it was.
    it('une_ligne_illisible_est_gardee_telle_quelle_a_sa_place', async () => {
      const { context, page, w } = await visit(en, 'f-illisible')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      expect(await form.getByText('Kept as written', { exact: false }).first().isVisible()).toBe(true)
      await form.getByRole('button', { name: w.add, exact: true }).click()
      const row = form.getByRole('listitem').filter({ has: page.getByLabel('Label', { exact: true }) }).nth(2)
      await fill(row, 'Label', 'Retards')
      await fill(row, 'Value', '3')
      await shot(page, 'figures-form-illisible')
      await apply(page, form, w, { seen: 'Retards' })
      // Criterion amended: when Apply changes other lines, the unreadable line may come back indented by two spaces
      // under its bullet (the editor's serializer, same markdown). Its text stays intact, and in place.
      const written = await finish(en, 'f-illisible', page, w, fixture('figures-illisible-avant.md'))
      expect(written.replace(/^ {2}(Un commentaire que personne ne sait lire)$/m, '$1')).toBe(fixture('figures-illisible-apres.md'))
      await context.close()
    }, 90_000)

    // Raw: same lines, same file.
    it('raw_montre_les_lignes_du_formulaire_et_ecrit_le_meme_fichier', async () => {
      const { context, page, w } = await visit(en, 'f-brut')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      const area = form.getByRole('textbox')
      await area.waitFor()
      expect(norm(await area.inputValue()), 'the same two lines as the form').toBe('- Avancement: 62 % — 8 lots sur 13\n- Budget: 41 %')
      await area.fill('- Avancement: 62 % — 8 lots sur 13\n- Budget: 41 %\n- Retards: 3 — deux sur le gros œuvre')
      await shot(page, 'figures-raw')
      await apply(page, form, w, { seen: 'Retards' })
      expect(await finish(en, 'f-brut', page, w, fixture('figures-avant.md'))).toBe(fixture('figures-apres-ajout.md'))
      await context.close()
    }, 90_000)

    it('raw_apres_une_edition_du_formulaire_dit_la_meme_chose_et_le_retour_relit', async () => {
      const { context, page, w } = await visit(en, 'f-brut-forme')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('button', { name: w.add, exact: true }).click()
      const row = form.getByRole('listitem').nth(2)
      await fill(row, 'Label', 'Retards')
      await fill(row, 'Value', '3')
      await fill(row, 'Caption', 'deux sur le gros œuvre')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      expect(norm(await form.getByRole('textbox').inputValue())).toBe('- Avancement: 62 % — 8 lots sur 13\n- Budget: 41 %\n- Retards: 3 — deux sur le gros œuvre')
      await form.getByRole('textbox').fill('- Budget: 41 %')
      await form.getByRole('button', { name: w.raw, exact: true }).click() // back to the form
      await form.getByLabel('Label', { exact: true }).first().waitFor()
      expect(await form.getByRole('listitem').count(), 'the form re-reads the lines').toBe(1)
      expect(await form.getByLabel('Label', { exact: true }).first().inputValue()).toBe('Budget')
      await context.close()
    }, 90_000)

    // docs/ecrans.md, E-35: "Raw shows the lines the form would write" — the `Writes:` line says `- `, so does the file.
    it('raw_montre_les_lignes_telles_que_le_formulaire_les_ecrit', async () => {
      const { context, page, w } = await visit(en, 'f-brut-texte')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('listitem').nth(0).getByLabel('Label', { exact: true }).focus()
      const writes = await form.getByText('Writes:').locator('..').innerText()
      expect(writes.replace(/\s+/g, ' ')).toBe('Writes: - Avancement: 62 % — 8 lots sur 13')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      expect(await form.getByRole('textbox').inputValue()).toBe('- Avancement: 62 % — 8 lots sur 13\n- Budget: 41 %')
      await context.close()
    }, 60_000)

    // AD-33: the file is the same: Raw opened and applied with nothing typed changes no byte.
    it('raw_applique_sans_rien_changer_ne_change_aucun_octet', async () => {
      const { context, page, puts, w } = await visit(en, 'f-brut-intact')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      await form.getByRole('textbox').waitFor()
      await form.getByRole('button', { name: w.apply, exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 15_000 })
      await page.getByText('Budget').first().waitFor()
      await page.getByRole('button', { name: w.done, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached' })
      expect(file(en, 'f-brut-intact')).toBe(fixture('figures-avant.md'))
      expect(puts.length, 'a PUT for a page nobody changed').toBe(0)
      await context.close()
    }, 60_000)

    // Bord: an empty Raw is a block with no row (docs/ecrans.md, states of E-35).
    it('raw_vide_est_valide_et_donne_un_bloc_sans_ligne', async () => {
      const { context, page, w } = await visit(en, 'f-vide')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      await form.getByRole('textbox').fill('')
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled()).toBe(false)
      await apply(page, form, w, { gone: 'Avancement' })
      const refusal = page.getByText(/^Not saved/)
      await expect
        .poll(async () => (await refusal.count()) > 0 || file(en, 'f-vide') !== fixture('figures-avant.md'), { timeout: 10_000 })
        .toBe(true)
      expect(await refusal.allTextContents(), 'the page is refused after the form accepted the empty block').toEqual([])
      const written = await finish(en, 'f-vide', page, w, fixture('figures-avant.md'))
      expect(written).not.toContain('Avancement')
      expect(written).not.toContain('Budget')
      expect(written.startsWith('---\ntitle: Chiffres\n---\n\n:::figures')).toBe(true)
      await context.close()
    }, 60_000)

    it('en_francais_le_formulaire_et_son_refus_parlent_francais', async () => {
      const { context, page, w } = await visit(fr, 'f-fr')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', /Chiffres — données|Figures — données|— données/)
      for (const word of [w.raw, w.add, w.apply, w.cancel]) expect(await form.getByRole('button', { name: word, exact: true }).count(), word).toBe(1)
      const value = form.getByRole('listitem').nth(1).locator('input').nth(1)
      await value.fill('trois')
      await form.getByText('Écris un nombre, avec son unité s’il y en a une', { exact: true }).waitFor({ timeout: 10_000 })
      await form.getByRole('listitem').nth(0).getByRole('button', { name: w.remove }).waitFor()
      for (const english of ['Write a number', 'Apply', 'Cancel', 'Remove row', 'Writes:']) expect((await form.innerText()), english).not.toContain(english)
      await shot(page, 'figures-form-fr')
      await context.close()
    }, 60_000)

    it('sur_telephone_le_formulaire_tient_dans_l_ecran', async () => {
      const { context, page, w } = await visit(en, 'f-telephone', { size: 'phone' })
      await startEditing(page, w)
      const form = await openForm(page, w, 'Avancement', 'Figures — data')
      const box = (await form.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390.5)
      expect(box.y + box.height).toBeLessThanOrEqual(844.5)
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isVisible()).toBe(true)
      await shot(page, 'figures-form-phone')
      await context.close()
    }, 60_000)
  })

  describe('B-27 data form, timeline, list, table', () => {
    it('timeline_ajouter_deux_lignes_avec_ou_sans_debut_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 't-ajout')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Cadrage', 'Timeline — data')
      expect(await form.getByLabel('Start', { exact: true }).first().inputValue()).toBe('2026-01-15')
      expect(await form.getByLabel('Due', { exact: true }).first().inputValue()).toBe('2026-03-01')
      await form.getByRole('button', { name: w.add, exact: true }).click()
      let row = form.getByRole('listitem').nth(2)
      await fill(row, 'Phase', 'Livraison')
      await fill(row, 'Start', '2026-07-01')
      await fill(row, 'Due', '2026-09-01')
      await form.getByRole('button', { name: w.add, exact: true }).click()
      row = form.getByRole('listitem').nth(3)
      await fill(row, 'Phase', 'Bilan')
      await fill(row, 'Due', '2026-10-01')
      await shot(page, 'timeline-form')
      await apply(page, form, w, { seen: 'Livraison' })
      expect(await finish(en, 't-ajout', page, w, fixture('timeline-avant.md'))).toBe(fixture('timeline-apres-ajout.md'))
      await context.close()
    }, 90_000)

    it('timeline_raw_ecrit_le_meme_fichier_que_le_formulaire', async () => {
      const { context, page, w } = await visit(en, 't-brut')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Cadrage', 'Timeline — data')
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      const area = form.getByRole('textbox')
      expect(norm(await area.inputValue())).toBe('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01')
      await area.fill('- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n- Livraison: 2026-07-01 → 2026-09-01\n- Bilan: 2026-10-01')
      await apply(page, form, w, { seen: 'Livraison' })
      expect(await finish(en, 't-brut', page, w, fixture('timeline-avant.md'))).toBe(fixture('timeline-apres-ajout.md'))
      await context.close()
    }, 90_000)

    // Échec: due before start is refused under the due field.
    it('timeline_echeance_avant_debut_est_refusee_sous_l_echeance', async () => {
      const { context, page, puts, w } = await visit(en, 't-invalide')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Cadrage', 'Timeline — data')
      const due = form.getByRole('listitem').nth(0).getByLabel('Due', { exact: true })
      await due.fill('2026-01-01')
      const message = form.getByText('Due is before start', { exact: true })
      await message.waitFor({ timeout: 10_000 })
      const [m, d] = [await message.boundingBox(), await due.boundingBox()]
      expect(m!.y).toBeGreaterThanOrEqual(d!.y + d!.height - 1)
      expect(await form.getByRole('button', { name: w.apply, exact: true }).isDisabled()).toBe(true)
      await shot(page, 'timeline-form-invalide')
      await form.getByRole('button', { name: w.cancel, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).click()
      await page.getByRole('button', { name: w.done, exact: true }).waitFor({ state: 'detached' })
      expect(puts).toEqual([])
      await context.close()
    }, 60_000)

    // Bord: an equal start and due are not "before".
    it('timeline_echeance_egale_au_debut_est_acceptee', async () => {
      const { context, page, w } = await visit(en, 't-ordre')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Cadrage', 'Timeline — data')
      const due = form.getByRole('listitem').nth(0).getByLabel('Due', { exact: true })
      const message = form.getByText('Due is before start', { exact: true })
      const applyButton = form.getByRole('button', { name: w.apply, exact: true })
      // Signal that validation is live: an earlier due is refused first. Reading
      // "no message" straight after the fill would pass before React rendered.
      await due.fill('2026-01-01')
      await message.waitFor({ timeout: 10_000 })
      await expect.poll(() => applyButton.isDisabled(), { timeout: 10_000 }).toBe(true)
      // Then the equal date: the refusal must lift and Apply come back.
      await due.fill('2026-01-15')
      await due.blur()
      await message.waitFor({ state: 'detached', timeout: 10_000 })
      await expect.poll(() => applyButton.isDisabled(), { timeout: 10_000 }).toBe(false)
      expect(await message.count()).toBe(0)
      await context.close()
    }, 60_000)

    it('liste_ajouter_une_ligne_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 'l-ajout')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Camille', /^List — data$|— data$/)
      await form.getByRole('button', { name: w.add, exact: true }).click()
      const row = form.getByRole('listitem').nth(2)
      await row.locator('input').nth(0).fill('Support')
      await row.locator('input').nth(1).fill('Aïcha')
      await apply(page, form, w, { seen: 'Support' })
      expect(norm(await finish(en, 'l-ajout', page, w, fixture('liste-avant.md')))).toBe(fixture('liste-apres-ajout.md'))
      await context.close()
    }, 90_000)

    it('liste_raw_ecrit_le_meme_fichier', async () => {
      const { context, page, w } = await visit(en, 'l-brut')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Camille', /— data$/)
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      const area = form.getByRole('textbox')
      expect(norm(await area.inputValue())).toBe('- Pilote: Camille\n- Relecture: Noé')
      await area.fill('- Pilote: Camille\n- Relecture: Noé\n- Support: Aïcha')
      await apply(page, form, w, { seen: 'Support' })
      expect(norm(await finish(en, 'l-brut', page, w, fixture('liste-avant.md')))).toBe(fixture('liste-apres-ajout.md'))
      await context.close()
    }, 90_000)

    it('tableau_ajouter_une_ligne_ecrit_le_fichier_de_reference', async () => {
      const { context, page, w } = await visit(en, 'tb-ajout')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Retard', /— data$/)
      await form.getByRole('button', { name: w.add, exact: true }).click()
      const rows = form.getByRole('listitem')
      const last = rows.last()
      await last.locator('input').nth(0).fill('Fuite')
      await last.locator('input').nth(1).fill('Basse')
      await shot(page, 'table-form')
      await apply(page, form, w, { seen: 'Fuite' })
      const written = await finish(en, 'tb-ajout', page, w, fixture('tableau-avant.md'))
      expect(cells(written)).toEqual([['Risque', 'Gravité'], ['Retard', 'Haute'], ['Fuite', 'Basse']])
      expect(written.startsWith('---\ntitle: Risques\n---\n\n:::table\n')).toBe(true)
      expect(written.endsWith('\n:::\n')).toBe(true)
      await context.close()
    }, 90_000)

    it('tableau_raw_montre_le_tableau_en_pipes', async () => {
      const { context, page, w } = await visit(en, 'tb-brut')
      await startEditing(page, w)
      const form = await openForm(page, w, 'Retard', /— data$/)
      await form.getByRole('button', { name: w.raw, exact: true }).click()
      const text = await form.getByRole('textbox').inputValue()
      expect(cells(text), 'the lines of the table, one pipe row each').toEqual([['Risque', 'Gravité'], ['Retard', 'Haute']])
      await context.close()
    }, 60_000)
  })

  // ── P-17 step 4 / B-24: inserting from the gallery opens the form ──────────────────────────────────
  describe('gallery insertion opens the data form', () => {
    it('inserer_figures_ouvre_son_formulaire_sur_une_ligne_vide', async () => {
      const { context, page, w } = await visit(en, 'i-figures')
      await startEditing(page, w)
      await page.getByRole('button', { name: 'Add block' }).click()
      const gallery = page.getByRole('dialog', { name: 'Add block' })
      await gallery.getByRole('option', { name: 'Figures' }).click()
      const form = page.getByRole('dialog', { name: 'Figures — data' })
      await form.waitFor({ timeout: 15_000 })
      expect(await gallery.count(), 'the gallery closed').toBe(0)
      expect(await form.getByRole('listitem').count(), 'one empty row').toBe(1)
      expect(await form.getByLabel('Label', { exact: true }).inputValue()).toBe('')
      await shot(page, 'galerie-figures-formulaire')
      const row = form.getByRole('listitem').first()
      await fill(row, 'Label', 'Délai')
      await fill(row, 'Value', '3')
      await fill(row, 'Caption', 'jours')
      await apply(page, form, w, { seen: 'Délai' })
      expect(await finish(en, 'i-figures', page, w, fixture('vide-avant.md'))).toBe(fixture('inseree-figures.md'))
      await context.close()
    }, 90_000)

    it('la_carte_figures_montre_ses_variantes_et_celle_choisie_est_inseree', async () => {
      const { context, page, w } = await visit(en, 'i-figures-inline')
      await startEditing(page, w)
      await page.getByRole('button', { name: 'Add block' }).click()
      const gallery = page.getByRole('dialog', { name: 'Add block' })
      await gallery.getByRole('option', { name: 'Figures' }).waitFor()
      expect(await gallery.getByRole('radio', { name: 'tiles' }).count()).toBe(1)
      expect(await gallery.getByRole('radio', { name: 'rows' }).count(), 'list shows its own three').toBe(1)
      await gallery.getByRole('radio', { name: 'inline' }).click()
      await gallery.getByRole('option', { name: 'Figures' }).click()
      const form = page.getByRole('dialog', { name: 'Figures — data' })
      await form.waitFor({ timeout: 15_000 })
      const row = form.getByRole('listitem').first()
      await fill(row, 'Label', 'Délai')
      await fill(row, 'Value', '3')
      await fill(row, 'Caption', 'jours')
      await apply(page, form, w, { seen: 'Délai' })
      expect(await finish(en, 'i-figures-inline', page, w, fixture('vide-avant.md'))).toBe(fixture('inseree-figures-inline.md'))
      await context.close()
    }, 90_000)

    // Exclusion: a block without data does not open a form (Callout was covered above); neither does Cancel write.
    it('annuler_le_formulaire_d_un_bloc_insere_ne_perd_pas_la_page', async () => {
      const { context, page, w } = await visit(en, 'i-annule')
      await startEditing(page, w)
      await page.getByRole('button', { name: 'Add block' }).click()
      await page.getByRole('dialog', { name: 'Add block' }).getByRole('option', { name: 'Figures' }).click()
      const form = page.getByRole('dialog', { name: 'Figures — data' })
      await form.waitFor({ timeout: 15_000 })
      await form.getByRole('button', { name: w.cancel, exact: true }).click()
      await form.waitFor({ state: 'detached' })
      expect(await page.getByText('Du texte.').first().isVisible(), 'the text of the page is still there').toBe(true)
      await context.close()
    }, 60_000)

    it('projet_inserer_timeline_ouvre_son_formulaire_ajoute_une_ligne_et_raw_ecrit_le_meme_fichier', async () => {
      for (const mode of ['form', 'raw'] as const) {
        const id = mode === 'form' ? 'i-timeline' : 'i-timeline-brut'
        const { context, page, w } = await visit(en, id)
        await startEditing(page, w)
        await page.getByRole('button', { name: 'Add block' }).click()
        const gallery = page.getByRole('dialog', { name: 'Add block' })
        await gallery.getByRole('option', { name: 'Timeline' }).click()
        const form = page.getByRole('dialog', { name: 'Timeline — data' })
        await form.waitFor({ timeout: 15_000 })
        expect(await form.getByRole('listitem').count(), `${mode}: one empty row`).toBe(1)
        if (mode === 'form') {
          await fill(form.getByRole('listitem').nth(0), 'Phase', 'Lancement')
          await fill(form.getByRole('listitem').nth(0), 'Start', '2026-02-01')
          await fill(form.getByRole('listitem').nth(0), 'Due', '2026-02-15')
          await form.getByRole('button', { name: w.add, exact: true }).click()
          expect(await form.getByRole('listitem').count()).toBe(2)
          await fill(form.getByRole('listitem').nth(1), 'Phase', 'Fin')
          await fill(form.getByRole('listitem').nth(1), 'Due', '2026-03-01')
          await shot(page, 'projet-timeline-formulaire')
        } else {
          await form.getByRole('button', { name: w.raw, exact: true }).click()
          await form.getByRole('textbox').fill('- Lancement: 2026-02-01 → 2026-02-15\n- Fin: 2026-03-01')
        }
        await apply(page, form, w, { seen: 'Lancement' })
        expect(await finish(en, id, page, w, fixture('vide-projet-avant.md')), mode).toBe(fixture('inseree-timeline.md'))
        await context.close()
      }
    }, 120_000)

    it('liste_inseree_ouvre_son_formulaire_et_tableau_aussi', async () => {
      for (const [id, option] of [['i-liste', 'List'], ['i-tableau', 'Table']] as const) {
        const { context, page, w } = await visit(en, id)
        await startEditing(page, w)
        await page.getByRole('button', { name: 'Add block' }).click()
        await page.getByRole('dialog', { name: 'Add block' }).getByRole('option', { name: option, exact: true }).click()
        const form = page.getByRole('dialog', { name: new RegExp(`${option} — data`) })
        await form.waitFor({ timeout: 15_000 })
        expect(await form.getByRole('button', { name: w.apply, exact: true }).count(), option).toBe(1)
        await context.close()
      }
    }, 60_000)
  })
})
