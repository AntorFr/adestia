/**
 * The shell wait of the test helper (task rouge-adestia-14-attente-coque, criterion 1): on expiry
 * the error says the URL, the route and what the page showed, never a bare timeout. Driven with a
 * stand-in page and throwaway HTTP servers, no browser.
 */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { awaitShell, type Page } from './charte-browser.js'

const here = dirname(fileURLToPath(import.meta.url))

/** A page whose shell never shows (selector wait times out) and whose body says `text`. */
function pageWithoutShell(text: string): Page {
  return {
    waitForSelector: async (selector: string, o?: { timeout?: number }) => {
      await new Promise((r) => setTimeout(r, Math.min(o?.timeout ?? 0, 50)))
      throw new Error(`page.waitForSelector: Timeout ${o?.timeout}ms exceeded waiting for ${selector}\nlog`)
    },
    evaluate: async () => text,
  } as unknown as Page
}
function pageWithShellAfter(ms: number): Page {
  const t0 = Date.now()
  return {
    waitForSelector: async () => {
      await new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - t0))))
    },
  } as unknown as Page
}

describe('awaitShell', () => {
  let server: Server
  let base = ''
  beforeAll(async () => {
    server = createServer((_req, res) => res.end('<html>up</html>'))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((r) => server.close(r))
  })

  it('a page that never shows .adestia-chat: the error holds the URL, the route and the page text', async () => {
    const error = await awaitShell(pageWithoutShell('Hello no shell'), base, '/pages', 1_500).then(() => undefined, (e: unknown) => e as Error)
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(`${base}/#/pages`)
    expect(error?.message).toContain('Hello no shell')
    expect(error?.message).toContain('.adestia-chat')
  })

  it('an instance that does not answer: the error names the URL and says so', async () => {
    const dead = 'http://127.0.0.1:1'
    const error = await awaitShell(pageWithoutShell('x'), dead, '/', 800).then(() => undefined, (e: unknown) => e as Error)
    expect(error?.message).toContain('instance did not answer')
    expect(error?.message).toContain(`${dead}/#/`)
  })

  it('a shell that shows after a pause is waited for and resolves without error', async () => {
    await expect(awaitShell(pageWithShellAfter(1_200), base, '/', 10_000)).resolves.toBeUndefined()
  })

  it('the helper source keeps no fixed 20 s delay', () => {
    expect(readFileSync(join(here, 'charte-browser.ts'), 'utf8')).not.toMatch(/20_000|20000/)
  })
})
