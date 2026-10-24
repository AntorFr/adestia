/**
 * The camera reader mounted in a test DOM, with a camera that is a stub.
 *
 * The reader takes the sheet's contract: a modal dialog, Escape that closes it
 * as « cancel » does and stops the camera, the focus handed back to whoever
 * opened it. Its words go through the plugin's table, and the per-code remove
 * button is a named icon, not a bare ×.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

import { openScanner } from '../web/scanner.js'

/** A fresh page, a fake camera, a detector that sees `codes` on every frame. */
async function mount(t, { locale = 'en', codes = [], onCompose = () => {} } = {}) {
  const { window } = new JSDOM('<body><button id="opener">Scan</button></body>')
  const stops = { count: 0 }
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => { stops.count += 1 } }],
        }),
      },
    },
  })
  window.HTMLMediaElement.prototype.play = async () => {}
  globalThis.BarcodeDetector = class {
    static getSupportedFormats = async () => ['ean_13', 'qr_code', 'code_128']
    detect = async () => codes.map((rawValue) => ({ rawValue }))
  }
  const opener = window.document.getElementById('opener')
  opener.focus()
  await openScanner({ locale, compose: onCompose })
  const overlay = () => window.document.querySelector('.scan-overlay')
  const press = (key, init = {}) => {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    ;(window.document.activeElement ?? window.document.body).dispatchEvent(event)
    return event
  }
  // The decode loop runs until the reader closes: leave none running.
  t.after(() => { if (overlay()) press('Escape') })
  return { window, stops, opener, overlay, press }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('the reader is a modal dialog with a name', async (t) => {
  const { overlay } = await mount(t)
  const node = overlay()
  assert.equal(node.getAttribute('role'), 'dialog')
  assert.equal(node.getAttribute('aria-modal'), 'true')
  assert.notEqual(node.getAttribute('aria-label') ?? '', '')
  const cancel = node.querySelector('.scan-cancel')
  assert.equal(cancel.textContent, 'Cancel')
  assert.notEqual(cancel.getAttribute('aria-label') ?? '', '')
  assert.equal(node.querySelector('.scan-done').textContent, 'Add to message')
})

test('Escape removes the reader, stops the camera and gives the focus back', async (t) => {
  const { overlay, stops, opener, press, window } = await mount(t)
  assert.notEqual(window.document.activeElement, opener, 'the reader takes the focus while open')
  const event = press('Escape')
  assert.equal(event.defaultPrevented, true)
  assert.equal(overlay(), null)
  assert.equal(stops.count, 1)
  assert.equal(window.document.activeElement, opener)
})

test('Escape twice, or Escape after cancel, stops the camera once', async (t) => {
  const { overlay, stops, press, window } = await mount(t)
  window.document.querySelector('.scan-cancel').click()
  assert.equal(overlay(), null)
  press('Escape')
  assert.equal(stops.count, 1)
})

test('cancel closes it like Escape: camera stopped, focus back on the opener', async (t) => {
  const { overlay, stops, opener, window } = await mount(t)
  window.document.querySelector('.scan-cancel').click()
  assert.equal(overlay(), null)
  assert.equal(stops.count, 1)
  assert.equal(window.document.activeElement, opener)
})

test('Escape does not move the focus onto an opener that left the page', async (t) => {
  const { press, opener, window } = await mount(t)
  opener.remove()
  assert.doesNotThrow(() => press('Escape'))
  assert.notEqual(window.document.activeElement, opener)
})

test('Tab does not leave the reader, either way round', async (t) => {
  const { overlay, press, window } = await mount(t)
  const cancel = window.document.querySelector('.scan-cancel')
  cancel.focus()
  // Only « cancel » is enabled while the basket is empty.
  assert.equal(press('Tab').defaultPrevented, true)
  assert.ok(overlay().contains(window.document.activeElement))
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  assert.ok(overlay().contains(window.document.activeElement))
})

test('a scanned code gets an icon button named « Remove this code »', async (t) => {
  const { window } = await mount(t, { codes: ['3017620422003'] })
  await settle()
  const remove = window.document.querySelector('.scan-code button')
  assert.ok(remove, 'the code is in the basket')
  assert.equal(remove.getAttribute('aria-label'), 'Remove this code')
  assert.equal(remove.title, 'Remove this code')
  assert.equal(remove.textContent.trim(), '', 'no × glyph')
  assert.equal(remove.querySelector('use').getAttribute('href'), '#adestia-i-x')
  assert.equal(window.document.querySelector('.scan-done').textContent, 'Add 1 to message')
})

test('in French the reader says its own words', async (t) => {
  const { window } = await mount(t, { locale: 'fr', codes: ['3017620422003'] })
  await settle()
  const root = window.document.querySelector('.scan-overlay')
  assert.equal(root.querySelector('.scan-cancel').textContent, 'Annuler')
  assert.equal(root.querySelector('.scan-done').textContent, 'Ajouter 1 au message')
  const remove = root.querySelector('.scan-code button')
  assert.equal(remove.getAttribute('aria-label'), 'Retirer ce code')
  assert.equal(remove.title, 'Retirer ce code')
})

test('in French with an empty basket, « Ajouter au message »', async (t) => {
  const { window } = await mount(t, { locale: 'fr' })
  assert.equal(window.document.querySelector('.scan-done').textContent, 'Ajouter au message')
})

test('adding deposits the codes once, closes and stops the camera', async (t) => {
  const composed = []
  const { window, overlay, stops } = await mount(t, { codes: ['3017620422003'], onCompose: (text) => composed.push(text) })
  await settle()
  window.document.querySelector('.scan-done').click()
  assert.equal(composed.length, 1)
  assert.match(composed[0], /3017620422003/)
  assert.equal(overlay(), null)
  assert.equal(stops.count, 1)
})
