/**
 * The camera overlay.
 *
 * Raw DOM rather than React: a plugin ships JavaScript into the page and there
 * is no sandbox, so this is honest about what it is — and it keeps the chrome
 * contract to buttons rather than growing an overlay facet for one use case.
 */

import { words } from './chrome.js'
import { addCode, composeMessage, createBasket, dropCode, FORMATS } from './codes.js'

/** Native where it exists — Android and Chrome desktop — zxing elsewhere. */
async function makeDecoder() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const supported = await globalThis.BarcodeDetector.getSupportedFormats()
      const formats = FORMATS.filter((format) => supported.includes(format))
      if (formats.length > 0) {
        const detector = new globalThis.BarcodeDetector({ formats })
        return async (video) => (await detector.detect(video)).map((result) => result.rawValue)
      }
    } catch {
      /* fall through to zxing */
    }
  }
  // ~140 kB, loaded only where the native one is missing. This is what makes
  // iOS work, and what nobody else has to download.
  const { decodeFrame } = await import(new URL('./decoder.js', import.meta.url))
  return decodeFrame
}

export async function openScanner(api, t = words(api?.locale)) {
  // Whoever opened the reader gets the focus back when it closes.
  const opener = document.activeElement
  const stream = await navigator.mediaDevices.getUserMedia({
    // The rear camera, without demanding it: `exact` fails outright on a
    // laptop, where the front camera is the only one and works fine.
    video: { facingMode: { ideal: 'environment' } },
  })

  const basket = createBasket()
  const overlay = document.createElement('div')
  overlay.className = 'scan-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', t('Scan barcodes'))
  overlay.innerHTML = `
    <video class="scan-video" playsinline muted></video>
    <div class="scan-panel">
      <ul class="scan-basket"></ul>
      <div class="scan-actions">
        <button type="button" class="scan-cancel" aria-label="${t('Cancel scanning')}">${t('Cancel')}</button>
        <button type="button" class="scan-done" disabled>${t('Add to message')}</button>
      </div>
    </div>`
  document.body.append(overlay)

  const video = overlay.querySelector('.scan-video')
  const list = overlay.querySelector('.scan-basket')
  const done = overlay.querySelector('.scan-done')
  video.srcObject = stream
  await video.play()

  let running = true
  const close = () => {
    if (!running) return
    running = false
    document.removeEventListener('keydown', onKey, true)
    for (const track of stream.getTracks()) track.stop()
    overlay.remove()
    // On a phone the composer's fold removes the scan button while the reader
    // is open: with no opener left, the focus goes to the composer's field.
    if (opener?.isConnected) opener.focus()
    else document.querySelector('.adestia-composer__input')?.focus()
  }
  // Escape closes it exactly as « cancel » does; Tab stays inside the overlay.
  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('button:not(:disabled)')]
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!overlay.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
  document.addEventListener('keydown', onKey, true)
  overlay.querySelector('.scan-cancel').focus()

  const paint = () => {
    list.replaceChildren(
      ...basket.codes.map((code) => {
        const item = document.createElement('li')
        item.className = 'scan-code'
        item.textContent = code
        const remove = document.createElement('button')
        remove.type = 'button'
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('class', 'adestia-icon')
        icon.setAttribute('aria-hidden', 'true')
        icon.setAttribute('focusable', 'false')
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', '#adestia-i-x')
        icon.append(use)
        remove.append(icon)
        remove.setAttribute('aria-label', t('Remove this code'))
        remove.title = t('Remove this code')
        remove.addEventListener('click', () => {
          dropCode(basket, code)
          paint()
        })
        item.append(remove)
        return item
      }),
    )
    done.disabled = basket.codes.length === 0
    done.textContent =
      basket.codes.length === 0
        ? t('Add to message')
        : t('Add %n to message', { n: basket.codes.length })
  }

  overlay.querySelector('.scan-cancel').addEventListener('click', close)
  done.addEventListener('click', () => {
    // Accumulate, then deposit ONCE. The conversation commands.
    api.compose(composeMessage('', basket.codes))
    close()
  })

  const decode = await makeDecoder()
  const loop = async () => {
    while (running) {
      try {
        for (const value of await decode(video)) {
          if (addCode(basket, value)) paint()
        }
      } catch {
        // A frame that will not decode is the normal case, not an error.
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  void loop()
  paint()
}
