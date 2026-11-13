/**
 * E-6, undo from the settings window: a variant chosen in the popover of a `figures` block is
 * taken back by ONE Ctrl+Z pressed while the focus is still in that window (the popover is portaled
 * out of the block, which is what first hid the key from the editor). Ctrl+Shift+Z and Ctrl+Y redo it.
 * A text field in the window keeps its own undo and does not touch the document.
 * Driven browser on the bench instance (`--seed saisie`); skipped without Playwright, needs `npm run build`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

describe.skipIf(!playwright)('settings window: undo and redo', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('saisie', 'skippy', 'en')
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  async function opened() {
    const { context, page } = (await open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', route: '/page/saisie/figures' })) as { context: any; page: any }
    await page.waitForSelector('.adestia-editor__actions .adestia-btn', { timeout: 20_000 })
    await page.locator('.adestia-editor__actions .adestia-btn').first().click()
    const block = page.locator('.adestia-edblock[data-block="figures"]').first()
    await block.waitFor({ timeout: 20_000 })
    await block.hover()
    await block.locator('.adestia-edblock__gear').click({ force: true })
    await page.waitForSelector('.adestia-blockset')
    const inline = () => block.locator('.adestia-figures--inline').count()
    return { context, page, block, inline }
  }
  const settle = (page: any) => page.waitForTimeout(300)

  // Breaks if a key pressed inside the window never reaches the editor's history.
  it('Ctrl+Z from a radio of the window takes the variant back in one step; Ctrl+Shift+Z and Ctrl+Y redo it', async () => {
    const { context, page, inline } = await opened()
    const before = await inline()
    await page.getByRole('radio', { name: /^inline$/i }).click()
    await page.waitForFunction(() => document.querySelector('.adestia-figures--inline'), null, { timeout: 5_000 })
    expect(await page.evaluate(() => !!document.activeElement?.closest('.adestia-blockset'))).toBe(true)
    await page.keyboard.press('Control+z')
    await settle(page)
    expect(await inline()).toBe(before)
    await page.keyboard.press('Control+Shift+z')
    await settle(page)
    expect(await inline()).toBeGreaterThan(0)
    await page.keyboard.press('Control+z')
    await settle(page)
    expect(await inline()).toBe(before)
    await page.keyboard.press('Control+y')
    await settle(page)
    expect(await inline()).toBeGreaterThan(0)
    await context.close()
  }, 90_000)

  // Breaks if the window steals the undo of its own text fields.
  it('Ctrl+Z in a text field of the window leaves the document alone', async () => {
    const { context, page, inline } = await opened()
    await page.getByRole('radio', { name: /^inline$/i }).click()
    await page.waitForFunction(() => document.querySelector('.adestia-figures--inline'), null, { timeout: 5_000 })
    const field = page.locator('.adestia-blockset input[type="text"], .adestia-blockset input:not([type])').first()
    await field.focus()
    await page.keyboard.press('Control+z')
    await settle(page)
    expect(await inline()).toBeGreaterThan(0)
    await context.close()
  }, 90_000)
})
