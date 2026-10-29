/**
 * The counters of the voyages agree in number, in the instance's language.
 *
 * « 1 confirmée » / « 2 confirmées », « 1 écartée » / « 3 écartées » in French;
 * « 1 confirmed » / « 2 confirmed », « 1 dismissed » / « 3 dismissed » in English.
 * Each French form is a whole table entry: no `s` is glued on a translated word,
 * and no placeholder (`%one`, `%n`) reaches the screen.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { mount, settle } from '../../test/mount.js'
import view from '../web/view.js'
import { DATA, VOYAGE, apiFor, mountTrip, respond, texts } from './trip-fixture.js'

const hubOf = async (locale, voyages) => {
  const api = apiFor(locale)
  const fetch = api.fetch
  api.fetch = (url, init) => (url.endsWith('/voyages') ? respond({ voyages }) : fetch(url, init))
  const mounted = await mount(view, api, '#/voyages')
  await settle()
  await settle()
  return mounted
}

const WORDS = {
  fr: { confirmed: (n) => (n > 1 ? `${n} confirmées` : `${n} confirmée`), dismissed: (n) => (n > 1 ? `${n} écartées` : `${n} écartée`) },
  en: { confirmed: (n) => `${n} confirmed`, dismissed: (n) => `${n} dismissed` },
}

for (const locale of ['fr', 'en']) {
  test(`the hub card counts confirmed items by number (${locale})`, async () => {
    const voyages = [1, 2, 7].map((n) => ({ path: `${VOYAGE}-${n}`, titre: `Trip ${n}`, confirmes: n, suggestions: 0 }))
    const { document, root } = await hubOf(locale, voyages)
    const tags = [...document.querySelectorAll('.vhub-card .tag')].map((tag) => tag.textContent.trim())
    assert.deepEqual(tags, [1, 2, 7].map(WORDS[locale].confirmed))
    assert.ok(!texts(document).some((text) => /%(one|n)\b/.test(text)), 'no placeholder on screen')
    root.unmount()
  })

  for (const dismissed of [1, 3]) {
    test(`the tray counts ${dismissed} dismissed item(s) by number (${locale})`, async () => {
      const log = []
      const data = { ...DATA, items: [...DATA.items.filter((i) => i.statut !== 'ecartee'),
        ...Array.from({ length: dismissed }, (_, k) => ({ id: `out${k}`, type: 'activite', titre: `Out ${k}`, statut: 'ecartee' }))] }
      const api = apiFor(locale, log)
      const fetch = api.fetch
      api.fetch = (url, init) => (url.includes('/voyage?') ? respond(data) : fetch(url, init))
      const { document, root } = await mount(view, api, `#/voyages/${encodeURIComponent(VOYAGE)}`)
      await settle()
      await settle()
      assert.equal(document.querySelector('.eclink').textContent.replace(/[▾▸]/g, '').trim(), WORDS[locale].dismissed(dismissed))
      root.unmount()
    })
  }
}

test('the trip page still mounts with the fixture (guard for the helper above)', async () => {
  const { document, root } = await mountTrip('fr')
  assert.match(document.querySelector('.eclink').textContent, /1 écartée(?!s)/)
  root.unmount()
})
