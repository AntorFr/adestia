/**
 * The two halves of a view that a unit test can reach: the addresses it
 * answers to for the SHELL, and the fact that it mounts at all.
 *
 * The mount matters more here than the assertions do. A plugin is imported at
 * runtime, in a browser, with no build to catch a typo in an import or a
 * component that was never defined — so the failure lands on whoever opened
 * the tile. Rendering it once, against a real DOM and a fake api, is what
 * moves that failure back here.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { buildLibrary, resolve, routeFor, routeOf } from '../web/model.js'

const INDEX = {
  entries: [
    {
      path: 'veille/moteur-audio.md',
      title: 'Le moteur audio',
      fields: {
        type: 'ecoute',
        url: 'https://www.youtube.com/watch?v=AAA',
        media: 'video',
        source: 'Underscore_',
        publie: '2026-08-27',
        duree: '18:42',
        tags: ['audio'],
      },
      finished: false,
    },
    {
      path: 'domaines/audio/moteur-audio.md',
      title: 'Un homonyme',
      fields: { type: 'ecoute', url: 'https://exemple.fr/12' },
      finished: true,
    },
    {
      path: 'veille/episode-12.md',
      title: 'Épisode 12',
      fields: { type: 'ecoute', media: 'audio' },
      finished: false,
    },
    { path: 'notes/veille.md', title: 'Une note', fields: { type: 'note' }, finished: false },
  ],
}

const library = buildLibrary(INDEX.entries)

test('the library is the pages typed ecoute, newest first', () => {
  assert.deepEqual(library.map((item) => item.titre), [
    'Le moteur audio',
    'Un homonyme',
    'Épisode 12',
  ])
  assert.equal(library[0].media, 'video')
  assert.equal(library[2].media, 'audio')
  assert.equal(library[1].finished, true)
})

test('an item is addressed by name, and a shared name falls back to the path', () => {
  assert.equal(routeOf(library, 'veille/episode-12.md'), '/listening-post/episode-12')
  // Two items are called `moteur-audio`: a pretty link that opens the wrong
  // one is worse than an ugly one.
  assert.equal(
    routeOf(library, 'veille/moteur-audio.md'),
    '/listening-post/veille/moteur-audio.md',
  )
})

test('every address ever written resolves back to its page', () => {
  assert.equal(resolve(library, '/episode-12'), 'veille/episode-12.md')
  assert.equal(resolve(library, '/veille/moteur-audio.md'), 'veille/moteur-audio.md')
  assert.equal(resolve(library, '/veille%2Fmoteur-audio.md'), 'veille/moteur-audio.md')
  assert.equal(resolve(library, '/moteur-audio'), null, 'an ambiguous name resolves to nothing')
  assert.equal(resolve(library, ''), null)
})

test('a transcript belongs to the screen of the item it transcribes', () => {
  assert.equal(
    routeFor(library, 'veille/assets/episode-12.transcript.txt'),
    '/listening-post/episode-12',
  )
  assert.equal(routeFor(library, 'veille/assets/episode-12.media.json'), '/listening-post/episode-12')
})

test('a path this view has no screen for gets no answer, rather than a guess', () => {
  assert.equal(routeFor(library, 'notes/veille.md'), undefined)
  assert.equal(routeFor(library, 'veille'), undefined, 'the folder itself is the shell’s own rule')
  assert.equal(routeFor(library, 'veille/assets/orphelin.transcript.txt'), undefined)
})

test('the view mounts, draws what is kept, and says where it is', async () => {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://instance.test/#/listening-post',
  })
  global.window = dom.window
  global.document = dom.window.document
  // Node owns `navigator` and will not let it be assigned; React only reads
  // it, so defining it is enough.
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  global.location = dom.window.location
  global.IS_REACT_ACT_ENVIRONMENT = false

  const [{ createRoot }, { default: view }] = await Promise.all([
    import('react-dom/client'),
    import('../web/app.js'),
  ])
  const { createElement } = await import('react')

  const asked = []
  const trail = []
  const api = {
    id: 'listening-post',
    base: '/plugins/listening-post/',
    locale: 'fr',
    fetch: (url) => {
      const answers = {
        '/api/pages/index': INDEX,
        '/api/plugin/listening-post/queue': {
          items: [
            {
              key: 'yt:BBB',
              url: 'https://www.youtube.com/watch?v=BBB',
              titre: 'Une nouveauté du flux',
              source: 'Underscore_',
              media: 'video',
              publie: '2026-08-30T00:00:00.000Z',
              duree: '12:00',
              tags: ['tech'],
              origine: 'flux',
            },
          ],
          sources: [{ id: 'underscore', ok: true, count: 1 }],
          problems: [],
        },
        '/api/plugin/listening-post/health': { transcriber: null },
      }
      const body = answers[String(url)]
      return Promise.resolve(
        body ? { ok: true, json: () => Promise.resolve(body) } : { ok: false, status: 404 },
      )
    },
    ask: (prompt) => asked.push(prompt),
    compose() {},
    trail: (crumbs) => trail.push(crumbs),
    PageEditor: () => null,
  }

  const contribution = view(api)
  assert.equal(contribution.route, '/listening-post')

  const root = createRoot(dom.window.document.getElementById('root'))
  root.render(createElement(contribution.component))
  // Effects, then the two fetches they start, then the render they cause.
  for (let turn = 0; turn < 8; turn += 1) await new Promise((done) => setTimeout(done, 0))

  const text = dom.window.document.body.textContent
  assert.match(text, /Le moteur audio/, 'a kept item is on the shelf')
  assert.match(text, /Une nouveauté du flux/, 'a feed candidate is in the queue')
  assert.match(text, /Underscore_ · 27 août 2026 · 18:42/, 'its meta line reads in the locale')
  assert.match(text, /Archive · 1/, 'a finished item is folded away rather than dropped')
  assert.match(text, /pas de transcripteur/, 'an instance without yt-dlp says so')
  assert.deepEqual(trail.at(-1), [], 'the hub says it is nowhere in particular')

  // The ✦ button talks to the agent rather than writing anything itself.
  const extract = [...dom.window.document.querySelectorAll('button')].find((button) =>
    button.textContent.includes('extraire'),
  )
  assert.ok(extract, 'a candidate offers an extraction')
  extract.click()
  assert.equal(asked.length, 1)
  assert.match(asked[0], /https:\/\/www\.youtube\.com\/watch\?v=BBB/)

  root.unmount()
})
