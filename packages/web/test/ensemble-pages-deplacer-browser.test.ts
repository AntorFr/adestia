/**
 * `adestia-pages-deplacer` seen from its need (B-23 move a block without a mouse; B-24 the block gallery;
 * P-17; E-4 in editing, E-34), through a driven browser on the bench instance (`bench/launch.mjs`, scripted
 * engine, seeds `besoin-pages-deplacer` and `besoin-pages-deplacer-sans-pm`). Every expected word and number is
 * written by hand from docs/parcours.md (B-23, B-24, P-17) and docs/ecrans.md (« E-4 move and E-34, states »),
 * never from the components.
 *
 * PLAN (need -> case -> proof)
 *  B-23 nominal   six blocks, the 4th moved to the 2nd by Alt+ArrowUp twice          -> live region + order shown + order saved
 *  B-23 nominal   same on the phone, Move up tapped twice                              -> live region + order shown + order saved
 *  B-23 nominal   Move down tapped on the 1st block                                    -> "Moved to position 2 of 6"
 *  B-23 bords     first block: Move up disabled, Alt+ArrowUp says "Already first", nothing moves; last: the same downwards
 *  B-23 bords     page of one block: both controls disabled, not hidden; page of zero: nothing to move
 *  B-23 touch     long press (400 ms) on the grip then drag moves the block; a release without moving, or moving away early, does not
 *  B-23 echec     the save of a move is refused: "Not saved" + Retry, the moved order stays on screen
 *  B-23 exclusion read-only page: no move control; a move loses no block and duplicates none
 *  B-24 nominal   Add block opens "Add block"; choosing Figures puts it after the focused block
 *  B-24 bords     no focus -> end of page; zero-block page -> end of page; search (case, accents, no match); keyboard Enter
 *  B-24 echec     Escape / x close without inserting; page written elsewhere -> "The page changed." and nothing inserted
 *  B-24 contenu   core cards by name; plugin enabled listed, disabled not; no record -> identifier; project-management enabled or not
 *  B-24 menu `/`  keeps its items and ends on "Browse", which opens the gallery
 *  B-24 phone     bottom sheet, 80 % of the height
 *  B-24 exclusion read-only page: no Add block
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 * `DEPLACER_SHOTS=<dir>` writes one capture per state.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

const SHOTS = process.env.DEPLACER_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** Opens a page of the instance and waits for the proof that the shell and the pages index are up. */
async function visit(browser: BrowserOf, base: string, locale: string, size: 'desk' | 'phone', path: string) {
  const { context, page } = (await open(browser, base, {
    theme: 'light',
    size,
    locale,
    route: `/page/${path}`,
    before: async (p: any) => {
      p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  return { context, page }
}

/** Presses Edit and waits for the editor: its Done button and the blocks of the page. */
async function edit(page: any, blocks: number) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  if (blocks > 0) await page.waitForFunction((n: number) => document.querySelectorAll('[data-block="callout"]').length >= n, blocks, { timeout: 20_000 })
  await page.waitForTimeout(500) // the editor remounts once the index is read; a click lands on the final one
}

const block = (page: any, n: number) => page.locator('[data-block="callout"]', { hasText: `Bloc ${n}` })
/** The bar of a block shows on hover (a touch screen has no hover). */
async function bar(page: any, n: number, phone = false) {
  const b = block(page, n).first()
  await b.scrollIntoViewIfNeeded()
  if (!phone) await b.hover()
  return b
}
/** A touch screen has no hover: the user touches the block, and its bar answers (retried, a touch that lands on a remounting editor is lost). */
async function touchBar(page: any, n: number) {
  const b = await bar(page, n, true)
  for (let attempt = 0; attempt < 6; attempt++) {
    const shownNow = await control(b, 'Move up').evaluate((e: HTMLElement) => getComputedStyle(e.parentElement!).pointerEvents !== 'none')
    if (shownNow) return b
    await b.getByText(`Texte du bloc ${n}.`).tap()
    await page.waitForTimeout(500)
  }
  return b
}
const control = (b: any, name: string) => b.getByRole('button', { name, exact: true }).first()

/** The titles of the callouts, in the order the editor shows them. */
const shown = (page: any): Promise<number[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-block="callout"]')].map((e) => Number(/Bloc (\d)/.exec((e as HTMLElement).innerText)?.[1] ?? 0)),
  )

/** The kinds of the blocks of the editor, in order (`callout`, `figures`…). */
const kinds = (page: any): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('.ProseMirror [data-block]')].map((e) => e.getAttribute('data-block') ?? ''))

