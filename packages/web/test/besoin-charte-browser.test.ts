import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  type Page,
  type Size,
  type Theme,
  type Finding,
  SHOTS,
  focusRing,
  inspect,
  launch,
  newBrowser,
  open,
  playwright,
} from './charte-browser.js'

const SKINS = ['skippy', 'alfred', 'nestor', 'dobby']

interface Screen {
  id: string
  seed: string
  route?: string
  proof: string
  root: string
  /** where the chrome's words are read; defaults to root */
  lang?: string
  skip?: string
  signIn?: boolean
  before?: (page: Page, base: string) => Promise<void>
  reload?: boolean
  shell?: boolean
  offline?: boolean
  /** where Tab is expected to land; null when the screen has no control (a gate with no retry) */
  ringRoot?: string | null
  gesture?: (page: Page) => Promise<void>
}

const sessionLost = async (page: Page, base: string) => {
  await page.route('**/api/instance', async (route) => {
    const real = await fetch(`${base}/api/instance`)
    await route.fulfill({ status: real.status, contentType: 'application/json', body: await real.text() })
  })
}

// Chrome of the back control and the chat rail belong to other tranches (pages, chat).
const OTHERS = '.adestia-switch, .adestia-chat, .adestia-console-host'

const SCREENS: Screen[] = [
  { id: 'E-1', seed: 'oidc', signIn: true, before: sessionLost, reload: true, shell: false, proof: '.adestia-gate .adestia-btn--accent', root: '.adestia-gate' },
  { id: 'E-9', seed: 'base', route: '/settings', proof: '.adestia-prefs .adestia-tiles .adestia-tile', root: '.adestia-prefs', skip: OTHERS },
  { id: 'E-10', seed: 'base', route: '/settings/mcp', proof: '.adestia-prefs__page .adestia-tiles .adestia-tile', root: '.adestia-prefs', skip: OTHERS },
  { id: 'E-11', seed: 'base', route: '/settings/instructions', proof: '.adestia-prefs__page .adestia-filecard', root: '.adestia-prefs', skip: OTHERS },
  {
    id: 'E-12',
    seed: 'base',
    route: '/settings/instructions',
    proof: '.adestia-sheet .adestia-catalogues__list .adestia-filecard',
    root: '.adestia-sheet',
    gesture: async (page) => page.locator('button:text-matches("^Catalogues?$")').first().click({ timeout: 10_000 }),
  },
  { id: 'E-13', seed: 'base', route: '/settings/delegations', proof: '.adestia-deleg .adestia-deleg__group .adestia-conversations__item', root: '.adestia-deleg', skip: OTHERS },
  { id: 'E-14', seed: 'config-writable', route: '/settings/config', proof: '.adestia-prefs__page :is(input, select, textarea)', root: '.adestia-prefs', skip: OTHERS },
  {
    id: 'E-15',
    seed: 'oidc',
    signIn: true,
    proof: '.adestia-cog__panel .adestia-cog__signout',
    root: '.adestia-cog__panel',
    gesture: async (page) => page.locator('.adestia-cog > button').first().click({ timeout: 10_000 }),
  },
  { id: 'E-19', seed: 'base', proof: '.adestia-problems--refused', root: '.adestia-problems', ringRoot: '.adestia-canvas', lang: '.adestia-problems, .adestia-home__greeting', skip: OTHERS },
  { id: 'E-21', seed: 'base', shell: false, offline: true, ringRoot: null, proof: '.adestia-gate__card--fatal .adestia-icon', root: '.adestia-gate' },
]

async function goOffline(page: Page, context: { setOffline(o: boolean): Promise<void> }) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.evaluate(async () => {
    const until = Date.now() + 20_000
    for (;;) {
      const names = await caches.keys()
      const entries = await Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys())))
      if (entries.flat().length >= 5 || Date.now() > until) return
      await new Promise((r) => setTimeout(r, 200))
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
}

