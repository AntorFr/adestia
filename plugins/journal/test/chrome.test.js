/** The open journal's controls: a back link that names its destination, and icons for the rest. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount, settle } from '../../test/mount.js'
import view from '../web/app.js'

const INDEX = {
  entries: [
    { path: 'journal/atelier/INDEX.md', title: 'Atelier', fields: { type: 'journal' } },
    { path: 'journal/atelier/2026-08-25.md', title: 'Un jour', fields: { type: 'entree', date: '2026-08-25' } },
  ],
}

const apiFor = (locale) => ({
  id: 'journal', base: '/plugins/journal/', locale,
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) }),
  ask() {}, compose() {}, trail() {}, PageEditor: () => null,
})

for (const [locale, word] of [['en', 'Journals'], ['fr', 'Journaux']]) {
  test(`the open journal's back link says "${word}" with a chevron, and still goes to #/journal (${locale})`, async () => {
    const { document, root } = await mount(view, apiFor(locale), '#/journal/atelier')
    const back = document.querySelector('a.journal-back')
    assert.ok(back, 'a back link is drawn')
    assert.equal(back.textContent.trim(), word)
    assert.equal(back.getAttribute('href'), '#/journal')
    assert.equal(back.querySelector('use').getAttribute('href'), '#adestia-i-chevron-left')
    assert.ok(back.classList.contains('adestia-btn--ghost') && back.classList.contains('adestia-btn--sm'))
    assert.ok(!back.textContent.includes('‹'), 'no glyph chevron')
    root.unmount()
  })
}

test('the add toggle swaps plus for x, and says it is expanded', async () => {
  const { document, root } = await mount(view, apiFor('en'), '#/journal/atelier')
  const toggle = document.querySelector('button.journal-add')
  const iconOf = () => toggle.querySelector('use').getAttribute('href')
  assert.equal(iconOf(), '#adestia-i-plus')
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.ok(!/[+×]/.test(toggle.textContent))
  toggle.click()
  await settle()
  assert.equal(iconOf(), '#adestia-i-x')
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(toggle.textContent.trim(), 'Cancel')
  root.unmount()
})
