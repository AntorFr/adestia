/**
 * `adestia-decouverte-renommer-ecrans` seen from its need (B-35; P-21 step 5; E-3 Rename, E-37 rename),
 * through a driven browser on the bench instance (seed `besoin-renommer`, scripted engine).
 * Expectations come from the task's exit criterion and docs/ecrans.md, not from the components.
 * Needs `npm run build`; skipped without Playwright.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })
type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)

const WORDS = {
  en: { rename: 'Rename', label: 'Folder name', taken: 'name already taken', notice: '2 pages still point to the old name', details: 'Details' },
  fr: { rename: 'Renommer', label: 'Nom du dossier', taken: 'ce nom est déjà pris', notice: '2 pages pointent encore vers l’ancien nom', details: 'Détails' },
} as const

const visit = (browser: BrowserOf, base: string, locale: 'en' | 'fr', route: string, size: 'desk' | 'phone' = 'desk', theme: 'light' | 'dark' = 'light') =>
  open(browser, base, {
    theme,
    size,
    locale,
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: patience(20_000) }).catch(() => null)
    },
  }) as Promise<{ context: any; page: any }>
async function up(page: any) {
  expect(await page.indexAnswered, 'index never answered').not.toBeNull()
  await page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(() => d(null)))))
}
const btn = (page: any, name: string) => page.getByRole('button', { name, exact: true })
const hash = (page: any): Promise<string> => page.evaluate(() => location.hash)

for (const locale of ['en', 'fr'] as const) {
  const w = WORDS[locale]
  describe.skipIf(!playwright)(`B-35 rename a folder (${locale})`, () => {
    let instance: Instance
    let browser: BrowserOf
    beforeAll(async () => {
      instance = await launch('besoin-renommer', 'skippy', locale)
      browser = await newBrowser()
    }, 180_000)
    afterAll(async () => {
      await browser?.close()
      await instance?.stop()
    })

    const sheetRename = async (page: any, name: string) => {
      await btn(page, w.rename).first().click({ timeout: T(10_000) })
      await page.getByLabel(w.label).waitFor({ timeout: T(10_000) })
      await page.getByLabel(w.label).fill(name)
    }
    const submit = (page: any) => btn(page, w.rename).last()

    it('empty or unchanged name leaves Rename disabled; the field is prefilled and focused', async () => {
      // red if the sheet sends an empty or identical name
      const { context, page } = await visit(browser, instance.url, locale, '/section/vide')
      await up(page)
      await btn(page, w.rename).first().click({ timeout: T(10_000) })
      const field = page.getByLabel(w.label)
      await field.waitFor({ timeout: T(10_000) })
      expect(await field.inputValue()).toBe('vide')
      expect(await submit(page).isDisabled()).toBe(true)
      await field.fill('')
      expect(await submit(page).isDisabled()).toBe(true)
      await field.fill('vide')
      expect(await submit(page).isDisabled()).toBe(true)
      await field.fill('Vide')
      expect(await submit(page).isDisabled()).toBe(true) // slugs to `vide`: unchanged
      await field.fill('vide2')
      expect(await submit(page).isDisabled()).toBe(false)
      await page.keyboard.press('Escape')
      await field.waitFor({ state: 'detached', timeout: T(10_000) })
      await context.close()
    })

    it('a name already taken shows under the field, sheet open, nothing renamed', async () => {
      // red if the 409 closes the sheet or is not shown
      const { context, page } = await visit(browser, instance.url, locale, '/section/plans')
      await up(page)
      await sheetRename(page, 'projets')
      const answered = page.waitForResponse((r: any) => r.url().endsWith('/api/folders/rename'), { timeout: T(20_000) })
      await submit(page).click()
      expect((await answered).status()).toBe(409)
      await page.getByText(w.taken, { exact: false }).waitFor({ timeout: T(10_000) })
      expect(await page.getByLabel(w.label).inputValue()).toBe('projets')
      expect(await hash(page)).toBe('#/section/plans')
      await context.close()
    })

    it('Enter confirms: a fresh folder with a typo is renamed, opens at the new path, the old one is gone', async () => {
      // red if the old path still answers or the new one is not opened
      const { context, page } = await visit(browser, instance.url, locale, '/section/vide')
      await up(page)
      await sheetRename(page, 'Vidé corrigé')
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => location.hash === '#/section/vide-corrige', undefined, { timeout: T(15_000) })
      const gone = await page.evaluate(async () => (await fetch('/api/pages/index')).json().then((j: any) => JSON.stringify(j)))
      expect(gone).toContain('vide-corrige')
      expect(gone).not.toMatch(/"vide"/)
      await context.close()
    })

    it('after a rename that leaves 2 pages on the old name, the line shows and Details unfolds the links; none at zero', async () => {
      // red if the line is missing, the count wrong, or Details does not unfold
      const { context, page } = await visit(browser, instance.url, locale, '/section/projets')
      await up(page)
      await sheetRename(page, 'dossiers')
      await submit(page).click()
      await page.waitForFunction(() => location.hash === '#/section/dossiers', undefined, { timeout: T(15_000) })
      await page.getByText(w.notice, { exact: false }).waitFor({ timeout: T(10_000) })
      const d = btn(page, w.details)
      expect(await d.getAttribute('aria-expanded')).toBe('false')
      await d.click()
      expect(await d.getAttribute('aria-expanded')).toBe('true')
      await page.waitForFunction(() => document.querySelectorAll('#adestia-rename-details a').length === 2, undefined, { timeout: T(15_000) })
      await context.close()
      const zero = await visit(browser, instance.url, locale, '/section/plans')
      await up(zero.page)
      await sheetRename(zero.page, 'schemas')
      await submit(zero.page).click()
      await zero.page.waitForFunction(() => location.hash === '#/section/schemas', undefined, { timeout: T(15_000) })
      await zero.page.waitForTimeout(500)
      expect(await zero.page.locator('.adestia-notice').count()).toBe(0)
      await zero.context.close()
    })

    it('no Rename in a read-only folder nor in a folder whose parent is read-only', async () => {
      // red if the button is drawn where the route would answer 403
      for (const route of ['/section/lecture', '/section/lecture/ouvert']) {
        const { context, page } = await visit(browser, instance.url, locale, route)
        await up(page)
        await page.waitForTimeout(800)
        expect(await btn(page, w.rename).count(), route).toBe(0)
        await context.close()
      }
    })
  })
}
