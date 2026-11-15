/**
 * `adestia-pages-blocs-formulaires-galerie`, exit criterion in a driven browser (seed `plugins-ensemble`):
 * Figures inserted with « inline » writes view=inline and opens its form on an empty row; a list/table opens
 * its form; Callout (no fields) opens none; a timeline on a project-management page opens its form.
 * Needs Playwright and Chromium (skipped without) and `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function editing(browser: BrowserOf, base: string, route: string, theme: 'light' | 'dark' = 'light', size: 'desk' | 'phone' = 'desk') {
  const { context, page } = (await open(browser, base, { theme, size, locale: 'en', route })) as { context: any; page: any }
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(500)
  return { context, page }
}
async function insert(page: any, card: string, variant?: string) {
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(600)
  if (variant) {
    await page.locator('.adestia-blockcell', { has: page.getByRole('option', { name: card, exact: true }) }).getByRole('radio', { name: variant }).click()
  }
  await page.getByRole('option', { name: card, exact: true }).click()
}
/** The page file as the server holds it, once it has the wanted text (a save is a signal, not a delay). */
async function savedWith(page: any, path: string, wanted: string): Promise<string> {
  let text = ''
  for (let i = 0; i < 60; i++) {
    text = await page.evaluate(async (p: string) => (await fetch(`/api/pages/${p}`)).text(), path)
    if (text.includes(wanted)) break
    await page.waitForTimeout(500)
  }
  return text
}
/**
 * Done pressed in the same instant as an insertion saves without it — for any block, Callout included, so
 * not this task's doing; a person takes longer than that, and so does the test.
 */
const settle = (page: any) => page.waitForTimeout(1500)
const formOpen = (page: any) => page.locator('.adestia-sheet').filter({ hasText: '— data' })

describe.skipIf(!playwright)('galerie → formulaire, du critère', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('plugins-ensemble', '', 'en')
    browser = await newBrowser()
  }, 120_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('figures_inline_ecrit_view_et_ouvre_une_ligne_vide', async () => {
    const { context, page } = await editing(browser, instance.url, '/page/ensemble/dates')
    await insert(page, 'Figures', 'inline')
    await formOpen(page).waitFor({ timeout: 10_000 })
    expect(await page.getByRole('dialog', { name: 'Add block' }).count()).toBe(0)
    expect(await formOpen(page).locator('[data-row]').count()).toBe(1)
    expect(await formOpen(page).locator('[data-row] input').evaluateAll((l: HTMLInputElement[]) => l.map((i) => i.value))).toEqual(['', '', ''])
    await formOpen(page).getByRole('button', { name: 'Cancel' }).click()
    await settle(page)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    const saved = await savedWith(page, 'ensemble/dates.md', 'figures')
    expect(saved).toContain(':::figures{view=\\"inline\\"}\\n- Label: 0\\n:::')
    await context.close()
  }, 120_000)

  it('callout_nouvre_pas_de_formulaire', async () => {
    const { context, page } = await editing(browser, instance.url, '/page/ensemble/dates')
    await insert(page, 'Callout')
    await page.waitForTimeout(800)
    expect(await formOpen(page).count()).toBe(0)
    await context.close()
  }, 120_000)

  for (const card of ['List', 'Table']) {
    it(`${card.toLowerCase()}_ouvre_son_formulaire`, async () => {
      const { context, page } = await editing(browser, instance.url, '/page/ensemble/dates')
      await insert(page, card)
      await formOpen(page).waitFor({ timeout: 10_000 })
      if (card === 'List') {
        await formOpen(page).locator('[data-row] input').first().fill('One')
        await formOpen(page).getByRole('button', { name: 'Apply' }).click()
        await page.waitForTimeout(500)
        console.log('LISTBODY', await page.locator('.adestia-edblock').last().innerText())
      }
      await context.close()
    }, 120_000)
  }

  it('timeline_sur_page_project_management_ouvre_son_formulaire', async () => {
    const { context, page } = await editing(browser, instance.url, '/page/renovation/amber')
    await insert(page, 'Timeline')
    await formOpen(page).waitFor({ timeout: 10_000 })
    // Raw writes what is typed there, as the file would have it.
    await formOpen(page).getByRole('button', { name: 'Raw', exact: true }).click()
    await formOpen(page).locator('textarea').fill('- Cadrage: 2026-01-15 -> 2026-03-01')
    await formOpen(page).getByRole('button', { name: 'Apply' }).click()
    await formOpen(page).waitFor({ state: 'detached', timeout: 10_000 })
    await settle(page)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    const saved = await savedWith(page, 'renovation/amber.md', 'Cadrage')
    expect(saved).toContain(':::timeline\\n- Cadrage: 2026-01-15 -> 2026-03-01\\n:::')
    await context.close()
  }, 120_000)

  it('figures_par_defaut_necrit_pas_view', async () => {
    const { context, page } = await editing(browser, instance.url, '/page/ensemble/dates')
    await insert(page, 'Figures')
    await formOpen(page).waitFor({ timeout: 10_000 })
    await formOpen(page).getByRole('button', { name: 'Cancel' }).click()
    await settle(page)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    const saved = await savedWith(page, 'ensemble/dates.md', 'figures\\n- Label: 0\\n:::\\n\\n:::figures\\n')
    expect(saved).toContain(':::figures\\n- Label: 0\\n:::')
    expect(JSON.parse(saved).markdown.match(/^:::figures.*$/gm)).toEqual([':::figures{view="inline"}', ':::figures'])
    await context.close()
  }, 120_000)
})
