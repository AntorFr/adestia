/**
 * B-20 and the E-10 half of B-18 seen from their need (docs/parcours.md P-16 (3) and (5);
 * docs/ecrans.md "E-10 and E-33 in `adestia-ajouts-mcp`"), through a driven browser against the
 * bench instance (`bench/launch.mjs`, scripted engine). The server is slowed, broken or cut by
 * intercepting one request, never by touching the code. Every expectation is a literal taken from
 * the docs, not from the components.
 *
 * PLAN (need -> cases -> proof)
 *  B-20 nominal   Remove on an opened, editable server opens "Remove server?" naming it, Cancel / Remove,
 *                 focus on Cancel (4 skins x en/fr x desk/phone x light/dark; phone = bottom sheet).
 *  B-20 bords     Cancel, the X, the scrim, Escape and Enter-on-Cancel keep the server, send no DELETE and keep
 *                 the edited draft; focus returns to Remove; Tab stays in the sheet; a 64-letter name wraps
 *                 on a phone; a reload cancels the sheet.
 *  B-20 Remove    sends one DELETE, the sheet closes at once, E-10's Remove is disabled while it runs, the
 *                 list comes back without the server and with the others.
 *  B-20 echec     DELETE 500 / cut: sheet closed, alert in the action bar, declaration kept, Remove asks again.
 *  B-20 exclus.   a read-only (shadowed) server has no Remove button; Remove is never the focused default.
 *  B-18 (E-10)    loading row under the heading (no tiles, no empty text, no "Add a server") for the list and an
 *                 opened server; failure block with the message and Retry; Retry shows loading and fetches
 *                 once; health (/api/mcp/status) and refetches after Remove never show loading or a failure.
 *
 * Needs `npm run build` first, and Playwright from the environment (skipped without; a skipped suite
 * is not a seen screen). Pictures: MCP_SHOTS=<dir outside the tree>.
 */
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

