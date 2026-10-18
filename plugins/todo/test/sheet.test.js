/**
 * The way back from a task's sheet names the screen it leads to.
 *
 * The sheet is rendered alone in a test DOM, in en and fr, with a task and a stub editor.
 * The back control must be a ghost button whose accessible name is the list screen's title
 * (aria-label and visible word agree), carrying the shell's chevron-left, and it calls onBack.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount, settle } from '../../test/mount.js'
import { words } from '../web/model.js'
import { makeSheet } from '../web/sheet.js'

const TASK = { id: 'a', path: 'a.md', title: 'Buy paint', done: false, sub: [], files: [] }
const MODEL = { tasks: { a: TASK } }

for (const locale of ['en', 'fr']) {
  test(`the back button is named after the list screen and calls onBack (${locale})`, async () => {
    const { createElement: h } = await import('react')
    const api = { id: 'todo', locale, fetch: () => Promise.reject(new Error('no net')), trail: () => {}, PageEditor: () => null }
    const t = words(locale)
    const Sheet = makeSheet(api, t)
    let backs = 0
    const { document, root } = await mount(
      () => ({ component: () => h(Sheet, { task: TASK, model: MODEL, onBack: () => { backs += 1 }, onChanged: async () => {}, onOpenTask: async () => {} }) }),
      api,
      '#/',
    )
    const back = document.querySelector('.todo-back')
    assert.equal(back.tagName, 'BUTTON')
    assert.equal(back.getAttribute('type'), 'button')
    assert.ok(back.classList.contains('adestia-btn--ghost') && back.classList.contains('adestia-btn--sm'))
    // 'Todo' is what the list screen's heading says today in both tables.
    assert.equal(back.getAttribute('aria-label'), 'Todo')
    assert.equal(back.textContent, 'Todo')
    assert.equal(back.querySelector('use').getAttribute('href'), '#adestia-i-chevron-left')
    assert.equal(back.querySelector('svg').getAttribute('aria-hidden'), 'true')
    assert.ok(!back.textContent.includes('‹'))
    back.click()
    await settle()
    assert.equal(backs, 1)
    root.unmount()
  })
}
