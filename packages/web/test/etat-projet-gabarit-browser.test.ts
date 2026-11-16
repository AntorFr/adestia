/**
 * Task `adestia-pages-etat-projet-gabarit` (B-30, P-20, E-3, E-36, E-4), from its exit criterion, in a browser:
 * in a project folder, New from template → "Project status" → a title → Create opens the page in E-4 with its
 * summary, its two-column band and its timeline; progress reflects the folder's sub-pages; milestones and risks
 * say "Edit data" when empty and fill from their form; the page holds no date written in advance; with the plugin
 * off the model and the button are gone.
 * Browser on `bench/launch.mjs --seed etat-projet-gabarit` (five sub-pages in `projet/`, two finished); needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, type Size, type Theme, launch, newBrowser, open, playwright } from './charte-browser.js'

const markdown = async (base: string, path: string): Promise<string> =>
  ((await (await fetch(`${base}/api/pages/${path}`)).json()) as { markdown: string }).markdown

describe.skipIf(!playwright)('Project status model (B-30, P-20; E-3, E-36, E-4)', () => {
  let instance: Instance
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    instance = await launch('etat-projet-gabarit', '', 'en')
    browser = await newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  const create = async (title: string, size: Size = 'desk', theme: Theme = 'light') => {
    const { context, page } = (await open(browser, instance.url, { theme, size, locale: 'en', route: '/section/projet' })) as { context: any; page: any }
    await page.getByRole('button', { name: 'New from template' }).click({ timeout: 20_000 })
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: /Project status/ }).click({ timeout: 15_000 })
    await sheet.getByRole('textbox').fill(title)
    await sheet.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/#\/page\/projet\//, { timeout: 15_000 })
    await page.locator('.adestia-meter, .adestia-figure, .pm-empty').first().waitFor({ timeout: 20_000 })
    return { context, page }
  }
  const slug = (title: string) => `projet/${title.toLowerCase().replace(/\s+/g, '-')}.md`

  it('creer_depuis_le_modele_ouvre_la_page_avec_synthese_bande_et_frise_sans_date_ecrite', async () => {
    const { context, page } = await create('Etat un')
    const text = await markdown(instance.url, slug('Etat un'))
    expect(text).toMatch(/^---\n[\s\S]*title: Etat un/)
    expect(text).not.toMatch(/template:/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text.indexOf(':::section')).toBeGreaterThan(-1)
    expect(text.indexOf(':::section')).toBeLessThan(text.indexOf(':::progress'))
    expect(text.indexOf(':::progress')).toBeLessThan(text.indexOf(':::milestones'))
    expect(text.indexOf(':::milestones')).toBeLessThan(text.indexOf(':::risks'))
    expect(text.indexOf(':::risks')).toBeLessThan(text.indexOf(':::timeline'))
    // The page is drawn, not shown as raw directives or as an error.
    const shown = await page.locator('.adestia-canvas, .adestia-shell').first().innerText()
    expect(shown).not.toContain(':::')
    expect(shown).toContain('Summary')
    await context.close()
  }, 90_000)

  it('avancement_reflete_les_sous_pages_du_dossier', async () => {
    // Its own instance: the pages the other tests create in `projet/` would count as sub-pages too.
    const fresh = await launch('etat-projet-gabarit', '', 'en')
    try {
      const { context, page } = (await open(browser, fresh.url, { theme: 'light', size: 'desk', locale: 'en', route: '/section/projet' })) as { context: any; page: any }
      await page.getByRole('button', { name: 'New from template' }).click({ timeout: 20_000 })
      const sheet = page.getByRole('dialog')
      await sheet.getByRole('radio', { name: /Project status/ }).click({ timeout: 15_000 })
      await sheet.getByRole('textbox').fill('Avancement')
      await sheet.getByRole('button', { name: 'Create' }).click()
      await page.waitForURL(/#\/page\/projet\/avancement/, { timeout: 15_000 })
      // Seed: five sub-pages in projet/, two finished (status clos), one due in the past and still open;
      // the page that carries the block is not counted.
      await page.getByText('Progress', { exact: true }).first().waitFor({ timeout: 20_000 })
      const shown: string = await page.locator('.adestia-canvas, .adestia-shell').first().innerText()
      expect(shown).toContain('40 %')
      expect(shown).toContain('2 of 5 sub-pages done')
      expect(shown).toMatch(/1\s*\n\s*Late/)
      await context.close()
    } finally {
      await fresh.stop()
    }
  }, 90_000)

  it('milestones_et_risks_vides_nomment_Edit_data_et_se_remplissent_par_leur_formulaire', async () => {
    const { context, page } = await create('Etat trois')
    const shown: string = await page.locator('.adestia-canvas, .adestia-shell').first().innerText()
    expect(shown).toContain('No milestone yet. Use Edit data to add one.')
    expect(shown).toContain('No risk recorded. Use Edit data to add one.')
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 })
    await page.locator('.ProseMirror[contenteditable="true"]').first().waitFor({ timeout: 20_000 })
    for (const [hover, fill] of [
      ['No milestone yet', async (form: any) => {
        await form.getByLabel('Milestone', { exact: true }).fill('Recette')
        await form.getByLabel('Date', { exact: true }).fill('2026-12-01')
      }],
      ['No risk recorded', async (form: any) => {
        await form.getByLabel('Risk', { exact: true }).fill('Fuite')
        await form.getByLabel('Level', { exact: true }).selectOption('High')
      }],
    ] as const) {
      const block = page.locator('.adestia-edblock').filter({ hasText: hover })
      // Hover the block's edge: its bar then opens over the empty sentence, which the pointer must not aim at.
      await block.last().hover({ position: { x: 4, y: 4 } })
      // The columns block holds the text too: the innermost block is the last in document order.
      await block.last().getByRole('button', { name: 'Block settings' }).first().click()
      await page.getByRole('button', { name: 'Edit data', exact: true }).click()
      const form = page.locator('.adestia-blockform')
      await form.waitFor({ timeout: 15_000 })
      await form.getByRole('button', { name: 'Add', exact: true }).click()
      await fill(form)
      await form.getByRole('button', { name: 'Apply', exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 15_000 })
    }
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ state: 'detached', timeout: 15_000 })
    await expect
      .poll(async () => await markdown(instance.url, slug('Etat trois')), { timeout: 15_000 })
      .toMatch(/:::milestones\n[\s\S]*?Recette: 2026-12-01[\s\S]*?\n:::[\s\S]*:::risks\n[\s\S]*?Fuite: High[\s\S]*?\n:::/)
    await page.getByText('Recette').first().waitFor({ timeout: 15_000 })
    await page.getByText('Fuite').first().waitFor({ timeout: 15_000 })
    const after: string = await page.locator('.adestia-canvas, .adestia-shell').first().innerText()
    expect(after).not.toContain('No milestone yet')
    expect(after).not.toContain('No risk recorded')
    await context.close()
  }, 120_000)

  it('la_page_se_lit_au_telephone_sombre_sans_debordement_horizontal', async () => {
    const { context, page } = await create('Etat quatre', 'phone', 'dark')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await context.close()
  }, 90_000)
})

describe.skipIf(!playwright)('Project status model with the plugin off (B-30)', () => {
  let off: Instance
  let browser: Awaited<ReturnType<typeof newBrowser>>
  beforeAll(async () => {
    off = await launch('etat-projet-gabarit-sans-plugin', '', 'en')
    browser = await newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await off?.stop()
  })
  it('desactiver_le_plugin_retire_le_bouton_dans_le_dossier_du_projet', async () => {
    const { context, page } = (await open(browser, off.url, { theme: 'light', size: 'desk', locale: 'en', route: '/section/projet' })) as { context: any; page: any }
    await page.locator('.adestia-section, .adestia-canvas').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(2500)
    expect(await page.getByRole('button', { name: 'New from template' }).count()).toBe(0)
    await context.close()
  }, 60_000)
})
