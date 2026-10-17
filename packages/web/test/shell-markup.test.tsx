// @vitest-environment jsdom
/**
 * The shell's markup, pinned. The snapshots were taken from the monolithic App
 * and Home before they were split by lifetime; the split must not move them.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { App } from '../src/app/App.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [{ id: 'todo', kind: 'app', base: '/plugins/todo/', tile: { label: 'Todo', icon: '☑' } }],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}
const PAGES = [
  { path: 'notes/INDEX.md', title: 'Notes', fields: {} },
  { path: 'notes/a.md', title: 'A', fields: {} },
  { path: 'notes/b.md', title: 'B', fields: {} },
  { path: 'voyages/INDEX.md', title: 'Voyages', fields: {} },
  { path: 'voyages/c.md', title: 'C', fields: {} },
]
const BRIEF = {
  generatedAt: '2026-10-17T08:00:00Z',
  items: [
    { ico: '📋', title: 'Notes', reason: 'à relire', target: { type: 'section', path: 'notes' } },
    { title: 'Voyage', cible: { type: 'page', path: 'voyages/c' } },
  ],
}

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response
}
const fetchImpl = ((url: string) => {
  const u = String(url)
  if (u.startsWith('/api/instance')) return Promise.resolve(json(INSTANCE))
  if (u.startsWith('/api/home/brief')) return Promise.resolve(json(BRIEF))
  if (u.startsWith('/api/pages/index')) return Promise.resolve(json({ entries: PAGES }))
  if (u.startsWith('/api/pages/')) return Promise.resolve(json({}, 404))
  return Promise.resolve(json({ entries: PAGES, conversations: [] }))
}) as unknown as typeof fetch

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  location.hash = ''
  cleanup()
})

const routes: Record<string, string> = {
  home: '',
  settings: '#/settings',
  section: '#/section/notes',
  missing: '#/page/ghost.md',
}

for (const [name, hash] of Object.entries(routes)) {
  for (const width of [1440, 390]) {
    it(`renders ${name} at ${width}px unchanged`, async () => {
      window.innerWidth = width
      location.hash = hash
      const { container } = render(<App fetchImpl={fetchImpl} />)
      await waitFor(() => expect(container.querySelector('.adestia-canvas__body')).toBeTruthy())
      const wait = {
        home: '.adestia-brief__item',
        settings: '.adestia-canvas__body button',
        section: '.adestia-canvas__body .adestia-chead',
        missing: '.adestia-missing',
      }[name]!
      await waitFor(() => expect(container.querySelector(wait)).toBeTruthy())
      const html = container.innerHTML.replace(/:r[0-9a-z]+:/g, ':rN:')
      await expect(html).toMatchFileSnapshot(`./__snapshots__/shell-markup/${name}-${width}.html`)
    })
  }
}
