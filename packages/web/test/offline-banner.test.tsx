// @vitest-environment jsdom
/**
 * The offline banner (E-32, AD-22): drawn once, in the place the user is looking
 * at, never under a gate, never covering the screen below.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { App } from '../src/app/App.js'
import { Offline } from '../src/app/Offline.js'
import { translator } from '../src/app/i18n.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

/** The instance answers; `state.up` decides whether anything else (health included) does. */
function server(state: { up: boolean }, instance: unknown = INSTANCE): typeof fetch {
  return ((url: string) => {
    if (String(url).startsWith('/api/instance')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(instance) } as unknown as Response)
    }
    if (!state.up) return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ entries: [], conversations: [] }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

function fold(width: number): () => void {
  const previous = { width: window.innerWidth, matchMedia: window.matchMedia }
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  window.matchMedia = ((media: string) => ({
    media,
    matches: width <= 820,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  return () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: previous.width })
    window.matchMedia = previous.matchMedia
  }
}

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
  restore = undefined
})

const banners = (c: HTMLElement) => c.querySelectorAll('.adestia-offline')

describe('Offline', () => {
  it.each([
    ['en', 'The server is not responding'],
    ['fr', 'Le serveur ne répond pas'],
  ] as const)('says it in %s, as a status', (locale, text) => {
    render(<Offline t={translator(locale)} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe(text)
    expect(status.className).toContain('adestia-offline')
    expect(status.querySelector('svg use')?.getAttribute('href')).toContain('wifi-off')
  })
})

describe('the banner in the shell', () => {
  it('is absent while the server answers', async () => {
    const { container } = render(<App fetchImpl={server({ up: true })} />)
    await waitFor(() => expect(container.querySelector('.adestia-canvas__body')).toBeTruthy())
    expect(banners(container)).toHaveLength(0)
  })

  it('desk: once, first child of the canvas body, above Problems, and not in the chat', async () => {
    const state = { up: false }
    const { container } = render(<App fetchImpl={server(state, { ...INSTANCE, pluginProblems: [{ id: 'x', reason: 'broken' }] })} />)
    await waitFor(() => expect(container.querySelector('.adestia-canvas__body')).toBeTruthy())
    await waitFor(() => expect(banners(container).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(banners(container)).toHaveLength(1)
    const body = container.querySelector('.adestia-canvas__body')!
    expect(body.firstElementChild?.classList.contains('adestia-offline')).toBe(true)
    expect(container.querySelector('.adestia-chat .adestia-offline')).toBeNull()
  }, 15000)
})

describe('the banner on a phone', () => {
  async function down(width = 390) {
    restore = fold(width)
    const state = { up: false }
    const view = render(<App fetchImpl={server(state)} />)
    await waitFor(() => expect(view.container.querySelector('.adestia-shell')).toBeTruthy())
    return view
  }

  it('chat shown: once, above the rail header, none in the canvas; canvas shown: once, in the canvas body', async () => {
    const { container } = await down()
    await waitFor(() => expect(banners(container).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(banners(container)).toHaveLength(1)
    const chat = container.querySelector('.adestia-chat')!
    expect(chat.firstElementChild?.classList.contains('adestia-offline')).toBe(true)
    expect(container.querySelector('.adestia-canvas__body .adestia-offline')).toBeNull()

    fireEvent.click(container.querySelector('.adestia-edge[data-side="right"]')!)
    expect(container.querySelector('.adestia-shell')!.getAttribute('data-screen')).toBe('canvas')
    expect(banners(container)).toHaveLength(1)
    expect(container.querySelector('.adestia-canvas__body')!.firstElementChild?.classList.contains('adestia-offline')).toBe(true)
    expect(container.querySelector('.adestia-chat .adestia-offline')).toBeNull()

    fireEvent.click(container.querySelector('.adestia-edge[data-side="left"]')!)
    expect(banners(container)).toHaveLength(1)
    expect(container.querySelector('.adestia-chat')!.firstElementChild?.classList.contains('adestia-offline')).toBe(true)
  }, 15000)
})

describe('under a gate', () => {
  const body = (status: number) =>
    (() =>
      Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error: 'no' }) } as unknown as Response)) as unknown as typeof fetch

  it('no banner on the fatal gate (server down at start)', async () => {
    const dead = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    const { container } = render(<App fetchImpl={dead} />)
    await waitFor(() => expect(screen.getByText('Adestia could not start')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 50))
    expect(banners(container)).toHaveLength(0)
  })

  it.each([401, 403, 500])('no banner on the gate for HTTP %i', async (status) => {
    const { container } = render(<App fetchImpl={body(status)} />)
    await waitFor(() => expect(container.querySelector('.adestia-gate')).toBeTruthy())
    expect(banners(container)).toHaveLength(0)
  })
})

describe('the screen under the banner', () => {
  it('stays interactive: the banner takes no pointer and a click on the shell reaches it', async () => {
    restore = fold(390)
    const state = { up: false }
    const { container } = render(<App fetchImpl={server(state)} />)
    await waitFor(() => expect(banners(container).length).toBeGreaterThan(0), { timeout: 8000 })
    // handle still works with the banner drawn
    fireEvent.click(container.querySelector('.adestia-edge[data-side="right"]')!)
    expect(container.querySelector('.adestia-shell')!.getAttribute('data-screen')).toBe('canvas')
    const css = readFileSync(join(repo, 'packages/web/src/app/styles/offline.css'), 'utf8')
    expect(css).not.toMatch(/position:\s*(fixed|absolute)/)
    expect(css).not.toMatch(/z-index/)
  }, 15000)
})

describe('doc and sheet', () => {
  it('docs/ecrans.md names .adestia-offline and the sheet defines it, imported by the shell sheet', () => {
    const doc = readFileSync(join(repo, 'docs/ecrans.md'), 'utf8')
    expect(doc).toContain('.adestia-offline')
    expect(doc).toContain('styles/offline.css')
    const css = readFileSync(join(repo, 'packages/web/src/app/styles/offline.css'), 'utf8')
    expect(css).toMatch(/^\.adestia-offline\s*\{/m)
    expect(readFileSync(join(repo, 'packages/web/src/app/shell.css'), 'utf8')).toContain("./styles/offline.css")
  })
})
