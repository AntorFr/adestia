/**
 * The charter tranche seen from its need (B-6, B-7, B-8, B-10; P-1, P-7..P-10, P-13, P-14;
 * E-1, E-9..E-15, E-19, E-21), through a driven browser on the bench instance
 * (`bench/launch.mjs`, scripted engine). Expectations come from docs/parcours.md,
 * docs/ecrans.md and docs/charte.md, never from the components.
 *
 * Playwright and Chromium come from the environment (`npm root -g`), never from the
 * repository. Without them the whole file is skipped — say so in the report, a skipped
 * browser suite is not a seen screen. Needs `npm run build` first.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

interface Locator {
  click(options?: { timeout?: number }): Promise<void>
  first(): Locator
  count(): Promise<number>
}
export interface Page {
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>
  reload(options?: { waitUntil?: string }): Promise<unknown>
  route(glob: string, handler: (route: Route) => Promise<void>): Promise<void>
  addInitScript<A>(fn: (arg: A) => void, arg: A): Promise<void>
  waitForSelector(selector: string, options?: { state?: string; timeout?: number }): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
  locator(selector: string): Locator
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>
  evaluate<R>(fn: () => R | Promise<R>): Promise<R>
  keyboard: { press(key: string): Promise<void> }
  mouse: { click(x: number, y: number): Promise<void> }
  on(event: 'dialog', handler: (dialog: { dismiss(): Promise<void> }) => void): void
  screenshot(options: { path: string }): Promise<unknown>
}
interface Route {
  fulfill(options: { status?: number; contentType?: string; body?: string }): Promise<void>
  continue(): Promise<void>
}
interface Context {
  newPage(): Promise<Page>
  setOffline(offline: boolean): Promise<void>
  close(): Promise<void>
}
interface Browser {
  newContext(options: Record<string, unknown>): Promise<Context>
  close(): Promise<void>
}
interface Playwright {
  chromium: { launch(options: { args: string[] }): Promise<Browser> }
}

function loadPlaywright(): Playwright | undefined {
  const roots = ['/usr/lib/node_modules']
  try {
    roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim())
  } catch {
    // no npm on the path
  }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try {
        return createRequire(`${dir}/`)(name) as Playwright
      } catch {
        // not under this root
      }
    }
  }
  return undefined
}

export const playwright = loadPlaywright()
export const SHOTS = process.env.CHARTE_SHOTS // a directory, when the captures are wanted

// ── the instances ───────────────────────────────────────────────────────────
export interface Instance {
  url: string
  stop(): Promise<void>
}
const running = new Set<ChildProcess>()
afterAll(() => {
  for (const child of running) child.kill('SIGTERM')
})

export function launch(seed: string, skin: string, locale: string): Promise<Instance> {
  const child = spawn(
    execPath,
    [join(repo, 'bench', 'launch.mjs'), '--engine', 'fake', '--seed', seed, ...(skin ? ['--skin', skin] : []), '--locale', locale],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  running.add(child)
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk))
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk
      const found = /listening on (\S+)/.exec(out)
      if (found)
        resolve({
          url: found[1] as string,
          stop: () =>
            new Promise<void>((done) => {
              if (child.exitCode !== null) return done()
              child.once('exit', () => done())
              child.kill('SIGTERM')
            }),
        })
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.slice(-300)}`)))
  })
}

export async function newBrowser(): Promise<Browser> {
  return (playwright as Playwright).chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] })
}

export const VIEWPORTS = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} as const
export type Size = keyof typeof VIEWPORTS
export type Theme = 'light' | 'dark'

export type { Browser, Context }

export async function open(browser: Browser, base: string, options: { theme: Theme; size: Size; locale: string; signIn?: boolean | undefined; before?: ((page: Page, base: string) => Promise<void>) | undefined; route?: string | undefined; reload?: boolean | undefined; shell?: boolean | undefined }) {
  const context = await browser.newContext({
    ...VIEWPORTS[options.size],
    colorScheme: options.theme,
    locale: options.locale === 'fr' ? 'fr-FR' : 'en-US',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  await page.addInitScript((theme: string) => {
    try {
      localStorage.setItem('adestia.theme', theme)
    } catch {
      // storage refused
    }
  }, options.theme)
  if (options.signIn) {
    await page.goto(`${base}/auth/login?returnTo=%2F`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  }
  await options.before?.(page, base)
  await page.goto(`${base}/#${options.route ?? '/'}`, { waitUntil: 'domcontentloaded' })
  if (options.reload) await page.reload({ waitUntil: 'domcontentloaded' })
  if (options.shell !== false) {
    await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
    if (options.size === 'phone') {
      const onCanvas = await page.evaluate(() => document.querySelector('.adestia-shell')?.getAttribute('data-screen') === 'canvas')
      if (!onCanvas)
        await page.evaluate(() => {
          const back = [...document.querySelectorAll<HTMLElement>('.adestia-chat__header .adestia-ib')].find((b) => b.textContent === '▥')
          back?.click()
        })
    }
  }
  return { context, page }
}

// ── what the page is asked, once a screen is up ─────────────────────────────
export interface Finding {
  native: string[]
  glyphs: string[]
  words: string[]
  contrast: string[]
  icons: number
  text: string
}

/** Runs in the page. Everything it needs is inside it. */
export function inspect(arg: { root: string; lang: string; skip: string }): Finding {
  const roots = [...document.querySelectorAll<HTMLElement>(arg.root)]
  const inside = (el: Element) => roots.some((r) => r.contains(el)) && !(arg.skip && el.closest(arg.skip))
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden') return false
    }
    return true
  }
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''} « ${(el.textContent ?? '').trim().slice(0, 30)} »`
  const finding: Finding = { native: [], glyphs: [], words: [], contrast: [], icons: 0, text: '' }

  // 1. no native unstyled control
  for (const el of document.querySelectorAll<HTMLElement>('button, input, select, textarea')) {
    if (!inside(el) || !visible(el)) continue
    const type = (el as HTMLInputElement).type
    if (type === 'checkbox' || type === 'radio' || type === 'hidden' || type === 'file') continue
    const s = getComputedStyle(el)
    const nativeBorder = (s.borderTopStyle === 'outset' || s.borderTopStyle === 'inset') && parseFloat(s.borderTopWidth) >= 2
    const nativeSelect = el.tagName === 'SELECT' && s.appearance !== 'none'
    const nativeFace = el.tagName === 'BUTTON' && (s.backgroundColor === 'rgb(239, 239, 239)' || s.backgroundColor === 'rgb(107, 107, 107)') && s.borderTopStyle !== 'none'
    if (nativeBorder || nativeSelect || nativeFace) finding.native.push(label(el))
  }

  // 2. icons, no glyph on a control
  finding.icons = [...document.querySelectorAll('svg.adestia-icon')].filter((n) => inside(n) && visible(n)).length
  const glyph = /[⚙✎↺✕×▤▥＋✓⚠ℹ‹›•]|\p{Extended_Pictographic}/u
  for (const el of document.querySelectorAll<HTMLElement>('button, a, summary, [role=button], [role=menuitem]')) {
    if (!inside(el) || !visible(el)) continue
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
    if (glyph.test(own)) finding.glyphs.push(label(el))
  }

  // 3. the words of the chrome (controls, labels, headings, empty states)
  const chrome: string[] = []
  const lang = arg.lang
  for (const el of document.querySelectorAll<HTMLElement>(arg.lang ? 'button:not(.adestia-conversations__item):not(.adestia-filecard), .adestia-chip, .adestia-deleg__state, label, h1, h2, h3, legend, [role=status], [role=alert], .adestia-empty__text, .adestia-gate__card p, .adestia-gate__card h1, .adestia-gate__card h2, .adestia-field__label, .adestia-field__help, .adestia-field__error' : 'x-none')) {
    if (!inside(el) || !visible(el)) continue
    chrome.push((el.getAttribute('aria-label') ?? '') + ' ' + (el.getAttribute('title') ?? '') + ' ' + (el.getAttribute('placeholder') ?? '') + ' ' + [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '))
  }
  for (const el of document.querySelectorAll<HTMLElement>(arg.lang ? 'input, textarea, select' : 'x-none')) {
    if (!inside(el) || !visible(el)) continue
    chrome.push((el.getAttribute('aria-label') ?? '') + ' ' + (el.getAttribute('placeholder') ?? ''))
  }
  const joined = chrome.join(' | ').replace(/\s+/g, ' ')
  finding.text = joined
  if (lang) finding.words.push(joined)

  // 4. text contrast against the nearest opaque ground
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.canvas.width = ctx.canvas.height = 1
  const rgba = (css: string): [number, number, number, number] => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0] as number, d[1] as number, d[2] as number, (d[3] as number) / 255]
  }
  const over = (top: number[], bottom: number[]) => {
    const a = top[3] as number
    return [0, 1, 2].map((i) => (top[i] as number) * a + (bottom[i] as number) * (1 - a)).concat([1])
  }
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0] as number) + 0.7152 * f(c[1] as number) + 0.0722 * f(c[2] as number)
  }
  const ground = (el: Element): number[] | null => {
    const layers: number[][] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.backgroundImage !== 'none') return null
      const c = rgba(s.backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] === 1) break
    }
    let base = rgba(getComputedStyle(document.documentElement).backgroundColor)
    base = base[3] === 0 ? [255, 255, 255, 1] : base
    if (layers[layers.length - 1]?.[3] !== 1) layers.push(base)
    return layers.reverse().reduce((under, layer) => over(layer, under))
  }
  const seen = new Set<string>()
  for (const el of document.querySelectorAll<HTMLElement>('*')) {
    if (!inside(el) || !visible(el)) continue
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim()).map((n) => n.textContent).join('').trim()
    if (!own) continue
    if ((el as HTMLButtonElement).disabled || el.closest('[aria-disabled=true], :disabled')) continue
    let faded = false
    for (let n: Element | null = el; n; n = n.parentElement) if (parseFloat(getComputedStyle(n).opacity) < 1) faded = true
    if (faded) continue
    const s = getComputedStyle(el)
    const bg = ground(el)
    if (!bg) continue
    const fg = over(rgba(s.color), bg)
    const [l1, l2] = [lum(fg), lum(bg)]
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const px = parseFloat(s.fontSize)
    const large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight) >= 700)
    if (ratio < (large ? 3 : 4.5)) {
      const key = `${label(el)}`
      if (!seen.has(key)) {
        seen.add(key)
        finding.contrast.push(`${key} ${ratio.toFixed(2)}:1 (${s.color} on ${bg.slice(0, 3).map(Math.round).join(',')})`)
      }
    }
  }
  return finding
}

/** Tab until a control inside the root has the focus; says what ring it wears. */
export async function focusRing(page: Page, root: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const ring = await page.evaluate((selector: string) => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !el.closest(selector) || !el.matches('button, a, input, select, textarea, [tabindex]')) return null
      const s = getComputedStyle(el)
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && rgba0(s.outlineColor) > 0
      const shadow = s.boxShadow !== 'none' && /\d+px/.test(s.boxShadow)
      function rgba0(c: string) {
        const m = /rgba?\(([^)]+)\)/.exec(c)
        const parts = (m?.[1] ?? '').split(/[ ,/]+/)
        return parts.length > 3 ? parseFloat(parts[3] as string) : 1
      }
      return `${el.tagName.toLowerCase()}.${el.className}|${outline || shadow ? 'ring' : `none(${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow.slice(0, 40)})`}`
    }, root)
    if (ring) return ring
  }
  return 'no control reached by Tab'
}
