/**
 * B-18 seen from its need (docs/parcours.md P-16 (3), docs/ecrans.md "Loading and failure"):
 * the shell's screens E-3, E-4, E-8, E-9, E-11 and E-13 show their loading before their data, and
 * when a read fails E-4/E-8/E-11/E-13 show a message and Retry, which fetches again. E-3 and E-9
 * have no Retry. Driven through a browser against the bench instance (`bench/launch.mjs`, scripted
 * engine); the server is slowed or broken by intercepting one read, never by touching the code.
 * Expectations are literals from the docs, not from the components.
 *
 * Needs `npm run build` first, and Playwright from the environment (skipped without; a skipped
 * suite is not a seen screen). Pictures: CHARGEMENTS_SHOTS=<dir outside the tree>.
 */
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, playwright } from './charte-browser.js'

interface Loc {
  first(): Loc
  nth(i: number): Loc
  count(): Promise<number>
  click(o?: { timeout?: number }): Promise<void>
  focus(): Promise<void>
  press(k: string): Promise<void>
  textContent(): Promise<string | null>
  isVisible(): Promise<boolean>
  waitFor(o?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>
  locator(s: string): Loc
}
interface Route {
  request(): { method(): string }
  fulfill(o: { status: number; contentType: string; body: string }): Promise<void>
  continue(): Promise<void>
  abort(code?: string): Promise<void>
}
interface P {
  goto(url: string, o?: { waitUntil?: string }): Promise<unknown>
  route(glob: string, h: (r: Route) => Promise<void>): Promise<void>
  locator(s: string): Loc
  getByRole(role: string, o: { name: RegExp }): Loc
  getByText(t: string | RegExp, o?: { exact?: boolean }): Loc
  waitForSelector(s: string, o?: { timeout?: number; state?: string }): Promise<unknown>
  evaluate<R, A>(fn: (a: A) => R, a: A): Promise<R>
  evaluate<R>(fn: () => R): Promise<R>
  screenshot(o: { path: string }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
}
interface Ctx {
  newPage(): Promise<P>
  addInitScript<A>(fn: (a: A) => void, a: A): Promise<void>
  close(): Promise<void>
}
interface B {
  newContext(o: Record<string, unknown>): Promise<Ctx>
  close(): Promise<void>
}

const SHOTS = process.env.CHARGEMENTS_SHOTS
const WORDS = {
  en: { loading: 'Loading…', retry: /^Retry$/, notResponding: 'The server is not responding', failed: (n: number) => `Request failed (${n})` },
  fr: { loading: 'Chargement…', retry: /^Réessayer$/, notResponding: 'Le serveur ne répond pas', failed: (n: number) => `La requête a échoué (${n})` },
} as const
type Locale = keyof typeof WORDS

/** Control of one read: pass, hold until released, answer an error, or cut the connection. */
interface Gate {
  mode: 'pass' | 'hold' | 'status' | 'cut'
  status: number
  body: string
  calls: number
  release(): void
}
async function gate(page: P, glob: string): Promise<Gate> {
  const held: (() => void)[] = []
  const g: Gate = {
    mode: 'pass',
    status: 500,
    body: JSON.stringify({ error: 'bench boom' }),
    calls: 0,
    release() {
      g.mode = 'pass'
      for (const r of held.splice(0)) r()
    },
  }
  await page.route(glob, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    g.calls++
    if (g.mode === 'hold') {
      await new Promise<void>((r) => held.push(r))
      return route.continue()
    }
    if (g.mode === 'status') return route.fulfill({ status: g.status, contentType: 'application/json', body: g.body })
    if (g.mode === 'cut') return route.abort('failed')
    return route.continue()
  })
  return g
}

const canvas = '.adestia-canvas'
const loadingRow = `${canvas} .adestia-loading`
const failure = `${canvas} .adestia-empty--state`
const T = 15_000

describe.skipIf(!playwright)('B-18 · chargement et Réessayer des écrans du shell', () => {
  let browser: B
  const instances = new Map<string, Instance>()
  const shot = async (page: P, name: string) => {
    if (!SHOTS) return
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  }

  beforeAll(async () => {
    browser = (await newBrowser()) as unknown as B
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    for (const i of instances.values()) await i.stop()
  })

  async function instance(skin: string, locale: Locale) {
    const key = `${skin}/${locale}`
    let i = instances.get(key)
    if (!i) {
      i = await launch('base', skin, locale)
      instances.set(key, i)
    }
    return i
  }

  async function visit(skin: string, locale: Locale, hash: string, prepare: (page: P) => Promise<void> = async () => undefined) {
    const inst = await instance(skin, locale)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: locale === 'fr' ? 'fr-FR' : 'en-US',
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    await prepare(page)
    await page.goto(`${inst.url}/#${hash}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
    return { page, context, base: inst.url }
  }


  // ── the screens: where each opens, the read it waits for, and what proves its data ──────────
  const SCREENS = [
    { id: 'E-4', hash: '/page/pieces/dossier', read: '**/api/pages/pieces/dossier*', data: 'Pièces jointes', retry: true },
    { id: 'E-11', hash: '/settings/instructions', read: '**/api/instructions', data: 'relecteur', retry: true },
    { id: 'E-13', hash: '/settings/delegations', read: '**/api/delegations', data: 'Résume le devis de la cuisine', retry: true },
  ] as const

  const COMBOS: [string, Locale][] = [
    ['skippy', 'en'],
    ['skippy', 'fr'],
    ['alfred', 'fr'],
    ['nestor', 'en'],
    ['dobby', 'fr'],
    ['alfred', 'en'],
    ['nestor', 'fr'],
    ['dobby', 'en'],
  ]

  describe.each(COMBOS)('habillage %s, langue %s', (skin, locale) => {
    const w = WORDS[locale]

    describe.each(SCREENS)('$id', (screen) => {
      it(`${screen.id} montre la ligne de chargement avant ses données, sans bouton, puis les données la remplacent`, async () => {
        const { page, context } = await visit(skin, locale, '/', async (p) => {
          const g = await gate(p, screen.read)
          g.mode = 'hold'
          ;(p as unknown as { g: Gate }).g = g
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), screen.hash)
          await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
          expect((await page.locator(loadingRow).first().textContent())?.trim()).toBe(w.loading)
          expect(await page.getByText(screen.data, { exact: false }).count()).toBe(0)
          expect(await page.locator(canvas).locator('.adestia-empty__action').count()).toBe(0)
          await shot(page, `${skin}-${locale}-${screen.id}-chargement`)
          g.release()
          await page.getByText(screen.data, { exact: false }).first().waitFor({ state: 'visible', timeout: T })
          await page.locator(loadingRow).first().waitFor({ state: 'hidden', timeout: T })
        } finally {
          await context.close()
        }
      }, 60_000)

      it(`${screen.id} en erreur 500 : le message du serveur et ${locale === 'fr' ? 'Réessayer' : 'Retry'}, et Réessayer recharge et affiche les données`, async () => {
        const { page, context } = await visit(skin, locale, '/', async (p) => {
          const g = await gate(p, screen.read)
          g.mode = 'status'
          ;(p as unknown as { g: Gate }).g = g
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), screen.hash)
          await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
          // E-4's failure is E-8, whose sentence for "the server could not" is its own (a hole: docs/ecrans.md
          // does not say whether the server's `error` replaces it); E-11 and E-13 say the server's sentence.
          if (screen.id === 'E-4') expect((await page.locator(failure).first().textContent())?.length).toBeGreaterThan(10)
          else expect(await page.locator(failure).first().textContent()).toContain('bench boom')
          const button = page.locator(`${failure} .adestia-empty__action button`).first()
          expect((await button.textContent())?.trim()).toMatch(w.retry)
          expect(await page.locator(loadingRow).count()).toBe(0)
          await shot(page, `${skin}-${locale}-${screen.id}-echec`)
          g.release()
          await button.click()
          await page.getByText(screen.data, { exact: false }).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failure).count()).toBe(0)
        } finally {
          await context.close()
        }
      }, 60_000)
    })
  })

  // ── the rest runs once per language on the default skin ─────────────────────────────────
  describe.each(['en', 'fr'] as Locale[])('langue %s', (locale) => {
    const w = WORDS[locale]

    it('E-3 : la ligne de chargement remplace l\'état vide tant que l\'index n\'a pas répondu, sans Réessayer ; les cartes la remplacent', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/index')
        g.mode = 'hold'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/section/voyages')
        await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
        expect((await page.locator(loadingRow).first().textContent())?.trim()).toBe(w.loading)
        expect(await page.getByText('Voyage Italie').count()).toBe(0)
        expect(await page.getByText(locale === 'fr' ? /Rien ne correspond|Cette section est vide/ : /This section holds nothing yet|Nothing matches/).count()).toBe(0)
        expect(await page.locator(canvas).locator('.adestia-empty__action').count()).toBe(0)
        await shot(page, `skippy-${locale}-E-3-chargement`)
        g.release()
        await page.getByText('Voyage Italie').first().waitFor({ state: 'visible', timeout: T })
        await page.locator(loadingRow).first().waitFor({ state: 'hidden', timeout: T })
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-3 : index en erreur 500, la ligne de chargement reste (jamais l\'état vide) et aucun bouton Réessayer n\'apparaît', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/index')
        g.mode = 'status'
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/section/voyages')
        await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
        await page.waitForTimeout(1500)
        expect(await page.locator(loadingRow).count()).toBe(1)
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-9 : la ligne de chargement s\'affiche au-dessus des tuiles, qui restent dessinées, sans Réessayer ; elle part quand les lectures ont répondu', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/delegations')
        g.mode = 'hold'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/settings')
        await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
        expect((await page.locator(loadingRow).first().textContent())?.trim()).toBe(w.loading)
        expect(await page.locator(`${canvas} .adestia-tiles .adestia-tile`).count()).toBeGreaterThan(0)
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        await shot(page, `skippy-${locale}-E-9-chargement`)
        g.release()
        await page.locator(loadingRow).first().waitFor({ state: 'hidden', timeout: T })
        expect(await page.locator(`${canvas} .adestia-tiles .adestia-tile`).count()).toBeGreaterThan(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-9 : une lecture en erreur 500 laisse les tuiles, ni message ni bouton, et la ligne de chargement s\'en va', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/delegations')
        g.mode = 'status'
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/settings')
        await page.locator(`${canvas} .adestia-tiles .adestia-tile`).first().waitFor({ state: 'visible', timeout: T })
        await page.locator(loadingRow).first().waitFor({ state: 'hidden', timeout: T })
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        expect(await page.locator(failure).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-11 : liste en erreur 500 sans phrase du serveur, la phrase générique « Request failed (500) »', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/instructions')
        g.mode = 'status'
        g.body = '{}'
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/settings/instructions')
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(failure).first().textContent()).toContain(w.failed(500))
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-4 : erreur 500 sans phrase du serveur, ou sans réponse, jamais un « fetch failed » brut, et Réessayer', async () => {
      const a = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/pieces/dossier*')
        g.mode = 'status'
        g.body = '{}'
      })
      try {
        await a.page.evaluate((h) => (location.hash = h), '/page/pieces/dossier')
        await a.page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        expect(await a.page.locator(failure).first().textContent()).not.toMatch(/fetch failed|Failed to fetch/)
        expect(await a.page.getByRole('button', { name: w.retry }).count()).toBe(1)
      } finally {
        await a.context.close()
      }
      const b = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/pieces/dossier*')
        g.mode = 'cut'
      })
      try {
        await b.page.evaluate((h) => (location.hash = h), '/page/pieces/dossier')
        await b.page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        const text = await b.page.locator(failure).first().textContent()
        expect(text).not.toContain('fetch failed')
        expect(text).not.toContain('Failed to fetch')
        expect(await b.page.getByRole('button', { name: w.retry }).count()).toBe(1)
      } finally {
        await b.context.close()
      }
    }, 90_000)

    it('E-8 : serveur injoignable sur une page, Réessayer recharge la page', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/pieces/dossier*')
        g.mode = 'cut'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/page/pieces/dossier')
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        g.release()
        await page.getByRole('button', { name: w.retry }).first().click()
        await page.getByText('Pièces jointes').first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(failure).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    for (const status of [404, 401, 403]) {
      it(`E-8 : une page refusée en ${status} n'a pas de bouton ${locale === 'fr' ? 'Réessayer' : 'Retry'}`, async () => {
        const { page, context } = await visit('skippy', locale, '/', async (p) => {
          const g = await gate(p, '**/api/pages/pieces/dossier*')
          g.mode = 'status'
          g.status = status
        })
        try {
          await page.evaluate((h) => (location.hash = h), '/page/pieces/dossier')
          await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
          expect(await page.locator(`${canvas} .adestia-empty__action .adestia-btn`).count()).toBe(0)
        } finally {
          await context.close()
        }
      }, 60_000)
    }

    it('E-8 : une vraie page absente (404 du serveur) n\'a pas de bouton Réessayer', async () => {
      const { page, context } = await visit('skippy', locale, '/page/nulle/part')
      try {
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        await shot(page, `skippy-${locale}-E-8-404`)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('Réessayer ne peut pas être pressé deux fois : le bloc d\'échec cède la place à la ligne de chargement, une seule requête part', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/pages/pieces/dossier*')
        g.mode = 'status'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/page/pieces/dossier')
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        const before = g.calls
        g.mode = 'hold'
        await page.getByRole('button', { name: w.retry }).first().click()
        await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(failure).count()).toBe(0)
        expect(await page.locator(loadingRow).count()).toBe(1)
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        await page.waitForTimeout(500)
        expect(g.calls).toBe(before + 1)
        g.release()
        await page.getByText('Pièces jointes').first().waitFor({ state: 'visible', timeout: T })
      } finally {
        await context.close()
      }
    }, 60_000)

    it('Réessayer s\'active au clavier', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/delegations')
        g.mode = 'status'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/settings/delegations')
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        g.release()
        const button = page.getByRole('button', { name: w.retry }).first()
        await button.focus()
        await button.press('Enter')
        await page.getByText('Résume le devis de la cuisine').first().waitFor({ state: 'visible', timeout: T })
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-4 : de page en page, la première reste à l\'écran sans ligne de chargement jusqu\'à ce que la seconde réponde', async () => {
      const { page, context } = await visit('skippy', locale, '/page/pieces/dossier', async (p) => {
        const g = await gate(p, '**/api/pages/maison/rangement*')
        g.mode = 'hold'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.getByText('Pièces jointes').first().waitFor({ state: 'visible', timeout: T })
        await page.evaluate((h) => (location.hash = h), '/page/maison/rangement')
        await page.waitForTimeout(800)
        expect(g.calls).toBeGreaterThan(0)
        expect(await page.getByText('Pièces jointes').first().isVisible()).toBe(true)
        expect(await page.locator(loadingRow).count()).toBe(0)
        g.release()
        await page.getByText('Fini en juin.').first().waitFor({ state: 'visible', timeout: T })
        expect(await page.getByText('Pièces jointes').count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-4 : si la seconde page échoue, le bloc d\'échec remplace la première', async () => {
      const { page, context } = await visit('skippy', locale, '/page/pieces/dossier', async (p) => {
        const g = await gate(p, '**/api/pages/maison/rangement*')
        g.mode = 'status'
      })
      try {
        await page.getByText('Pièces jointes').first().waitFor({ state: 'visible', timeout: T })
        await page.evaluate((h) => (location.hash = h), '/page/maison/rangement')
        await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.getByText('Pièces jointes').count()).toBe(0)
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(1)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-4 : un clic ultérieur remplace le précédent, la page affichée est la dernière demandée', async () => {
      const { page, context } = await visit('skippy', locale, '/page/pieces/dossier', async (p) => {
        const g = await gate(p, '**/api/pages/maison/rangement*')
        g.mode = 'hold'
        ;(p as unknown as { g: Gate }).g = g
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.getByText('Pièces jointes').first().waitFor({ state: 'visible', timeout: T })
        await page.evaluate((h) => (location.hash = h), '/page/maison/rangement')
        await page.waitForTimeout(300)
        await page.evaluate((h) => (location.hash = h), '/page/voyages/italie')
        await page.getByText('Voyage Italie').first().waitFor({ state: 'visible', timeout: T })
        g.release()
        await page.waitForTimeout(800)
        expect(await page.getByText('Fini en juin.').count()).toBe(0)
        expect(await page.getByText('Voyage Italie').first().isVisible()).toBe(true)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('E-11 : la liste en 404 reste « ce moteur n\'a pas ce dossier », sans Réessayer', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/instructions')
        g.mode = 'status'
        g.status = 404
        g.body = '{}'
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/settings/instructions')
        await page.waitForTimeout(1500)
        expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        expect(await page.locator(loadingRow).count()).toBe(0)
        expect(await page.getByText(w.failed(404)).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    for (const [id, listHash, listRead, openText, openRead] of [
      ['E-11', '/settings/instructions', '**/api/instructions', 'relecteur', '**/api/instructions/.claude/agents/relecteur.md*'],
      ['E-13', '/settings/delegations', '**/api/delegations', 'Résume le devis de la cuisine', '**/api/delegations/**'],
    ] as const) {
      it(`${id} : ouvrir un élément dont la lecture échoue en 500 montre le bloc d'échec à sa place, la liste reste atteignable, et Réessayer affiche l'élément`, async () => {
        const { page, context } = await visit('skippy', locale, '/', async (p) => {
          const g = await gate(p, openRead)
          g.mode = 'status'
          ;(p as unknown as { g: Gate }).g = g
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), listHash)
          await page.getByText(openText).first().waitFor({ state: 'visible', timeout: T })
          await page.getByText(openText).first().click()
          await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failure).first().textContent()).toContain('bench boom')
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(1)
          await shot(page, `skippy-${locale}-${id}-element-echec`)
          g.release()
          await page.getByRole('button', { name: w.retry }).first().click()
          await page.locator(failure).first().waitFor({ state: 'hidden', timeout: T })
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        } finally {
          await context.close()
        }
      }, 60_000)

      for (const status of [404, 401, 403]) {
        it(`${id} : un élément ouvert refusé en ${status} a le message, sans Réessayer`, async () => {
          const { page, context } = await visit('skippy', locale, '/', async (p) => {
            const g = await gate(p, openRead)
            g.mode = 'status'
            g.status = status
          })
          try {
            await page.evaluate((h) => (location.hash = h), listHash)
            await page.getByText(openText).first().waitFor({ state: 'visible', timeout: T })
            await page.getByText(openText).first().click()
            await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
            expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
          } finally {
            await context.close()
          }
        }, 60_000)
      }

      it(`${id} : ouvrir un élément dont la lecture est lente montre la ligne de chargement à sa place`, async () => {
        const { page, context } = await visit('skippy', locale, '/', async (p) => {
          const g = await gate(p, openRead)
          g.mode = 'hold'
          ;(p as unknown as { g: Gate }).g = g
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), listHash)
          await page.getByText(openText).first().waitFor({ state: 'visible', timeout: T })
          await page.getByText(openText).first().click()
          await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
          expect((await page.locator(loadingRow).first().textContent())?.trim()).toBe(w.loading)
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
          g.release()
          await page.locator(loadingRow).first().waitFor({ state: 'hidden', timeout: T })
        } finally {
          await context.close()
        }
      }, 60_000)

      it(`${id} : la liste inaccessible (serveur muet) dit « ${w.notResponding} » avec Réessayer`, async () => {
        const { page, context } = await visit('skippy', locale, '/', async (p) => {
          const g = await gate(p, listRead)
          g.mode = 'cut'
        })
        try {
          await page.evaluate((h) => (location.hash = h), listHash)
          await page.locator(failure).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failure).first().textContent()).toContain(w.notResponding)
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(1)
        } finally {
          await context.close()
        }
      }, 60_000)
    }

    it('les classes du bloc d\'échec et de la ligne de chargement sont celles que la doc nomme', async () => {
      const { page, context } = await visit('skippy', locale, '/', async (p) => {
        const g = await gate(p, '**/api/delegations')
        g.mode = 'status'
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/settings/delegations')
        await page.locator('.adestia-empty.adestia-empty--state').first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator('.adestia-empty--state .adestia-empty__icon').count()).toBe(1)
        expect(await page.locator('.adestia-empty--state .adestia-empty__text').count()).toBe(1)
        expect(await page.locator('.adestia-empty--state .adestia-empty__action button.adestia-btn').count()).toBe(1)
      } finally {
        await context.close()
      }
    }, 60_000)
  })
})
