/**
 * `adestia-dossiers-fichier-reglages` seen from its need (B-36, B-37; E-2 tiles, E-3 header and cards),
 * through a driven browser on the bench instance (`bench/launch.mjs`, scripted engine, seed
 * `besoin-dossiers-reglages`: `cave` dressed by its `.folder.md`, `jardin` too, `maison` with an
 * `INDEX.md` and no `.folder.md`). Expectations are written by hand from the sheet's criterion and
 * docs/parcours.md (B-36, B-37), docs/ecrans.md (E-2, E-3); the effect (what the route writes and
 * refuses) is proved at its door in `packages/server/test/besoin-dossiers-reglages-ensemble.test.ts`.
 *
 * Plan (need -> case -> proof):
 *   E-2  the tile of `cave` shows the icon 🍷 and the title « Ma cave » of its `.folder.md`, tinted; `jardin`
 *        has another tint, `maison` (no file) has none  -> `tiles are dressed by .folder.md` (desk/phone x light/dark)
 *   B-37 `maison` counts 2 cards (INDEX.md among them), `cave` 2, `jardin` 1; the old colour in the INDEX page dresses nothing
 *   E-3  `#/section/maison` stays the folder route and draws both cards, the INDEX one included, by title
 *   E-3  `#/section/cave` header: title « Ma cave » and the icon 🍷
 *   P-22 a settings write through the route is seen on the next load: the tile of `maison` takes its colour
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 * `REGLAGES_SHOTS=<dir>` writes one capture per state.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })

const SHOTS = process.env.REGLAGES_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)
const visit = (browser: BrowserOf, base: string, route: string, size: Size, theme: 'light' | 'dark') =>
  open(browser, base, { theme, size, locale: 'fr', route }) as Promise<{ context: any; page: any }>
/** On a phone the chat is shown first; the canvas opens by the header's last button (« Open apps »). */
async function toCanvas(page: any) {
  const onChat = await page.evaluate(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen') !== 'canvas')
  if (onChat) await page.locator('.adestia-chat__header .adestia-ib').last().click({ timeout: T(10_000) })
  await page.waitForFunction(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas', undefined, { timeout: T(10_000) })
}
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
const tile = (page: any, label: string) => page.locator('.adestia-tile', { has: page.locator('.adestia-tile__label', { hasText: new RegExp(`^${label}$`) }) })
const tint = (page: any, label: string): Promise<string> =>
  tile(page, label).first().evaluate((el: Element) => getComputedStyle(el).getPropertyValue('--tile-color').trim())
const chip = (page: any, label: string): Promise<string> => tile(page, label).first().locator('.adestia-chip').innerText()

describe.skipIf(!playwright)('E-2, E-3: folders dressed by .folder.md, INDEX pages as cards', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('besoin-dossiers-reglages', '', 'fr')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  for (const size of ['desk', 'phone'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      it(`E-2 ${size} ${theme}: the tile of a folder carries the icon, the title and the tint of its .folder.md`, async () => {
        // red if the tile ignores `folderSettings` (default folder icon, folder name, no tint)
        const { context, page } = await visit(browser, instance.url, '/', size, theme)
        if (size === 'phone') await toCanvas(page)
        await tile(page, 'Ma cave').first().waitFor({ timeout: T(30_000) })
        expect(await tile(page, 'Ma cave').first().locator('.adestia-tile__icon').innerText()).toBe('🍷')
        expect(await tile(page, 'Cave').count()).toBe(0) // the name shown is the title of the file, not the directory name
        const cave = await tint(page, 'Ma cave')
        const jardin = await tint(page, 'Jardin')
        const maison = await tint(page, 'Maison')
        expect(cave).not.toBe('')
        expect(jardin).not.toBe('')
        expect(cave).not.toBe(jardin) // rouge and vert are two tints
        expect(maison).toBe('') // a folder without .folder.md is not tinted
        await shot(page, `accueil-${size}-${theme}`)
        await context.close()
      })
    }
  }

  it('B-37 E-2: the counters count INDEX.md as a card, and the colour an INDEX page still carries dresses nothing', async () => {
    // red if the INDEX page is left out of its folder's count, or its old `couleur: bleu` still tints the tile
    const { context, page } = await visit(browser, instance.url, '/', 'desk', 'light')
    await tile(page, 'Ma cave').first().waitFor({ timeout: T(30_000) })
    expect(await chip(page, 'Maison')).toBe('2 fiches')
    expect(await chip(page, 'Ma cave')).toBe('2 fiches')
    expect(await chip(page, 'Jardin')).toBe('1 fiche')
    const bleu = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--adestia-hue-bleu').trim())
    expect(bleu).not.toBe('')
    expect(await tint(page, 'Maison')).not.toBe(bleu)
    await context.close()
  })

  it('B-37 E-3: the address of a folder opens the folder route, with INDEX.md and the other page as cards', async () => {
    // red if the address of `maison` opens its INDEX page, or the INDEX card is missing
    const { context, page } = await visit(browser, instance.url, '/section/maison', 'desk', 'light')
    await page.getByText('Plan maison', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('Sommaire maison', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.evaluate(() => location.hash)).toBe('#/section/maison')
    expect(await page.getByRole('heading', { name: 'Maison', exact: true }).count()).toBeGreaterThanOrEqual(1)
    await shot(page, 'section-maison')
    await context.close()
  })

  it('E-3: the header of a dressed folder shows its title and its icon', async () => {
    // red if the header keeps the directory name `cave` and the default icon
    const { context, page } = await visit(browser, instance.url, '/section/cave', 'desk', 'light')
    await page.getByRole('heading', { name: 'Ma cave', exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('🍷', { exact: true }).first().waitFor({ timeout: T(10_000) })
    await page.getByText('Vins', { exact: true }).first().waitFor({ timeout: T(10_000) })
    await shot(page, 'section-cave')
    await context.close()
  })

  it('P-22: a write through PUT /api/folders/settings dresses the tile on the next load', async () => {
    // red if the screen reads its dressing from anywhere but the index that the route feeds
    const { context, page } = await visit(browser, instance.url, '/', 'desk', 'light')
    await tile(page, 'Ma cave').first().waitFor({ timeout: T(30_000) })
    expect(await tint(page, 'Maison')).toBe('')
    const answered = page.waitForResponse((r: any) => r.url().endsWith('/api/folders/settings') && r.request().method() === 'PUT', { timeout: T(20_000) })
    await page.evaluate(() => fetch('/api/folders/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'maison', settings: { couleur: 'vert', title: 'Ma maison' } }) }))
    expect((await answered).status()).toBe(200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await tile(page, 'Ma maison').first().waitFor({ timeout: T(30_000) })
    expect(await tint(page, 'Ma maison')).toBe(await tint(page, 'Jardin'))
    await shot(page, 'accueil-apres-ecriture')
    await context.close()
  })
})
