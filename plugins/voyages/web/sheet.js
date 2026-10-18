/**
 * The card's sheet — the shell's dialog, drawn by hand.
 *
 * The contract is the plugin-author skill's, and a plugin has no helper to
 * borrow (AD-8): a `role="dialog"` named by its title, the scrim that closes
 * it, Escape that closes it, Tab that stays inside, and focus that goes back
 * to whatever opened it. The engine writes the CONTENT; everything a dialog
 * owes its reader is here, once.
 *
 * The scrim is created once and handed to the host, which places it in the
 * plugin's own subtree: unmounting the view takes it away, where a node on
 * `document.body` would have to be swept by hand (the leak the predecessor
 * left behind on every navigation).
 */

/** The shell mounts the sprite once; a plugin shares its names, not its code. */
export function iconHTML(name) {
  return `<svg class="adestia-icon" aria-hidden="true" focusable="false"><use href="#adestia-i-${name}"></use></svg>`
}

function node(tag, className, text) {
  const made = document.createElement(tag)
  if (className) made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function makeSheet(t) {
  const scrim = node('div', 'adestia-sheet vsheet')
  scrim.hidden = true
  let panel = null
  let opener = null
  let onClose = null

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab' && panel) {
      const controls = [...panel.querySelectorAll(FOCUSABLE)]
      if (!controls.length) return
      const first = controls[0]
      const last = controls.at(-1)
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) close()
  })

  function close() {
    if (scrim.hidden) return
    document.removeEventListener('keydown', onKey, true)
    scrim.hidden = true
    scrim.replaceChildren()
    panel = null
    const back = opener
    const done = onClose
    opener = null
    onClose = null
    // A gesture repaints the page and the card with it: only an opener still
    // in the document can take the focus back.
    if (back?.isConnected) back.focus()
    done?.()
  }

  /**
   * Open the sheet on one card.
   *
   * `bodyHTML` and `footHTML` are built by the engine, which escapes what it
   * puts in them; the title is text. The close button of the head and the one
   * of the foot do the same thing and both say « Close ».
   */
  function open({ title, bodyHTML, footHTML, from, closed }) {
    if (!scrim.hidden) close()
    opener = from ?? null
    onClose = closed ?? null
    panel = node('div', 'adestia-sheet__panel voyages-sheet')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    const head = node('header', 'adestia-sheet__head')
    const heading = node('h2', 'adestia-sheet__title', title)
    heading.id = 'voyages-sheet-title'
    panel.setAttribute('aria-labelledby', heading.id)
    const x = node('button', 'adestia-btn adestia-btn--ghost adestia-btn--sm adestia-btn--icon')
    x.type = 'button'
    x.setAttribute('aria-label', t('Close'))
    x.innerHTML = iconHTML('x')
    x.addEventListener('click', close)
    head.append(heading, x)
    const body = node('div', 'adestia-sheet__body')
    body.innerHTML = bodyHTML
    const foot = node('footer', 'adestia-sheet__foot')
    foot.innerHTML = footHTML
    const shut = node('button', 'adestia-btn adestia-btn--sm', t('Close'))
    shut.type = 'button'
    shut.addEventListener('click', close)
    foot.append(shut)
    panel.append(head, body, foot)
    scrim.replaceChildren(panel)
    scrim.hidden = false
    document.addEventListener('keydown', onKey, true)
    x.focus()
    return { panel, body, foot }
  }

  return { scrim, open, close }
}
