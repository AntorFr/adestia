/**
 * The browser helper waits for the shell on a signal and, on expiry, says where it was and what the
 * page showed (task rouge-adestia-14-attente-coque, criterion 1). Driven through Chromium against
 * throwaway HTTP servers that never serve a shell. Skipped without Playwright.
 */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { awaitShell, newBrowser, playwright, type Browser, type Page } from './charte-browser.js'

const here = dirname(fileURLToPath(import.meta.url))

describe.skipIf(!playwright)('awaitShell: expiry names the place and the page', () => {
  let browser: Browser
  let server: Server
  let base = ''
  let shellAfterMs = 0
  const started = () => Date.now()

  beforeAll(async () => {
    browser = await newBrowser()
    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html')
      if (req.url?.startsWith('/late')) {
        setTimeout(() => res.end('<div class="adestia-chat">ok</div>'), shellAfterMs)
        return
      }
      res.end('<html><body><h1>Hello no shell</h1></body></html>')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await browser?.close()
    await new Promise((r) => server?.close(r))
  })

  async function pageAt(path: string): Promise<Page> {
    const page = await (await browser.newContext({})).newPage()
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
    return page
  }

  it('a page that never shows .adestia-chat: the error holds the URL, the route and the page text', async () => {
    const page = await pageAt('/')
    const error = await awaitShell(page, base, '/pages', 1_500).then(
      () => undefined,
      (e: unknown) => e as Error,
    )
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(`${base}/#/pages`)
    expect(error?.message).toContain('Hello no shell')
    expect(error?.message).not.toMatch(/^TimeoutError/)
  })

  it('an instance that does not answer: the error names the URL, not a bare timeout', async () => {
    const page = await pageAt('/')
    const dead = 'http://127.0.0.1:1'
    const error = await awaitShell(page, dead, '/', 800).then(
      () => undefined,
      (e: unknown) => e as Error,
    )
    expect(error?.message).toContain('instance did not answer')
    expect(error?.message).toContain(`${dead}/#/`)
  })

  it('a shell served late is waited for and resolves without error', async () => {
    shellAfterMs = 2_500
    const page = await pageAt('/late-start')
    const t = started()
    await awaitShell(page, base, '/', 20_000)
    expect(Date.now() - t).toBeLessThan(20_000)
  })

  it('the helper keeps no fixed 20 s on .adestia-chat and never builds the shell', () => {
    const source = readFileSync(join(here, 'charte-browser.ts'), 'utf8')
    expect(source).not.toMatch(/20_000|20000/)
    expect(source).not.toMatch(/npm run build['"`]\s*\]|execFileSync\([^)]*build/)
  })
})
