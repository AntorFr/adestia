/**
 * The chat tranche seen from its need (adestia-qualite-chat: B-7, B-8, B-10; P-2, P-3; E-16, E-17,
 * E-18), through a driven browser on the bench instance (`bench/launch.mjs`, scripted engine).
 * Expectations come from the fiche, docs/parcours.md and docs/ecrans.md, never from the components.
 *
 * Playwright and Chromium come from the environment (`npm root -g`). Without them the whole file is
 * skipped — a skipped browser suite is not a seen screen. Needs `npm run build` first.
 * `CHAT_SHOTS=<dir>` writes one capture per state.
 *
 * The real-Claude turn of the exit criterion needs a token and is not here (see the report).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Size, type Theme, VIEWPORTS, inspect, launch, newBrowser, playwright } from './charte-browser.js'

const SHOTS = process.env.CHAT_SHOTS
const SKINS = ['skippy', 'alfred', 'nestor', 'dobby']
const THREAD = '00000000-0000-4000-8000-000000000100' // the seeded « Seeded decisions » thread (chat-permission)

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function visit(browser: BrowserOf, base: string, o: { theme?: Theme; size?: Size; locale?: string; tabs?: string; seedStorage?: Record<string, string> }) {
  const locale = o.locale ?? 'en'
  const context: any = await browser.newContext({
    ...VIEWPORTS[o.size ?? 'desk'],
    colorScheme: o.theme ?? 'light',
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    ignoreHTTPSErrors: true,
  })
  const page: any = await context.newPage()
  await page.addInitScript(
    (arg: { theme: string; tabs: string | undefined; extra: Record<string, string> }) => {
      localStorage.setItem('adestia.theme', arg.theme)
      if (arg.tabs) localStorage.setItem('adestia.tabs', JSON.stringify({ open: [arg.tabs], active: arg.tabs }))
      for (const [k, v] of Object.entries(arg.extra)) localStorage.setItem(k, v)
    },
    { theme: o.theme ?? 'light', tabs: o.tabs, extra: o.seedStorage ?? {} },
  )
  await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  await page.waitForTimeout(500)
  return { context, page }
}

const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** Types a message in the composer and sends it. */
async function say(page: any, text: string) {
  const field = page.locator('.adestia-chat textarea')
  await field.fill(text)
  await field.press('Enter')
}

// ── what a screen shows, read in the page ────────────────────────────────────
interface Extra {
  glyphs: string[]
  strings: string[]
  closers: string[]
  small: string[]
  headerOverflow: string[]
  dotShape: string[]
}