interface Row {
  screen: string
  theme: Theme
  size: Size
  finding: Finding
  ring: string
}

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function survey(browser: BrowserOf, skin: string, locale: string, variants: [Theme, Size][]): Promise<Row[]> {
  const rows: Row[] = []
  for (const seed of [...new Set(SCREENS.map((s) => s.seed))]) {
    const instance = await launch(seed, skin, locale)
    try {
      for (const screen of SCREENS.filter((s) => s.seed === seed)) {
        for (const [theme, size] of variants) {
          const { context, page } = await open(browser, instance.url, { theme, size, locale, signIn: screen.signIn, before: screen.before, route: screen.route, reload: screen.reload, shell: screen.shell })
          try {
            if (screen.offline) await goOffline(page, context)
            await screen.gesture?.(page)
            await page.waitForSelector(screen.proof, { state: 'visible', timeout: 15_000 })
            await page.evaluate(() => document.fonts.ready.then(() => undefined))
            await page.waitForTimeout(600)
            const finding = await page.evaluate(inspect, { root: screen.root, lang: screen.lang ?? screen.root, skip: screen.skip ?? '' })
            const ring = screen.ringRoot === null ? 'n/a|ring' : await focusRing(page, screen.ringRoot ?? screen.root)
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/${skin}-${locale}-${screen.id}-${theme}-${size}.png` })
            rows.push({ screen: screen.id, theme, size, finding, ring })
          } finally {
            await context.close()
          }
        }
      }
    } finally {
      await instance.stop()
    }
  }
  return rows
}

const FRENCH = /(?<![\p{L}])(le|la|les|des|une|pour|avec|vous|votre|vos|dans|sur|est|pas|ou|et|du|aux|cette|ajouter|enregistrer|supprimer|annuler|fermer|rechercher|chargement|aucun|aucune|serveurs?|ouvrir|retour|accueil|réglages|déconnexion|nouveau|nouvelle)(?![\p{L}])|[àâçéèêëîïôûù]/iu
const ENGLISH = /(?<![\p{L}])(the|and|with|your|you|save|cancel|remove|add|loading|nothing|none|search|delete|close|sign|back|restart|discard|refresh|connect|settings|home|empty|open|new|servers?|failed|could|not|start)(?![\p{L}])/iu

const ALL: [Theme, Size][] = [['light', 'desk'], ['light', 'phone'], ['dark', 'desk'], ['dark', 'phone']]
const FEW: [Theme, Size][] = [['light', 'desk'], ['dark', 'phone']]

const where = (r: Row) => `${r.screen} ${r.theme}/${r.size}`

describe.skipIf(!playwright)('charter — the settings and entry screens through a browser (B-6, B-7, B-8, B-10)', () => {
  let browser: BrowserOf
  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
  })

  for (const skin of SKINS) {
    describe(`skin ${skin}`, () => {
      let en: Row[]
      let fr: Row[]
      beforeAll(async () => {
        en = await survey(browser, skin, 'en', ALL)
        fr = await survey(browser, skin, 'fr', FEW)
      }, 900_000)

      it('draws no native grey control on E-1, E-9 to E-15, E-19 and E-21, light and dark, desk and phone', () => {
        expect(en.flatMap((r) => r.finding.native.map((n) => `${where(r)}: ${n}`))).toEqual([])
      })

      it('shows Lucide icons and no glyph on the controls of these screens', () => {
        expect(en.filter((r) => r.finding.icons === 0).map(where)).toEqual([])
        expect(en.flatMap((r) => r.finding.glyphs.map((g) => `${where(r)}: ${g}`))).toEqual([])
      })

      it('keeps an en instance free of French in the chrome of these screens', () => {
        const hits = en.flatMap((r) => r.finding.words.filter((w) => FRENCH.test(w)).map((w) => `${where(r)}: ${w}`))
        expect(hits).toEqual([])
      })

      it('keeps an fr instance free of English in the chrome of these screens', () => {
        // E-21 shows the browser's own network error, which no locale translates (docs/ecrans.md).
        const hits = fr.flatMap((r) => r.finding.words.map((w) => w.replace('Failed to fetch', '')).filter((w) => ENGLISH.test(w)).map((w) => `${where(r)}: ${w}`))
        expect(hits).toEqual([])
      })

      it('wears a focus ring on the control Tab reaches first, on every screen', () => {
        expect(en.filter((r) => !r.ring.endsWith('|ring')).map((r) => `${where(r)}: ${r.ring}`)).toEqual([])
      })

      it('reaches AA contrast (4.5:1, 3:1 for large text) on the text these screens draw', () => {
        expect(en.flatMap((r) => r.finding.contrast.map((c) => `${where(r)}: ${c}`))).toEqual([])
      })
    })
  }

  // B-10: a skin's own words (placeholder, greeting) exist in both languages, in the
  // instance's language, whatever the skin.
  for (const skin of SKINS) {
    it(`speaks ${skin}'s placeholder and greeting in the instance's language, en and fr`, async () => {
      const said: Record<string, { placeholder: string; greeting: string }> = {}
      for (const locale of ['en', 'fr']) {
        const instance = await launch('base', skin, locale)
        const { context, page } = await open(browser, instance.url, { theme: 'light', size: 'desk', locale, route: '/' })
        try {
          await page.waitForSelector('.adestia-composer__input', { timeout: 20_000 })
          await page.waitForTimeout(800)
          said[locale] = await page.evaluate(() => ({
            placeholder: document.querySelector('.adestia-composer__input')?.getAttribute('placeholder') ?? '',
            greeting: document.querySelector('.adestia-home__greeting')?.textContent ?? '',
          }))
        } finally {
          await context.close()
          await instance.stop()
        }
      }
      const en = said['en'] as { placeholder: string; greeting: string }
      const fr = said['fr'] as { placeholder: string; greeting: string }
      expect(en.placeholder.length).toBeGreaterThan(0)
      expect(fr.placeholder.length).toBeGreaterThan(0)
      expect(fr.placeholder).not.toBe(en.placeholder)
      expect(FRENCH.test(en.placeholder + ' ' + en.greeting), 'French in the en words').toBe(false)
      expect(ENGLISH.test(fr.placeholder + ' ' + fr.greeting), 'English in the fr words').toBe(false)
    }, 120_000)
  }
})
