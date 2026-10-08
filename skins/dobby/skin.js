/**
 * Dobby — the library's familiar, a personal body. It greets the person the
 * identity provider names, and Madame when there is nobody to name.
 *
 * A college library after dark. Dobby speaks of himself in the third person,
 * as the house-elf does, and that is the whole of the borrowing: the sock on
 * the seal is a wink, never a lettering or a crest lifted from the books.
 *
 * The landing head is a BOOKPLATE — the one place a library writes whose book
 * this is — beside the greeting. Everything under it stays the shell's.
 *
 * NO `console` slot: a reading room has no status band, and one that could
 * only assert calm without measuring it would be décor that lies. The candle
 * already says "Dobby is working", at the moment it is true.
 */

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/* The sock: cuff, leg, heel, toe. One silhouette for the crest, the
   bookplate and the icon, in currentColor so each wears its own metal. */
const CHAUSSETTE =
  '<path d="M33 10h32a2 2 0 0 1 2 2v12H31V12a2 2 0 0 1 2-2z"/>' +
  '<path d="M33 28h32v28c0 4 2 6.5 5.5 8.5l13 7.5c8 4.6 4.8 17.5-4.5 17L49 87.5C38.5 86.8 31.5 78 33 67.5z"/>'

const PLUME =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M4 20c4-7 8-12 16-16-1 6-5 10-11 11M4 20l5-5"/></svg>'

/** The bookplate and the greeting — the head of the landing. */
function hero(host, context) {
  // The bookplate carries the whole name, as a bookplate does; the greeting
  // only the first, as one speaks to a person. `user` is there only under
  // OIDC — a local instance has nobody to name.
  const nom = context.user?.displayName?.trim() || 'Madame'
  const prenom = nom.split(/\s+/)[0]
  const h = new Date().getHours()
  const salut = h >= 5 && h < 18 ? `Bonjour, ${prenom}.` : `Bonsoir, ${prenom}.`
  const aparte =
    h >= 22 || h < 5
      ? 'Dobby garde la chandelle allumée. Que doit-il chercher ?'
      : 'Dobby est à votre service. Que doit-il chercher ?'

  host.innerHTML = `<div class="dby-hero">
    <div class="dby-exlibris" aria-hidden="true">
      <small>EX LIBRIS</small>
      <svg viewBox="0 0 100 100" fill="currentColor">${CHAUSSETTE}</svg>
      <b>${esc(nom)}</b>
    </div>
    <div class="dby-salut">
      <h1>${esc(salut)}</h1>
      <p>${esc(aparte)}</p>
      <button class="dby-plume" type="button" data-plume>${PLUME}<span>Demander à Dobby…</span></button>
    </div>
  </div>`

  // The quill only hands the cursor back to the composer: the chat stays the
  // surface, the bookplate is just a way in.
  host.querySelector('[data-plume]').addEventListener('click', () => context.focusComposer())
}

/** The candle, in place of the three dots while a turn runs. */
function busy(host) {
  const el = document.createElement('span')
  el.className = 'dby-chandelle'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = '<b></b><i></i>'
  host.appendChild(el)
}

export default function dobby() {
  return {
    brand: 'Dobby',
    title: 'Dobby',
    placeholder: 'Demander à Dobby…',
    busyLabel: 'Dobby écrit à la chandelle',
    idleLabel: 'Dobby veille',
    greetingDay: 'Bonjour, Madame.',
    greetingEvening: 'Bonsoir, Madame.',
    greetingAside: 'Dobby est à votre service.',
    // Pressed into the wax seal: the silhouette alone, so it holds in
    // monochrome.
    crest: `<svg viewBox="0 0 100 100" fill="currentColor">${CHAUSSETTE}</svg>`,
    // The quill on the send seal: Dobby writes the answer down.
    sendIcon: PLUME,
    hero,
    busy,
  }
}
