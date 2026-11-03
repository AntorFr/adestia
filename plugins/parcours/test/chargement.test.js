/**
 * B-18 for E-28: the route map (page, `:::parcours` block, link view) shows the shell's
 * loading row while it fetches; on failure, a message and Retry that refetches in the
 * same host (no Retry on 404/401/403); nothing is painted after unmount.
 * Expected strings are written out, not read from the code.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const gate = () => { let open; const wait = new Promise((r) => { open = r }); return { wait, open } }
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const later = () => new Promise((r) => setTimeout(r, 15))
const GOOD = { titre: 'Val', reperes: [], trace: {} }

async function boot() {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://i.test/' })
  global.window = dom.window
  global.document = dom.window.document
  global.Image = dom.window.Image
  global.requestAnimationFrame ??= (f) => setTimeout(f, 0)
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  const { mountParcours } = await import('../web/carte.js')
  return (locale, vue) => {
    const hote = globalThis.document.createElement('div')
    globalThis.document.body.appendChild(hote)
    const off = mountParcours(hote, { src: '/x', chemin: 'a/v.parcours.json', locale, vue, urls: { gpx: (p) => `/gpx?f=${p}`, page: (p) => `#/parcours/${p}` } })
    return { hote, off }
  }
}

for (const vue of ['carte', 'lien']) {
  for (const [locale, loading, message, retry] of [
    ['en', 'Loading…', 'Unreadable route.', 'Retry'],
    ['fr', 'Chargement…', 'Parcours illisible.', 'Réessayer'],
  ]) {
    test(`${vue}/${locale}: loading row before the data`, async () => {
      const mount = await boot()
      const g = gate()
      global.fetch = async () => { await g.wait; return reply(GOOD) }
      const { hote } = mount(locale, vue)
      const row = hote.querySelector('.adestia-loading')
      assert.ok(row)
      assert.equal(row.getAttribute('role'), 'status')
      assert.equal(row.textContent.trim(), loading)
      g.open(); await later()
      assert.equal(hote.querySelector('.adestia-loading'), null)
    })

    for (const [name, handler] of [
      ['a 500', async () => reply({}, 500)],
      ['a network error', async () => { throw new Error('offline') }],
      ['a 200 that is not JSON', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x') } })],
    ]) {
      test(`${vue}/${locale}: ${name} gives message and Retry, Retry reloads and paints`, async () => {
        const mount = await boot()
        let healthy = false
        global.fetch = async () => (healthy ? reply(GOOD) : handler())
        const { hote } = mount(locale, vue)
        await later()
        const block = hote.querySelector('.adestia-empty')
        assert.ok(block)
        assert.equal(block.classList.contains('adestia-empty--inline'), vue === 'lien')
        assert.equal(block.classList.contains('adestia-empty--state'), vue !== 'lien')
        assert.equal(hote.querySelector('.adestia-empty__text').textContent, message)
        const button = hote.querySelector('.adestia-empty__action .adestia-btn')
        assert.equal(button.textContent.trim(), retry)
        assert.equal(hote.querySelector('.adestia-loading'), null)
        healthy = true
        const g = gate(); const inner = global.fetch
        let calls = 0
        global.fetch = async (...a) => { calls += 1; await g.wait; return inner(...a) }
        button.click(); button.click()
        assert.equal(button.disabled, true)
        assert.ok(hote.querySelector('.adestia-loading'))
        assert.equal(hote.querySelector('.adestia-empty'), null)
        g.open(); await later()
        assert.equal(calls, 1, 'one refetch')
        assert.equal(hote.querySelector('.adestia-empty'), null)
        assert.equal(hote.querySelector('.adestia-loading'), null)
        assert.ok(hote.querySelector('.pc-ready, .pc-vide, .pc-card-t'), 'the map is drawn')
      })
    }
  }
}

for (const status of [404, 401, 403]) {
  test(`a ${status} says the message and offers no Retry`, async () => {
    const mount = await boot()
    global.fetch = async () => reply({}, status)
    const { hote } = mount('en', 'carte')
    await later()
    assert.equal(hote.querySelector('.adestia-empty__text').textContent, 'Unreadable route.')
    assert.equal(hote.querySelector('.adestia-btn'), null)
  })
}

test('a failure after unmount paints nothing', async () => {
  const mount = await boot()
  const g = gate()
  global.fetch = async () => { await g.wait; return reply({}, 500) }
  const { hote, off } = mount('en', 'carte')
  off(); hote.textContent = ''
  g.open(); await later()
  assert.equal(hote.textContent, '')
})

test('Retry pressed, then unmounted before the answer: nothing is painted', async () => {
  const mount = await boot()
  let healthy = false
  global.fetch = async () => (healthy ? reply(GOOD) : reply({}, 500))
  const { hote, off } = mount('en', 'carte')
  await later()
  const g = gate(); const inner = global.fetch
  healthy = true
  global.fetch = async (...a) => { await g.wait; return inner(...a) }
  hote.querySelector('.adestia-btn').click()
  off(); hote.textContent = ''
  g.open(); await later()
  assert.equal(hote.textContent, '')
})
