/** The two clear buttons: icon x, and the search one is named. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount, settle } from '../../test/mount.js'
import view from '../web/app.js'

const answers = {
  '/api/pages/index': { entries: [] },
  '/api/plugin/listening-post/queue': {
    items: [{ key: 'yt:B', url: 'https://www.youtube.com/watch?v=B', titre: 'Une nouveauté', source: 'S', media: 'video', publie: '2026-08-30T00:00:00.000Z', origine: 'flux' }],
    sources: [], problems: [],
  },
  '/api/plugin/listening-post/health': { transcriber: {} },
  '/api/plugin/listening-post/search?q=audio': { query: 'audio', results: [] },
}
const apiFor = (locale) => ({
  id: 'listening-post', base: '/plugins/listening-post/', locale,
  fetch: (url) => {
    const body = answers[String(url)]
    return Promise.resolve(body ? { ok: true, json: () => Promise.resolve(body) } : { ok: false, status: 404 })
  },
  ask() {}, compose() {}, trail() {}, PageEditor: () => null,
})

for (const [locale, dismiss, clear] of [['en', 'dismiss', 'Clear'], ['fr', 'écarter', 'Effacer']]) {
  test(`dismiss keeps its word and drops the glyph; the search clear is named (${locale})`, async () => {
    const { document, root, dom } = await mount(view, apiFor(locale), '#/listening-post')
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(dismiss))
    assert.ok(button, 'dismiss button')
    assert.equal(button.textContent.trim(), dismiss)
    assert.equal(button.querySelector('use').getAttribute('href'), '#adestia-i-x')

    const input = document.querySelector('input[type=search]')
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    set.call(input, 'audio')
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await settle()
    document.querySelector('form.lp-seek').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
    await settle()
    const clearButton = document.querySelector(`button[aria-label="${clear}"]`)
    assert.ok(clearButton, 'the clear button is named')
    assert.equal(clearButton.textContent.trim(), '')
    assert.equal(clearButton.querySelector('use').getAttribute('href'), '#adestia-i-x')
    clearButton.click()
    await settle()
    assert.equal(document.querySelector('.lp-results'), null, 'clearing closes the results')
    root.unmount()
  })
}