interface Loc {
  getByRole(role: string, o?: { name?: string | RegExp }): Loc
  first(): Loc
  count(): Promise<number>
  click(o?: { timeout?: number; position?: { x: number; y: number } }): Promise<void>
  fill(v: string): Promise<void>
  inputValue(): Promise<string>
  press(k: string): Promise<void>
  textContent(): Promise<string | null>
  isDisabled(): Promise<boolean>
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
  route(glob: string, h: (r: Route) => Promise<void>): Promise<void>
  locator(s: string): Loc
  getByRole(role: string, o?: { name?: string | RegExp }): Loc
  evaluate<R, A>(fn: (a: A) => R, a: A): Promise<R>
  evaluate<R>(fn: () => R): Promise<R>
  screenshot(o: { path: string }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  waitForResponse(f: (r: { url(): string; request(): { method(): string } }) => boolean, o?: { timeout?: number }): Promise<unknown>
  reload(o?: { waitUntil?: string }): Promise<unknown>
  keyboard: { press(k: string): Promise<void> }
  mouse: { click(x: number, y: number): Promise<void> }
}
interface Ctx {
  close(): Promise<void>
}

const SHOTS = process.env.MCP_SHOTS
const WORDS = {
  en: {
    title: 'Remove server?',
    body: (n: string) => `“${n}” will no longer be wired. Its declaration is deleted from this instance.`,
    cancel: /^Cancel$/,
    remove: /^Remove$/,
    loading: 'Loading…',
    retry: /^Retry$/,
    heading: 'MCP servers',
    empty: 'None wired yet',
    add: 'Add a server',
    failed500: /request failed \(500\)/i,
  },
  fr: {
    title: 'Supprimer le serveur ?',
    body: (n: string) => `« ${n} » ne sera plus branché. Sa déclaration est supprimée de cette instance.`,
    cancel: /^Annuler$/,
    remove: /^Supprimer$/,
    loading: 'Chargement…',
    retry: /^Réessayer$/,
    heading: 'Serveurs MCP',
    empty: 'Aucun branché',
    add: 'Ajouter un serveur',
    failed500: /la requête a échoué \(500\)/i,
  },
} as const
type Locale = keyof typeof WORDS
type Size = 'desk' | 'phone'
const norm = (s: string | null) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()

/** Control of one request (matched by glob and method): pass, hold until released, answer an error, or cut. */
interface Gate {
  mode: 'pass' | 'hold' | 'status' | 'cut'
  status: number
  body: string
  calls: number
  release(): void
}
async function gate(page: P, glob: string, method: string): Promise<Gate> {
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
    if (route.request().method() !== method) return route.continue()
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
const failure = `${canvas} .adestia-empty--state .adestia-empty__action`
const failureBlock = `${canvas} .adestia-empty--state`
const tiles = `${canvas} .adestia-tile`
const bar = `${canvas} .adestia-mcp__bar`
const T = 15_000
const LONG = 'a'.repeat(62)

describe.skipIf(!playwright)('B-20 et B-18 (E-10) · retirer un serveur MCP avec confirmation, voir son chargement', () => {
  let browser: Awaited<ReturnType<typeof newBrowser>>
  const instances = new Map<string, Instance>()
  let counter = 0

  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    for (const i of instances.values()) await i.stop()
  })

  async function instance(seed: string, skin: string, locale: Locale) {
    const key = `${seed}/${skin}/${locale}`
    let i = instances.get(key)
    if (!i) {
      i = await launch(seed, skin, locale)
      instances.set(key, i)
    }
    return i
  }

  /** A server added through the product's own route, so each destructive test has one of its own. */
  async function declare(locale: Locale, name?: string, skin = 'skippy'): Promise<{ base: string; name: string }> {
    const base = (await instance('base', skin, locale)).url
    const n = name ?? `rm-${Date.now().toString(36)}-${++counter}`
    const res = await fetch(`${base}/api/mcp/servers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: n, url: 'http://127.0.0.1:9/mcp' }),
    })
    expect(res.status).toBe(200)
    return { base, name: n }
  }
  async function names(base: string): Promise<string[]> {
    const res = await fetch(`${base}/api/mcp/servers`)
    return ((await res.json()) as { servers: { name: string }[] }).servers.map((s) => s.name)
  }

  async function visit(opts: { seed?: string; skin?: string; locale: Locale; size?: Size; theme?: 'light' | 'dark'; route: string; before?: (p: P) => Promise<void> }) {
    const inst = await instance(opts.seed ?? 'base', opts.skin ?? 'skippy', opts.locale)
    const { context, page } = await open(browser, inst.url, {
      theme: opts.theme ?? 'light',
      size: opts.size ?? 'desk',
      locale: opts.locale,
      route: opts.route,
      before: opts.before ? async (p) => opts.before?.(p as unknown as P) : undefined,
    })
    const p = page as unknown as P
    if (opts.size === 'phone') {
      // the shell opens on the chat; the last control of its header leads to the canvas
      await p.evaluate(() => {
        if (document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas') return
        const buttons = document.querySelectorAll<HTMLElement>('.adestia-chat__header button')
        buttons[buttons.length - 1]?.click()
      })
      await p.locator('.adestia-shell[data-screen="canvas"]').first().waitFor({ state: 'attached', timeout: T })
    }
    return { page: p, context: context as unknown as Ctx, base: inst.url }
  }
  const shot = async (page: P, name: string) => {
    if (!SHOTS) return
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  }
  const dialog = (page: P) => page.getByRole('dialog')
  const removeButton = (page: P, locale: Locale) => page.locator(bar).getByRole('button', { name: WORDS[locale].remove })
  const focused = (page: P) =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      return { text: (a?.textContent ?? '').trim(), inDialog: !!a?.closest('[role=dialog]'), inBar: !!a?.closest('.adestia-mcp__bar'), tag: a?.tagName ?? '' }
    })

  /** Opens an editable server and presses Remove; the sheet is up when this returns. */
  async function openSheet(page: P, locale: Locale) {
    await removeButton(page, locale).waitFor({ state: 'visible', timeout: T })
    await removeButton(page, locale).click()
    await dialog(page).waitFor({ state: 'visible', timeout: T })
  }

  // ── B-20 · the sheet, in every habillage, language, size and theme ────────────────────────────
  const SKINS = ['skippy', 'alfred', 'nestor', 'dobby']
  const SIZES: Size[] = ['desk', 'phone']
  const THEMES = ['light', 'dark'] as const
  for (const skin of SKINS)
    for (const locale of ['en', 'fr'] as Locale[])
      for (const size of SIZES)
        for (const theme of THEMES)
          it(`B-20 nominal · ${skin}/${locale}/${size}/${theme} : Remove ouvre « ${WORDS[locale].title} » nommant le serveur, Annuler et Supprimer, le focus sur Annuler`, async () => {
            const w = WORDS[locale]
            const { name } = await declare(locale, `sheet-${skin}-${size}-${theme}-${locale}`, skin)
            const { page, context } = await visit({ skin, locale, size, theme, route: `/settings/mcp/${name}` })
            try {
              await openSheet(page, locale)
              expect(norm(await dialog(page).locator('h2').first().textContent())).toBe(w.title)
              expect(norm(await dialog(page).locator('strong').first().textContent())).toBe(name)
              expect(norm(await dialog(page).locator('.adestia-sheet__body').first().textContent())).toBe(w.body(name))
              expect(await dialog(page).getByRole('button', { name: w.cancel }).count()).toBe(1)
              expect(await dialog(page).getByRole('button', { name: w.remove }).count()).toBe(1)
              const f = await focused(page)
              expect(f.inDialog).toBe(true)
              expect(f.text).toBe(locale === 'fr' ? 'Annuler' : 'Cancel')
              const box = await page.evaluate(() => {
                const r = document.querySelector('[role=dialog]')?.getBoundingClientRect()
                return { top: r?.top ?? 0, bottom: r?.bottom ?? 0, left: r?.left ?? 0, right: r?.right ?? 0, h: innerHeight, w: innerWidth }
              })
              expect(box.left).toBeGreaterThanOrEqual(0)
              expect(box.right).toBeLessThanOrEqual(box.w + 1)
              if (size === 'phone') {
                // bottom sheet: it rests on the lower edge of the screen and spans (nearly) its width
                expect(box.bottom).toBeGreaterThanOrEqual(box.h - 2)
                expect(box.right - box.left).toBeGreaterThan(box.w * 0.9)
              }
              await shot(page, `B20-${skin}-${locale}-${size}-${theme}`)
            } finally {
              await context.close()
            }
          }, 60_000)

  describe.each(['en', 'fr'] as Locale[])('langue %s', (locale) => {
    const w = WORDS[locale]
    const removeWord = locale === 'fr' ? 'Supprimer' : 'Remove'

    // ── B-20 · every way out keeps the server ─────────────────────────────────────────────────
    const WAYS: { id: string; how: (p: P) => Promise<void> }[] = [
      { id: 'le bouton Annuler', how: (p) => dialog(p).getByRole('button', { name: w.cancel }).click() },
      { id: 'Escape', how: (p) => p.keyboard.press('Escape') },
      { id: 'Entrée sur Annuler (le focus initial)', how: (p) => p.keyboard.press('Enter') },
      { id: 'la croix ✕', how: (p) => dialog(p).locator('.adestia-sheet__head button').first().click() },
      { id: 'un clic sur le voile', how: (p) => p.mouse.click(5, 5) },
    ]
    for (const way of WAYS)
      it(`B-20 : ${way.id} garde le serveur : aucun DELETE, brouillon intact, focus rendu à ${removeWord}`, async () => {
      const { base, name } = await declare(locale)
        const { page, context } = await visit({ locale, route: `/settings/mcp/${name}`, before: async (p) => void (await gate(p, '**/api/mcp/servers/*', 'DELETE').then((g) => ((p as unknown as { g: Gate }).g = g))) })
        try {
          await page.locator(`${canvas} textarea`).first().waitFor({ state: 'visible', timeout: T })
          const edited = '{"name":"' + name + '","url":"http://127.0.0.1:9/edite"}'
          await page.locator(`${canvas} textarea`).first().fill(edited)
          await openSheet(page, locale)
          await way.how(page)
          await dialog(page).waitFor({ state: 'hidden', timeout: T })
          await page.waitForTimeout(400)
          expect(((page as unknown as { g: Gate }).g).calls).toBe(0)
          expect(await names(base)).toContain(name)
          expect(await page.locator(`${canvas} textarea`).first().inputValue()).toBe(edited)
          expect(await page.evaluate(() => location.hash)).toBe(`#/settings/mcp/${name}`)
          const f = await (async () => {
            for (let i = 0; i < 20; i++) {
              const x = await focused(page)
              if (x.inBar) return x
              await page.waitForTimeout(100)
            }
            return focused(page)
          })()
          expect(f.inBar).toBe(true)
          expect(f.text).toBe(removeWord)
        } finally {
          await context.close()
        }
      }, 60_000)

