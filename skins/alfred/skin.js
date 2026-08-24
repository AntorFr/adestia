/**
 * Alfred — the butler.
 *
 * A skin declares tokens and a handful of strings. That is the whole contract,
 * and this file is deliberately small enough to prove it: everything that
 * makes Alfred recognisable is a colour, a name, and a way of addressing you.
 */

export default function alfred() {
  return {
    brand: 'Alfred',
    title: 'Alfred',
    // The placeholder does real work: it tells a first-time visitor that this
    // chat can also open things, which no amount of chrome would.
    placeholder: 'Écrire à Alfred… ou « ouvre mes projets »',
    busyLabel: 'Un instant',
    idleLabel: 'À votre service',
    // The butler's address. The shell picks which of the two by the hour.
    greetingDay: 'Bonjour, Monsieur.',
    greetingEvening: 'Bonsoir, Monsieur.',
    greetingAside: 'Que puis-je pour vous ?',
    // The crest: an open chevron, in currentColor so it follows the rail's
    // own colour through light and dark without a line of CSS.
    crest:
      '<svg viewBox="0 0 100 100" fill="currentColor">' +
      '<path d="M50 53 L27 39 v27 z M50 53 L73 39 v27 z"/>' +
      '<circle cx="50" cy="53" r="7"/></svg>',
  }
}
