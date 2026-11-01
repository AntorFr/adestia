/**
 * Handing the layout back is asked in the plugin's own sheet, never in the browser's dialog.
 *
 * Seeded bench with one hand-placed piece, in the edit mode so the « Hand back » button
 * exists. `confirm` is poisoned: any call to it fails the test by itself.
 */

import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

import createAtelierApp from '../web/app.js'
import { makeT } from '../web/words.js'
import { PATH, WORKBOOK } from './render.js'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..', 'web')

async function bench(locale) {
  const dom = new JSDOM('<!doctype html><body><div class="atelier-page"></div></body>')
  const { window } = dom
  const posts = []
  globalThis.document = window.document
  globalThis.confirm = () => { throw new Error('the browser confirm() was called') }
  window.confirm = globalThis.confirm
  globalThis.fetch = async (url, options = {}) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body })
    if (url.endsWith('/workbooks')) return json({ workbooks: [] })
    if (url.includes('/workbook?')) return json(WORKBOOK)
    if (url.includes('/state')) return json({ fait: {} })
    if (url.includes('/layout')) {
      if (options.method === 'POST') { posts.push(JSON.parse(options.body)); return json({ poses: {}, bandes: {} }) }
      return json({ poses: { 'GAR-C1-COTE-G': { plaque: 'P1', x: 20, y: 20 } }, bandes: {} })
    }
    return { ok: false, status: 500, json: async () => ({}) }
  }
  const engine = createAtelierApp({
    page: window.document.querySelector('.atelier-page'),
    esc: (v) => String(v ?? ''),
    t: makeT(locale),
    locale,
    crumbs() {},
    headers: () => ({}),
    add() {},
    chipsOf: () => [],
    href: (path) => `#/atelier/${path}`,
    learn() {},
    IC: { shop: '<svg viewBox="0 0 24 24"><path d="M3 21h18"/></svg>' },
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5))
  await engine.routes['atelier/'](PATH)
  await settle()
  const { document } = window
  const click = async (el) => { el.dispatchEvent(new window.Event('click', { bubbles: true })); await settle() }
  await click(document.querySelector('.wbtab'))
  await click(document.querySelector('#wbedit'))
  const key = (k) => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  const scrim = () => document.querySelector('body > .atelier-sheet')
  const reset = document.querySelector('#wbreset')
  assert.ok(reset, 'the hand-back button exists with one placed piece')
  reset.focus()
  return { document, posts, click, key, scrim, reset, settle }
}

for (const [locale, question, cancel, drop] of [
  ['en', 'Drop your layout and go back to Alfred’s?', 'Cancel', 'Discard my layout'],
  ['fr', 'Abandonner votre mise en plan et reprendre celle d’Alfred ?', 'Annuler', 'Abandonner ma mise en plan'],
]) {
  test(`reset asks in the sheet: question, Cancel focused first, then the destructive button (${locale})`, async () => {
    const { click, scrim, reset, document, posts } = await bench(locale)
    await click(reset)
    assert.equal(scrim().hidden, false)
    const dialog = scrim().querySelector('[role="dialog"]')
    assert.ok(dialog.textContent.includes(question))
    const buttons = [...dialog.querySelectorAll('footer button')].map((b) => b.textContent.trim())
    assert.deepEqual(buttons, [cancel, drop])
    assert.equal(document.activeElement.textContent.trim(), cancel)
    assert.deepEqual(posts, [], 'asking moves nothing')
  })

  test(`Cancel, Escape and the scrim leave the layout alone and return the focus to the button (${locale})`, async () => {
    for (const how of ['cancel', 'escape', 'scrim']) {
      const { click, key, scrim, reset, document, posts } = await bench(locale)
      await click(reset)
      if (how === 'cancel') await click([...scrim().querySelectorAll('footer button')][0])
      else if (how === 'escape') key('Escape')
      else await click(scrim())
      assert.equal(scrim().hidden, true, how)
      assert.deepEqual(posts, [], `${how} sends nothing`)
      assert.equal(document.activeElement, reset, `${how}: focus is back on the button`)
    }
  })

  test(`confirming sends reset: true once and closes the sheet (${locale})`, async () => {
    const { click, scrim, reset, posts, settle } = await bench(locale)
    await click(reset)
    await click([...scrim().querySelectorAll('footer button')][1])
    await settle()
    assert.deepEqual(posts.map((p) => p.reset), [true])
    assert.equal(posts.length, 1)
    assert.equal(scrim().hidden, true)
  })
}

test('a click inside the sheet does not cancel it', async () => {
  const { click, scrim, reset, posts } = await bench('en')
  await click(reset)
  await click(scrim().querySelector('[role="dialog"]'))
  assert.equal(scrim().hidden, false)
  assert.deepEqual(posts, [])
})

test('the plugin has no native confirm() left', () => {
  const found = readdirSync(web).filter((f) => f.endsWith('.js'))
    .filter((f) => /(?<![\w.])confirm\(/.test(readFileSync(join(web, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
  assert.deepEqual(found, [])
})

test('the question sheet stacks above the full-screen bench mode', () => {
  const css = readFileSync(join(web, 'atelier.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const zOf = (selector) => {
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => sel.split(',').map((s) => s.trim()).includes(selector))
    const z = rules.map(([, , body]) => body.match(/z-index:\s*calc\(var\(--z-sheet\)\s*\+\s*(\d+)\)/)).filter(Boolean).at(-1)
    return z ? Number(z[1]) : null
  }
  assert.equal(zOf('.atelier-full'), 1)
  assert.ok(zOf('.atelier-sheet') > zOf('.atelier-full'), 'the sheet is above the bench mode')
})
