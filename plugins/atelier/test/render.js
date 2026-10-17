/**
 * Draws the atelier engine into a test DOM and reads back what it SAYS.
 *
 * The engine renders with innerHTML into a node it is handed and keeps its
 * modal and its full-screen bench on `document.body`, so a jsdom document is
 * all it needs. Everything the reader can see is gathered in document order:
 * text nodes, and the `title` of anything that has one — a tooltip is a
 * sentence too.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JSDOM } from 'jsdom'

import createAtelierApp from '../web/app.js'
import { makeT } from '../web/words.js'

const here = dirname(fileURLToPath(import.meta.url))

export const WORKBOOK = JSON.parse(readFileSync(join(here, 'fixture-langue.json'), 'utf8'))
export const PATH = 'domaines/diy/projets/langue/assets/workbook.json'
export const LISTING = [
  { path: PATH, titre: WORKBOOK.titre, done: 1, total: 4, pieces: 4, lastActivity: '2026-09-03T12:00:00Z' },
  { path: 'domaines/diy/projets/autre/assets/workbook.json', titre: 'Sans activité', done: 0, total: 0, pieces: 0 },
]

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The text and tooltips under `root`, one per line. */
export function said(root) {
  const lines = []
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
    } else if (node.nodeType === 1) {
      if (node.hasAttribute('title')) lines.push(`[title] ${node.getAttribute('title')}`)
      if (node.hasAttribute('placeholder')) lines.push(`[placeholder] ${node.getAttribute('placeholder')}`)
      for (const child of node.childNodes) walk(child)
    }
  }
  walk(root)
  return lines.join('\n')
}

/** What the reader sees right now: the page, then the modal and the full-screen bench if open. */
export function screen(dom) {
  const { document } = dom.window
  const parts = [said(document.querySelector('.atelier-page'))]
  for (const node of document.querySelectorAll('body > .atelier-modal, body > .atelier-full')) {
    if (!node.hidden) parts.push(said(node))
  }
  return parts.filter(Boolean).join('\n')
}

/**
 * A booted engine. `listing`/`workbook` null means the endpoint answers 500;
 * `broken` makes the listing throw.
 */
export function boot({ locale, t = makeT(locale), listing = LISTING, workbook = WORKBOOK, broken = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="atelier-page"></div></body>')
  const { window } = dom
  const state = { fait: {} }
  const calls = []
  globalThis.document = window.document
  globalThis.confirm = () => true
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options.method ?? 'GET'])
    const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })
    if (broken) throw new Error('offline')
    if (url.endsWith('/workbooks')) return json({ workbooks: listing })
    if (url.includes('/workbook?')) return workbook ? json(workbook) : json({}, false)
    if (url.includes('/state')) {
      if (options.method === 'POST') {
        const { key, done } = JSON.parse(options.body)
        state.fait[key] = done
      }
      return json(state)
    }
    if (url.includes('/layout')) return json({ poses: {}, bandes: {} })
    return json({}, false)
  }
  const page = window.document.querySelector('.atelier-page')
  const trail = []
  const engine = createAtelierApp({
    page,
    esc,
    t,
    locale,
    crumbs: (items) => trail.push(items.map((c) => c.label)),
    headers: () => ({}),
    add() {},
    chipsOf: () => [],
    href: (path) => `#/atelier/${path}`,
    learn() {},
    IC: { shop: '<svg viewBox="0 0 24 24"><path d="M3 21h18"/></svg>' },
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
  return { dom, engine, page, trail, calls, settle, screen: () => screen(dom) }
}

/**
 * Every screen the engine can show for the seeded bench, as [name, text]
 * pairs. The names are the tour's own headings, not the engine's words.
 */
export async function tour(options) {
  const session = boot(options)
  const { dom, engine, settle, screen: now } = session
  const out = []
  const snap = (name) => out.push([name, now()])
  const click = (selector, index = 0) => {
    const node = dom.window.document.querySelectorAll(selector)[index]
    if (!node) throw new Error(`nothing to click: ${selector}`)
    node.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    return settle()
  }
  const press = (selector, type = 'pointerdown') => {
    const node = dom.window.document.querySelector(selector)
    if (!node) throw new Error(`nothing to press: ${selector}`)
    node.dispatchEvent(new dom.window.Event(type, { bubbles: true }))
  }

  await engine.routes.atelier()
  snap('hub')
  out.push(['crumbs of the hub', session.trail.at(-1).join(' > ')])
  await engine.routes['atelier/'](PATH)
  await settle()
  out.push(['crumbs of the bench', session.trail.at(-1).join(' > ')])
  const tabs = dom.window.document.querySelectorAll('.wbtab').length
  for (let i = 0; i < tabs; i += 1) {
    await click('.wbtab', i)
    snap(`station ${i}`)
  }
  await click('.wbtab', 0)
  await click('.colc')
  snap('column sheet')
  await click('.atelier-modal .actions button', 1)
  await click('.pname')
  snap('piece sheet')
  await click('.atelier-modal .actions button', 1)
  await click('#wbedit')
  snap('edit, nothing selected')
  press('.dragp')
  press('.dragp', 'pointerup')
  await settle()
  snap('edit, a piece selected')
  press('.colc')
  press('.colc', 'pointerup')
  await settle()
  snap('edit, a column selected')
  await click('#wbedit')
  await click('#shopmode')
  snap('shop mode')
  await click('.done-btn')
  snap('shop mode, one step done')
  for (let guard = 0; guard < 20 && dom.window.document.querySelector('.done-btn'); guard += 1) await click('.done-btn')
  snap('shop mode, finished')
  await click('.wbtab', 5)
  snap('follow-up, finished')

  const empty = boot({ ...options, listing: [] })
  await empty.engine.routes.atelier()
  out.push(['empty hub', empty.screen()])
  const down = boot({ ...options, broken: true })
  await down.engine.routes.atelier()
  out.push(['hub offline', down.screen()])
  const bad = boot({ ...options, workbook: null })
  await bad.engine.routes['atelier/'](PATH)
  out.push(['unreadable bench', bad.screen()])
  return out
}

export const transcript = (parts) => parts.map(([name, text]) => `== ${name} ==\n${text}\n`).join('\n')
