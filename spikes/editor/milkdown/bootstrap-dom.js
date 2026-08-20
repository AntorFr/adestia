// Headless DOM bootstrap. Must be evaluated BEFORE any Milkdown /
// ProseMirror module, because prosemirror-view captures `navigator` /
// `document` at module-evaluation time for browser sniffing.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true, // provides requestAnimationFrame
})

const { window } = dom

const globalsToCopy = [
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Text',
  'Document',
  'DocumentFragment',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'CustomEvent',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'InputEvent',
  'DOMParser',
  'XMLSerializer',
  'Range',
  'Selection',
  'ClipboardEvent',
  'DragEvent',
]

Object.defineProperty(globalThis, 'window', {
  value: window,
  configurable: true,
  writable: true,
})

for (const key of globalsToCopy) {
  if (!(key in window)) continue
  try {
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    })
  } catch {
    // Node-provided read-only globals we cannot replace: ignore.
  }
}

if (typeof globalThis.getSelection !== 'function')
  globalThis.getSelection = window.getSelection.bind(window)

// @milkdown/ctx timers use the bare window event API as globals.
for (const fn of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
  if (typeof globalThis[fn] !== 'function')
    globalThis[fn] = window[fn].bind(window)
}
