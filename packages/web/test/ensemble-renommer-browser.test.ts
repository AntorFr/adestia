/**
 * `adestia-decouverte-renommer`, exit criterion at the browser (B-35; P-21 step 5; E-3 Rename, E-38):
 * "Rename on a folder just created fixes the typo and opens the folder under its new name; the button
 * is absent on a read-only folder". Driven on the bench instance (seed `besoin-renommer`), English.
 * Expectations come from the fiche and docs/parcours.md. Needs `npm run build`; skipped without Playwright.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })
type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)
const btn = (page: any, name: string) => page.getByRole('button', { name, exact: true })

const visit = (browser: BrowserOf, base: string, route: string) =>
  open(browser, base, {
    theme: 'light',
    size: 'desk',
    locale: 'en',
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: patience(20_000) }).catch(() => null)
    },
  }) as Promise<{ context: any; page: any }>

describe.skipIf(!playwright)('E-3 / E-38 Rename: a folder just created is corrected from its header', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('besoin-renommer', 'skippy', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('create "Projt" with +, Rename it to "Projet": E-3 opens at #/section/projet, "Projet" is listed, "projt" is gone', async () => {
    // red if Rename is absent on the new folder, the shell stays on the old path, or the old name still answers
    const { context, page } = await visit(browser, instance.url, '/')
    expect(await page.indexAnswered, 'index never answered').not.toBeNull()
    await btn(page, 'New…').first().click({ timeout: T(15_000) })
    await page.getByText('New folder', { exact: true }).first().click({ timeout: T(10_000) })
    await page.getByLabel('Folder name').fill('Projt')
    const created = page.waitForResponse((r: any) => r.url().endsWith('/api/folders') && r.request().method() === 'POST', { timeout: T(20_000) })
    await btn(page, 'Create').last().click({ timeout: T(10_000) })
    expect((await created).status()).toBe(201)
    await page.waitForFunction(() => location.hash === '#/section/projt', undefined, { timeout: T(15_000) })
    await btn(page, 'Rename').first().click({ timeout: T(15_000) })
    const field = page.getByLabel('Folder name')
    await field.waitFor({ timeout: T(10_000) })
    expect(await field.inputValue()).toBe('projt')
    await field.fill('Projet')
    const renamed = page.waitForResponse((r: any) => r.url().endsWith('/api/folders/rename'), { timeout: T(20_000) })
    await btn(page, 'Rename').last().click()
    const answer = await renamed
    expect(answer.status()).toBe(200)
    expect(await answer.json()).toEqual({ path: 'projet', unrewritten: 0 })
    await page.waitForFunction(() => location.hash === '#/section/projet', undefined, { timeout: T(15_000) })
    const index = await page.evaluate(async () => JSON.stringify(await (await fetch('/api/pages/index')).json()))
    expect(index).toContain('"projet"')
    expect(index).not.toContain('"projt"')
    await context.close()
  })

  it('no Rename in a read-only folder', async () => {
    // red if the button is drawn on a folder the user cannot write
    const { context, page } = await visit(browser, instance.url, '/section/lecture')
    expect(await page.indexAnswered, 'index never answered').not.toBeNull()
    await page.waitForTimeout(800)
    expect(await btn(page, 'Rename').count()).toBe(0)
    await context.close()
  })
})
