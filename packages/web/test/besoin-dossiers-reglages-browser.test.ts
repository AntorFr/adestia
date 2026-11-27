/**
 * `adestia-dossiers-fichier-reglages` seen from its need (B-36, B-37; E-2 tiles, E-3 header and cards),
 * through a driven browser on the bench instance (`bench/launch.mjs`, scripted engine, seed
 * `dossiers-reglages`: `atelier` (title « Atelier du garage », icon 🔧, colour vert, an `INDEX.md`, a homonymous
 * page and one other), `cave` (icon 🍷, colour rouge, one page), `nu` (no `.folder.md`), `ancien` (an `INDEX.md`
 * carrying an old colour and icon, one other page). Expectations are written by hand from the sheet's criterion and
 * docs/parcours.md (B-36, B-37), docs/ecrans.md (E-2, E-3); the effect (what the route writes and
 * refuses) is proved at its door in `packages/server/test/besoin-dossiers-reglages-ensemble.test.ts`.
 *
 * Plan (need -> case -> proof):
 *   E-2  the tile of `atelier` shows 🔧 and « Atelier du garage », tinted vert; `cave` shows 🍷, tinted rouge;
 *        `nu` (no file) is not tinted  -> `tiles are dressed by .folder.md` (desk/phone x light/dark)
 *   B-37 `atelier` counts 3 cards (INDEX.md and the homonymous page among them), `ancien` 2; the old colour and icon an
 *        INDEX page carries dress nothing
 *   E-3  `#/section/atelier` stays the folder route and draws the three cards by title, the INDEX and homonymous ones included
 *   E-3  the header of `atelier`: title and icon 🔧
 *   P-22 a settings write through the route is seen on the next load: the tile of `nu` takes its title and colour
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
    instance = await launch('dossiers-reglages', '', 'fr')
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
        await tile(page, 'Atelier du garage').first().waitFor({ timeout: T(30_000) })
        expect(await tile(page, 'Atelier du garage').first().locator('.adestia-tile__icon').innerText()).toBe('🔧')
        expect(await tile(page, 'Cave').first().locator('.adestia-tile__icon').innerText()).toBe('🍷')
        expect(await tile(page, 'Atelier').count()).toBe(0) // the name shown is the title of the file, not the directory name
        const atelier = await tint(page, 'Atelier du garage')
        const cave = await tint(page, 'Cave')
        expect(atelier).not.toBe('')
        expect(cave).not.toBe('')
        expect(atelier).not.toBe(cave) // vert and rouge are two tints
        expect(await tint(page, 'Nu')).toBe('') // a folder without .folder.md is not tinted
        await shot(page, `accueil-${size}-${theme}`)
        await context.close()
      })
    }
  }

  it('B-37 E-2: the counters count INDEX.md and the homonymous page as cards, and what an INDEX page still carries dresses nothing', async () => {
    // red if the INDEX page is left out of its folder's count, or its old `couleur` / `ico` still dress the tile
    const { context, page } = await visit(browser, instance.url, '/', 'desk', 'light')
    await tile(page, 'Atelier du garage').first().waitFor({ timeout: T(30_000) })
    expect(await chip(page, 'Atelier du garage')).toBe('3 fiches')
    expect(await chip(page, 'Ancien')).toBe('2 fiches')
    expect(await chip(page, 'Cave')).toBe('1 fiche')
    expect(await tint(page, 'Ancien')).toBe('')
    expect(await tile(page, 'Ancien').first().locator('.adestia-tile__icon').innerText()).not.toContain('❌')
    expect(await page.getByText('Titre ignoré', { exact: true }).count()).toBe(0) // on the home, the INDEX page names nothing
    await context.close()
  })

  it('B-37 E-3: the address of a folder opens the folder route, with INDEX.md and the homonymous page as cards', async () => {
    // red if the address of `atelier` opens its INDEX page, or the INDEX / homonymous card is missing
    const { context, page } = await visit(browser, instance.url, '/section/atelier', 'desk', 'light')
    await page.getByText('Établi', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('Vue d’ensemble de l’atelier', { exact: true }).first().waitFor({ timeout: T(10_000) })
    await page.getByText('Page homonyme', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.evaluate(() => location.hash)).toBe('#/section/atelier')
    await shot(page, 'section-atelier')
    await context.close()
  })

  it('B-37 E-3: a folder whose INDEX page holds old settings lists it as a card under its own title', async () => {
    const { context, page } = await visit(browser, instance.url, '/section/ancien', 'desk', 'light')
    await page.getByText('Titre ignoré', { exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('B', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.evaluate(() => location.hash)).toBe('#/section/ancien')
    await context.close()
  })

  it('E-3: the header of a dressed folder shows its title and its icon', async () => {
    // red if the header keeps the directory name `atelier` and the default icon
    const { context, page } = await visit(browser, instance.url, '/section/atelier', 'desk', 'light')
    await page.getByRole('heading', { name: 'Atelier du garage', exact: true }).first().waitFor({ timeout: T(30_000) })
    await page.getByText('🔧', { exact: true }).first().waitFor({ timeout: T(10_000) })
    await context.close()
  })

  it('P-22: a write through PUT /api/folders/settings dresses the tile on the next load', async () => {
    // red if the screen reads its dressing from anywhere but the index that the route feeds
    const { context, page } = await visit(browser, instance.url, '/', 'desk', 'light')
    await tile(page, 'Atelier du garage').first().waitFor({ timeout: T(30_000) })
    expect(await tint(page, 'Nu')).toBe('')
    const answered = page.waitForResponse((r: any) => r.url().endsWith('/api/folders/settings') && r.request().method() === 'PUT', { timeout: T(20_000) })
    await page.evaluate(() => fetch('/api/folders/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'nu', settings: { couleur: 'vert', title: 'Le dossier nu' } }) }))
    expect((await answered).status()).toBe(200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await tile(page, 'Le dossier nu').first().waitFor({ timeout: T(30_000) })
    expect(await tint(page, 'Le dossier nu')).toBe(await tint(page, 'Atelier du garage'))
    await shot(page, 'accueil-apres-ecriture')
    await context.close()
  })
})
