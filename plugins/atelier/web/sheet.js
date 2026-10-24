/**
 * The piece's sheet — the shell's dialog, drawn by hand.
 *
 * A plugin imports no shell code (AD-8), so the contract of the plugin-author
 * skill is carried here, once: a `role="dialog"` named by its title, the scrim
 * that closes it, Escape that closes it, Tab that stays inside, and focus that
 * goes back to whatever opened it. The engine writes the CONTENT.
 *
 * `trap` is shared with the full-screen bench mode, which owes its reader the
 * same keyboard.
 */

/** The shell mounts the sprite once; a plugin shares its names, not its code. */
export function iconHTML(name) {
  return `<svg class="adestia-icon" aria-hidden="true" focusable="false"><use href="#adestia-i-${name}"></use></svg>`
}

export function node(tag, className, text) {
  const made = document.createElement(tag)
  if (className) made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Keep Tab inside `box`: the end wraps to the start, a stray focus comes back in. */
export function trap(event, box) {
  const controls = [...box.querySelectorAll(FOCUSABLE)]
  if (event.key !== 'Tab' || !controls.length) return
  const active = document.activeElement
  const edge = event.shiftKey ? controls[0] : controls.at(-1)
  if (!box.contains(active) || active === edge) {
    event.preventDefault()
    ;(event.shiftKey ? controls.at(-1) : controls[0]).focus()
  }
}

export function makeSheet(t) {
  const scrim = node('div', 'adestia-sheet atelier-sheet')
  scrim.hidden = true
  let panel = null
  let opener = null

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (panel) trap(event, panel)
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
    opener = null
    // A gesture repaints the page and the piece with it: only an opener still
    // in the document can take the focus back.
    if (back?.isConnected) back.focus()
  }

  /**
   * Open the sheet; the engine fills the `body` and `foot` it gets back.
   * Opened again from inside (a piece named in a column), it keeps the
   * ORIGINAL opener: the link that was clicked is about to be replaced.
   */
  function open({ title, from }) {
    const kept = scrim.hidden ? (from ?? null) : opener
    if (!scrim.hidden) {
      document.removeEventListener('keydown', onKey, true)
      scrim.hidden = true
    }
    opener = kept
    panel = node('div', 'adestia-sheet__panel atelier-sheet__panel')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    const head = node('header', 'adestia-sheet__head')
    const heading = node('h2', 'adestia-sheet__title', title)
    heading.id = 'atelier-sheet-title'
    panel.setAttribute('aria-labelledby', heading.id)
    const x = node('button', 'adestia-btn adestia-btn--ghost adestia-btn--sm adestia-btn--icon')
    x.type = 'button'
    x.setAttribute('aria-label', t('Close'))
    x.innerHTML = iconHTML('x')
    x.addEventListener('click', close)
    head.append(heading, x)
    const body = node('div', 'adestia-sheet__body')
    const foot = node('footer', 'adestia-sheet__foot actions')
    panel.append(head, body, foot)
    scrim.replaceChildren(panel)
    scrim.hidden = false
    document.addEventListener('keydown', onKey, true)
    x.focus()
    return { body, foot, close }
  }

  return { scrim, open, close }
}
