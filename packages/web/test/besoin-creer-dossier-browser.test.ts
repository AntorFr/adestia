/**
 * `adestia-decouverte-creer-dossier` seen from its need (B-32, B-33; P-21 steps 1 to 3; E-2, E-3, E-37),
 * through a driven browser on the bench instance (`bench/launch.mjs`, scripted engine, no plugin).
 * Expectations are written by hand from docs/parcours.md (B-32, B-33, P-21) and docs/ecrans.md (E-37),
 * never from the components. The effect (what `POST /api/folders` writes and refuses) is proved at its
 * door in `packages/server/test/besoin-creer-dossier-ensemble.test.ts`; here, the nominal of the gesture
 * and what the user sees.
 *
 * Plan (need -> case -> proof):
 *   B-32  fresh instance (seed `empty`, no plugin, no page yet), E-2: the + is beside Ask; it opens the list
 *         « Create » where New folder is, with « An empty folder to group pages. »; the empty home shows New folder
 *         as a button          -> `fresh instance`
 *   B-32  home with tiles: the + is beside Ask (desk and phone)   -> `home with tiles`
 *   B-32  read-only: no + and no New folder on a read-only root, nor in a read-only folder (E-3), empty or not
 *   B-33  New folder « Notes » -> `notes` opens as an empty folder (E-3) that has its +; the home tiles it
 *   B-33  a name taken (here or in another store) is refused under the field, the sheet stays, nothing is written
 *   B-33  « Café » creates `cafe`; a sub-folder made from a folder opens under it
 *   P-21  French labels
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 * `CREER_SHOTS=<dir>` writes one capture per state.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

vi.setConfig({ testTimeout: patience(90_000) })

const SHOTS = process.env.CREER_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const WORDS = {
  en: {
    plus: 'New…',
    folder: 'New folder',
    line: 'An empty folder to group pages.',
    nameLabel: 'Folder name',
    create: 'Create',
    taken: 'name already taken',
    emptySection: 'This section holds nothing yet.',
    fromTemplate: 'New from template',
  },
  fr: {
    plus: 'Nouveau…',
    folder: 'Nouveau dossier',
    line: 'Un dossier vide pour regrouper des pages.',
    nameLabel: 'Nom du dossier',
    create: 'Créer',
    taken: 'ce nom est déjà pris',
    emptySection: 'Ce domaine ne contient rien pour l’instant.',
    fromTemplate: 'Nouveau depuis un modèle',
  },
} as const
type Locale = keyof typeof WORDS

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

const T = (ms: number) => patience(ms)
const visit = (browser: BrowserOf, base: string, locale: Locale, route: string, size: Size = 'desk') =>
  open(browser, base, {
    theme: 'light',
    size,
    locale,
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: patience(20_000) }).catch(() => null)
    },
  }) as Promise<{ context: any; page: any }>
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
/** The + : a button named « New… » / « Nouveau… » (docs/ecrans.md, « Components »). */
const plus = (page: any, locale: Locale) => page.getByRole('button', { name: WORDS[locale].plus, exact: true })
const folderEntry = (page: any, locale: Locale) => page.getByRole('button', { name: new RegExp(`^${WORDS[locale].folder}`) })
/** Waits for the pages index to answer, then two frames: the home and E-3 draw their + only from it. */
async function screenUp(page: any) {
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
}
/** Presses + then New folder, types the name, presses Create, and returns the answer of the route. */
async function createFolder(page: any, locale: Locale, name: string) {
  const w = WORDS[locale]
  await plus(page, locale).click({ timeout: T(10_000) })
  await folderEntry(page, locale).click({ timeout: T(10_000) })
  await page.getByLabel(w.nameLabel).fill(name)
  const answered = page.waitForResponse((r: any) => r.url().endsWith('/api/folders') && r.request().method() === 'POST', { timeout: T(20_000) })
  await page.getByRole('button', { name: w.create, exact: true }).click({ timeout: T(10_000) })
  return answered as Promise<{ status(): number }>
}
const hash = (page: any): Promise<string> => page.evaluate(() => location.hash)