/** What the server holds for a page: its markdown. */
async function stored(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}/api/pages/${path}.md`)
  return ((await res.json()) as { markdown: string }).markdown
}
const storedOrder = async (base: string, path: string): Promise<number[]> =>
  [...(await stored(base, path)).matchAll(/title="Bloc (\d)"/g)].map((m) => Number(m[1]))
/** The fences of a stored page, in order: `callout`, `figures`, `timeline`… */
const fences = async (base: string, path: string): Promise<string[]> => [...(await stored(base, path)).matchAll(/^:::([a-z-]+)/gm)].map((m) => m[1] as string)

async function waitStoredOrder(base: string, path: string, want: number[]) {
  await expect.poll(() => storedOrder(base, path), { timeout: 30_000, message: `the order the server holds for ${path}` }).toEqual(want)
}

async function openGallery(page: any) {
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
  return page.getByRole('dialog', { name: 'Add block' })
}
const card = (gallery: any, name: string) => gallery.getByRole('option', { name, exact: true })
/** The group titles and card names of the open gallery. */
const catalogue = (page: any): Promise<{ group: string; cards: { name: string; line: string }[] }[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.adestia-blockgallery__group')].map((g) => ({
      group: g.querySelector('h3')?.textContent ?? '',
      cards: [...g.querySelectorAll('[role="option"]')].map((c) => ({
        name: c.querySelector('.adestia-blockcard__name')?.textContent ?? '',
        line: c.querySelector('.adestia-blockcard__line')?.textContent ?? '',
      })),
    })),
  )
const names = (groups: { cards: { name: string }[] }[]) => groups.flatMap((g) => g.cards.map((c) => c.name))

describe.skipIf(!playwright)('adestia-pages-deplacer, from the need', () => {
  describe('en, desk and phone', () => {
    let instance: Instance
    let browser: BrowserOf
    beforeAll(async () => {
      instance = await launch('besoin-pages-deplacer', 'skippy', 'en')
      browser = await newBrowser()
    }, 60_000)
    afterAll(async () => {
      await browser?.close()
      await instance?.stop()
    })

    // ── B-23 ─────────────────────────────────────────────────────────────────
    // P-17 step 2. Breaks if Alt+ArrowUp stops calling the move, or the live region stops naming the new place.
    it('clavier_deplace_le_quatrieme_bloc_au_deuxieme_rang_et_la_zone_live_le_dit', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-clavier')
      await edit(page, 6)
      expect(await shown(page)).toEqual([1, 2, 3, 4, 5, 6])
      await control(await bar(page, 4), 'Move up').focus()
      await page.keyboard.press('Alt+ArrowUp')
      await page.getByText('Moved to position 3 of 6', { exact: true }).waitFor({ timeout: 10_000 })
      expect(await shown(page)).toEqual([1, 2, 4, 3, 5, 6])
      await control(await bar(page, 4), 'Move up').focus()
      await page.keyboard.press('Alt+ArrowUp')
      await page.getByText('Moved to position 2 of 6', { exact: true }).waitFor({ timeout: 10_000 })
      expect(await shown(page)).toEqual([1, 4, 2, 3, 5, 6])
      await shot(page, 'clavier-deux-rangs')
      await waitStoredOrder(instance.url, 'six-clavier', [1, 4, 2, 3, 5, 6])
      await context.close()
    }, 120_000)

    // P-17 step 3: on the phone, Move up does the same. Breaks if the controls are hidden or unreachable on a touch screen.
    it('telephone_move_up_deplace_le_quatrieme_bloc_au_deuxieme_rang', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'six-telephone')
      await edit(page, 6)
      for (const dir of ['Moved to position 3 of 6', 'Moved to position 2 of 6']) {
        const b = await touchBar(page, 4)
        await control(b, 'Move up').tap()
        await page.getByText(dir, { exact: true }).waitFor({ timeout: 10_000 })
      }
      expect(await shown(page)).toEqual([1, 4, 2, 3, 5, 6])
      await shot(page, 'telephone-deux-rangs')
      await waitStoredOrder(instance.url, 'six-telephone', [1, 4, 2, 3, 5, 6])
      await context.close()
    }, 120_000)

    // E-4 « Phone »: the move controls stay reachable, 44 px.
    // Breaks if the controls shrink under the touch target size.
    it('telephone_les_controles_de_deplacement_font_44_px', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'six-bords')
      await edit(page, 6)
      const b = await touchBar(page, 3)
      for (const name of ['Move up', 'Move down']) {
        const box = await control(b, name).boundingBox()
        expect(box, name).not.toBeNull()
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44)
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44)
      }
      await context.close()
    }, 60_000)

    // B-23: the Move down control moves the block one place down and says where.
    // Breaks if Move down moves up, or not at all.
    it('move_down_deplace_le_premier_bloc_en_deuxieme_position', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-boutons')
      await edit(page, 6)
      await control(await bar(page, 1), 'Move down').click()
      await page.getByText('Moved to position 2 of 6', { exact: true }).waitFor({ timeout: 10_000 })
      expect(await shown(page)).toEqual([2, 1, 3, 4, 5, 6])
      await waitStoredOrder(instance.url, 'six-boutons', [2, 1, 3, 4, 5, 6])
      await context.close()
    }, 60_000)

    // E-4 « First / last block ». Breaks if a block can be pushed past an end, or the live region stays silent.
    it('premier_et_dernier_bloc_move_up_et_move_down_inactifs_et_la_zone_live_dit_deja', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-bords')
      await edit(page, 6)
      const first = await bar(page, 1)
      expect(await control(first, 'Move up').isDisabled(), 'Move up on the first').toBe(true)
      expect(await control(first, 'Move down').isDisabled(), 'Move down on the first').toBe(false)
      await control(first, 'Move down').focus() // the bar of the first block holds the focus
      await page.keyboard.press('Alt+ArrowUp')
      await page.getByText('Already first', { exact: true }).waitFor({ timeout: 10_000 })
      expect(await shown(page)).toEqual([1, 2, 3, 4, 5, 6])
      const last = await bar(page, 6)
      expect(await control(last, 'Move down').isDisabled(), 'Move down on the last').toBe(true)
      expect(await control(last, 'Move up').isDisabled(), 'Move up on the last').toBe(false)
      await control(last, 'Move up').focus()
      await page.keyboard.press('Alt+ArrowDown')
      await page.getByText('Already last', { exact: true }).waitFor({ timeout: 10_000 })
      expect(await shown(page)).toEqual([1, 2, 3, 4, 5, 6])
      await shot(page, 'deja-dernier')
      expect(await storedOrder(instance.url, 'six-bords'), 'nothing was written').toEqual([1, 2, 3, 4, 5, 6])
      await context.close()
    }, 60_000)

    // E-4 « Empty »: one block, both controls disabled (a disabled button, not hidden); zero blocks, Add block inserts at the end.
    // Breaks if the controls vanish or stay live on a single block.
    it('page_dun_seul_bloc_controles_desactives_pas_caches', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'un-seul')
      await edit(page, 1)
      const only = await bar(page, 1)
      expect(await only.getByRole('button', { name: 'Move up', exact: true }).count(), 'Move up is shown').toBe(1)
      expect(await only.getByRole('button', { name: 'Move down', exact: true }).count(), 'Move down is shown').toBe(1)
      expect(await control(only, 'Move up').isDisabled()).toBe(true)
      expect(await control(only, 'Move down').isDisabled()).toBe(true)
      await context.close()
    }, 60_000)

    // B-23 touch: a long press (400 ms) on the grip lifts the block, a drag then moves it; releasing without moving cancels.
    // Breaks if the long press does nothing, or if a plain release without movement reorders.
    it('appui_long_sur_la_poignee_puis_glisser_deplace_le_bloc_et_un_relachement_sans_glisser_annule', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'six-appui')
      await edit(page, 6)
      const cdp = await context.newCDPSession(page)
      const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
      const gripOf = async (n: number) => {
        const b = await touchBar(page, n)
        const box = await control(b, 'Move block').boundingBox()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      const yOf = async (n: number) => (await block(page, n).first().boundingBox()).y
      // release without moving: nothing changes
      let g = await gripOf(4)
      await touch('touchStart', g.x, g.y)
      await page.waitForTimeout(700)
      await touch('touchEnd', g.x, g.y)
      await page.waitForTimeout(500)
      expect(await shown(page), 'released without moving').toEqual([1, 2, 3, 4, 5, 6])
      // moving away before 400 ms: cancelled, nothing changes
      g = await gripOf(4)
      const upTo = (await yOf(2)) + 10
      await touch('touchStart', g.x, g.y)
      for (const f of [0.25, 0.5, 0.75, 1]) await touch('touchMove', g.x, g.y + (upTo - g.y) * f)
      await touch('touchEnd', g.x, upTo)
      await page.waitForTimeout(500)
      expect(await shown(page), 'moved before 400 ms').toEqual([1, 2, 3, 4, 5, 6])
      // long press, then drag up onto the 2nd block
      g = await gripOf(4)
      const target = (await yOf(2)) + 10
      await touch('touchStart', g.x, g.y)
      await page.waitForTimeout(600)
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
        await touch('touchMove', g.x, g.y + (target - g.y) * f)
        await page.waitForTimeout(40)
      }
      await touch('touchEnd', g.x, target)
      await shot(page, 'appui-long-glisser')
      await expect.poll(() => shown(page), { timeout: 10_000 }).toEqual([1, 4, 2, 3, 5, 6])
      await context.close()
    }, 120_000)

    // E-4 « Error »: after a failed save the moved order stays on screen and the file keeps the old one.
    // Breaks if the move is rolled back on screen, or if a failed save is written anyway.
    it('sauvegarde_refusee_apres_un_deplacement_garde_lordre_deplace_a_lecran', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-enregistre')
      await edit(page, 6)
      await page.route('**/api/pages/six-enregistre.md', async (route: any) => {
        if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
        else await route.continue()
      })
      await control(await bar(page, 2), 'Move down').click()
      await page.getByText('Moved to position 3 of 6', { exact: true }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(4000) // the save has been tried and refused by now
      expect(await shown(page), 'the moved order stays on screen').toEqual([1, 3, 2, 4, 5, 6])
      expect(await storedOrder(instance.url, 'six-enregistre'), 'the file keeps the old order').toEqual([1, 2, 3, 4, 5, 6])
      await shot(page, 'non-enregistre')
      await context.close()
    }, 90_000)

    // E-4 « Error »: the save status says "Not saved" with E-4's Retry.
    // Breaks if a failed save shows no status of that name, or offers no way to retry.
    it('sauvegarde_refusee_apres_un_deplacement_dit_non_enregistre_avec_retry', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-retry')
      await edit(page, 6)
      await page.route('**/api/pages/six-retry.md', async (route: any) => {
        if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
        else await route.continue()
      })
      await control(await bar(page, 2), 'Move down').click()
      await page.getByText('Moved to position 3 of 6', { exact: true }).waitFor({ timeout: 10_000 })
      await page.getByText(/Not saved/).first().waitFor({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ timeout: 10_000 })
      await context.close()
    }, 90_000)

    // E-4 « Read-only »: a page with a block Adestia does not know has no Edit, hence no move control, no Add block.
    // Breaks if the controls leak onto a page that cannot be written.
    it('page_en_lecture_seule_sans_controle_de_deplacement_ni_add_block', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'lecture-seule')
      await page.waitForSelector('.adestia-editor', { timeout: 20_000 })
      await page.waitForTimeout(1000)
      expect(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 'no Edit').toBe(0)
      for (const name of ['Move up', 'Move down', 'Move block', 'Add block'])
        expect(await page.getByRole('button', { name, exact: true }).count(), name).toBe(0)
      await shot(page, 'lecture-seule')
      await context.close()
    }, 60_000)

    // P-17 step 2 reading: a page not in editing has no controls either.
    it('page_en_lecture_sans_edition_pas_de_controle_de_deplacement', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-clavier')
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ timeout: 20_000 })
      for (const name of ['Move up', 'Move down', 'Add block'])
        expect(await page.getByRole('button', { name, exact: true }).count(), name).toBe(0)
      await context.close()
    }, 60_000)

    // B-23 pointer: the grip and its drag stay (E-4). Breaks if the pointer drag is lost.
    it('glisser_a_la_souris_par_la_poignee_deplace_toujours_le_bloc', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'six-bords')
      await edit(page, 6)
      // six-bords may have been written by an earlier test only if it failed: start from the page as stored
      const start = await shown(page)
      expect(start).toEqual([1, 2, 3, 4, 5, 6])
      const b = await bar(page, 5)
      const g = await control(b, 'Move block').boundingBox()
      const t = await block(page, 2).first().boundingBox()
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down()
      for (const f of [0.2, 0.4, 0.6, 0.8, 1]) await page.mouse.move(g.x + g.width / 2, g.y + (t.y + 10 - g.y) * f, { steps: 4 })
      await page.mouse.up()
      await expect.poll(() => shown(page), { timeout: 10_000 }).toEqual([1, 5, 2, 3, 4, 6])
      await waitStoredOrder(instance.url, 'six-bords', [1, 5, 2, 3, 4, 6])
      await context.close()
    }, 60_000)

    // ── B-24 ─────────────────────────────────────────────────────────────────
    // P-17 step 4: Add block opens the gallery; choosing Figures lands it after the block that has focus.
    // Breaks if the insertion point ignores the focus (end of page, start of page) or Figures is not inserted.
    it('add_block_ouvre_la_galerie_et_figures_se_pose_apres_le_bloc_qui_a_le_focus', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-apres')
      await edit(page, 2)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      const gallery = await openGallery(page)
      await shot(page, 'galerie-ouverte')
      await card(gallery, 'Figures').click()
      await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 })
      expect(await kinds(page)).toEqual(['callout', 'figures', 'callout'])
      await shot(page, 'figures-insere')
      await context.close()
    }, 90_000)

    // P-17 step 4 + B-24: the inserted block "lands with its default values": the page, once saved, holds it.
    // Breaks if the block is inserted empty and the save refuses it, so that nothing reaches the file.
    it('figures_insere_depuis_la_galerie_est_enregistre_avec_ses_valeurs_par_defaut', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-enregistre')
      await edit(page, 2)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      const gallery = await openGallery(page)
      await card(gallery, 'Figures').click()
      await expect.poll(() => fences(instance.url, 'galerie-enregistre'), { timeout: 20_000 }).toEqual(['callout', 'figures', 'callout'])
      expect(await page.getByText(/Not saved/).count(), 'no refusal shown').toBe(0)
      await context.close()
    }, 90_000)

    // P-17 step 4: EVERY card of the gallery lands in a page the server accepts, not only Figures and Table.
    // Breaks if a block holding flow (callout, list, image gallery…) is inserted empty and the save is refused.
    it('chaque_carte_de_la_galerie_donne_une_page_enregistree', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-tous')
      await edit(page, 2)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      const all = names(await (async () => { const g = await openGallery(page); const c = await catalogue(page); await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 }); void g; return c })())
      expect(all.length).toBeGreaterThan(3)
      for (const [i, name] of all.entries()) {
        const gallery = await openGallery(page)
        await card(gallery, name).click()
        await expect.poll(async () => (await fences(instance.url, 'galerie-tous')).length, { timeout: 20_000, message: `${name} saved` }).toBe(2 + i + 1)
        expect(await page.getByText(/Not saved/).count(), `refusal after ${name}`).toBe(0)
      }
      await context.close()
    }, 240_000)

    // B-24: no focus -> at the end of the page.
    it('sans_focus_le_bloc_se_pose_en_fin_de_page', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-fin')
      await edit(page, 2)
      const gallery = await openGallery(page)
      await card(gallery, 'Table').click()
      expect(await kinds(page)).toEqual(['callout', 'callout', 'table'])
      await context.close()
    }, 90_000)

    // E-34 « Empty »: a page of zero blocks, Add block inserts at the end of the page.
    it('page_sans_bloc_add_block_insere_a_la_fin', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'zero')
      await edit(page, 0)
      const gallery = await openGallery(page)
      await card(gallery, 'Figures').click()
      expect(await kinds(page)).toEqual(['figures'])
      await context.close()
    }, 90_000)

    // E-34 « Normal »: x and Escape close it without inserting; the sheet holds the search field "Search a block…".
    // Breaks if closing inserts the card under focus.
    it('galerie_se_ferme_par_echap_et_par_la_croix_sans_rien_inserer', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-annule')
      await edit(page, 2)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      for (const how of ['Escape', 'Close']) {
        const gallery = await openGallery(page)
        await gallery.getByPlaceholder('Search a block…').waitFor({ timeout: 5_000 })
        if (how === 'Escape') await page.keyboard.press('Escape')
        else await gallery.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 })
      }
      await page.waitForTimeout(2500) // an autosave, if one were wrongly queued, would have left by now
      expect(await fences(instance.url, 'galerie-annule')).toEqual(['callout', 'callout'])
      expect(await shown(page)).toEqual([1, 2])
      await context.close()
    }, 90_000)

    // E-34: the search ignores case and accents; no match shows the sentence of the state table.
    // Breaks if the search is case-sensitive, accent-sensitive, or the empty state is bare.
    it('recherche_ignore_casse_et_accents_et_dit_aucun_bloc_a_ce_nom', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-recherche')
      await edit(page, 2)
      const gallery = await openGallery(page)
      const search = gallery.getByPlaceholder('Search a block…')
      await search.fill('FIGURES')
      await expect.poll(async () => names(await catalogue(page)), { timeout: 5_000 }).toEqual(['Figures'])
      await search.fill('tablé')
      await expect.poll(async () => names(await catalogue(page)), { timeout: 5_000 }).toEqual(['Table'])
      await search.fill('gantt')
      await gallery.getByText('No block called "gantt"', { exact: true }).waitFor({ timeout: 5_000 })
      await gallery.getByText('Try "timeline", or clear the search to browse everything.', { exact: true }).waitFor({ timeout: 5_000 })
      expect(names(await catalogue(page)), 'no card for a search that matches nothing').toEqual([])
      await shot(page, 'galerie-aucun-resultat')
      await search.fill('')
      await expect.poll(async () => names(await catalogue(page)).includes('Callout'), { timeout: 5_000 }).toBe(true)
      await context.close()
    }, 90_000)

    // E-34 « Normal »: arrows move the card under focus, Enter inserts it (no confirm button).
    // Breaks if Enter does nothing, or inserts a card other than the one marked.
    it('galerie_au_clavier_fleche_puis_entree_insere_la_carte_marquee', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-apres')
      await edit(page, 2)
      await block(page, 2).getByText('Texte du bloc 2.').click()
      const gallery = await openGallery(page)
      const marked = () => page.evaluate(() => document.querySelector('[role="option"][aria-selected="true"] .adestia-blockcard__name')?.textContent ?? '')
      const first = await marked()
      await gallery.getByPlaceholder('Search a block…').focus()
      await page.keyboard.press('ArrowDown')
      await expect.poll(marked, { timeout: 5_000 }).not.toBe(first)
      const chosen = await marked()
      const fence: Record<string, string> = { Content: 'content', Callout: 'callout', Figures: 'figures', Table: 'table', List: 'list', Section: 'section', Columns: 'col', 'Line break': 'row', 'Image gallery': 'gallery' }
      expect(Object.keys(fence), `the marked card (${chosen}) is a core card`).toContain(chosen)
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: 'Add block' }).waitFor({ state: 'detached', timeout: 10_000 })
      // after Bloc 2, so at the end of a two-block page, whatever earlier tests did to this page
      await expect.poll(async () => (await kinds(page)).at(-1), { timeout: 10_000 }).toBe(fence[chosen])
      await context.close()
    }, 90_000)

    // E-34 « Normal » and B-24: the cores cards by name, with a line each; the identifiers `row`, `gallery`, `content` are not names.
    // Breaks if a core block shows under its identifier or without its line.
    it('galerie_liste_les_blocs_du_coeur_par_nom_avec_leur_ligne', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-recherche')
      await edit(page, 2)
      await openGallery(page)
      const groups = await catalogue(page)
      const all = names(groups)
      for (const n of ['Content', 'Callout', 'Figures', 'List', 'Table', 'Section', 'Columns', 'Line break', 'Image gallery']) expect(all, `core card ${n}`).toContain(n)
      for (const id of ['row', 'section', 'gallery', 'content', 'callout', 'figures', 'list', 'table']) expect(all, `identifier ${id} shown as a name`).not.toContain(id)
      const content = groups.flatMap((g) => g.cards).find((c) => c.name === 'Content')
      expect(content?.line).toBe('Pages of one kind, listed where you put it.')
      for (const c of groups.flatMap((g) => g.cards).filter((c) => ['Content', 'Callout', 'Figures', 'List', 'Table', 'Section', 'Columns', 'Line break', 'Image gallery'].includes(c.name)))
        expect(c.line.trim().length, `line of ${c.name}`).toBeGreaterThan(0)
      const layout = groups.find((g) => g.group === 'Layout')
      expect(layout?.cards.map((c) => c.name).sort(), 'the Layout group holds section, columns, the row and gallery').toEqual(['Columns', 'Image gallery', 'Line break', 'Section'])
      // The pictures load after the sheet opens: wait for them, a slow machine draws them late.
      await expect
        .poll(
          () => page.evaluate(() => [...document.querySelectorAll('.adestia-blockcard img')].filter((i) => !((i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)).map((i) => (i as HTMLImageElement).src)),
          { message: 'every card picture is drawn', timeout: 30_000 },
        )
        .toEqual([])
      await context.close()
    }, 90_000)

    // B-24 + manifest `gallery`: an enabled plugin's block is listed under its record; a disabled plugin's is not;
    // a block with no record shows its identifier, the plugin's id as group, no line.
    // Breaks if a disabled plugin's record leaks, or an enabled one is missing.
    it('galerie_liste_le_bloc_dun_plugin_active_et_pas_celui_dun_plugin_desactive', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-recherche')
      await edit(page, 2)
      const gallery = await openGallery(page)
      const groups = await catalogue(page)
      const on = groups.find((g) => g.group === 'Bench group')
      expect(on?.cards, 'enabled plugin block under its group').toEqual([{ name: 'Activity report', line: 'Sums up the week of a team.' }])
      const flat = groups.flatMap((g) => g.cards)
      expect(flat.map((c) => c.name), 'disabled plugin block').not.toContain('Disabled secret block')
      expect(flat.map((c) => c.name), 'disabled plugin block by identifier').not.toContain('bench-secret')
      expect(groups.map((g) => g.group), 'disabled plugin group').not.toContain('Bench off')
      const bare = groups.find((g) => g.group === 'bench-sans-fiche')
      expect(bare?.cards, 'no record: identifier, plugin id, no line').toEqual([{ name: 'bench-nu', line: '' }])
      await gallery.getByPlaceholder('Search a block…').fill('secret')
      await gallery.getByText('No block called "secret"', { exact: true }).waitFor({ timeout: 5_000 })
      await gallery.getByPlaceholder('Search a block…').fill('report')
      await expect.poll(async () => names(await catalogue(page)), { timeout: 5_000 }).toEqual(['Activity report'])
      await context.close()
    }, 90_000)

    // B-24: with project-management enabled, `timeline` and `subproject` show under their name and line, not their identifier.
    // Breaks if the project blocks are missing from the manifest records.
    it('galerie_montre_timeline_et_subproject_sous_leur_nom_et_leur_ligne', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'projet')
      await edit(page, 1)
      await openGallery(page)
      const groups = await catalogue(page)
      const flat = groups.flatMap((g) => g.cards)
      for (const n of ['Timeline', 'Sub-projects']) {
        const c = flat.find((x) => x.name === n)
        expect(c, `card ${n}`).toBeDefined()
        expect(c!.line.trim().length, `line of ${n}`).toBeGreaterThan(0)
      }
      expect(flat.map((c) => c.name), 'identifiers shown as names').not.toContain('timeline')
      expect(flat.map((c) => c.name)).not.toContain('subproject')
      const project = groups.find((g) => g.group === 'Project')
      expect(project?.cards.map((c) => c.name).sort()).toEqual(['Sub-projects', 'Timeline'])
      await shot(page, 'galerie-projet')
      await context.close()
    }, 90_000)

    // B-24: inserting Timeline from the gallery writes a :::timeline block (the block exists, not only its card).
    it('choisir_timeline_pose_un_bloc_timeline_apres_le_bloc_qui_a_le_focus', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'projet')
      await edit(page, 1)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      const gallery = await openGallery(page)
      await card(gallery, 'Timeline').click()
      await expect.poll(async () => (await fences(instance.url, 'projet')).slice(0, 2), { timeout: 30_000 }).toEqual(['callout', 'timeline'])
      await context.close()
    }, 90_000)

    // E-34 / `/` menu: the menu stays, ends on "Browse", which opens the gallery and inserts after the block with focus.
    // Breaks if Browse is missing, not last, or inserts elsewhere.
    it('menu_slash_se_termine_par_browse_qui_ouvre_la_galerie', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-fin')
      await edit(page, 2)
      await block(page, 2).getByText('Texte du bloc 2.').click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await page.keyboard.type('/')
      const menu = page.locator('.milkdown-slash-menu').first()
      await menu.waitFor({ state: 'visible', timeout: 15_000 })
      const items = await menu.evaluate((m: HTMLElement) => [...m.querySelectorAll('li, [role="menuitem"], button')].map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean))
      expect(items.length, 'the slash menu keeps its items').toBeGreaterThan(1)
      expect(items.at(-1), 'the last item of the menu').toBe('Browse')
      await shot(page, 'menu-slash-browse')
      await menu.getByText('Browse', { exact: true }).click()
      await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
      await context.close()
    }, 90_000)

    // E-34 « Error »: the page was written elsewhere while the sheet was open: nothing is inserted, "The page changed." with Reload.
    // Breaks if the insertion overwrites the other write, or fails silently.
    it('page_ecrite_ailleurs_pendant_la_galerie_dit_la_page_a_change_et_rien_nest_insere', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-lecture')
      await edit(page, 2)
      await block(page, 1).getByText('Texte du bloc 1.').click()
      const gallery = await openGallery(page)
      // the agent writes the page while the sheet is open
      const current = (await (await fetch(`${instance.url}/api/pages/galerie-lecture.md`)).json()) as { markdown: string; revision: string }
      const other = current.markdown.replace('Texte du bloc 2.', 'Texte du bloc 2, écrit ailleurs.')
      const put = await fetch(`${instance.url}/api/pages/galerie-lecture.md`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ markdown: other, revision: current.revision }) })
      expect(put.ok, 'the outside write is accepted').toBe(true)
      await card(gallery, 'Figures').click()
      await page.getByText('The page changed.', { exact: false }).first().waitFor({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Reload', exact: true }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1500)
      const md = await stored(instance.url, 'galerie-lecture')
      expect(md, 'the outside write survives').toContain('écrit ailleurs')
      expect(md, 'nothing is inserted').not.toContain(':::figures')
      await shot(page, 'galerie-page-changee')
      await context.close()
    }, 90_000)

    // E-34 « Phone »: a bottom sheet, 80 % of the height.
    // Breaks if the sheet stays a centred dialog on a phone.
    it('telephone_la_galerie_est_une_feuille_basse_a_80_pour_cent_de_la_hauteur', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'phone', 'galerie-recherche')
      await edit(page, 2)
      await openGallery(page)
      await page.waitForTimeout(600) // the sheet slides in
      const g = await page.evaluate(() => {
        const r = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, vh: innerHeight, vw: innerWidth }
      })
      expect(g.bottom, 'the sheet sits on the bottom edge').toBeGreaterThanOrEqual(g.vh - 1)
      expect(g.height / g.vh, `80 % of the height (got ${g.height} of ${g.vh})`).toBeGreaterThan(0.78)
      expect(g.height / g.vh, `80 % of the height (got ${g.height} of ${g.vh})`).toBeLessThan(0.82)
      expect(g.left, 'full width').toBeLessThanOrEqual(1)
      expect(g.right).toBeGreaterThanOrEqual(g.vw - 1)
      await shot(page, 'galerie-telephone')
      await context.close()
    }, 90_000)

    // E-34 « Read-only »: no Add block on a page that cannot be edited; the gallery is not reachable.
    it('page_en_lecture_seule_sans_add_block', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'lecture-seule')
      await page.waitForSelector('.adestia-editor', { timeout: 20_000 })
      expect(await page.getByRole('button', { name: 'Add block', exact: true }).count()).toBe(0)
      await context.close()
    }, 60_000)
  })

  // B-24: project-management NOT enabled -> its blocks are not offered.
  describe('en, project-management not enabled', () => {
    let instance: Instance
    let browser: BrowserOf
    beforeAll(async () => {
      instance = await launch('besoin-pages-deplacer-sans-pm', 'skippy', 'en')
      browser = await newBrowser()
    }, 60_000)
    afterAll(async () => {
      await browser?.close()
      await instance?.stop()
    })
    // Breaks if the gallery lists the blocks of a plugin that is not enabled.
    it('galerie_sans_project_management_active_ne_montre_ni_timeline_ni_sub_projects', async () => {
      const { context, page } = await visit(browser, instance.url, 'en', 'desk', 'galerie-recherche')
      await edit(page, 2)
      await openGallery(page)
      const groups = await catalogue(page)
      const all = names(groups)
      for (const n of ['Timeline', 'Sub-projects', 'timeline', 'subproject']) expect(all, n).not.toContain(n)
      expect(groups.map((g) => g.group)).not.toContain('Project')
      expect(all, 'the core blocks stay').toContain('Figures')
      expect(all, 'the other enabled plugin stays').toContain('Activity report')
      await context.close()
    }, 90_000)
  })

  // The manifest names are written in en and fr: the instance in French shows the French record.
  describe('fr', () => {
    let instance: Instance
    let browser: BrowserOf
    beforeAll(async () => {
      instance = await launch('besoin-pages-deplacer', 'skippy', 'fr')
      browser = await newBrowser()
    }, 60_000)
    afterAll(async () => {
      await browser?.close()
      await instance?.stop()
    })
    // Breaks if the plugin record is shown in English under `fr`. The shell's own French words are not written in the docs: a gap.
    it('galerie_en_francais_montre_le_nom_et_la_ligne_francais_du_plugin', async () => {
      const { context, page } = await visit(browser, instance.url, 'fr', 'desk', 'galerie-recherche')
      await page.getByRole('button', { name: 'Modifier', exact: true }).click()
      await page.getByRole('button', { name: 'Terminé', exact: true }).waitFor({ timeout: 20_000 })
      await page.waitForFunction(() => document.querySelectorAll('[data-block="callout"]').length >= 2, null, { timeout: 20_000 })
      await page.waitForTimeout(500)
      await page.locator('.adestia-edblock__bar, button').first().waitFor()
      const addBlock = page.locator('button', { has: page.locator('svg') }).filter({ hasText: /^\s*\S.*bloc/i }).first()
      await addBlock.click()
      await page.locator('.adestia-blockgallery').waitFor({ timeout: 10_000 })
      const groups = await catalogue(page)
      const plugin = groups.flatMap((g) => g.cards).find((c) => c.name === 'Rapport d’activité')
      expect(plugin, 'the French name of the record').toBeDefined()
      expect(plugin?.line).toBe('Résume la semaine d’une équipe.')
      expect(names(groups)).not.toContain('Activity report')
      await shot(page, 'galerie-fr')
      await context.close()
    }, 90_000)
  })
})
