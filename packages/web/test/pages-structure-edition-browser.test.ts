/**
 * `adestia-pages-structure-edition` through a driven browser on the bench instance (B-28 in editing on E-4,
 * E-34, E-6): Section then Columns from the gallery, the section's title, a band from 2 to 3 columns and back
 * (refused while the third holds text), the saved page read back as the same tree, "Drop here" in editing only,
 * and a page without containers saved untouched. Without Playwright the file is skipped. Needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function visit(browser: BrowserOf, base: string, path: string, locale = 'en') {
  const { context, page } = (await open(browser, base, {
    theme: 'light',
    size: 'desk',
    locale,
    route: `/page/${path}`,
    before: async (p: any) => {
      p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
  expect(await page.indexAnswered).not.toBeNull()
  return { context, page }
}
async function edit(page: any) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-block="callout"]').length >= 2, null, { timeout: 20_000 })
  await page.waitForTimeout(500)
}
async function stored(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}/api/pages/${path}.md`)
  return ((await res.json()) as { markdown: string }).markdown
}
const fences = async (base: string, path: string) => [...(await stored(base, path)).matchAll(/^:{3,}([a-z-]+)/gm)].map((m) => m[1] as string)
async function openGallery(page: any) {
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  const g = page.getByRole('dialog', { name: 'Add block' })
  await g.waitFor({ timeout: 10_000 })
  return g
}

describe.skipIf(!playwright)('adestia-pages-structure-edition', () => {
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

  // Breaks if the gallery names Section/Columns by identifier, offers `col`, or shows no picture.
  it('galerie_montre_section_et_columns_avec_image_sans_col', async () => {
    const { context, page } = await visit(browser, instance.url, 'galerie-recherche')
    await edit(page)
    const g = await openGallery(page)
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('.adestia-blockgallery [role="option"]')].map((c) => ({
        name: c.querySelector('.adestia-blockcard__name')?.textContent ?? '',
        img: c.querySelector('img')?.getAttribute('src') ?? '',
        group: c.closest('.adestia-blockgallery__group')?.querySelector('h3')?.textContent ?? '',
      })),
    )
    for (const n of ['Section', 'Columns']) {
      const c = cards.find((x: any) => x.name === n)
      expect(c, n).toBeDefined()
      expect(c.group).toBe('Layout')
      expect(c.img).toMatch(/\.svg$/)
    }
    expect(cards.map((c: any) => c.name)).not.toContain('col')
    expect(cards.map((c: any) => c.name)).not.toContain('section')
    expect(cards.map((c: any) => c.name)).not.toContain('columns')
    expect(g).toBeTruthy()
    await context.close()
  }, 90_000)

  it('section_puis_colonnes_titre_2_3_2_et_relecture_identique', async () => {
    const path = 'galerie-enregistre'
    const { context, page } = await visit(browser, instance.url, path)
    await edit(page)
    await page.locator('[data-block="callout"]', { hasText: 'Bloc 1' }).getByText('Texte du bloc 1.').click()
    await (await openGallery(page)).getByRole('option', { name: 'Section', exact: true }).click()
    await expect.poll(() => fences(instance.url, path), { timeout: 20_000 }).toEqual(['callout', 'section', 'callout'])
    // The new section has the focus: Columns goes at its end, inside it.
    await (await openGallery(page)).getByRole('option', { name: 'Columns', exact: true }).click()
    await expect.poll(() => fences(instance.url, path), { timeout: 20_000 }).toEqual(['callout', 'section', 'columns', 'col', 'col', 'callout'])
    expect(await page.locator('[data-block="col"]').count()).toBe(2)
    // Empty columns show their lane in editing.
    const drop = await page.evaluate(() => [...document.querySelectorAll('[data-block="col"]')].map((c) => c.querySelector('[data-drop]')?.getAttribute('data-drop') ?? ''))
    expect(drop).toEqual(['Drop here', 'Drop here'])

    // The section's title through E-6.
    const sec = page.locator('[data-block="section"]').first()
    await sec.hover()
    await sec.getByRole('button', { name: 'Block settings', exact: true }).first().click()
    await page.locator('.adestia-blockset').getByLabel('Title').first().fill('Ma section')
    await page.keyboard.press('Escape')
    await expect.poll(() => stored(instance.url, path), { timeout: 20_000 }).toContain('title="Ma section"')

    // 2 -> 3 -> 2 on the band.
    const band = page.locator('[data-block="columns"]').first()
    const openBand = async () => {
      await band.hover()
      await band.getByRole('button', { name: 'Block settings', exact: true }).first().click()
      return page.getByRole('group', { name: 'Number of columns' })
    }
    let choice = await openBand()
    await choice.getByRole('button', { name: '3', exact: true }).click()
    await expect.poll(() => fences(instance.url, path), { timeout: 20_000 }).toEqual(['callout', 'section', 'columns', 'col', 'col', 'col', 'callout'])
    // The third is empty: going back is allowed. Put text in it first to see the refusal.
    await page.keyboard.press('Escape')
    await page.locator('[data-block="col"]').nth(2).locator('p').first().click()
    await page.keyboard.type('Troisième')
    await expect.poll(() => stored(instance.url, path), { timeout: 20_000 }).toContain('Troisième')
    choice = await openBand()
    const two = choice.getByRole('button', { name: '2', exact: true })
    expect(await two.isDisabled(), 'going back to 2 is refused while the third holds text').toBe(true)
    expect(await page.getByText(/Nothing is deleted/).isVisible(), 'the reason is visible').toBe(true)
    expect(await stored(instance.url, path)).toContain('Troisième')
    // Empty it: back to 2 is accepted.
    await page.keyboard.press('Escape')
    const third = page.locator('[data-block="col"]').nth(2).locator('p').first()
    await third.click()
    for (let i = 0; i < 'Troisième'.length; i++) await page.keyboard.press('Backspace')
    await expect.poll(() => stored(instance.url, path), { timeout: 20_000 }).not.toContain('Troisième')
    choice = await openBand()
    expect(await choice.getByRole('button', { name: '2', exact: true }).isEnabled()).toBe(true)
    await choice.getByRole('button', { name: '2', exact: true }).click()
    await expect.poll(() => fences(instance.url, path), { timeout: 20_000 }).toEqual(['callout', 'section', 'columns', 'col', 'col', 'callout'])
    await context.close()

    // Read back: the same tree, and no lane in reading.
    const after = await visit(browser, instance.url, path)
    await after.page.locator('[data-block="callout"], .adestia-section, [class*="section"]').first().waitFor({ timeout: 20_000 })
    expect(await after.page.locator('[data-drop]').count()).toBe(0)
    expect(await after.page.getByText('Drop here').count()).toBe(0)
    await after.context.close()
  }, 180_000)

  // Breaks if opening and saving an untouched page rewrites it.
  it('page_sans_conteneur_ouverte_puis_enregistree_reste_identique', async () => {
    const path = 'galerie-annule'
    const before = await stored(instance.url, path)
    const { context, page } = await visit(browser, instance.url, path)
    await edit(page)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForTimeout(2000)
    expect(await stored(instance.url, path)).toBe(before)
    await context.close()
  }, 90_000)
})