describe.skipIf(!playwright)('E-2 and E-37: the + on a fresh instance with no plugin and no page yet', () => {
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

  it('the + beside Ask opens the list « Create » where New folder figures with its one-line description (B-32)', async () => {
    // red if a fresh instance draws no + (the pages directory does not exist until a page is written)
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await plus(page, 'en').waitFor({ timeout: T(10_000) })
    await plus(page, 'en').click()
    await page.getByText(WORDS.en.line, { exact: true }).waitFor({ timeout: T(10_000) })
    expect(await folderEntry(page, 'en').count()).toBe(1)
    await shot(page, 'frais-liste')
    await context.close()
  })

  it('the empty home shows New folder as a button, and the + too (B-32, E-2 empty)', async () => {
    // red if the empty home keeps only the hint to edit the configuration
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByText('Nothing to show yet.', { exact: true }).waitFor({ timeout: T(10_000) })
    expect(await folderEntry(page, 'en').count()).toBeGreaterThanOrEqual(1)
    await shot(page, 'frais-accueil-vide')
    await context.close()
  })

  it('New folder « Notes » on the very first use: the folder opens empty with its own + (B-33, P-21 steps 2 and 3)', async () => {
    // red if the first folder cannot be made on a new instance
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    const answer = await createFolder(page, 'en', 'Notes')
    expect(answer.status()).toBe(201)
    await page.waitForFunction(() => location.hash === '#/section/notes', undefined, { timeout: T(10_000) })
    await page.getByText(WORDS.en.emptySection, { exact: true }).waitFor({ timeout: T(10_000) })
    expect(await plus(page, 'en').count()).toBe(1)
    await shot(page, 'frais-dossier-cree')
    await context.close()
  })
})