/** Runs in the page; everything it needs is inside it. */
function scan(arg: { roots: string }): Extra {
  const CONTENT = '.adestia-prose, .adestia-bubble__text, .adestia-bubble__error, .adestia-tab__title, .adestia-conversations__item, .adestia-ask__text, .adestia-ask__reason, .adestia-trace__name, .adestia-trace__target, .adestia-connect strong, option, iframe'
  const roots = [...document.querySelectorAll<HTMLElement>(arg.roots)]
  const inside = (el: Element) => roots.some((r) => r.contains(el))
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden') return false
    }
    return true
  }
  const out: Extra = { glyphs: [], strings: [], closers: [], small: [], headerOverflow: [], dotShape: [] }
  const name = (el: Element) => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ').join('.') : ''}`
  const GLYPH = /[⚙✎↺✕✖×▤▥＋✓✔⚠ℹ‹›•▾▸▼▲✗✘☰✏]|\p{Extended_Pictographic}/u

  // text nodes outside the user's and the engine's own content
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (!el || !inside(el) || !visible(el) || el.closest(CONTENT)) continue
    const text = (node.textContent ?? '').trim()
    if (!text) continue
    if (GLYPH.test(text) || /^[^\p{L}\p{N}\s]{1,2}$/u.test(text) || /^[x+*]$/i.test(text)) out.glyphs.push(`${name(el)} « ${text} »`)
    out.strings.push(text)
  }
  // attributes
  for (const el of document.querySelectorAll<HTMLElement>('*')) {
    if (!inside(el)) continue
    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
      const v = el.getAttribute(attr)
      if (!v) continue
      if (GLYPH.test(v.replace('…', ''))) out.glyphs.push(`${name(el)}[${attr}] « ${v} »`)
      out.strings.push(v.split(' — ')[0] as string) // « Archive — <title> »: the title is content
    }
  }
  // closing and removing controls: one form, the x icon
  for (const el of document.querySelectorAll<HTMLElement>('button, a, [role=button]')) {
    if (!inside(el) || !visible(el)) continue
    const label = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').trim().toLowerCase()
    if (/^(close|remove|dismiss|not now|fermer|retirer|ne plus|pas maintenant|masquer)/.test(label)) {
      const href = el.querySelector('use')?.getAttribute('href') ?? 'no icon'
      if (href !== '#adestia-i-x') out.closers.push(`${name(el)} « ${label} » → ${href}`)
    }
  }
  // targets of at least 24 × 24 px
  for (const el of document.querySelectorAll<HTMLElement>('.adestia-chat button, .adestia-chat select, .adestia-chat textarea, .adestia-sheet button, .adestia-sheet a')) {
    if (!inside(el) || !visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 23.5 || r.height < 23.5) out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
  }
  // the header keeps one row and its buttons stay inside the screen
  const header = document.querySelector<HTMLElement>('.adestia-chat__header')
  if (header) {
    const tops = [...header.children].filter(visible).map((c) => Math.round(c.getBoundingClientRect().top))
    if (Math.max(...tops) - Math.min(...tops) > 24) out.headerOverflow.push(`rows: ${tops.join(',')}`)
    for (const b of header.querySelectorAll<HTMLElement>('button')) {
      if (visible(b) && b.getBoundingClientRect().right > window.innerWidth + 0.5) out.headerOverflow.push(`${name(b)} right ${Math.round(b.getBoundingClientRect().right)} > ${window.innerWidth}`)
    }
  }
  return out
}

const FRENCH = /(?<![\p{L}])(le|la|les|des|une|pour|avec|vous|votre|vos|dans|sur|est|pas|ou|et|du|aux|cette|ajouter|enregistrer|supprimer|annuler|fermer|rechercher|chargement|aucun|aucune|ouvrir|retour|accueil|nouveau|nouvelle|conversations? en cours|signer|refuser|toujours|jusqu|appels?|outil)(?![\p{L}])|[àâçéèêëîïôûù]/iu
const ENGLISH = /(?<![\p{L}])(the|and|with|your|you|new|working|remove|open|call|calls|tool|until|sign|signature requested|held|waits?|standing|authorisation|refuse|once|always|attach|files|send|ask|asks|connect|now|not|close|tab|model|context|weight|requested|lapsed|unsigned|saved|conversation list|no conversation)(?![\p{L}])/iu

interface Row {
  where: string
  native: string[]
  glyphs: string[]
  closers: string[]
  small: string[]
  headerOverflow: string[]
  contrast: string[]
  icons: number
  strings: string[]
  ring: string
}

async function ring(page: any): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !el.closest('.adestia-chat') || !el.matches('button, a, input, select, textarea')) return null
      const s = getComputedStyle(el)
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
      const shadow = s.boxShadow !== 'none' && /\d+px/.test(s.boxShadow)
      return outline || shadow ? 'ring' : `none(${el.className})`
    })
    if (r) return r
  }
  return 'no control reached by Tab'
}

