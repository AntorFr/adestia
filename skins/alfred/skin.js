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
  }
}
