/**
 * B-19 seen from its need (docs/parcours.md B-19 and P-16 (4), docs/ecrans.md E-32): when the
 * server does not answer, a banner "The server is not responding" (`fr` "Le serveur ne répond
 * pas") shows above the open screen, which it moves down without covering, and it goes away by
 * itself when the server answers. No offline screen, no cache. Driven through a browser against
 * a REAL bench instance (`bench/launch.mjs`, scripted engine) that the test stops and starts
 * again on the same port and data directory. Expectations are literals from the docs.
 *
 * Needs `npm run build` first, and Playwright from the environment (skipped without; a skipped
 * suite is not a seen screen). Pictures: HORS_LIGNE_SHOTS=<dir outside the tree>.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, type Page, newBrowser, open, playwright } from './charte-browser.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHOTS = process.env.HORS_LIGNE_SHOTS
const WORDS = { en: 'The server is not responding', fr: 'Le serveur ne répond pas' } as const
type Locale = keyof typeof WORDS
const WAIT_SHOWN = 10_000 // docs: at once if the link refuses, within 5 s if it hangs
const WAIT_GONE = 8_000 // docs: within 3 s of the server answering

/** A bench instance that can be stopped and started again on the same address. */
class Bench {
  child: ChildProcess | undefined
  readonly cleanups: (() => Promise<void>)[] = []
  constructor(
    readonly port: number,
    readonly data: string,
    readonly skin: string,
    readonly locale: Locale,
  ) {}
  get url(): string {
    return `http://127.0.0.1:${this.port}`
  }
  start(): Promise<void> {
    const child = spawn(
      execPath,
      [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', '--seed', 'config-writable', '--skin', this.skin, '--locale', this.locale, '--port', String(this.port), '--data', this.data],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    this.child = child
    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => (stderr += c))
    return new Promise((resolve, reject) => {
      let out = ''
      child.stdout?.on('data', (c: Buffer) => {
        out += c
        if (/listening on (\S+)/.test(out)) resolve()
      })
      child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
    })
  }
  stop(): Promise<void> {
    const child = this.child
    if (!child || child.exitCode !== null) return Promise.resolve()
    return new Promise((done) => {
      child.once('exit', () => done())
      child.kill('SIGTERM')
    })
  }
  async dispose(): Promise<void> {
    await this.stop()
    await rm(this.data, { recursive: true, force: true })
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

interface Seen {
  text: string
  top: number
  bottom: number
  left: number
  right: number
  hasIcon: boolean
  iconName: string
  parentClass: string
  parentRight: number
  isFirstChild: boolean
  overflowing: boolean
  background: string
  viewportHeight: number
  nextTop: number
  nextClass: string
}

async function banners(page: Page, words: string): Promise<Seen[]> {
  return page.evaluate((w: string) => {
    return [...document.querySelectorAll('[role="status"]')]
      .filter((e) => (e.textContent ?? '').includes(w))
      .map((e) => {
        const r = e.getBoundingClientRect()
        const next = e.nextElementSibling
        return {
          text: (e.textContent ?? '').trim(),
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          hasIcon: e.querySelector('svg') !== null,
          iconName: e.querySelector('svg')?.getAttribute('class') ?? '',
          parentClass: e.parentElement?.className ?? '',
          parentRight: e.parentElement?.getBoundingClientRect().right ?? 0,
          isFirstChild: e.parentElement?.firstElementChild === e,
          overflowing: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
          background: getComputedStyle(e).backgroundColor,
          viewportHeight: window.innerHeight,
          nextTop: next ? next.getBoundingClientRect().top : -1,
          nextClass: next?.className ?? '',
        }
      })
  }, words)
}

/** On a phone the chat fills the screen; the header's "Open apps" button brings the canvas. */
async function showCanvas(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas') return
    const open = [...document.querySelectorAll<HTMLElement>('.adestia-chat__header button')].find((x) => /^(Open apps|Ouvrir les apps)$/.test(x.getAttribute('aria-label') ?? ''))
    open?.click()
  })
  await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
}

/** Polls the page until `ok` holds for the banners seen; the proof of the state, not a delay. */
async function until(page: Page, words: string, ok: (b: Seen[]) => boolean, timeout: number): Promise<Seen[]> {
  const deadline = Date.now() + timeout
  let seen: Seen[] = []
  for (;;) {
    seen = await banners(page, words)
    if (ok(seen)) return seen
    if (Date.now() > deadline) return seen
    await new Promise((r) => setTimeout(r, 100))
  }
}

describe.skipIf(!playwright)('B-19 · le bandeau « le serveur ne répond pas »', () => {
  let browser: Browser
  const benches: Bench[] = []

  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    for (const b of benches) await b.dispose()
  })

