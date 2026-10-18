/**
 * Renders the project blocks to static markup and reads back what they SAY:
 * every text node and every title, one per line, in document order.
 */
import { JSDOM } from 'jsdom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

export function said(markup) {
  const { document } = new JSDOM(`<body>${markup}</body>`).window
  const lines = []
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
    } else if (node.nodeType === 1) {
      if (node.hasAttribute('title')) lines.push(`[title] ${node.getAttribute('title')}`)
      if (node.hasAttribute('data-label')) lines.push(`[label] ${node.getAttribute('data-label')}`)
      for (const child of node.childNodes) walk(child)
    }
  }
  walk(document.body)
  return lines.join('\n')
}

const PAGES = [
  { path: 'p/a', title: 'Alpha', finished: false, fields: { type: 'project-management', start: '2026-01-10', due: '2026-12-01', 'project-status': 'Amber' } },
  { path: 'p/b', title: 'Bravo', finished: true, fields: { type: 'project-management', start: '2026-02-01', due: '2026-03-01' } },
  { path: 'p/c', title: 'Charlie', finished: true, fields: { type: 'project-management', due: '2026-04-01' } },
  { path: 'p/d', title: 'Delta', finished: false, fields: { type: 'project-management', due: '2026-05-01' } },
  { path: 'p/e', title: 'Echo', finished: false, fields: { type: 'project-management', start: '2026-09-01', due: '2026-01-01' } },
]
const WRITTEN = ['Phase one: 2026-01-15 → 2026-11-01', 'Review: 2026-12-01', 'not a date line']
const noFetch = { locale: 'en', fetch: () => Promise.reject(new Error('no network')) }

/** Midday, 17 October 2026: the one "today" every transcript is drawn on. */
const NOW = Date.parse('2026-10-17T12:00:00Z')

/** Every state worth reading, as `[name, markup]`, for one locale. */
export async function tour(blocksUrl, locale) {
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])) }
    static now() { return NOW }
  }
  try {
  const { default: create } = await import(blocksUrl)
  const tags = create({ ...noFetch, locale }).tags
  const draw = (Tag, props) => renderToStaticMarkup(createElement(Tag, props))
  const out = []
  out.push(['timeline written', draw(tags.timeline, { items: WRITTEN })])
  out.push(['timeline written quarters', draw(tags.timeline, { items: WRITTEN, attributes: { scale: 'quarters' } })])
  out.push(['timeline written empty', draw(tags.timeline, { items: [] })])
  out.push(['timeline written unreadable', draw(tags.timeline, { items: ['nope'] })])
  out.push(['timeline queried', draw(tags.timeline, { attributes: { depth: 'subtree' }, path: 'p/root', pages: PAGES })])
  out.push(['timeline queried empty', draw(tags.timeline, { attributes: { depth: 'subtree' }, path: 'p/root', pages: [] })])
  out.push(['timeline queried loading', draw(tags.timeline, { attributes: { depth: 'subtree' }, path: 'p/root' })])
  out.push(['subproject rows', draw(tags.subproject, { path: 'p/root', pages: PAGES, attributes: { closed: 'show' } })])
  out.push(['subproject fold two', draw(tags.subproject, { path: 'p/root', pages: PAGES })])
  out.push(['subproject fold one', draw(tags.subproject, { path: 'p/root', pages: PAGES.filter((p) => p.path !== 'p/c') })])
  out.push(['subproject cards', draw(tags.subproject, { path: 'p/root', pages: PAGES, attributes: { view: 'cards' } })])
  out.push(['subproject empty', draw(tags.subproject, { path: 'p/root', pages: [] })])
  return out.map(([name, markup]) => [name, said(markup)])
  } finally {
    globalThis.Date = RealDate
  }
}

export const transcript = (parts) => parts.map(([name, text]) => `## ${name}\n${text}`).join('\n\n') + '\n'
