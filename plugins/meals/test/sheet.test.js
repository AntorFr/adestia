/**
 * The dish detail is the shell's sheet, and the frise speaks the page's language.
 *
 * Mounted twice (en, fr) against a seeded menu. The sheet is written to the body by an
 * effect, so what is asserted is the contract of the plugin-author skill: a named dialog,
 * Escape and the scrim close it, Tab stays inside, focus goes back to the card, and
 * nothing is left in the body afterwards.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount, settle } from '../../test/mount.js'
import layouts from '../web/layouts.js'

const PERIOD = {
  page: 'p.md',
  data: 'p.meals.json',
  revision: 'r1',
  shape: { titre: 'Week', debut: '2026-09-01', fin: '2026-09-01', sections: ['lunch'] },
  items: [
    { id: 'soup', titre: 'Soup', statut: 'confirme', jour: '2026-09-01', section: 'lunch', quantite: '1 bowl', desc: 'Hot', props: { salt: '1 g' } },
    { id: 'idea', titre: 'Idea', statut: 'suggestion', hint: 'Maybe' },
  ],
}

const apiFor = (locale, fetch) => ({
  id: 'meals', base: '/plugins/meals/', locale,
  fetch: fetch ?? (() => Promise.resolve({ ok: true, json: () => Promise.resolve(PERIOD) })),
})

const view = (api) => ({ component: layouts(api).types.meals })
const mountFrise = (locale, fetch) =>
  mount(() => ({ component: () => null }), apiFor(locale, fetch), '#/page/p.md').then(async (m) => {
    m.root.unmount()
    const { createRoot } = await import('react-dom/client')
    const { createElement } = await import('react')
    const api = apiFor(locale, fetch)
    const root = createRoot(m.document.getElementById('root'))
    root.render(createElement(view(api).component, { path: 'p.md', fields: { type: 'meals' } }))
    await settle()
    return { ...m, root, api }
  })

const key = (document, k, target = document.activeElement) =>
  target.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

for (const locale of ['en', 'fr']) {
  test(`opening a dish: dialog, Escape closes, focus returns to the card (${locale})`, async () => {
    const { document, root } = await mountFrise(locale)
    const card = [...document.querySelectorAll('.meals-card')].find((c) => c.textContent.includes('Soup'))
    assert.equal(card.getAttribute('role'), 'button')
    card.focus()
    card.click()
    await settle()
    const dialog = document.querySelector('body > .adestia-sheet [role="dialog"]')
    assert.ok(dialog, 'the sheet is written to the body')
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Soup')
    const x = dialog.querySelector('button')
    assert.equal(x.getAttribute('aria-label'), locale === 'fr' ? 'Fermer' : 'Close')
    assert.equal(x.querySelector('use').getAttribute('href'), '#adestia-i-x')
    assert.equal(document.activeElement, x, 'focus enters the sheet')

    key(document, 'Tab')
    assert.ok(dialog.contains(document.activeElement), 'Tab stays inside')
    key(document, 'Escape')
    await settle()
    assert.equal(document.querySelector('.adestia-sheet'), null)
    assert.equal(document.activeElement, card, 'focus goes back to the card')
    root.unmount()
  })

  test(`scrim and x close the sheet, a click inside does not (${locale})`, async () => {
    const { document, root } = await mountFrise(locale)
    const open = async () => {
      document.querySelector('.meals-card').click()
      await settle()
    }
    await open()
    document.querySelector('.adestia-sheet__panel').click()
    await settle()
    assert.ok(document.querySelector('.adestia-sheet'), 'inside click keeps it')
    document.querySelector('.adestia-sheet').click()
    await settle()
    assert.equal(document.querySelector('.adestia-sheet'), null)
    await open()
    document.querySelector('.adestia-sheet button').click()
    await settle()
    assert.equal(document.querySelector('.adestia-sheet'), null)
    await open()
    root.unmount()
    await settle()
    assert.equal(document.querySelector('.adestia-sheet'), null, 'unmounting leaves nothing in the body')
  })

  test(`the tray's dismiss is the x icon with a name (${locale})`, async () => {
    const { document, root } = await mountFrise(locale)
    const dismiss = document.querySelector('.meals-dismiss')
    assert.ok(dismiss)
    assert.equal(dismiss.textContent.trim(), '')
    assert.equal(dismiss.getAttribute('aria-label'), locale === 'fr' ? 'Écarter celle-ci' : 'Set this one aside')
    assert.equal(dismiss.querySelector('use').getAttribute('href'), '#adestia-i-x')
    root.unmount()
  })
}

test('in English no text node is accented or French, sheet included', async () => {
  const { document, root } = await mountFrise('en')
  document.querySelector('.meals-card').click()
  await settle()
  const walker = document.createTreeWalker(document.body, 4)
  const bad = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent
    if (/[àâçéèêëîïôûùüœ]/i.test(s) || /\b(le|la|des|pour|avec)\b/i.test(s)) bad.push(s)
  }
  for (const label of document.querySelectorAll('[aria-label],[title]'))
    for (const v of [label.getAttribute('aria-label'), label.getAttribute('title')])
      if (v && (/[àâçéèêëîïôûùüœ]/i.test(v) || /\b(le|la|des|pour|avec)\b/i.test(v))) bad.push(v)
  assert.deepEqual(bad, [])
  root.unmount()
})

test('the conflict sentence says vous, and only that changed', async () => {
  const { words } = layouts(apiFor('fr'))
  const t = words
  const en = 'Someone changed this period while you were reading it. Reloaded.'
  assert.equal(t[en] ?? t(en), 'Quelqu’un a modifié cette période pendant que vous la lisiez. Rechargée.')
})
