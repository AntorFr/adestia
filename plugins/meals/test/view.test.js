/**
 * The two halves a unit test can reach: the addresses the plugin answers to,
 * and the fact that its screen mounts at all.
 *
 * The mount matters more than the assertions. A plugin is imported at runtime,
 * in a browser, with no build to catch a typo in an import or a component that
 * was never defined — so the failure lands on whoever opened the page.
 * Rendering it once, against a real DOM and a fake api, moves that failure
 * back here.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { folderOf, pathOf, routeOf } from '../web/route.js'

const PLAN = {
  version: 1,
  titre: 'Corse — la semaine',
  debut: '2026-08-08',
  fin: '2026-08-09',
  sections: ['matin', 'midi', 'soir'],
  items: [
    {
      id: 'burrata',
      titre: 'Pâtes à la burrata',
      ico: '🍝',
      statut: 'confirme',
      jour: '2026-08-08',
      section: 'soir',
      quantite: 'pour 4',
      props: { 'pâtes': '500 g', burrata: '2 boules' },
    },
    { id: 'poulet', titre: 'Poulet au citron', statut: 'suggestion', hint: 'Pendant la plage' },
  ],
}

test('an address encodes its segments and leaves the slashes alone', () => {
  assert.equal(
    routeOf('voyages/corse 2026/semaine.meals.json'),
    '#/meals/voyages/corse%202026/semaine.meals.json',
  )
  assert.equal(pathOf('#/meals/voyages/corse%202026/semaine.meals.json'), 'voyages/corse 2026/semaine.meals.json')
  // Round trip, and the shapes a hand-typed or older link may take.
  assert.equal(pathOf(routeOf('a/b.meals.json')), 'a/b.meals.json')
  assert.equal(pathOf('#/meals'), undefined)
  assert.equal(pathOf('#/meals/'), undefined)
  // Another screen's hash is not a period with a strange name.
  assert.equal(pathOf('#/page/x'), undefined)
  assert.equal(pathOf('#/mealsy/x'), undefined)
  // A stray `%` leaves the path readable rather than throwing out of the router.
  assert.equal(pathOf('#/meals/100%.meals.json'), '100%.meals.json')
})

test('the folder a period hangs off, with or without an assets/', () => {
  assert.equal(folderOf('voyages/corse/semaine.meals.json'), 'voyages/corse')
  assert.equal(folderOf('voyages/corse/assets/semaine.meals.json'), 'voyages/corse')
  assert.equal(folderOf('semaine.meals.json'), '')
})

test('the standalone view is a route with no tile', async () => {
  const { default: view } = await import('../web/view.js')
  const contribution = view({ id: 'meals', locale: 'fr' })
  assert.equal(contribution.route, '/meals')
  assert.equal(typeof contribution.component, 'function')
  // A period is not an app: nothing to launch from the home.
  assert.equal(contribution.tile, undefined)
})

test('the block mounts, and draws the frise it promised', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://instance.test/#/page/voyages/corse/semaine.md',
  })
  global.window = dom.window
  global.document = dom.window.document
  // Node owns `navigator` and will not let it be assigned; React only reads
  // it, so defining it is enough.
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  global.location = dom.window.location
  global.IS_REACT_ACT_ENVIRONMENT = false

  const [{ createRoot }, { default: blocks }, { createElement }] = await Promise.all([
    import('react-dom/client'),
    import('../web/blocks.js'),
    import('react'),
  ])

  const asked = []
  const api = {
    id: 'meals',
    base: '/plugins/meals/',
    locale: 'fr',
    fetch: (url) => {
      asked.push(url)
      const body = url.includes('/api/plugin/meals/state') ? { items: {} } : PLAN
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    },
  }

  const { tags } = blocks(api)
  const root = createRoot(dom.window.document.getElementById('root'))
  root.render(
    createElement(tags.meals, {
      attributes: { source: 'semaine.meals.json' },
      resolve: (path) => `/api/files/voyages/corse/${path}`,
      locate: (path) => `voyages/corse/${path}`,
    }),
  )
  // Two fetches land before the first painted frame; let both settle.
  for (let tick = 0; tick < 8; tick += 1) await new Promise((done) => setTimeout(done, 0))

  const text = dom.window.document.getElementById('root').textContent
  assert.match(text, /Corse — la semaine/)
  // A placed card, in its day, and a waiting one in the tray.
  assert.match(text, /Pâtes à la burrata/)
  assert.match(text, /Poulet au citron/)
  // The face is quiet: the quantity shows, the props wait for a click.
  assert.match(text, /pour 4/)
  assert.equal(/500 g/.test(text), false)
  // Both halves of the file were asked for, by the two names of one file.
  assert.equal(asked.some((url) => url === '/api/files/voyages/corse/semaine.meals.json'), true)
  assert.equal(
    asked.some((url) => url.includes('state?f=voyages%2Fcorse%2Fsemaine.meals.json')),
    true,
  )

  root.unmount()
})
