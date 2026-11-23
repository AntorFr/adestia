/**
 * `adestia-decouverte-creer-dossier`, second pass from the need (B-32, B-33; P-21; E-2, E-3, E-38 « Create »),
 * through a driven browser on the bench instance with nothing in it (`empty`, no plugin, no page).
 * It adds to `besoin-creer-dossier-browser.test.ts` what the user sees there and that file does not play.
 * Expected values are written by hand from docs/parcours.md (B-32, B-33) and docs/ecrans.md (E-38 (c), (d)).
 * The effect of the route is proved at its door (`packages/server/test/besoin-creer-dossier-*.test.ts`).
 *
 * Plan (need -> case -> proof):
 *   B-32 bords      the empty home carries the line « or turn a plugin on in Settings » (fr: « ou activez un plugin
 *                   dans les Réglages »), « Settings » being a link, and no longer the hint to edit the configuration
 *   B-32 exclusion  while the list of the + is open the entry buttons of the empty home are hidden (one New folder, not two)
 *   B-33 bords      a name left empty, or that reduces to nothing (« !!! »), leaves Create disabled
 *   B-33 exclusion  Cancel closes the sheet and no POST is sent
 *   B-32 + B-33     the folder just created is empty, offers New folder as a button and has its +; a sub-folder made
 *                   from that button opens under it; back on the home, the folder is a tile and the empty state is gone
 *
 * Playwright and Chromium come from the environment; without them the file is skipped. Needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>
const T = (ms: number) => patience(ms)

const visit = (browser: BrowserOf, base: string, locale: 'en' | 'fr', route: string) =>
  open(browser, base, {
    theme: 'light',
    size: 'desk',
    locale,
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: patience(20_000) }).catch(() => null)
    },
  }) as Promise<{ context: any; page: any }>

async function screenUp(page: any) {
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
}

describe.skipIf(!playwright)('E-2 and E-3 on an instance with nothing in it (en)', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('empty', 'skippy', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('E-2 empty: « or turn a plugin on in Settings » with Settings as a link, and no hint to edit the configuration file (B-32)', async () => {
    // red if the empty home keeps the old hint, or the line has no Settings link
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByText('Nothing to show yet.', { exact: true }).waitFor({ timeout: T(10_000) })
    await page.getByText(/or turn a plugin on in/).waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('link', { name: 'Settings', exact: true }).count()).toBeGreaterThanOrEqual(1)
    expect(await page.getByText(/adestia\.config\.yaml/).count()).toBe(0)
    await context.close()
  })

  it('E-2 empty: while the list of the + is open, New folder is drawn once, not as a button behind it too (B-32)', async () => {
    // red if the entry buttons stay drawn under the open list
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByText('Nothing to show yet.', { exact: true }).waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('button', { name: /^New folder/ }).count()).toBe(1)
    await page.getByRole('button', { name: 'New…', exact: true }).click({ timeout: T(10_000) })
    await page.getByText('An empty folder to group pages.', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('button', { name: /^New folder/ }).count()).toBe(1)
    await context.close()
  })

  it('the name sheet keeps Create disabled for an empty name and for a name that reduces to nothing (B-33)', async () => {
    // red if Create is live with nothing to create
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByRole('button', { name: 'New…', exact: true }).click({ timeout: T(10_000) })
    await page.getByRole('button', { name: /^New folder/ }).click({ timeout: T(10_000) })
    const create = page.getByRole('button', { name: 'Create', exact: true })
    await create.waitFor({ timeout: T(10_000) })
    expect(await create.isDisabled()).toBe(true)
    await page.getByLabel('Folder name').fill('!!!')
    expect(await create.isDisabled()).toBe(true)
    await page.getByLabel('Folder name').fill('Notes')
    expect(await create.isDisabled()).toBe(false)
    await context.close()
  })

  it('Cancel closes the name sheet and sends nothing (B-33)', async () => {
    // red if Cancel still writes the folder
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    const posts: string[] = []
    page.on('request', (r: any) => r.method() === 'POST' && r.url().endsWith('/api/folders') && posts.push(r.url()))
    await page.getByRole('button', { name: 'New…', exact: true }).click({ timeout: T(10_000) })
    await page.getByRole('button', { name: /^New folder/ }).click({ timeout: T(10_000) })
    await page.getByLabel('Folder name').fill('Notes')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: T(10_000) })
    await page.getByLabel('Folder name').waitFor({ state: 'detached', timeout: T(10_000) })
    expect(posts).toEqual([])
    expect(await page.evaluate(() => location.hash)).toMatch(/^#\/?$/)
    await context.close()
  })

  it('the folder just created offers New folder as a button and has its +; a sub-folder opens under it; the home tiles it (B-32, B-33, P-21)', async () => {
    // red if an empty folder offers no entry button, or the home does not tile the new folder
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByRole('button', { name: 'New…', exact: true }).click({ timeout: T(10_000) })
    await page.getByRole('button', { name: /^New folder/ }).click({ timeout: T(10_000) })
    await page.getByLabel('Folder name').fill('Notes')
    const first = page.waitForResponse((r: any) => r.url().endsWith('/api/folders') && r.request().method() === 'POST', { timeout: T(20_000) })
    await page.getByRole('button', { name: 'Create', exact: true }).click({ timeout: T(10_000) })
    expect((await first).status()).toBe(201)
    await page.waitForFunction(() => location.hash === '#/section/notes', undefined, { timeout: T(10_000) })
    await page.getByText('This section holds nothing yet.', { exact: true }).waitFor({ timeout: T(10_000) })
    // the entry as a button, in the empty folder
    expect(await page.getByRole('button', { name: /^New folder/ }).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'New…', exact: true }).count()).toBe(1)
    await page.getByRole('button', { name: /^New folder/ }).click({ timeout: T(10_000) })
    await page.getByLabel('Folder name').fill('Idées')
    const second = page.waitForResponse((r: any) => r.url().endsWith('/api/folders') && r.request().method() === 'POST', { timeout: T(20_000) })
    await page.getByRole('button', { name: 'Create', exact: true }).click({ timeout: T(10_000) })
    expect((await second).status()).toBe(201)
    await page.waitForFunction(() => location.hash === '#/section/notes/idees', undefined, { timeout: T(10_000) })
    await page.evaluate(() => (location.hash = '#/'))
    await page.getByText('Notes', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await page.getByText('Nothing to show yet.', { exact: true }).count()).toBe(0)
    await context.close()
  })
})

describe.skipIf(!playwright)('E-2 on an instance with nothing in it (fr)', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('empty', 'skippy', 'fr')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('E-2 vide en français : « ou activez un plugin dans les Réglages », Réglages en lien, et Nouveau dossier en bouton (B-32)', async () => {
    // red if the line or the button stay in English
    const { context, page } = await visit(browser, instance.url, 'fr', '/')
    await screenUp(page)
    await page.getByText('Rien à afficher pour l’instant.', { exact: true }).waitFor({ timeout: T(10_000) })
    await page.getByText(/ou activez un plugin dans les/).waitFor({ timeout: T(10_000) })
    expect(await page.getByRole('link', { name: 'Réglages', exact: true }).count()).toBeGreaterThanOrEqual(1)
    expect(await page.getByRole('button', { name: /^Nouveau dossier/ }).count()).toBe(1)
    await context.close()
  })
})
