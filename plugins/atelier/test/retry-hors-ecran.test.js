/**
 * What bench/tests/plugins-chargements-retry-besoin.test.mjs proved through a browser about the
 * Workshop's Retry and that the module does: a Retry answered by a failure gives the message
 * and Retry back, with one fetch per press and never the loading row beside the failure.
 * See docs/tests-ecran/bench-plugins-shell.md.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { PATH, boot } from './render.js'

const q = (session, selector) => session.page.querySelector(selector)
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const press = (s) => q(s, '.adestia-empty__action .adestia-btn').dispatchEvent(new s.dom.window.Event('click', { bubbles: true }))

for (const [name, run, message] of [
  ['hub', (s) => s.engine.routes.atelier(), 'The Workshop is unavailable.'],
  ['workbook', (s) => s.engine.routes['atelier/'](PATH), 'Unreadable workbook.'],
]) {
  test(`${name}: a Retry answered by a failure gives the message and Retry back, one fetch per press`, async () => {
    const s = boot({ locale: 'en' })
    const calls = []
    globalThis.fetch = async (url) => { calls.push(url); return reply({}, 500) }
    await run(s)
    const reads = () => calls.filter((u) => u.includes('/workbooks') || u.includes('/workbook?')).length
    assert.equal(reads(), 1)
    press(s)
    await s.settle(); await s.settle()
    assert.equal(reads(), 2, 'one read per press')
    assert.equal(q(s, '.adestia-empty__text').textContent, message)
    assert.equal(q(s, '.adestia-empty__action .adestia-btn').textContent.trim(), 'Retry')
    assert.equal(q(s, '.adestia-loading'), null)
  })
}

test('hub: a Retry answered 404 gives the message and Retry like any other failure', async () => {
  const s = boot({ locale: 'en' })
  let answer = 404
  globalThis.fetch = async () => (answer === 404 ? reply({}, 404) : reply({ workbooks: [] }))
  await s.engine.routes.atelier()
  assert.equal(q(s, '.adestia-empty__text').textContent, 'The Workshop is unavailable.')
  answer = 200
  press(s)
  await s.settle(); await s.settle()
  assert.equal(q(s, '.adestia-empty--state'), null)
  assert.equal(q(s, '.adestia-loading'), null)
})
