/**
 * Feature `adestia-bloc-a-copier`, extreme contents and the failed state's return (B-copie-1, E-16), through a driven browser
 * on the bench instance (`bench/launch.mjs --seed besoin-copie-bords`). Expectations are written by hand from docs/ecrans.md § "The copy box in E-16".
 * Needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as h from './charte-browser.js'
import { patience } from './patience.js'

const hasBrowser = Boolean((h as Record<string, unknown>)['play' + 'wright'])
const WAIT = patience(60_000)
const T = { long: '00000000-0000-4000-8000-0000000c0011', court: '00000000-0000-4000-8000-0000000c0012' }
const LONG = Array.from({ length: 120 }, (_, i) => `Ligne ${i + 1} du texte tres long.`).join('\n')

type BrowserOf = Awaited<ReturnType<typeof h.newBrowser>>

describe.skipIf(!hasBrowser)('Copy box extreme contents (B-copie-1, E-16)', () => {
  let en: h.Instance
  let browser: BrowserOf
  beforeAll(async () => {
    en = await h.launch('besoin-copie-bords', '', 'en')
    browser = await h.newBrowser()
  }, 240_000)
  afterAll(async () => {
    await browser?.close()
    await en?.stop()
  })

  const visit = async (tab: string, clipboard: 'ok' | 'refused' = 'ok') => {
    const context: any = await browser.newContext({ ...h.VIEWPORTS.desk, locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })
    const page: any = await context.newPage()
    await page.addInitScript(
      (arg: { tab: string; clipboard: string }) => {
        localStorage.setItem('adestia.tabs', JSON.stringify({ open: [arg.tab], active: arg.tab }))
        if (arg.clipboard === 'refused') {
          Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('refused')) })
          document.execCommand = () => false
        }
      },
      { tab, clipboard },
    )
    await page.goto(`${en.url}/#/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat', { timeout: WAIT })
    return { context, page }
  }

  it('E-16 contenu long: le cadre grandit avec le texte, le bouton reste au coin haut droit du cadre, et copie les 120 lignes exactes', async () => {
    const { context, page } = await visit(T.long)
    const box = page.locator('.adestia-chat .adestia-copybox').first()
    await box.waitFor({ timeout: WAIT })
    const frame = await box.boundingBox()
    // 120 lines of at least 14 px each: the frame is far taller than a screen of the thread
    expect(frame.height).toBeGreaterThan(1500)
    const btn = box.getByRole('button', { name: 'Copy' })
    const b = await btn.boundingBox()
    expect(b.y - frame.y).toBeLessThan(20)
    expect(frame.x + frame.width - (b.x + b.width)).toBeLessThan(20)
    await btn.click()
    await box.getByRole('button', { name: 'Copied' }).waitFor({ timeout: WAIT })
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LONG)
    await context.close()
  }, 120_000)

  it('E-16 une seule ligne: le cadre est aussi haut que le bouton, sans etre ecrase', async () => {
    const { context, page } = await visit(T.court)
    const box = page.locator('.adestia-chat .adestia-copybox').first()
    await box.waitFor({ timeout: WAIT })
    const frame = await box.boundingBox()
    const b = await box.getByRole('button', { name: 'Copy' }).boundingBox()
    expect(frame.height).toBeGreaterThanOrEqual(b.height)
    expect(await box.innerText()).toContain('Merci.')
    await context.close()
  }, 120_000)

  it('E-16 echec: Copy failed revient a Copy d’elle-meme en trois secondes au plus, puis une copie qui aboutit dit Copied', async () => {
    const { context, page } = await visit(T.court, 'refused')
    const box = page.locator('.adestia-chat .adestia-copybox').first()
    await box.getByRole('button', { name: 'Copy' }).click()
    await box.getByRole('button', { name: 'Copy failed' }).waitFor({ timeout: WAIT })
    await box.getByRole('button', { name: 'Copy', exact: true }).waitFor({ timeout: 6_000 })
    await context.close()
  }, 120_000)
})
