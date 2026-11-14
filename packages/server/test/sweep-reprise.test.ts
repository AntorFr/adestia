// The sweep waits for each screen's proof at the pod's pace and takes a slow
// screen a second time (bench/lib/capture.mjs). A stub browser stands in for
// Playwright: the proof "appears" only from the Nth wait on, or never.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

const capturePath = fileURLToPath(new URL('../../../bench/lib/capture.mjs', import.meta.url))
const lib = (await import(/* @vite-ignore */ capturePath)) as {
  APPEAR_MS: number
  captureWithRetry: (b: unknown, base: string, screen: unknown, theme: string, size: string, env: unknown) => Promise<string>
}

afterAll(cleanTmp)

const PROOF = '.voyages-page .vhub-card'
const screen = { id: 'E-26', name: 'voyages', proof: PROOF, shell: 'none', route: '/voyages' }

/** `appearsOnTry`: the proof shows from that attempt on (1-based); Infinity: never. */
function stubBrowser(appearsOnTry: number, loadingCard = false) {
  const state = { contexts: 0, closed: 0, proofWaits: 0, timeouts: [] as number[] }
  const browser = {
    async newContext() {
      state.contexts += 1
      const attempt = state.contexts
      const page = {
        async addInitScript() {},
        async goto() {},
        async reload() {},
        async waitForSelector(selector: string, opts: { timeout: number }) {
          state.timeouts.push(opts.timeout)
          if (selector !== PROOF) return
          state.proofWaits += 1
          if (attempt < appearsOnTry) throw new Error('Timeout exceeded')
        },
        async evaluate() {
          return 'Loading…'
        },
        locator: (selector: string) => ({ count: async () => (loadingCard && selector.includes('--loading') ? 1 : 0) }),
        async waitForTimeout() {},
        async screenshot({ path }: { path: string }) {
          writeFileSync(path, Buffer.alloc(2000, 1))
        },
      }
      return { newPage: async () => page, close: async () => void (state.closed += 1) }
    },
  }
  return { browser, state }
}

const env = async () => ({ outDir: await tmpDir('sweep-reprise-'), locale: 'en-US', conversations: {} })

describe('the sweep retries a slow screen once', () => {
  it('waits 60 s for the proof, one shared constant', async () => {
    expect(lib.APPEAR_MS).toBe(60_000)
    const { browser, state } = stubBrowser(1)
    await lib.captureWithRetry(browser, 'http://x', screen, 'light', 'desk', await env())
    expect(state.timeouts).toEqual([60_000])
  })

  it('a proof that shows at once is taken in one context', async () => {
    const { browser, state } = stubBrowser(1)
    const file = await lib.captureWithRetry(browser, 'http://x', screen, 'light', 'desk', await env())
    expect(file.endsWith('E-26-voyages-light-desk.png')).toBe(true)
    expect(state.contexts).toBe(1)
  })

  it('a proof that only shows on the second try is taken, in a fresh context, and counts as a success', async () => {
    const { browser, state } = stubBrowser(2)
    const file = await lib.captureWithRetry(browser, 'http://x', screen, 'dark', 'desk', await env())
    expect(file.endsWith('E-26-voyages-dark-desk.png')).toBe(true)
    expect(state.contexts).toBe(2)
    expect(state.closed).toBe(2)
  })

  it('a proof that never shows fails after exactly two tries, naming the selector and the second try', async () => {
    const { browser, state } = stubBrowser(Infinity)
    const failure = await lib.captureWithRetry(browser, 'http://x', screen, 'light', 'phone', await env()).then(
      () => undefined,
      (error: Error) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(state.contexts).toBe(2)
    expect(state.closed).toBe(2)
    expect(failure!.message).toContain('the selector that proves the screen never appeared')
    expect(failure!.message).toContain(PROOF)
    expect(failure!.message).toContain('second attempt')
  })

  it('a screen that appeared but shows a loading card is not retried', async () => {
    const { browser, state } = stubBrowser(1, true)
    await expect(lib.captureWithRetry(browser, 'http://x', screen, 'light', 'desk', await env())).rejects.toThrow('a loading screen is shown')
    expect(state.contexts).toBe(1)
    expect(state.closed).toBe(1)
  })
})