    it('B-20 : Tab reste dans la feuille, et recharger la page l\'annule', async () => {
      const { name } = await declare(locale)
      const { page, context } = await visit({ locale, route: `/settings/mcp/${name}` })
      try {
        await openSheet(page, locale)
        for (let i = 0; i < 7; i++) {
          await page.keyboard.press('Tab')
          expect((await focused(page)).inDialog).toBe(true)
        }
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator(`${canvas} textarea`).first().waitFor({ state: 'visible', timeout: T })
        expect(await dialog(page).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-20 : un nom de 64 lettres se replie dans la feuille sur un téléphone, sans être tronqué ni déborder', async () => {
      const { name } = await declare(locale, LONG + locale)
      const { page, context } = await visit({ locale, size: 'phone', route: `/settings/mcp/${name}` })
      try {
        await openSheet(page, locale)
        expect(await dialog(page).locator('strong').first().textContent()).toBe(name)
        const fits = await page.evaluate(() => {
          const d = document.querySelector('[role=dialog]') as HTMLElement
          const s = d.querySelector('strong') as HTMLElement
          const r = s.getBoundingClientRect()
          const dr = d.getBoundingClientRect()
          return { scroll: d.scrollWidth <= d.clientWidth + 1, inside: r.right <= dr.right + 1 && r.left >= dr.left - 1 }
        })
        expect(fits.scroll).toBe(true)
        expect(fits.inside).toBe(true)
        await shot(page, `B20-nom-long-${locale}-phone`)
      } finally {
        await context.close()
      }
    }, 60_000)

    // ── B-20 · Remove ─────────────────────────────────────────────────────────────────────────
    it('B-20 : Supprimer envoie un DELETE, la feuille se ferme aussitôt, le bouton Supprimer de E-10 est grisé en attendant, puis la liste revient sans le serveur et avec les autres', async () => {
      const { base, name } = await declare(locale)
      const { page, context } = await visit({ locale, route: `/settings/mcp/${name}`, before: async (p) => void (await gate(p, '**/api/mcp/servers/*', 'DELETE').then((g) => ((p as unknown as { g: Gate }).g = g))) })
      try {
        const g = (page as unknown as { g: Gate }).g
        await openSheet(page, locale)
        g.mode = 'hold'
        await dialog(page).getByRole('button', { name: w.remove }).click()
        await dialog(page).waitFor({ state: 'hidden', timeout: T })
        expect(await removeButton(page, locale).isDisabled()).toBe(true)
        expect(await dialog(page).count()).toBe(0)
        await shot(page, `B20-en-vol-${locale}`)
        const done = page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes(`/api/mcp/servers/${name}`), { timeout: T })
        g.release()
        await done
        await page.locator(`${canvas} .adestia-tile__label:text-is("agenda")`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.evaluate(() => location.hash)).toBe('#/settings/mcp')
        expect(await page.locator(`${canvas} .adestia-tile__label:text-is("${name}")`).count()).toBe(0)
        expect(g.calls).toBe(1)
        expect(await names(base)).not.toContain(name)
        expect(await names(base)).toContain('agenda')
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-20 : un DELETE en erreur 500 : feuille fermée, le message du serveur dans l\'alerte de la barre, déclaration gardée, Supprimer redemande, et une seconde confirmation retire', async () => {
      const { base, name } = await declare(locale)
      const { page, context } = await visit({ locale, route: `/settings/mcp/${name}`, before: async (p) => void (await gate(p, '**/api/mcp/servers/*', 'DELETE').then((g) => ((p as unknown as { g: Gate }).g = g))) })
      try {
        const g = (page as unknown as { g: Gate }).g
        await openSheet(page, locale)
        g.mode = 'status'
        await dialog(page).getByRole('button', { name: w.remove }).click()
        await page.locator(`${canvas} [role=alert]`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(`${canvas} [role=alert]`).first().textContent()).toContain('bench boom')
        expect(await dialog(page).count()).toBe(0)
        expect(await names(base)).toContain(name)
        expect(await removeButton(page, locale).isDisabled()).toBe(false)
        await shot(page, `B20-echec-500-${locale}`)
        await removeButton(page, locale).click()
        await dialog(page).waitFor({ state: 'visible', timeout: T })
        expect(norm(await dialog(page).locator('strong').first().textContent())).toBe(name)
        g.release()
        const done = page.waitForResponse((r) => r.request().method() === 'DELETE', { timeout: T })
        await dialog(page).getByRole('button', { name: w.remove }).click()
        await done
        await page.locator(`${canvas} .adestia-tile__label:text-is("agenda")`).first().waitFor({ state: 'visible', timeout: T })
        expect(await names(base)).not.toContain(name)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-20 : un DELETE sans réponse (serveur coupé) : feuille fermée, une alerte non vide dans la barre, serveur gardé', async () => {
      const { base, name } = await declare(locale)
      const { page, context } = await visit({ locale, route: `/settings/mcp/${name}`, before: async (p) => void (await gate(p, '**/api/mcp/servers/*', 'DELETE').then((g) => ((p as unknown as { g: Gate }).g = g))) })
      try {
        const g = (page as unknown as { g: Gate }).g
        await openSheet(page, locale)
        g.mode = 'cut'
        await dialog(page).getByRole('button', { name: w.remove }).click()
        await page.locator(`${canvas} [role=alert]`).first().waitFor({ state: 'visible', timeout: T })
        expect(norm(await page.locator(`${canvas} [role=alert]`).first().textContent()).length).toBeGreaterThan(0)
        expect(await dialog(page).count()).toBe(0)
        expect(await names(base)).toContain(name)
        expect(await removeButton(page, locale).isDisabled()).toBe(false)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-20 : un serveur en lecture seule (déclaré dans la configuration) n\'a pas de bouton Supprimer', async () => {
      const { page, context } = await visit({ locale, route: '/settings/mcp/fichiers' })
      try {
        await page.locator(`${canvas} .adestia-mcp`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.getByRole('button', { name: w.remove }).count()).toBe(0)
        expect(await dialog(page).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    // ── B-18 · E-10 loading and failure ───────────────────────────────────────────────────────
    for (const seed of ['base', 'empty'])
      it(`B-18 E-10 (${seed}) : liste en attente : le titre reste, la ligne « ${w.loading} » dessous, ni tuiles ni « ${w.empty} » ni « ${w.add} » ; la réponse les remplace`, async () => {
        const { page, context } = await visit({
          seed,
          locale,
          route: '/',
          before: async (p) => {
            const g = await gate(p, '**/api/mcp/servers', 'GET')
            g.mode = 'hold'
            ;(p as unknown as { g: Gate }).g = g
          },
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), '/settings/mcp')
          await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
          expect(norm(await page.locator(loadingRow).first().textContent())).toBe(w.loading)
          expect(norm(await page.locator(`${canvas} h1`).first().textContent())).toBe(w.heading)
          expect(await page.locator(tiles).count()).toBe(0)
          expect(norm(await page.locator(canvas).first().textContent())).not.toContain(w.empty)
          expect(norm(await page.locator(canvas).first().textContent())).not.toContain(w.add)
          expect(await page.locator(failureBlock).count()).toBe(0)
          await shot(page, `B18-liste-chargement-${seed}-${locale}`)
          g.release()
          await page.locator(`${canvas} .adestia-tile__label:text-is("${w.add}")`).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(loadingRow).count()).toBe(0)
          expect(norm(await page.locator(canvas).first().textContent()).includes(w.empty)).toBe(seed === 'empty')
        } finally {
          await context.close()
        }
      }, 60_000)

    it('B-18 E-10 : un serveur ouvert attend sa déclaration : ligne de chargement, ni éditeur ni barre d\'actions ; la réponse les amène', async () => {
      const { page, context } = await visit({
        locale,
        route: '/',
        before: async (p) => {
          const g = await gate(p, '**/api/mcp/servers', 'GET')
          g.mode = 'hold'
          ;(p as unknown as { g: Gate }).g = g
        },
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/settings/mcp/meteo')
        await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
        expect(norm(await page.locator(loadingRow).first().textContent())).toBe(w.loading)
        expect(await page.locator(`${canvas} textarea`).count()).toBe(0)
        expect(await page.locator(bar).count()).toBe(0)
        expect(await page.locator(failureBlock).count()).toBe(0)
        g.release()
        await page.locator(`${canvas} textarea`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(loadingRow).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    for (const seed of ['base', 'empty'])
      it(`B-18 E-10 (${seed}) : lecture en erreur 500 : le titre, le message du serveur et ${locale === 'fr' ? 'Réessayer' : 'Retry'}, ni tuiles ni « ${w.empty} » ; Réessayer remet la ligne de chargement, refait une requête, puis la liste`, async () => {
        const { page, context } = await visit({
          seed,
          locale,
          route: '/',
          before: async (p) => {
            const g = await gate(p, '**/api/mcp/servers', 'GET')
            g.mode = 'status'
            ;(p as unknown as { g: Gate }).g = g
          },
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await page.evaluate((h) => (location.hash = h), '/settings/mcp')
          await page.locator(failureBlock).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failureBlock).first().textContent()).toContain('bench boom')
          expect(norm(await page.locator(`${canvas} h1`).first().textContent())).toBe(w.heading)
          const retry = page.locator(failure).getByRole('button', { name: w.retry })
          expect(await retry.count()).toBe(1)
          expect(await page.locator(tiles).count()).toBe(0)
          expect(norm(await page.locator(canvas).first().textContent())).not.toContain(w.empty)
          expect(await page.locator(loadingRow).count()).toBe(0)
          await shot(page, `B18-liste-echec-${seed}-${locale}`)
          const before = g.calls
          g.mode = 'hold'
          await retry.click()
          await page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failureBlock).count()).toBe(0)
          expect(await page.locator(`${canvas} .adestia-empty__action`).count()).toBe(0)
          await page.waitForTimeout(400)
          expect(g.calls).toBe(before + 1)
          g.release()
          await page.locator(`${canvas} .adestia-tile__label:text-is("${w.add}")`).first().waitFor({ state: 'visible', timeout: T })
          expect(await page.locator(failureBlock).count()).toBe(seed === 'empty' ? 1 : 0) // the empty state of an empty instance is the same block
          expect(await page.locator(loadingRow).count()).toBe(0)
        } finally {
          await context.close()
        }
      }, 60_000)

    it('B-18 E-10 : erreur 500 sans phrase du serveur : « request failed (500) » traduit, jamais un « fetch failed » brut', async () => {
      const { page, context } = await visit({
        locale,
        route: '/',
        before: async (p) => {
          const g = await gate(p, '**/api/mcp/servers', 'GET')
          g.mode = 'status'
          g.body = '{}'
        },
      })
      try {
        await page.evaluate((h) => (location.hash = h), '/settings/mcp')
        await page.locator(failureBlock).first().waitFor({ state: 'visible', timeout: T })
        const text = norm(await page.locator(failureBlock).first().textContent())
        expect(text).toMatch(w.failed500)
        expect(text).not.toContain('fetch failed')
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-18 E-10 : serveur sans réponse : le bloc d\'échec avec Réessayer, pas de ligne de chargement ni de liste ; Réessayer ramène la liste quand le serveur répond', async () => {
      const { page, context } = await visit({
        locale,
        route: '/',
        before: async (p) => {
          const g = await gate(p, '**/api/mcp/servers', 'GET')
          g.mode = 'cut'
          ;(p as unknown as { g: Gate }).g = g
        },
      })
      try {
        const g = (page as unknown as { g: Gate }).g
        await page.evaluate((h) => (location.hash = h), '/settings/mcp')
        await page.locator(failureBlock).first().waitFor({ state: 'visible', timeout: T })
        expect(norm(await page.locator(failureBlock).first().textContent()).length).toBeGreaterThan(0)
        expect(await page.locator(tiles).count()).toBe(0)
        g.release()
        await page.locator(failure).getByRole('button', { name: w.retry }).click()
        await page.locator(`${canvas} .adestia-tile__label:text-is("agenda")`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(failureBlock).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)

    it('B-18 E-10 : la santé (/api/mcp/status) en attente puis en erreur n\'a ni ligne de chargement, ni message, ni Réessayer ; les tuiles restent', async () => {
      for (const mode of ['hold', 'status'] as const) {
        const { page, context } = await visit({
          locale,
          route: '/',
          before: async (p) => {
            const g = await gate(p, '**/api/mcp/status', 'GET')
            g.mode = mode
          },
        })
        try {
          await page.evaluate((h) => (location.hash = h), '/settings/mcp')
          await page.locator(`${canvas} .adestia-tile__label:text-is("agenda")`).first().waitFor({ state: 'visible', timeout: T })
          await page.waitForTimeout(600)
          expect(await page.locator(loadingRow).count()).toBe(0)
          expect(await page.locator(failureBlock).count()).toBe(0)
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
        } finally {
          await context.close()
        }
      }
    }, 60_000)

    it('B-18 E-10 : après Supprimer, la relecture de la liste ne montre jamais de ligne de chargement, et si elle échoue c\'est en silence', async () => {
      for (const mode of ['hold', 'status'] as const) {
        const { name } = await declare(locale)
        const { page, context } = await visit({
          locale,
          route: `/settings/mcp/${name}`,
          before: async (p) => {
            const g = await gate(p, '**/api/mcp/servers', 'GET')
            ;(p as unknown as { g: Gate }).g = g
          },
        })
        try {
          const g = (page as unknown as { g: Gate }).g
          await openSheet(page, locale)
          g.mode = mode
          const before = g.calls
          const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE', { timeout: T })
          await dialog(page).getByRole('button', { name: w.remove }).click()
          await deleted
          for (let i = 0; i < 30 && g.calls === before; i++) await page.waitForTimeout(100)
          expect(g.calls).toBe(before + 1) // the list was read again
          await page.waitForTimeout(600)
          expect(await page.locator(loadingRow).count()).toBe(0)
          expect(await page.locator(failureBlock).count()).toBe(0)
          expect(await page.getByRole('button', { name: w.retry }).count()).toBe(0)
          g.release()
        } finally {
          await context.close()
        }
      }
    }, 90_000)

    it('B-18 E-10 : un serveur ouvert dont le nom n\'est pas dans les déclarations (retiré ailleurs) montre la liste, sans état neuf', async () => {
      const { page, context } = await visit({ locale, route: '/settings/mcp/n-existe-pas' })
      try {
        await page.locator(`${canvas} .adestia-tile__label:text-is("agenda")`).first().waitFor({ state: 'visible', timeout: T })
        expect(await page.locator(failureBlock).count()).toBe(0)
        expect(await page.locator(loadingRow).count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 60_000)
  })

  // ── B-18 · E-10 in the four habillages, both languages, desk and phone ───────────────────────
  for (const skin of SKINS)
    for (const locale of ['en', 'fr'] as Locale[])
      for (const size of SIZES)
        it(`B-18 E-10 · ${skin}/${locale}/${size} : chargement puis échec avec ${locale === 'fr' ? 'Réessayer' : 'Retry'}`, async () => {
          const w = WORDS[locale]
          // opened straight on E-10: on a phone the shell then shows the canvas, not the chat
          const slow = await visit({
            skin,
            locale,
            size,
            route: '/settings/mcp',
            before: async (p) => {
              const g = await gate(p, '**/api/mcp/servers', 'GET')
              g.mode = 'hold'
            },
          })
          try {
            await slow.page.locator(loadingRow).first().waitFor({ state: 'visible', timeout: T })
            expect(norm(await slow.page.locator(loadingRow).first().textContent())).toBe(w.loading)
            expect(await slow.page.locator(tiles).count()).toBe(0)
            await shot(slow.page, `B18-${skin}-${locale}-${size}-chargement`)
          } finally {
            await slow.context.close()
          }
          const broken = await visit({
            skin,
            locale,
            size,
            route: '/settings/mcp',
            before: async (p) => {
              const g = await gate(p, '**/api/mcp/servers', 'GET')
              g.mode = 'status'
            },
          })
          try {
            await broken.page.locator(failureBlock).first().waitFor({ state: 'visible', timeout: T })
            expect(await broken.page.locator(failure).getByRole('button', { name: w.retry }).count()).toBe(1)
            await shot(broken.page, `B18-${skin}-${locale}-${size}-echec`)
          } finally {
            await broken.context.close()
          }
        }, 60_000)
})
