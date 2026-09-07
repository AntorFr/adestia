/**
 * The layout mounts, and draws the period the server described.
 *
 * The mount matters more than the assertions. A plugin is imported at runtime,
 * in a browser, with no build to catch a typo in an import or a component that
 * was never defined — and a layout that throws takes a PAGE down, not a corner
 * of one. Rendering it once, against a real DOM and a fake api, moves that
 * failure back here.
 *
 * What is asserted beyond "it drew": that the face of a card stayed quiet. A
 * logged meal carries six nutrients, and the day one of them leaks onto a card
 * a fortnight of logging becomes three screens of scrolling.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const PERIOD = {
  page: 'sante/septembre.md',
  data: 'sante/assets/septembre.meals.json',
  revision: 'abc123',
  shape: {
    titre: 'Semaine type — septembre',
    debut: '2026-09-01',
    fin: '2026-09-02',
    sections: ['matin', 'midi', 'goûter', 'soir'],
  },
  items: [
    {
      id: 'yaourt',
      titre: 'Yaourt nature Malo',
      ico: '🥛',
      statut: 'confirme',
      jour: '2026-09-01',
      section: 'matin',
      quantite: '125 g',
      props: { 'énergie': '72 kcal', sel: '0,06 g' },
    },
    { id: 'oeufs', titre: 'Œufs brouillés', statut: 'suggestion', hint: 'Quand il reste du temps' },
  ],
}

test('the layout draws the frise, and the card keeps its detail back', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://instance.test/#/page/sante/septembre.md',
  })
  global.window = dom.window
  global.document = dom.window.document
  // Node owns `navigator` and will not let it be assigned; React only reads
  // it, so defining it is enough.
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  global.location = dom.window.location
  global.IS_REACT_ACT_ENVIRONMENT = false

  const [{ createRoot }, { default: layouts }, { createElement }] = await Promise.all([
    import('react-dom/client'),
    import('../web/layouts.js'),
    import('react'),
  ])

  const asked = []
  const api = {
    id: 'meals',
    base: '/plugins/meals/',
    locale: 'fr',
    fetch: (url) => {
      asked.push(url)
      return Promise.resolve({ ok: true, json: () => Promise.resolve(PERIOD) })
    },
  }

  const { types } = layouts(api)
  const root = createRoot(dom.window.document.getElementById('root'))
  root.render(createElement(types.meals, { path: 'sante/septembre.md', fields: { type: 'meals' } }))
  for (let tick = 0; tick < 8; tick += 1) await new Promise((done) => setTimeout(done, 0))

  const text = dom.window.document.getElementById('root').textContent
  assert.match(text, /Semaine type — septembre/)
  // Four sections because the PAGE declared four — the biscuit at four o'clock
  // is exactly what a log exists to catch.
  assert.match(text, /goûter/)
  assert.match(text, /Yaourt nature Malo/)
  assert.match(text, /Œufs brouillés/)
  // The quantity shows on the face; the nutrients wait for a click.
  assert.match(text, /125 g/)
  assert.equal(/72 kcal/.test(text), false)

  // One request, naming the PAGE. The layout is handed the page's frontmatter
  // too and deliberately ignores it: the server parses the same page to decide
  // what a placement may be, and two opinions about one page is how a screen
  // ends up disagreeing with the file it shows.
  assert.deepEqual(asked, ['/api/plugin/meals/period?page=sante%2Fseptembre.md'])

  root.unmount()
})
