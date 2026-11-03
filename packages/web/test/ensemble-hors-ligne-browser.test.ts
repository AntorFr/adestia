/**
 * B-19 (P-16 étape 4, AD-27, E-32) vue depuis le besoin seul, par un navigateur piloté.
 * Le serveur du banc (`bench/launch.mjs`, moteur scripté) est mis derrière un relais TCP que le test
 * coupe puis rouvre sur le même port : c'est « couper le serveur / le relancer » sans toucher au code.
 * Les attendus sont des littéraux tirés de docs/parcours.md (B-19) et docs/ecrans.md (E-32).
 *
 * Il faut `npm run build` avant, et Playwright de l'environnement (sans lui : ignoré, ce qui n'est
 * pas un écran vu). Captures : ENSEMBLE_HORS_LIGNE_SHOTS=<dossier hors de l'arbre>.
 */
import { createServer, type Server, type Socket, connect } from 'node:net'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, playwright } from './charte-browser.js'

interface Loc {
  first(): Loc
  filter(o: { hasText: string | RegExp }): Loc
  locator(s: string): Loc
  count(): Promise<number>
  click(o?: { timeout?: number }): Promise<void>
  fill(v: string): Promise<void>
  isVisible(): Promise<boolean>
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>
  textContent(): Promise<string | null>
  waitFor(o?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>
  evaluate<R>(fn: (el: HTMLElement) => R): Promise<R>
}
interface Route {
  request(): { method(): string }
  fulfill(o: { status: number; contentType?: string; body?: string }): Promise<void>
  continue(): Promise<void>
  abort(code?: string): Promise<void>
}
interface P {
  goto(url: string, o?: { waitUntil?: string }): Promise<unknown>
  route(glob: string, h: (r: Route) => Promise<void>): Promise<void>
  locator(s: string): Loc
  getByRole(role: string, o?: { name?: string | RegExp }): Loc
  getByText(t: string | RegExp, o?: { exact?: boolean }): Loc
  getByLabel(t: string | RegExp): Loc
  addInitScript<A>(fn: (a: A) => void, a: A): Promise<void>
  evaluate<R, A>(fn: (a: A) => R, a: A): Promise<R>
  evaluate<R>(fn: () => R): Promise<R>
  waitForSelector(s: string, o?: { timeout?: number; state?: string }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  screenshot(o: { path: string }): Promise<unknown>
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

const SHOTS = process.env.ENSEMBLE_HORS_LIGNE_SHOTS
const TEXT = { en: 'The server is not responding', fr: 'Le serveur ne répond pas' } as const
type Locale = keyof typeof TEXT
const DESK = { viewport: { width: 1440, height: 900 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

/** A TCP relay in front of the bench instance: `cut()` refuses and drops everything, `restore()` reopens the same port. */
class Relay {
  private server: Server | undefined
  private readonly sockets = new Set<Socket>()
  port = 0
  constructor(private readonly target: number) {}
  get url() {
    return `http://127.0.0.1:${this.port}`
  }
  async restore(): Promise<void> {
    if (this.server) return
    const server = createServer((down) => {
      const up = connect(this.target, '127.0.0.1')
      this.sockets.add(down).add(up)
      down.pipe(up)
      up.pipe(down)
      const drop = () => {
        down.destroy()
        up.destroy()
      }
      down.on('error', drop)
      up.on('error', drop)
      down.on('close', () => up.destroy())
      up.on('close', () => down.destroy())
    })
    await new Promise<void>((ok, ko) => {
      server.once('error', ko)
      server.listen(this.port, '127.0.0.1', () => ok())
    })
    this.port = (server.address() as { port: number }).port
    this.server = server
  }
  async cut(): Promise<void> {
    const server = this.server
    this.server = undefined
    for (const s of this.sockets) s.destroy()
    this.sockets.clear()
    await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()))
  }
}

let inst: Instance | undefined
let instFr: Instance | undefined
let relay: Relay
let relayFr: Relay
let browser: B
const shot = async (page: P, name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}
const targetPort = (i: Instance) => Number(new URL(i.url).port)

async function open(opts: { locale: Locale; phone?: boolean; theme?: 'light' | 'dark'; route: string; waitFor?: string }) {
  const context = await browser.newContext({
    ...(opts.phone ? PHONE : DESK),
    colorScheme: opts.theme ?? 'light',
    locale: opts.locale === 'fr' ? 'fr-FR' : 'en-US',
  })
  const page = await context.newPage()
  await page.goto(`${(opts.locale === 'fr' ? relayFr : relay).url}/#${opts.route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(opts.waitFor ?? '.adestia-chat', { timeout: 20_000 })
  return { context, page }
}
async function showCanvas(page: P) {
  await page.evaluate(() => {
    if (document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas') return
    document.querySelector<HTMLElement>('.adestia-chat__header button[aria-label="Open apps"]')?.click()
  })
  await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { state: 'attached', timeout: 10_000 })
  // the slide between the two screens is a transition: wait until the canvas sits at the left edge
  for (let i = 0; i < 50; i++) {
    const box = await page.locator('.adestia-canvas__body').boundingBox()
    if (box && Math.abs(box.x) < 1) return
    await page.waitForTimeout(100)
  }
  throw new Error('the canvas never settled at the left edge')
}
const banner = (page: P, locale: Locale) => page.getByRole('status').filter({ hasText: TEXT[locale] })

const suite = playwright ? describe : describe.skip

suite('B-19 : le bandeau « serveur ne répond pas », vu de l’extérieur', () => {
  beforeAll(async () => {
    inst = await launch('config-writable', '', 'en')
    relay = new Relay(targetPort(inst))
    await relay.restore()
    instFr = await launch('base', '', 'fr')
    relayFr = new Relay(targetPort(instFr))
    await relayFr.restore()
    browser = (await newBrowser()) as unknown as B
  }, 60_000)
  beforeEach(async () => {
    await relay.restore()
    await relayFr.restore() // a failed test must not leave the server cut for the next
  })
  afterAll(async () => {
    await browser?.close()
    await relay?.cut()
    await relayFr?.cut()
    await inst?.stop()
    await instFr?.stop()
  })

  describe('nominal : on coupe le serveur, le bandeau vient ; on le relance, il part seul', () => {
    for (const [name, route, ready] of [
      ['accueil', '/', '.adestia-chat'],
      ['réglages MCP (E-10)', '/settings/mcp', '.adestia-chat'],
    ] as const) {
      it(`${name} : apparaît sans recharger, laisse l’écran dessous, repart seul`, async () => {
        const { context, page } = await open({ locale: 'en', route, waitFor: ready })
        await page.evaluate(() => {
          ;(window as unknown as { __mark: number }).__mark = 42
        })
        const b = banner(page, 'en')
        expect(await b.count()).toBe(0)
        await relay.cut()
        await b.first().waitFor({ state: 'visible', timeout: 9_000 })
        // texte exact, un seul bandeau, icône wifi-off
        expect((await b.first().textContent())?.trim()).toBe('The server is not responding')
        expect(await b.count()).toBe(1)
        expect(await b.first().locator('svg').count()).toBeGreaterThan(0)
        await shot(page, `nominal-${route.replaceAll('/', '_')}-coupe`)
        await relay.restore()
        await b.first().waitFor({ state: 'hidden', timeout: 8_000 })
        expect(await page.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(42)
        await shot(page, `nominal-${route.replaceAll('/', '_')}-revenu`)
        await context.close()
      }, 60_000)
    }

    it('il revient à la coupure suivante (pas un bandeau à usage unique)', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings', waitFor: '.adestia-chat' })
      const b = banner(page, 'en')
      for (let i = 0; i < 2; i++) {
        await relay.cut()
        await b.first().waitFor({ state: 'visible', timeout: 9_000 })
        await relay.restore()
        await b.first().waitFor({ state: 'hidden', timeout: 8_000 })
      }
      await context.close()
    }, 90_000)

    it('en français : « Le serveur ne répond pas »', async () => {
      const { context, page } = await open({ locale: 'fr', route: '/settings' })
      await relayFr.cut()
      await banner(page, 'fr').first().waitFor({ state: 'visible', timeout: 9_000 })
      expect(await banner(page, 'en').count()).toBe(0)
      await shot(page, 'fr-bureau')
      await relayFr.restore()
      await banner(page, 'fr').first().waitFor({ state: 'hidden', timeout: 8_000 })
      await context.close()
    }, 60_000)
  })

  describe('bords : il décale l’écran sans le couvrir, et reste en vue', () => {
    it('bureau : le bandeau est au-dessus du contenu, qui reste cliquable', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings' })
      const heading = page.getByRole('heading', { name: /MCP servers|Settings/ }).first()
      const before = await page.locator('.adestia-canvas__body').boundingBox()
      await relay.cut()
      const b = banner(page, 'en').first()
      await b.waitFor({ state: 'visible', timeout: 9_000 })
      const bb = await b.boundingBox()
      const canvas = await page.locator('.adestia-canvas__body').boundingBox()
      expect(bb).not.toBeNull()
      expect(canvas).not.toBeNull()
      // dans le corps du canevas, tout en haut ; plein la largeur du canevas
      expect(bb!.y).toBeGreaterThanOrEqual(canvas!.y - 1)
      expect(bb!.x).toBeGreaterThanOrEqual(canvas!.x - 1)
      expect(bb!.x + bb!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 1)
      // le reste de l’écran commence sous le bandeau
      const firstTile = await page.getByText('MCP servers', { exact: true }).first().boundingBox()
      expect(firstTile!.y).toBeGreaterThanOrEqual(bb!.y + bb!.height - 1)
      expect(before).not.toBeNull()
      // et le contenu est utilisable : un lien de l’écran mène ailleurs
      await page.getByText('MCP servers', { exact: true }).first().click({ timeout: 5_000 })
      expect(await page.evaluate(() => location.hash)).toBe('#/settings/mcp')
      await relay.restore()
      await b.waitFor({ state: 'hidden', timeout: 8_000 })
      void heading
      await context.close()
    }, 60_000)

    it('E-14 défilé jusqu’au bas : le bandeau reste à l’écran, collé sous l’en-tête du canevas', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings/config' })
      await page.waitForSelector('text=Simultaneous turns', { timeout: 20_000 })
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight
        window.scrollTo(0, document.body.scrollHeight)
      })
      await relay.cut()
      const b = banner(page, 'en').first()
      await b.waitFor({ state: 'visible', timeout: 9_000 })
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight
      })
      const bb = await b.boundingBox()
      const head = await page.locator('.adestia-canvas__header').first().boundingBox()
      expect(bb!.y).toBeGreaterThanOrEqual(0)
      expect(bb!.y + bb!.height).toBeLessThanOrEqual(900)
      expect(Math.abs(bb!.y - (head!.y + head!.height))).toBeLessThan(2)
      await shot(page, 'e14-defile')
      await relay.restore()
      await b.waitFor({ state: 'hidden', timeout: 8_000 })
      await context.close()
    }, 60_000)

    it('téléphone, canevas montré : le bandeau est en tête du corps du canevas', async () => {
      const { context, page } = await open({ locale: 'en', phone: true, route: '/settings' })
      await showCanvas(page)
      expect(await page.evaluate(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen'))).toBe('canvas')
      await relay.cut()
      const b = banner(page, 'en').first()
      await b.waitFor({ state: 'visible', timeout: 9_000 })
      const bb = await b.boundingBox()
      const body = await page.locator('.adestia-canvas__body').boundingBox()
      expect(bb!.y).toBeGreaterThanOrEqual(body!.y - 1)
      expect(bb!.x).toBeGreaterThanOrEqual(0)
      expect(bb!.x + bb!.width).toBeLessThanOrEqual(390.5)
      await shot(page, 'phone-canevas')
      await relay.restore()
      await b.waitFor({ state: 'hidden', timeout: 8_000 })
      await context.close()
    }, 60_000)

    it('téléphone, chat montré : le bandeau est au-dessus de l’en-tête du chat, une seule fois', async () => {
      const { context, page } = await open({ locale: 'en', phone: true, route: '/' })
      expect(await page.evaluate(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen'))).toBe('chat')
      await relay.cut()
      const b = banner(page, 'en')
      await b.first().waitFor({ state: 'visible', timeout: 9_000 })
      expect(await b.count()).toBe(1)
      const bb = await b.first().boundingBox()
      const head = await page.locator('.adestia-chat__header').first().boundingBox()
      expect(bb!.y + bb!.height).toBeLessThanOrEqual(head!.y + 1)
      await shot(page, 'phone-chat')
      await relay.restore()
      await b.first().waitFor({ state: 'hidden', timeout: 8_000 })
      await context.close()
    }, 60_000)

    it('320 px en français : le texte tient dans la largeur, sans coupure', async () => {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'fr-FR', isMobile: true, hasTouch: true })
      const page = await context.newPage()
      await page.goto(`${relayFr.url}/#/settings`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
      await relayFr.cut()
      const b = banner(page, 'fr').first()
      await b.waitFor({ state: 'visible', timeout: 9_000 })
      const over = await b.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }))
      expect(over.sw).toBeLessThanOrEqual(over.cw + 1)
      expect(over.sh).toBeLessThanOrEqual(over.ch + 1)
      expect(((await b.textContent()) ?? '').trim()).toBe('Le serveur ne répond pas')
      await relayFr.restore()
      await b.waitFor({ state: 'hidden', timeout: 8_000 })
      await context.close()
    }, 60_000)
  })

  describe('chaque habillage, clair et sombre : lisible, fond opaque', () => {
    for (const skin of ['alfred', 'dobby', 'nestor', 'skippy']) {
      for (const theme of ['light', 'dark'] as const) {
        it(`${skin} ${theme}`, async () => {
          const own = await launch('base', skin, 'en')
          const r = new Relay(targetPort(own))
          await r.restore()
          const context = await browser.newContext({ ...DESK, colorScheme: theme })
          const page = await context.newPage()
          await page.addInitScript((t: string) => localStorage.setItem('adestia.theme', t), theme)
          await page.goto(`${r.url}/#/settings`, { waitUntil: 'domcontentloaded' })
          await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
          await r.cut()
          const b = banner(page, 'en').first()
          await b.waitFor({ state: 'visible', timeout: 9_000 })
          const css = await b.evaluate((el) => {
            const s = getComputedStyle(el)
            return { bg: s.backgroundColor, fg: s.color }
          })
          expect(css.bg).not.toBe('rgba(0, 0, 0, 0)')
          expect(css.bg).not.toBe('transparent')
          expect(css.bg).not.toContain('/') // no alpha channel: opaque
          expect(css.fg).not.toBe(css.bg)
          await shot(page, `skin-${skin}-${theme}`)
          await context.close()
          await own.stop()
        }, 90_000)
      }
    }
  })

  describe('échec : « Coming back… » (E-14)', () => {
    it('le bandeau se montre dès que la sonde échoue, au-dessus de « Coming back… », et les deux partent quand l’instance répond', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings/config' })
      await page.route('**/api/restart', async (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"restarting":true}' }))
      await page.waitForSelector('text=Simultaneous turns', { timeout: 20_000 })
      await page.getByLabel('Simultaneous turns').first().fill('5')
      await page.getByRole('button', { name: /^Save$/ }).first().click({ timeout: 10_000 })
      const restart = page.getByRole('button', { name: /^Restart now$/ }).first()
      await restart.waitFor({ state: 'visible', timeout: 15_000 })
      await relay.cut() // l'instance part avec la demande de redémarrage
      await restart.click({ timeout: 10_000 })
      const coming = page.getByText('Coming back…').first()
      await coming.waitFor({ state: 'visible', timeout: 10_000 })
      const b = banner(page, 'en').first()
      await b.waitFor({ state: 'visible', timeout: 9_000 })
      expect(await coming.isVisible()).toBe(true)
      const bb = await b.boundingBox()
      const cb = await coming.boundingBox()
      expect(bb!.y + bb!.height).toBeLessThanOrEqual(cb!.y + 1)
      await shot(page, 'coming-back')
      await relay.restore()
      await b.waitFor({ state: 'hidden', timeout: 10_000 })
      await coming.waitFor({ state: 'hidden', timeout: 15_000 })
      await context.close()
    }, 90_000)
  })

  describe('exclusions : pas de bandeau quand le serveur répond', () => {
    /** Records whether the banner was EVER drawn: a flash that a later answered call wipes must not pass as absence. */
    const watch = (page: P) =>
      page.evaluate(() => {
        const w = window as unknown as { __flash: boolean }
        w.__flash = false
        const look = () => {
          for (const el of document.querySelectorAll('[role="status"]')) if ((el.textContent ?? '').includes('The server is not responding')) w.__flash = true
        }
        new MutationObserver(look).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
        look()
      })
    const quiet = async (page: P) => {
      await page.waitForTimeout(4_500) // the probe answers here; all that is awaited is an absence
      expect(await banner(page, 'en').count()).toBe(0)
      expect(await page.evaluate(() => (window as unknown as { __flash: boolean }).__flash)).toBe(false)
    }

    it('serveur sain, rien ne se passe : aucun bandeau', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings' })
      await watch(page)
      await quiet(page)
      await context.close()
    }, 40_000)

    /** The shell's own read of the MCP list is answered as asked; the screen's Retry proves the read happened and failed. */
    const failOneRead = async (answer: (route: Route) => Promise<void>) => {
      const { context, page } = await open({ locale: 'en', route: '/settings' })
      await watch(page)
      await page.route('**/api/mcp/servers*', async (route) => (route.request().method() === 'GET' ? answer(route) : route.continue()))
      await page.getByText('MCP servers', { exact: true }).first().click({ timeout: 5_000 })
      await page.getByRole('button', { name: /^Retry$/ }).first().waitFor({ state: 'visible', timeout: 10_000 })
      await quiet(page)
      await context.close()
    }

    it('un appel isolé du shell qui échoue (connexion coupée) alors que le serveur répond : aucun bandeau', async () => {
      await failOneRead((route) => route.abort('connectionreset'))
    }, 40_000)

    it('un appel qui répond 500 : le serveur est là, aucun bandeau', async () => {
      await failOneRead((route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    }, 40_000)

    it('l’événement navigateur « offline » seul (VPN tombé côté navigateur, serveur vivant) n’allume rien', async () => {
      const { context, page } = await open({ locale: 'en', route: '/settings' })
      await watch(page)
      await page.evaluate(() => window.dispatchEvent(new Event('offline')))
      await quiet(page)
      await context.close()
    }, 40_000)

    it('première charge sans serveur : la porte fatale E-1 reste, aucun bandeau', async () => {
      const context = await browser.newContext({ ...DESK, locale: 'en-US' })
      const page = await context.newPage()
      await page.route('**/api/**', async (route) => route.abort('connectionrefused'))
      await page.goto(`${relay.url}/#/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Adestia could not start', { timeout: 20_000 })
      await page.waitForTimeout(4_500)
      expect(await banner(page, 'en').count()).toBe(0)
      await shot(page, 'porte-fatale')
      await context.close()
    }, 40_000)
  })
})