for (const locale of ['en', 'fr'] as const) {
  const w = WORDS[locale]
  describe.skipIf(!playwright)(`E-2, E-3, E-37 with writable and read-only stores (${locale})`, () => {
    let instance: Instance
    let browser: BrowserOf
    beforeAll(async () => {
      instance = await launch('besoin-creer-dossier', 'skippy', locale)
      browser = await newBrowser()
    }, 180_000)
    afterAll(async () => {
      await browser?.close()
      await instance?.stop()
    })

    for (const size of ['desk', 'phone'] as const) {
      it(`home with tiles (${size}): the + is there, its list holds New folder and its line (B-32)`, async () => {
        // red if the + is drawn only on an empty home
        const { context, page } = await visit(browser, instance.url, locale, '/', size)
        await screenUp(page)
        await page.getByText('Projets', { exact: false }).first().waitFor({ timeout: T(10_000) })
        expect(await plus(page, locale).count()).toBe(1)
        await plus(page, locale).click()
        await page.getByText(w.line, { exact: true }).waitFor({ timeout: T(10_000) })
        expect(await folderEntry(page, locale).count()).toBe(1)
        await shot(page, `tuiles-${locale}-${size}`)
        await context.close()
      })
    }

    it('New folder « Notes »: 201, the empty folder opens with its own +, and the home tiles it (B-33)', async () => {
      // red if the folder does not open, opens non-empty, or does not reach the home
      const { context, page } = await visit(browser, instance.url, locale, '/')
      await screenUp(page)
      const answer = await createFolder(page, locale, 'Notes')
      expect(answer.status()).toBe(201)
      await page.waitForFunction(() => location.hash === '#/section/notes', undefined, { timeout: T(10_000) })
      await page.getByText(w.emptySection, { exact: true }).waitFor({ timeout: T(10_000) })
      expect(await plus(page, locale).count()).toBe(1)
      await shot(page, `dossier-cree-${locale}`)
      await page.evaluate(() => (location.hash = '#/'))
      await page.getByText('Notes', { exact: true }).first().waitFor({ timeout: T(10_000) })
      await shot(page, `accueil-tuile-${locale}`)
      await context.close()
    })

    it('a name taken in the default store is refused under the field, the sheet stays, nothing is made (B-33)', async () => {
      // red if the 409 closes the sheet, is not shown, or the folder is made anyway
      const { context, page } = await visit(browser, instance.url, locale, '/')
      await screenUp(page)
      const answer = await createFolder(page, locale, 'Projets')
      expect(answer.status()).toBe(409)
      await page.getByText(w.taken, { exact: false }).waitFor({ timeout: T(10_000) })
      expect(await page.getByLabel(w.nameLabel).inputValue()).toBe('Projets')
      expect(await hash(page)).toBe('#/')
      await shot(page, `nom-pris-${locale}`)
      await context.close()
    })

    it('a name taken only in another store (« commun ») is refused the same way (B-33)', async () => {
      // red if the collision is judged in the first store only
      const { context, page } = await visit(browser, instance.url, locale, '/')
      await screenUp(page)
      const answer = await createFolder(page, locale, 'commun')
      expect(answer.status()).toBe(409)
      await page.getByText(w.taken, { exact: false }).waitFor({ timeout: T(10_000) })
      await context.close()
    })

    it('« Café » creates `cafe`: the name is reduced before it is sent (B-33)', async () => {
      // red if capitals and accents are sent as typed (the route would answer 400)
      const { context, page } = await visit(browser, instance.url, locale, '/')
      await screenUp(page)
      const answer = await createFolder(page, locale, 'Café')
      expect(answer.status()).toBe(201)
      await page.waitForFunction(() => location.hash === '#/section/cafe', undefined, { timeout: T(10_000) })
      await context.close()
    })

    it('from inside a writable folder, New folder makes a sub-folder that opens under it (E-3, E-37)', async () => {
      // red if the parent is forgotten or the + is missing in the header of a folder
      const { context, page } = await visit(browser, instance.url, locale, '/section/projets')
      await screenUp(page)
      const answer = await createFolder(page, locale, 'Archives')
      expect(answer.status()).toBe(201)
      await page.waitForFunction(() => location.hash === '#/section/projets/archives', undefined, { timeout: T(10_000) })
      await page.getByText(w.emptySection, { exact: true }).waitFor({ timeout: T(10_000) })
      await context.close()
    })

    it('a read-only folder draws neither the + nor New folder (E-3, P-21 step 3)', async () => {
      // red if the + is drawn where no entry can be offered, or New folder offered in a read-only folder
      const { context, page } = await visit(browser, instance.url, locale, '/section/lecture/ancien')
      await page.getByText('Vieille page', { exact: false }).first().waitFor({ timeout: T(20_000) })
      expect(await plus(page, locale).count()).toBe(0)
      expect(await folderEntry(page, locale).count()).toBe(0)
      expect(await page.getByRole('button', { name: w.fromTemplate, exact: true }).count()).toBe(0)
      await shot(page, `lecture-seule-${locale}`)
      await context.close()
    })
  })
}

describe.skipIf(!playwright)('E-2: nothing can be created on a read-only root', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('besoin-creer-dossier-lecture', 'skippy', 'en')
    browser = await newBrowser()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  it('the home draws no +, and a read-only sub-folder none either (B-32: absent only when the list is empty)', async () => {
    // red if the + is drawn although nothing can be written
    const { context, page } = await visit(browser, instance.url, 'en', '/')
    await screenUp(page)
    await page.getByText('Dossier', { exact: true }).first().waitFor({ timeout: T(10_000) })
    expect(await plus(page, 'en').count()).toBe(0)
    expect(await folderEntry(page, 'en').count()).toBe(0)
    await shot(page, 'racine-lecture-seule')
    await page.evaluate(() => (location.hash = '#/section/dossier'))
    await page.getByText('Page gelée', { exact: false }).first().waitFor({ timeout: T(10_000) })
    expect(await plus(page, 'en').count()).toBe(0)
    await context.close()
  })
})
