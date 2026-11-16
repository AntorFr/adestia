/**
 * What bench/tests/plugins-chargements-retry-besoin.test.mjs proved through a browser about the
 * route map's Retry and that the module does: a Retry answered by a failure gives the failure
 * back (one fetch per press, never the loading row and the failure together), and a Retry
 * answered 404 or 403 says the message and offers no second Retry.
 * See docs/tests-ecran/bench-plugins-shell.md.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const later = () => new Promise((r) => setTimeout(r, 15))

async function boot() {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://i.test/' })
  global.window = dom.window
  global.document = dom.window.document
  global.Image = dom.window.Image
  global.requestAnimationFrame ??= (f) => setTimeout(f, 0)
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  const { mountParcours } = await import('../web/carte.js')
  return (vue) => {
    const hote = globalThis.document.createElement('div')
    globalThis.document.body.appendChild(hote)
    mountParcours(hote, { src: '/x', chemin: 'a/v.parcours.json', locale: 'en', vue, urls: { gpx: (p) => `/gpx?f=${p}`, page: (p) => `#/parcours/${p}` } })
    return hote
  }
}

for (const vue of ['carte', 'lien']) {
  test(`${vue}: a Retry answered by a failure gives the message and Retry back, one fetch per press`, async () => {
    const mount = await boot()
    let calls = 0
    global.fetch = async () => { calls += 1; return reply({}, 500) }
    const hote = mount(vue)
    await later()
    assert.equal(calls, 1)
    hote.querySelector('.adestia-btn').click()
    await later()
    assert.equal(calls, 2, 'one press, one fetch')
    assert.equal(hote.querySelector('.adestia-empty__text').textContent, 'Unreadable route.')
    assert.equal(hote.querySelector('.adestia-empty__action .adestia-btn').textContent.trim(), 'Retry')
    assert.equal(hote.querySelector('.adestia-loading'), null)
    assert.equal(hote.querySelector('.pc-ready, .pc-vide, .pc-card-t'), null, 'no map is drawn')
  })

  for (const status of [404, 403]) {
    test(`${vue}: a Retry answered ${status} says the message and offers no second Retry`, async () => {
      const mount = await boot()
      let answer = 500
      global.fetch = async () => reply({}, answer)
      const hote = mount(vue)
      await later()
      answer = status
      hote.querySelector('.adestia-btn').click()
      await later()
      assert.equal(hote.querySelector('.adestia-empty__text').textContent, 'Unreadable route.')
      assert.equal(hote.querySelector('.adestia-btn'), null)
      assert.equal(hote.querySelector('.adestia-loading'), null)
    })
  }
}