  async function bench(skin: string, locale: Locale): Promise<Bench> {
    const b = new Bench(await freePort(), await mkdtemp(join(tmpdir(), 'hors-ligne-')), skin, locale)
    benches.push(b)
    await b.start()
    return b
  }
  const shot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  }

  // ── nominal : two different screens, both languages ─────────────────────────────────────────
  const SCREENS = [
    { id: 'E-9', route: '/', shown: /Settings|Réglages|Paramètres/ },
    { id: 'E-11', route: '/settings/instructions', shown: /relecteur/ },
  ] as const

  describe.each(['en', 'fr'] as Locale[])('langue %s', (locale) => {
    const words = WORDS[locale]

    describe.each(SCREENS)('écran $id', (screen) => {
      it('serveur coupé : le bandeau apparaît en tête du corps du canevas, au-dessus de l\'écran ; serveur relancé : il disparaît seul', async () => {
        const b = await bench('skippy', locale)
        const { context, page } = await open(browser, b.url, { theme: 'light', size: 'desk', locale, route: screen.route })
        try {
          await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
          // The screen has drawn its data before the server goes: its own read must not be the one that fails.
          const drawn = Date.now() + 20_000
          const pattern = screen.shown
          while (Date.now() < drawn && !pattern.test(await page.evaluate(() => document.querySelector('.adestia-canvas__body')?.textContent ?? ''))) await new Promise((r) => setTimeout(r, 100))
          // At rest: no banner, nothing drawn.
          expect(await banners(page, words)).toHaveLength(0)
          expect(await page.evaluate(() => document.querySelectorAll('.adestia-offline').length)).toBe(0)
          const restTop = await page.evaluate(() => {
            const body = document.querySelector('.adestia-canvas__body')
            return (body?.firstElementChild?.getBoundingClientRect().top ?? -1) as number
          })

          await b.stop()
          const shown = await until(page, words, (s) => s.length === 1, WAIT_SHOWN)
          expect(shown).toHaveLength(1)
          const banner = shown[0] as Seen
          expect(banner.text).toBe(words)
          expect(banner.hasIcon).toBe(true)
          expect(banner.parentClass).toContain('adestia-canvas__body')
          expect(banner.isFirstChild).toBe(true)
          expect(banner.overflowing).toBe(false)
          // It moves the screen down by its own height and covers nothing: the next block starts under it.
          expect(banner.nextTop).toBeGreaterThanOrEqual(banner.bottom - 1)
          expect(banner.bottom - banner.top).toBeGreaterThan(10)
          expect(banner.top).toBeGreaterThanOrEqual(restTop - 1)
          // The screen under it stays drawn and usable.
          expect(await page.evaluate(() => document.querySelector('.adestia-canvas__body')?.textContent ?? '')).toMatch(screen.shown)
          await shot(page, `skippy-${locale}-${screen.id}-coupe`)

          await b.start()
          const gone = await until(page, words, (s) => s.length === 0, WAIT_GONE)
          expect(gone).toHaveLength(0)
          // Nothing reserved: the screen is back where it was.
          const backTop = await page.evaluate(() => (document.querySelector('.adestia-canvas__body')?.firstElementChild?.getBoundingClientRect().top ?? -1) as number)
          expect(Math.abs(backTop - restTop)).toBeLessThan(2)
          await shot(page, `skippy-${locale}-${screen.id}-revenu`)
        } finally {
          await context.close()
          await b.dispose()
        }
      }, 120_000)
    })
  })

  // ── the four skins, both themes, desk and phone, with the banner kept on screen when scrolled ──
  const SKINS: [string, Locale, 'light' | 'dark', 'desk' | 'phone'][] = [
    ['skippy', 'en', 'light', 'desk'],
    ['alfred', 'fr', 'dark', 'phone'],
    ['nestor', 'en', 'dark', 'desk'],
    ['dobby', 'fr', 'light', 'phone'],
  ]
  describe.each(SKINS)('habillage %s, %s, %s, %s', (skin, locale, theme, size) => {
    it('lisible sur son habillage, sans troncature, avec un fond opaque ; collé sous l\'en-tête quand E-14 est défilé jusqu\'au bas', async () => {
      const words = WORDS[locale]
      const b = await bench(skin, locale)
      const { context, page } = await open(browser, b.url, { theme, size, locale, route: '/settings/config' })
      try {
        await page.waitForSelector('.adestia-config__bar', { timeout: 20_000 })
        if (size === 'phone') await showCanvas(page)
        await page.evaluate(() => document.querySelector('.adestia-config__bar')?.scrollIntoView({ block: 'end', inline: 'nearest' }))
        await b.stop()
        const shown = await until(page, words, (s) => s.length === 1, WAIT_SHOWN)
        await shot(page, `${skin}-${locale}-${theme}-${size}-E-14-defile`)
        expect(shown).toHaveLength(1)
        const banner = shown[0] as Seen
        expect(banner.text).toBe(words)
        expect(banner.overflowing).toBe(false)
        expect(banner.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(banner.left).toBeGreaterThanOrEqual(0)
        // Scrolled to the foot of the form, the banner is still on screen, near the top.
        expect(banner.top).toBeGreaterThanOrEqual(0)
        expect(banner.top).toBeLessThan(120)
        expect(banner.bottom).toBeLessThan(banner.viewportHeight)
        await b.start()
        expect(await until(page, words, (s) => s.length === 0, WAIT_GONE)).toHaveLength(0)
      } finally {
        await context.close()
        await b.dispose()
      }
    }, 120_000)
  })

  // ── phone, chat shown: above the rail's header ──────────────────────────────────────────────
  it('téléphone, chat plein écran : le bandeau est au-dessus de l\'en-tête du rail, et part quand le serveur répond', async () => {
    const b = await bench('skippy', 'fr')
    const { context, page } = await open(browser, b.url, { theme: 'light', size: 'phone', locale: 'fr', shell: false })
    try {
      await page.waitForSelector('.adestia-chat__header', { timeout: 20_000 })
      expect(await banners(page, WORDS.fr)).toHaveLength(0)
      await b.stop()
      const shown = await until(page, WORDS.fr, (s) => s.length === 1, WAIT_SHOWN)
      expect(shown).toHaveLength(1)
      const banner = shown[0] as Seen
      expect(banner.text).toBe(WORDS.fr)
      const header = await page.evaluate(() => document.querySelector('.adestia-chat__header')?.getBoundingClientRect().top ?? -1)
      expect(header).toBeGreaterThanOrEqual(banner.bottom - 1)
      expect(banner.top).toBeGreaterThanOrEqual(0)
      expect(banner.overflowing).toBe(false)
      // Never both places at once.
      expect(await page.evaluate(() => document.querySelectorAll('[role="status"].adestia-offline').length)).toBe(1)
      await shot(page, 'skippy-fr-phone-chat-coupe')
      await b.start()
      expect(await until(page, WORDS.fr, (s) => s.length === 0, WAIT_GONE)).toHaveLength(0)
    } finally {
      await context.close()
      await b.dispose()
    }
  }, 120_000)

  // ── 320 px : the fr text wraps, never truncates, and sits above Problems ───────────────────
  it('320 px en français : le texte n\'est pas tronqué, sort de sa place sans la dépasser, au-dessus de « Problèmes »', async () => {
    const b = await bench('skippy', 'fr')
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, locale: 'fr-FR', ignoreHTTPSErrors: true })
    const page = await context.newPage()
    try {
      await page.goto(`${b.url}/#/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
      await showCanvas(page)
      await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
      await b.stop()
      const shown = await until(page, WORDS.fr, (s) => s.length === 1, WAIT_SHOWN)
      expect(shown).toHaveLength(1)
      const banner = shown[0] as Seen
      expect(banner.text).toBe(WORDS.fr)
      expect(banner.overflowing).toBe(false)
      await shot(page, 'skippy-fr-320-coupe')
      expect(banner.right).toBeLessThanOrEqual(banner.parentRight + 1)
      expect(banner.isFirstChild).toBe(true)
      expect(banner.nextTop).toBeGreaterThanOrEqual(banner.bottom - 1)
    } finally {
      await context.close()
      await b.dispose()
    }
  }, 120_000)

  // ── « Coming back… » (E-14) ────────────────────────────────────────────────────────────────
  describe.each([
    ['en', 'Coming back…'],
    ['fr', 'Retour en cours…'],
  ] as [Locale, string][])('E-14 attend le redémarrage (%s)', (locale, comingBack) => {
    it('le bandeau se montre dès qu\'une sonde échoue, au-dessus de « ' + comingBack + ' », et les deux partent quand l\'instance répond', async () => {
      const words = WORDS[locale]
      const b = await bench('skippy', locale)
      const { context, page } = await open(browser, b.url, { theme: 'light', size: 'desk', locale, route: '/settings/config' })
      try {
        // The bench cannot restart itself: the request is answered "restarting", then the instance is really gone.
        await page.route('**/api/restart', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"restarting":true}' }))
        await page.waitForSelector('.adestia-config__bar', { timeout: 20_000 })
        await page.evaluate(() => {
          const input = document.querySelector<HTMLInputElement>('input[type="number"][max="16"]')
          if (!input) throw new Error('no Simultaneous turns field')
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          set?.call(input, '7')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await page.evaluate(() => {
          const save = [...document.querySelectorAll('button')].find((x) => /^(Save|Enregistrer)$/.test(x.textContent?.trim() ?? ''))
          save?.click()
        })
        await page.waitForSelector('.adestia-config__restart-bar', { timeout: 15_000 })
        expect(await banners(page, words)).toHaveLength(0)
        await b.stop()
        await page.evaluate(() => {
          const go = [...document.querySelectorAll('.adestia-config__restart-bar button')][0] as HTMLElement | undefined
          go?.click()
        })
        // The proof the press took effect: the bar says "Coming back…". Both are on screen together.
        const deadline = Date.now() + WAIT_SHOWN
        let bar = ''
        while (!bar.includes(comingBack) && Date.now() < deadline) {
          bar = await page.evaluate(() => document.querySelector('.adestia-config__restart-bar')?.textContent ?? '')
          await new Promise((r) => setTimeout(r, 100))
        }
        expect(bar).toContain(comingBack)
        const shown = await until(page, words, (s) => s.length === 1, WAIT_SHOWN)
        expect(shown).toHaveLength(1)
        await shot(page, `skippy-${locale}-E-14-retour-en-cours`)
        await b.start()
        expect(await until(page, words, (s) => s.length === 0, WAIT_GONE)).toHaveLength(0)
        // The bar leaves "Coming back…" on its own poll, not with the banner: wait for it, then assert.
        const leftBy = Date.now() + WAIT_GONE
        let left = ''
        do {
          left = await page.evaluate(() => document.querySelector('.adestia-config__restart-bar')?.textContent ?? '')
          if (!left.includes('…')) break
          await new Promise((r) => setTimeout(r, 100))
        } while (Date.now() < leftBy)
        expect(left).not.toContain('…')
      } finally {
        await context.close()
        await b.dispose()
      }
    }, 120_000)
  })

  // ── the probe and the exclusions, against a living server whose answers are bent ───────────
  describe('un serveur vivant dont on plie les réponses', () => {
    let b: Bench
    beforeAll(async () => {
      b = await bench('skippy', 'en')
    }, 60_000)

    it('tous les appels /api/ échouent, la sonde /api/health aussi : le bandeau apparaît ; la sonde repasse : il part seul, sans recharger', async () => {
      const { context, page } = await open(browser, b.url, { theme: 'light', size: 'desk', locale: 'en', route: '/' })
      try {
        await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
        let healthCalls = 0
        await page.route('**/api/**', async (route) => {
          const r = route as unknown as { request(): { url(): string }; abort(c?: string): Promise<void> }
          if (r.request().url().endsWith('/api/health')) healthCalls++
          await r.abort('failed')
        })
        await page.evaluate(() => (location.hash = '/settings/instructions'))
        const shown = await until(page, WORDS.en, (s) => s.length === 1, WAIT_SHOWN)
        expect(shown).toHaveLength(1)
        // While shown, the probe GET /api/health keeps asking (every 3 s): at least two probes in 9 s.
        await until(page, WORDS.en, () => healthCalls >= 2, 9_000)
        expect(healthCalls).toBeGreaterThanOrEqual(2)
        await (page as unknown as { unroute(g: string): Promise<void> }).unroute('**/api/**')
        expect(await until(page, WORDS.en, (s) => s.length === 0, WAIT_GONE)).toHaveLength(0)
      } finally {
        await context.close()
      }
    }, 90_000)

    it('un appel unique qui échoue alors que le serveur répond : aucun bandeau', async () => {
      const { context, page } = await open(browser, b.url, { theme: 'light', size: 'desk', locale: 'en', route: '/' })
      try {
        await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
        let cut = false
        await page.route('**/api/instructions', async (route) => {
          cut = true
          await (route as unknown as { abort(c?: string): Promise<void> }).abort('failed')
        })
        await page.evaluate(() => (location.hash = '/settings/instructions'))
        await until(page, WORDS.en, () => cut, WAIT_SHOWN)
        expect(cut).toBe(true)
        // Longer than a probe's whole cycle (5 s hang + margin): still nothing.
        await page.waitForTimeout(7_000)
        expect(await banners(page, WORDS.en)).toHaveLength(0)
      } finally {
        await context.close()
      }
    }, 90_000)

    it.each([
      [401, 'sign-in'],
      [403, 'refused'],
      [500, 'server error'],
    ])('une réponse %i (%s) est une réponse du serveur : aucun bandeau', async (status) => {
      const { context, page } = await open(browser, b.url, { theme: 'light', size: 'desk', locale: 'en', route: '/' })
      try {
        await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
        let answered = false
        await page.route('**/api/instructions', async (route) => {
          answered = true
          await route.fulfill({ status, contentType: 'application/json', body: '{"error":"bench"}' })
        })
        await page.evaluate(() => (location.hash = '/settings/instructions'))
        await until(page, WORDS.en, () => answered, WAIT_SHOWN)
        expect(answered).toBe(true)
        await page.waitForTimeout(5_000)
        expect(await banners(page, WORDS.en)).toHaveLength(0)
      } finally {
        await context.close()
      }
    }, 90_000)

    it('sous la porte fatale E-1 (premier chargement sans serveur), le bandeau n\'est jamais dessiné', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', ignoreHTTPSErrors: true })
      const page = await context.newPage()
      try {
        await page.route('**/api/**', async (route) => {
          await (route as unknown as { abort(c?: string): Promise<void> }).abort('failed')
        })
        await page.goto(`${b.url}/#/`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.adestia-gate, [role="alert"]', { timeout: 20_000 })
        await page.waitForTimeout(6_000)
        expect(await banners(page, WORDS.en)).toHaveLength(0)
        expect(await page.evaluate(() => document.body.textContent ?? '')).toContain('Adestia could not start')
        await shot(page, 'skippy-en-E-1-fatale')
      } finally {
        await context.close()
      }
    }, 90_000)
  })
})