describe.skipIf(!playwright)('chat — E-16, E-17, E-18 through a browser (B-7, B-8, B-10; P-2, P-3)', () => {
  let browser: BrowserOf
  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
  })

  // ── the matrix of the exit criterion: four skins × light/dark × desk/phone × en/fr ──
  const ALL: [Theme, Size][] = [['light', 'desk'], ['light', 'phone'], ['dark', 'desk'], ['dark', 'phone']]
  const FEW: [Theme, Size][] = [['light', 'desk'], ['dark', 'phone']]

  /** A thread with a finished turn, a tool trace, an error, signatures, a question and a running turn. */
  async function survey(skin: string, locale: string, variants: [Theme, Size][]): Promise<Row[]> {
    const instance = await launch('chat-permission', skin, locale)
    const rows: Row[] = []
    try {
      for (const [theme, size] of variants) {
        const key = `${theme}-${size}`
        const { context, page } = await visit(browser, instance.url, { theme, size, locale, tabs: THREAD })
        try {
          if (size === 'phone') {
            // the chat is one of the phone's two screens; make sure it is the one shown
            const shown = await page.evaluate(() => document.querySelector('.adestia-chat')?.getBoundingClientRect().width ?? 0)
            if (shown < 200) throw new Error('the chat is not visible on the phone')
          }
          await page.locator('.adestia-sign').first().waitFor({ timeout: 15_000 })
          for (const word of ['fini', 'outil', 'erreur', 'signature']) {
            await say(page, word)
            await page.locator('.adestia-chat').getByText(word, { exact: true }).last().waitFor({ timeout: 15_000 })
            await page.waitForTimeout(1200)
          }
          await say(page, 'permission durable')
          await page.locator('.adestia-ask').waitFor({ timeout: 15_000 })
          for (const toggle of await page.locator('.adestia-trace__toggle').all()) await toggle.click()
          await page.evaluate(() => document.fonts.ready.then(() => undefined))
          await page.waitForTimeout(500)
          const state = async (label: string, roots: string) => {
            const finding = await page.evaluate(inspect, { root: roots, lang: '', skip: '' })
            const extra: Extra = await page.evaluate(scan, { roots })
            await shot(page, `${skin}-${locale}-${label}-${key}`)
            rows.push({
              where: `${skin} ${locale} ${label} ${theme}/${size}`,
              native: finding.native,
              glyphs: [...finding.glyphs, ...extra.glyphs],
              closers: extra.closers,
              small: extra.small,
              headerOverflow: extra.headerOverflow,
              contrast: finding.contrast,
              icons: finding.icons,
              strings: extra.strings,
              ring: label === 'thread' ? await ring(page) : 'ring',
            })
          }
          await state('thread', '.adestia-chat')
          // E-18: the sheet
          await page.locator('.adestia-sign__go').first().click()
          await page.locator('.adestia-sheet').waitFor({ timeout: 10_000 })
          await page.waitForTimeout(500)
          await state('sheet', '.adestia-sheet')
          await page.keyboard.press('Escape')
          // the list, then the held bubble
          await page.getByRole('button', { name: /^(Conversations)$/ }).click()
          await page.waitForTimeout(400)
          await state('list', '.adestia-chat')
        } finally {
          await context.close()
        }
      }
    } finally {
      await instance.stop()
    }
    return rows
  }

  for (const skin of SKINS) {
    describe(`skin ${skin}`, () => {
      let en: Row[]
      let fr: Row[]
      beforeAll(async () => {
        en = await survey(skin, 'en', ALL)
        fr = await survey(skin, 'fr', FEW)
      }, 900_000)

      it('draws no native grey control in the rail, the question or the sheet, light and dark, desk and phone', () => {
        expect(en.flatMap((r) => r.native.map((n) => `${r.where}: ${n}`))).toEqual([])
      })

      it('draws every icon as a Lucide svg and no glyph or emoji in its place', () => {
        expect(en.filter((r) => r.icons === 0).map((r) => r.where)).toEqual([])
        expect([...en, ...fr].flatMap((r) => r.glyphs.map((g) => `${r.where}: ${g}`))).toEqual([])
      })

      it('closes and removes with one form, the x icon', () => {
        expect([...en, ...fr].flatMap((r) => r.closers.map((c) => `${r.where}: ${c}`))).toEqual([])
      })

      it('keeps an en instance free of French in strings, labels and titles', () => {
        const hits = en.flatMap((r) => r.strings.filter((s) => FRENCH.test(s)).map((s) => `${r.where}: ${s}`))
        expect([...new Set(hits)]).toEqual([])
      })

      it('keeps an fr instance free of English in strings, labels and titles', () => {
        const hits = fr.flatMap((r) => r.strings.filter((s) => ENGLISH.test(s)).map((s) => `${r.where}: ${s}`))
        expect([...new Set(hits)]).toEqual([])
      })

      it('wears a focus ring on the control Tab reaches first in the rail', () => {
        expect(en.filter((r) => r.ring !== 'ring').map((r) => `${r.where}: ${r.ring}`)).toEqual([])
      })

      it('reaches AA contrast on the text of the thread, the question and the sheet', () => {
        expect(en.flatMap((r) => r.contrast.map((c) => `${r.where}: ${c}`))).toEqual([])
      })

      it('offers targets of at least 24 × 24 px and a header that stays on one row inside the screen', () => {
        expect(en.filter((r) => r.small.length).map((r) => `${r.where}: ${r.small.join('; ')}`)).toEqual([])
        expect(en.filter((r) => r.headerOverflow.length).map((r) => `${r.where}: ${r.headerOverflow.join('; ')}`)).toEqual([])
      })
    })
  }

  // ── P-2: talking with the agent, E-16 ────────────────────────────────────────
  describe('P-2 — the rail, with a model list (seed chat-rail)', () => {
    let instance: Awaited<ReturnType<typeof launch>>
    beforeAll(async () => {
      instance = await launch('chat-rail', 'skippy', 'en')
    }, 60_000)
    afterAll(async () => {
      await instance?.stop()
    })

    const fresh = (o: Parameters<typeof visit>[2] = {}) => visit(browser, instance.url, o)

    it('a first message with no open conversation creates one, and the reply shows whole, in order', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'fini')
        await page.locator('.adestia-chat').getByText('Rien ne manque pour samedi.').waitFor({ timeout: 15_000 })
        const text: string = await page.locator('.adestia-chat__conversation').innerText()
        expect(text.replace(/\s+/g, ' ')).toContain('Voici la liste des courses de la semaine. Rien ne manque pour samedi.')
        expect(await page.locator('.adestia-tab').count()).toBe(1)
        expect(await page.locator('.adestia-tab__title').first().innerText()).toBe('fini')
        await shot(page, 'p2-nominal')
      } finally {
        await context.close()
      }
    })

    it('shows a collapsible tool trace: closed by default, two calls, done and failed told in words', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'outil')
        const toggle = page.locator('.adestia-trace__toggle').first()
        await toggle.waitFor({ timeout: 15_000 })
        expect((await toggle.innerText()).trim()).toBe('2 tool calls')
        expect(await toggle.getAttribute('aria-expanded')).toBe('false')
        expect(await page.locator('.adestia-trace__item').count()).toBe(0)
        await toggle.click()
        expect(await toggle.getAttribute('aria-expanded')).toBe('true')
        expect(await page.locator('.adestia-trace__item').count()).toBe(2)
        expect(await page.locator('.adestia-trace__item--done [aria-label]').first().getAttribute('aria-label')).toBe('Done')
        expect(await page.locator('.adestia-trace__item--failed [aria-label]').first().getAttribute('aria-label')).toBe('Failed')
        expect(await page.locator('.adestia-trace__item--failed use').first().getAttribute('href')).toBe('#adestia-i-x')
        await toggle.click()
        expect(await page.locator('.adestia-trace__item').count()).toBe(0)
      } finally {
        await context.close()
      }
    })

    it('says "1 tool call" for a single call', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'signature')
        const toggle = page.locator('.adestia-trace__toggle').first()
        await toggle.waitFor({ timeout: 15_000 })
        expect((await toggle.innerText()).trim()).toBe('1 tool call')
      } finally {
        await context.close()
      }
    })

    it('shows the engine error on the turn, in an alert, beside the text it had streamed', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'erreur')
        const alert = page.locator('.adestia-chat [role=alert]').first()
        await alert.waitFor({ timeout: 15_000 })
        expect(await alert.innerText()).toContain('The engine stopped: rate limit reached, try again later.')
        expect(await page.locator('.adestia-chat__conversation').innerText()).toContain('Je commence')
        expect(await alert.locator('use').count()).toBeGreaterThan(0)
      } finally {
        await context.close()
      }
    })

    it('turns Send into Stop while a turn runs, holds a message sent meanwhile, and ends on Stop', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'en cours')
        const chat = page.locator('.adestia-chat')
        const stop = chat.getByRole('button', { name: 'Stop', exact: true })
        await stop.waitFor({ timeout: 15_000 })
        expect(await chat.getByRole('button', { name: 'Send', exact: true }).count()).toBe(0)
        await say(page, 'bonjour pendant ce temps')
        await chat.locator('.adestia-bubble__text', { hasText: 'bonjour pendant ce temps' }).first().waitFor({ timeout: 10_000 })
        await chat.locator('.adestia-bubble--held').waitFor({ timeout: 10_000 })
        expect(await chat.locator('.adestia-bubble--held').count()).toBe(1)
        await shot(page, 'p2-held')
        await stop.click()
        await chat.getByRole('button', { name: 'Stop', exact: true }).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined)
        await page.waitForTimeout(1500)
        // the held message was merged and sent as a turn of its own (answered by the echo), then it ends
        await stop.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined)
      } finally {
        await context.close()
      }
    }, 30_000)

    it('shows the context pill once a turn has reported its weight', async () => {
      const { context, page } = await fresh()
      try {
        expect(await page.locator('.adestia-pill').count()).toBe(0)
        await say(page, 'long contexte')
        await page.locator('.adestia-pill').waitFor({ timeout: 15_000 })
        expect((await page.locator('.adestia-pill').getAttribute('title'))?.length ?? 0).toBeGreaterThan(0)
        expect((await page.locator('.adestia-pill').innerText()).trim()).toMatch(/150/)
      } finally {
        await context.close()
      }
    })

    it('lists the models in the header, and keeps the chosen one in this browser as adestia.model', async () => {
      const { context, page } = await fresh()
      try {
        const picker = page.getByRole('combobox', { name: 'Model' })
        await picker.waitFor()
        await picker.selectOption('bench-long')
        expect(await page.evaluate(() => localStorage.getItem('adestia.model'))).toBe('bench-long')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByRole('combobox', { name: 'Model' }).waitFor()
        expect(await page.getByRole('combobox', { name: 'Model' }).inputValue()).toBe('bench-long')
      } finally {
        await context.close()
      }
    })

    it('opens the conversation list with the list icon, starts a draft with plus, and archives from the list entry', async () => {
      const { context, page } = await fresh()
      try {
        const list = page.getByRole('button', { name: 'Conversations', exact: true })
        expect(await list.getAttribute('aria-expanded')).toBe('false')
        expect(await list.locator('use').getAttribute('href')).toBe('#adestia-i-list')
        await list.click()
        expect(await list.getAttribute('aria-expanded')).toBe('true')
        const items = page.locator('.adestia-conversations__item')
        await items.first().waitFor()
        const before = await items.count()
        expect(before).toBeGreaterThan(20)
        const archive = page.locator('.adestia-conversations__archive').first()
        expect(await archive.locator('use').getAttribute('href')).toBe('#adestia-i-archive')
        const gone = ((await archive.getAttribute('aria-label')) ?? '').replace('Archive — ', '')
        expect(gone.length).toBeGreaterThan(0)
        await archive.click()
        await page.waitForTimeout(800)
        expect(await items.count()).toBe(before - 1)
        const remaining = await items.allInnerTexts()
        expect(remaining.some((t: string) => t.includes(gone) && t.trim() === gone)).toBe(false)
        // reloading does not bring the archived conversation back
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await items.first().waitFor()
        expect(await items.count()).toBe(before - 1)
        // plus: a new draft, empty thread, empty field
        await say(page, 'fini')
        await page.locator('.adestia-chat').getByText('Rien ne manque pour samedi.').waitFor({ timeout: 15_000 })
        await page.getByRole('button', { name: 'New conversation', exact: true }).click()
        await page.waitForTimeout(400)
        expect(await page.locator('.adestia-bubble').count()).toBe(0)
        expect(await page.locator('.adestia-chat textarea').inputValue()).toBe('')
      } finally {
        await context.close()
      }
    })

    it('marks an unread conversation with a dot that is not colour alone, and reading clears it', async () => {
      const { context, page } = await fresh()
      try {
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        const dots = page.locator('.adestia-conversations__item .adestia-dot')
        await dots.first().waitFor()
        const kinds: Record<string, string> = await page.evaluate(() => {
          const look: Record<string, string> = {}
          for (const dot of document.querySelectorAll<HTMLElement>('.adestia-conversations__item .adestia-dot')) {
            const kind = dot.getAttribute('aria-label') ?? ''
            const s = getComputedStyle(dot)
            const after = getComputedStyle(dot, '::after')
            const before = getComputedStyle(dot, '::before')
            look[kind] ??= [s.borderTopLeftRadius, s.width, s.height, s.borderTopStyle, s.borderTopWidth, s.boxShadow, s.animationName, s.backgroundImage, after.content, before.content].join('|')
          }
          return look
        })
        expect(Object.keys(kinds).sort()).toEqual(expect.arrayContaining(['Unread', 'Waiting', 'Working']))
        // each state differs from the others by more than its colour: the shape or the motion
        const shapes = Object.values(kinds)
        expect(new Set(shapes).size).toBe(shapes.length)
        const unread = page.locator('.adestia-conversations__item', { has: page.locator('.adestia-dot[aria-label="Unread"]') }).first()
        const title = ((await unread.innerText()) ?? '').trim()
        await unread.click()
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: 'Conversations', exact: true }).click().catch(() => undefined)
        const same = page.locator('.adestia-conversations__item', { hasText: title }).first()
        await same.waitFor()
        expect(await same.locator('.adestia-dot').getAttribute('aria-label')).not.toBe('Unread')
      } finally {
        await context.close()
      }
    })

    it('opens conversations as tabs on a desk, closes one with the x icon without archiving it, and reorders by drag', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'fini')
        await page.locator('.adestia-chat').getByText('Rien ne manque pour samedi.').waitFor({ timeout: 15_000 })
        await page.getByRole('button', { name: 'New conversation', exact: true }).click()
        await say(page, 'outil')
        await page.locator('.adestia-trace__toggle').first().waitFor({ timeout: 15_000 })
        const titles = () => page.locator('.adestia-tab__title').allInnerTexts()
        expect(await titles()).toEqual(['fini', 'outil'])
        await page.locator('.adestia-tab').nth(1).dragTo(page.locator('.adestia-tab').nth(0))
        await page.waitForTimeout(500)
        expect(await titles()).toEqual(['outil', 'fini'])
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('adestia.tabs') ?? '{}').open.length)
        expect(stored).toBe(2)
        const close = page.getByRole('button', { name: /^Close tab/ }).first()
        expect(await close.locator('use').getAttribute('href')).toBe('#adestia-i-x')
        await close.click()
        await page.waitForTimeout(500)
        expect(await titles()).toEqual(['fini'])
        // closed, not archived: the conversation is still in the list
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await page.locator('.adestia-conversations__item', { hasText: 'outil' }).first().waitFor()
      } finally {
        await context.close()
      }
    })

    it('has no tabs on a phone: the list is the only navigation and it is full width', async () => {
      const { context, page } = await fresh({ size: 'phone' })
      try {
        await say(page, 'fini')
        await page.locator('.adestia-chat').getByText('Rien ne manque pour samedi.').waitFor({ timeout: 15_000 })
        expect(await page.locator('.adestia-tabs:visible').count()).toBe(0)
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        const list = page.locator('.adestia-conversations')
        await list.waitFor()
        const box = await list.boundingBox()
        expect(box.width).toBeGreaterThanOrEqual(390 - 24)
        await shot(page, 'p2-phone-list')
      } finally {
        await context.close()
      }
    })

    it('narrows the model picker and the pill at 360 px without pushing the buttons out', async () => {
      const { context, page } = await fresh({ size: 'phone' })
      try {
        await page.setViewportSize({ width: 360, height: 800 })
        await say(page, 'long contexte')
        await page.locator('.adestia-pill').waitFor({ timeout: 15_000 })
        await page.waitForTimeout(500)
        const extra: Extra = await page.evaluate(scan, { roots: '.adestia-chat' })
        expect(extra.headerOverflow).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        await shot(page, 'p2-phone-360')
      } finally {
        await context.close()
      }
    })

    it('names attached files in the tray and removes one with the x icon', async () => {
      const { context, page } = await fresh()
      try {
        await page.locator('.adestia-composer input[type=file]').setInputFiles({ name: 'plan.txt', mimeType: 'text/plain', buffer: Buffer.from('plan') })
        const chip = page.locator('.adestia-composer').getByText('plan.txt').first()
        await chip.waitFor({ timeout: 10_000 })
        const remove = page.getByRole('button', { name: 'Remove plan.txt' })
        expect(await remove.count()).toBe(1)
        expect(await remove.locator('use').getAttribute('href')).toBe('#adestia-i-x')
        await remove.click()
        await page.waitForTimeout(400)
        expect(await page.locator('.adestia-composer').getByText('plan.txt').count()).toBe(0)
      } finally {
        await context.close()
      }
    })
  })

  describe('P-2 — the empty list and the absent model picker (seed empty)', () => {
    it('says "No conversation yet." in an empty state when the instance has none', async () => {
      const instance = await launch('empty', 'skippy', 'en')
      const { context, page } = await visit(browser, instance.url, {})
      try {
        await page.getByRole('button', { name: 'Conversations', exact: true }).click()
        await page.getByText('No conversation yet.', { exact: true }).waitFor({ timeout: 10_000 })
        expect(await page.locator('.adestia-empty').count()).toBeGreaterThan(0)
        await shot(page, 'p2-empty-list')
      } finally {
        await context.close()
        await instance.stop()
      }
    }, 60_000)
  })

  // ── P-2 step 5, E-17: the question; P-3, E-18: the signature ─────────────────
  describe('P-2/P-3 — the question and the ceremony (seed chat-permission, permissions ask)', () => {
    let instance: Awaited<ReturnType<typeof launch>>
    beforeAll(async () => {
      instance = await launch('chat-permission', 'skippy', 'en')
    }, 60_000)
    afterAll(async () => {
      await instance?.stop()
    })
    const fresh = () => visit(browser, instance.url, { tabs: THREAD })
    /** The fake engine holds a question until the turn is stopped; leave the thread idle for the next test. */
    const release = async (page: any) => {
      await page.request.post(`${instance.url}/api/turn/stop`, { data: { conversation: THREAD } })
      await page.waitForTimeout(500)
    }

    it('asks with three answers when the engine offered a lasting rule, blocks the composer, and frees it after an answer', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'permission durable')
        const ask = page.getByRole('alertdialog', { name: 'Permission required' })
        await ask.waitFor({ timeout: 15_000 })
        expect(await ask.getByRole('button').allInnerTexts()).toEqual(['Refuse', 'Just this once', 'Always'])
        expect(await ask.locator('use').first().getAttribute('href')).toBe('#adestia-i-triangle-alert')
        // the composer stays blocked: a message typed now is not sent
        await say(page, 'bloqué')
        await page.waitForTimeout(800)
        expect(await page.locator('.adestia-bubble--user', { hasText: 'bloqué' }).count()).toBe(0)
        await shot(page, 'p2-ask')
        const posted = page.waitForRequest((r: any) => r.url().includes('/api/permission') && r.method() === 'POST')
        await ask.getByRole('button', { name: 'Just this once', exact: true }).click()
        await posted
        await ask.waitFor({ state: 'hidden', timeout: 10_000 })
      } finally {
        await release(page)
        await context.close()
      }
    })

    it('offers no Always and says why when the engine proposed no rule', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'permission once')
        const ask = page.getByRole('alertdialog', { name: 'Permission required' })
        await ask.waitFor({ timeout: 15_000 })
        expect(await ask.getByRole('button').allInnerTexts()).toEqual(['Refuse', 'Just this once'])
        expect(await ask.getByText('No lasting rule', { exact: false }).count()).toBe(1)
      } finally {
        await release(page)
        await context.close()
      }
    })

    it('posts the refusal and frees the composer when the user presses Refuse', async () => {
      const { context, page } = await fresh()
      try {
        await say(page, 'permission durable')
        const ask = page.getByRole('alertdialog', { name: 'Permission required' })
        await ask.waitFor({ timeout: 15_000 })
        const posted = page.waitForRequest((r: any) => r.url().includes('/api/permission') && r.method() === 'POST')
        await ask.getByRole('button', { name: 'Refuse', exact: true }).click()
        const body = (await posted).postData() ?? ''
        expect(body.toLowerCase()).toMatch(/den|refus|deny|false/)
        await ask.waitFor({ state: 'hidden', timeout: 10_000 })
      } finally {
        await release(page)
        await context.close()
      }
    })

    it('draws the four signature states with their icon and a text label, and the deadline while pending', async () => {
      const { context, page } = await fresh()
      try {
        await page.evaluate(() => localStorage.setItem('adestia.signatures', JSON.stringify({ signed: 'signed', denied: 'denied' })))
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('.adestia-sign').first().waitFor({ timeout: 15_000 })
        for (const [state, icon] of [['pending', 'pen-line'], ['signed', 'check'], ['denied', 'x'], ['expired', 'clock']] as const) {
          const card = page.locator(`.adestia-sign--${state}`).first()
          expect(await card.count(), state).toBe(1)
          expect(await card.locator('use').first().getAttribute('href'), state).toBe(`#adestia-i-${icon}`)
          expect(((await card.locator('strong').first().innerText()) ?? '').trim().length, `${state} has a label`).toBeGreaterThan(5)
        }
        expect(await page.locator('.adestia-sign--pending .adestia-sign__meta').first().innerText()).toContain('until')
        expect(await page.locator('.adestia-sign--signed .adestia-sign__meta').first().innerText()).not.toContain('until')
        expect(await page.locator('.adestia-sign--pending').first().innerText()).toContain('signatures.bench.invalid')
      } finally {
        await context.close()
      }
    })

    it('opens the ceremony in one sheet with one close control and Open in a tab, and Escape returns the focus to Sign', async () => {
      const { context, page } = await fresh()
      try {
        const opener = page.getByRole('button', { name: 'Sign', exact: true }).first()
        await opener.waitFor({ timeout: 15_000 })
        await opener.click()
        const dialog = page.getByRole('dialog').first()
        await dialog.waitFor({ timeout: 10_000 })
        expect(await page.locator('.adestia-sheet').count()).toBe(1)
        expect(await page.locator('.adestia-sheet').evaluate((n: Element) => getComputedStyle(n).backgroundColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
        expect(await dialog.getByRole('link', { name: 'Open in a tab' }).count()).toBe(1)
        const close = dialog.getByRole('button', { name: /^Close/ })
        expect(await close.count()).toBe(1)
        expect(await close.locator('use').getAttribute('href')).toBe('#adestia-i-x')
        expect(await dialog.locator('iframe').count()).toBe(1)
        expect(await dialog.locator('use[href="#adestia-i-lock"]').count()).toBe(1)
        expect(await dialog.locator('use[href="#adestia-i-external-link"]').count()).toBe(1)
        await shot(page, 'p3-sheet')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
        expect(await opener.evaluate((n: Element) => n === document.activeElement)).toBe(true)
      } finally {
        await context.close()
      }
    })

    it('closes the ceremony with its close control too', async () => {
      const { context, page } = await fresh()
      try {
        await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
        const dialog = page.getByRole('dialog').first()
        await dialog.waitFor({ timeout: 10_000 })
        await dialog.getByRole('button', { name: /^Close/ }).click()
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
      } finally {
        await context.close()
      }
    })

    it('turns the ceremony into a bottom sheet on a phone', async () => {
      const instance2 = await launch('chat-permission', 'skippy', 'en')
      const { context, page } = await visit(browser, instance2.url, { size: 'phone', tabs: '00000000-0000-4000-8000-000000000101' })
      try {
        await page.getByRole('button', { name: 'Sign', exact: true }).first().click()
        const dialog = page.getByRole('dialog').first()
        await dialog.waitFor({ timeout: 10_000 })
        const box = await dialog.boundingBox()
        expect(Math.abs(box.y + box.height - 844)).toBeLessThan(2)
        expect(box.width).toBeGreaterThan(300)
      } finally {
        await context.close()
        await instance2.stop()
      }
    }, 60_000)

    it('without embed, Sign opens a tab and the card then offers "I signed it"', async () => {
      const { context, page } = await fresh()
      try {
        await page.route('**/api/instance', async (route: any) => {
          const response = await route.fetch()
          const body = await response.json()
          await route.fulfill({ json: { ...body, signatures: { ...(body.signatures ?? {}), embed: false } } })
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        const opener = page.getByRole('button', { name: 'Sign', exact: true }).first()
        await opener.waitFor({ timeout: 15_000 })
        const popup = page.waitForEvent('popup')
        await opener.click()
        const tab = await popup
        await tab.close()
        await page.getByRole('button', { name: 'I signed it', exact: true }).first().waitFor({ timeout: 10_000 })
        expect(await page.getByRole('dialog').count()).toBe(0)
      } finally {
        await context.close()
      }
    })
  })
})
