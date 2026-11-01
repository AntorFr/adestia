/**
 * B-18 for E-25: the hub and a workbook show the shell's loading row while they fetch,
 * and on failure (network error or non-2xx, the hub included) a message and Retry that
 * runs the same render again. Expected strings are written out, not read from the code.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { LISTING, PATH, WORKBOOK, boot } from './render.js'

const q = (session, selector) => session.page.querySelector(selector)
const gate = () => { let open; const wait = new Promise((r) => { open = r }); return { wait, open } }
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

/** Boots with a fetch that the test controls: `handler(url)` returns a response or throws. */
function bootWith(locale, handler) {
  const session = boot({ locale })
  const calls = []
  globalThis.fetch = async (url, options = {}) => { calls.push(url); return handler(url, options) }
  return { ...session, calls }
}
const healthyWorkbook = (url) => {
  if (url.includes('/workbook?')) return reply(WORKBOOK)
  if (url.includes('/state')) return reply({ fait: {} })
  if (url.includes('/layout')) return reply({ poses: {}, bandes: {} })
  return reply({}, 404)
}

for (const [locale, loading, message, retry] of [
  ['en', 'Loading…', 'The Workshop is unavailable.', 'Retry'],
  ['fr', 'Chargement…', 'Atelier indisponible.', 'Réessayer'],
]) {
  test(`hub (${locale}): loading row before the data, then the list`, async () => {
    const g = gate()
    const s = bootWith(locale, async () => { await g.wait; return reply({ workbooks: LISTING }) })
    const run = s.engine.routes.atelier()
    const row = q(s, '.adestia-loading')
    assert.ok(row, 'loading row while fetching')
    assert.equal(row.getAttribute('role'), 'status')
    assert.equal(row.textContent.trim(), loading)
    g.open(); await run
    assert.equal(q(s, '.adestia-loading'), null)
    assert.ok(q(s, '.cards'))
  })

  for (const [name, handler] of [
    ['a 500', async () => reply({}, 500)],
    ['a network error', async () => { throw new Error('offline') }],
    ['a 200 without a list', async () => reply({ nope: 1 })],
  ]) {
    test(`hub (${locale}): ${name} gives the message and Retry, Retry reloads the data`, async () => {
      let healthy = false
      const s = bootWith(locale, async () => (healthy ? reply({ workbooks: LISTING }) : handler()))
      await s.engine.routes.atelier()
      const block = q(s, '.adestia-empty.adestia-empty--state')
      assert.ok(block)
      assert.equal(q(s, '.adestia-empty__icon svg') !== null, true)
      assert.equal(q(s, '.adestia-empty__text').textContent, message)
      const button = q(s, '.adestia-empty__action .adestia-btn')
      assert.equal(button.textContent.trim(), retry)
      assert.equal(q(s, '.adestia-loading'), null)
      healthy = true
      const g = gate(); const inner = globalThis.fetch
      globalThis.fetch = async (...a) => { await g.wait; return inner(...a) }
      button.dispatchEvent(new s.dom.window.Event('click', { bubbles: true }))
      assert.equal(button.disabled, true, 'cannot be pressed twice')
      assert.ok(q(s, '.adestia-loading'), 'back to the loading row')
      assert.equal(q(s, '.adestia-empty--state'), null, 'never both at once')
      g.open(); await s.settle()
      assert.equal(q(s, '.adestia-empty--state'), null)
      assert.ok(q(s, '.cards'))
    })
  }
}

test('workbook: loading row first, then the bench', async () => {
  const g = gate()
  const s = bootWith('en', async (u) => { await g.wait; return healthyWorkbook(u) })
  const run = s.engine.routes['atelier/'](PATH)
  assert.equal(q(s, '.adestia-loading').textContent.trim(), 'Loading…')
  g.open(); await run; await s.settle()
  assert.equal(q(s, '.adestia-loading'), null)
  assert.ok(q(s, '.wbtab'))
})

for (const [name, bad, ] of [
  ['/workbook 500', (u) => u.includes('/workbook?') && 500],
  ['/state 500', (u) => u.includes('/state') && 500],
  ['/state network error', (u) => u.includes('/state') && 'throw'],
]) {
  for (const [locale, message, retry] of [['en', 'Unreadable workbook.', 'Retry'], ['fr', 'Workbook illisible.', 'Réessayer']]) {
    test(`workbook (${locale}): ${name} gives message and Retry, no raw error, Retry reloads`, async () => {
      let broken = true
      const s = bootWith(locale, async (u) => {
        const b = broken && bad(u)
        if (b === 'throw') throw new Error('Boom-42')
        if (b) return reply({}, b)
        return healthyWorkbook(u)
      })
      await s.engine.routes['atelier/'](PATH)
      assert.equal(q(s, '.adestia-empty__text').textContent, message)
      assert.equal(/500|Boom|Error/.test(s.page.textContent), false, 'raw error text hidden')
      const button = q(s, '.adestia-empty__action .adestia-btn')
      assert.equal(button.textContent.trim(), retry)
      broken = false
      button.dispatchEvent(new s.dom.window.Event('click', { bubbles: true }))
      assert.equal(button.disabled, true)
      await s.settle(); await s.settle()
      assert.equal(q(s, '.adestia-empty--state'), null)
      assert.ok(q(s, '.wbtab'))
    })
  }
}

test('workbook: /layout failing alone is tolerated', async () => {
  const s = bootWith('en', async (u) => (u.includes('/layout') ? reply({}, 500) : healthyWorkbook(u)))
  await s.engine.routes['atelier/'](PATH); await s.settle()
  assert.equal(q(s, '.adestia-empty--state'), null)
  assert.ok(q(s, '.wbtab'))
})

test('workbook: Retry fetches the same workbook again', async () => {
  let broken = true
  const s = bootWith('en', async (u) => (broken ? reply({}, 500) : healthyWorkbook(u)))
  await s.engine.routes['atelier/'](PATH)
  broken = false; s.calls.length = 0
  q(s, '.adestia-btn').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }))
  await s.settle()
  assert.ok(s.calls.some((u) => u.includes('/workbook?') && u.includes(encodeURIComponent(PATH))))
})
