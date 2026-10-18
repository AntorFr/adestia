/**
 * The trip card is the shell's sheet, and the page speaks the page's language.
 *
 * Mounted on one seeded trip, under `en` then `fr`. `fr-before-the-task.json` is the
 * text the French page showed BEFORE the task (captured on the starting commit, with the
 * `✕` glyph that became an icon taken out): the language work may not move a word of it.
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { settle } from '../../test/mount.js'
import { mountTrip, texts, apiFor, DATA, VOYAGE } from './trip-fixture.js'

const before = JSON.parse(readFileSync(new URL('./fr-before-the-task.json', import.meta.url), 'utf8'))
const key = (document, k, shiftKey = false) =>
  document.activeElement.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }))
const card = (document) => document.querySelector('.vcard[data-vi="bain"]')
const sorted = (list) => [...list].sort()

for (const locale of ['en', 'fr']) {
  test(`opening a card: named dialog, scrim, Escape closes, focus returns to the card (${locale})`, async () => {
    const { document, root } = await mountTrip(locale)
    const opener = card(document)
    assert.equal(opener.getAttribute('role'), 'button')
    assert.equal(opener.getAttribute('tabindex'), '0')
    opener.focus()
    opener.click()
    const scrim = document.querySelector('.adestia-sheet')
    assert.equal(scrim.hidden, false)
    assert.equal(scrim.parentElement.tagName, 'BODY', 'open, the scrim sits on the body: a fixed node inside a folded pane is fixed to the pane')
    const dialog = scrim.querySelector('[role="dialog"]')
    assert.equal(dialog.getAttribute('aria-modal'), 'true')
    assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Caracalla')
    const x = dialog.querySelector('header button')
    assert.equal(x.getAttribute('aria-label'), locale === 'fr' ? 'Fermer' : 'Close')
    assert.equal(x.querySelector('use').getAttribute('href'), '#adestia-i-x')
    assert.equal(document.activeElement, x)
    const foot = [...dialog.querySelectorAll('footer button')].map((b) => b.textContent.trim())
    assert.equal(foot.at(-1), locale === 'fr' ? 'Fermer' : 'Close', 'the foot keeps its Close')
    key(document, 'Escape')
    assert.equal(scrim.hidden, true)
    assert.equal(scrim.children.length, 0)
    assert.ok(document.querySelector('.voyages').parentElement.contains(scrim), 'closed, the scrim is back in the plugin subtree')
    assert.equal(document.activeElement, opener, 'focus goes back to the card')
    root.unmount()
  })

  test(`Tab and Shift+Tab stay inside the sheet (${locale})`, async () => {
    const { document, root } = await mountTrip(locale)
    card(document).click()
    const dialog = document.querySelector('[role="dialog"]')
    const controls = [...dialog.querySelectorAll('button, a[href], input')]
    controls.at(-1).focus()
    key(document, 'Tab')
    assert.equal(document.activeElement, controls[0], 'forward from the last wraps to the first')
    key(document, 'Tab', true)
    assert.equal(document.activeElement, controls.at(-1), 'backward from the first wraps to the last')
    root.unmount()
  })

  test(`scrim, x and Close close it; a click inside does not (${locale})`, async () => {
    const { document, root } = await mountTrip(locale)
    const scrim = () => document.querySelector('.adestia-sheet')
    card(document).click()
    document.querySelector('.adestia-sheet__panel').click()
    assert.equal(scrim().hidden, false)
    scrim().click()
    assert.equal(scrim().hidden, true)
    card(document).click()
    scrim().querySelector('header button').click()
    assert.equal(scrim().hidden, true)
    card(document).click()
    const foot = scrim().querySelectorAll('footer button')
    foot[foot.length - 1].click()
    assert.equal(scrim().hidden, true)
    root.unmount()
  })

  test(`the keyboard opens a card and returns to it (${locale})`, async () => {
    const { document, root } = await mountTrip(locale)
    const opener = document.querySelector('.traycard[data-vi="diner"]')
    opener.focus()
    key(document, 'Enter')
    assert.equal(document.querySelector('.adestia-sheet').hidden, false)
    key(document, 'Escape')
    assert.equal(document.activeElement, opener)
    root.unmount()
  })

  test(`the tray's dismiss is the x icon with a name (${locale})`, async () => {
    const { document, root } = await mountTrip(locale)
    const dis = document.querySelector('.dis[data-dis]')
    assert.equal(dis.textContent.trim(), '')
    assert.equal(dis.querySelector('use').getAttribute('href'), '#adestia-i-x')
    assert.equal(dis.getAttribute('aria-label'), locale === 'fr' ? 'Écarter — conservée, jamais reproposée' : 'Dismiss — kept, never suggested again')
    root.unmount()
  })
}

test('unmounting the view leaves no sheet behind', async () => {
  const { document, root } = await mountTrip('en')
  card(document).click()
  root.unmount()
  await settle()
  assert.equal(document.querySelector('.adestia-sheet'), null)
})

test('unmounting the view while a card is open leaves nothing on the body', async () => {
  const { document, root } = await mountTrip('en')
  card(document).click()
  assert.equal(document.querySelector('.adestia-sheet').parentElement.tagName, 'BODY')
  root.unmount()
  await settle()
  assert.equal(document.querySelector('.adestia-sheet'), null)
  assert.equal(document.querySelector('[role="dialog"]'), null)
})

test('in English no text node, label or title is accented or French, sheet included, outside the seeded content', async () => {
  const { document, root } = await mountTrip('en')
  card(document).click()
  const seeded = new Set([DATA.status, DATA.titre, ...DATA.items.flatMap((i) => [i.titre, i.hint, i.desc, i.duree, i.prix]).filter(Boolean)])
  const bad = texts(document).filter((s) => !seeded.has(s.replace(/^[^\p{L}]+/u, '')))
    .filter((s) => /[àâçéèêëîïôûùüœ]/i.test(s) || /\b(le|la|des|pour|avec)\b/i.test(s))
  assert.deepEqual(bad, [])
  assert.ok(texts(document).some((s) => s.includes('morning')), 'the slot is said in English')
  root.unmount()
})

test('in French the page and the sheet say, word for word, what they said before the task', async () => {
  const { document, root } = await mountTrip('fr')
  assert.deepEqual(sorted(texts(document).filter((s) => !s.startsWith('aria-label='))), sorted(before.page))
  card(document).click()
  assert.deepEqual(sorted(texts(document).filter((s) => !s.startsWith('aria-label='))), sorted(before.withSheet))
  root.unmount()
})

test('the plural of the counts follows the language', async () => {
  const mounted = {}
  for (const locale of ['en', 'fr']) {
    const { document, root } = await mountTrip(locale)
    mounted[locale] = document.querySelector('[data-ectoggle]')
    root.unmount()
  }
  assert.equal(mounted.en.textContent.trim(), '1 dismissed ▸')
  assert.equal(mounted.fr.textContent.trim(), '1 écartée ▸')
})

test('a refused gesture says its reason in the page language', async () => {
  for (const [locale, head] of [['en', 'Gesture refused: '], ['fr', 'Geste refusé : ']]) {
    const base = apiFor(locale)
    const api = {
      ...base,
      fetch: (url, init) => init?.method === 'POST'
        ? Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'conflit' }) })
        : base.fetch(url, init),
    }
    const { mount } = await import('../../test/mount.js')
    const { default: view } = await import('../web/view.js')
    const { document, root, dom } = await mount(view, api, `#/voyages/${encodeURIComponent(VOYAGE)}`)
    await settle()
    await settle()
    const seen = []
    dom.window.alert = (m) => seen.push(m)
    card(document).click()
    document.querySelector('[data-ecarter]').click()
    await settle()
    assert.deepEqual(seen, [`${head}conflit`])
    root.unmount()
  }
})
