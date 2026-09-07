/**
 * The operations a period accepts, and the only way its cards ever change.
 *
 * ONE file, two authors. The front drags a card and the agent writes a week of
 * suggestions, and both come through here — which is what let the overlay go.
 * An overlay existed to keep a screen's gestures out of a document the agent
 * owned; when the document is co-owned by design, it is a second copy of the
 * truth and a merge somebody has to remember to perform.
 *
 * What replaces it is not a lock. A lock stops two writes landing at once and
 * does nothing about the failure that actually loses work: an author reads,
 * thinks for thirty seconds, writes back a whole document, and silently drops
 * everything the other one did meanwhile. So every write states the REVISION
 * it read, and a write whose base has moved is refused — the same bargain the
 * shell already strikes with its page editor.
 *
 * This module is served to the BROWSER as well as imported by the server, so
 * the screen predicts a drag with the same code that will decide it. One
 * implementation, never two that drift — and the optimistic update is exactly
 * right rather than approximately.
 *
 * And the operations are FINE. `place this card on Thursday` carries no
 * opinion about the rest of the document, so two authors working at once
 * conflict only when they touch the same card — which is rare, and correct
 * when it happens.
 */

/** Closed, and enforced on both sides: a write cannot invent a status. */
export const STATUTS = ['suggestion', 'confirme', 'ecartee']

/** What a card may carry beyond its placement. `props` is free by design. */
const WRITABLE = ['titre', 'ico', 'quantite', 'hint', 'desc', 'source', 'props']

const ISO = /^\d{4}-\d{2}-\d{2}$/

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `props` narrowed to what the contract promises: free KEYS, text values.
 *
 * The keys are never checked — that is the whole wager of this format, and a
 * plugin that policed them would close a vocabulary meant to stay open. The
 * values are coerced to strings because nothing here ever computes with them:
 * a number would only invite somebody to start.
 */
function cleanProps(raw) {
  if (!isPlainObject(raw)) return undefined
  const props = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key === '') continue
    if (value === null || value === undefined) continue
    if (isPlainObject(value) || Array.isArray(value)) return undefined
    props[key] = String(value)
  }
  return props
}

/** A card, narrowed to what a period may hold. */
function cleanCard(raw) {
  if (!isPlainObject(raw)) return undefined
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '' || id.length > 200) return undefined
  const titre = typeof raw.titre === 'string' ? raw.titre.trim() : ''
  if (titre === '') return undefined
  const card = { id, titre, statut: STATUTS.includes(raw.statut) ? raw.statut : 'suggestion' }
  for (const field of WRITABLE) {
    if (field === 'titre' || !(field in raw)) continue
    if (field === 'props') {
      const props = cleanProps(raw.props)
      if (props === undefined) return undefined
      if (Object.keys(props).length > 0) card.props = props
    } else if (typeof raw[field] === 'string' && raw[field] !== '') {
      card[field] = raw[field]
    }
  }
  return card
}

/** Where a card may be placed, according to the page that frames the period. */
function placementIssue(shape, jour, section) {
  if (typeof jour !== 'string' || !ISO.test(jour)) return 'jour must be YYYY-MM-DD'
  if (!shape?.debut || !shape?.fin) return 'this period has no dates yet'
  if (jour < shape.debut || jour > shape.fin) return 'jour is outside the period'
  if (section !== undefined && !(shape.sections ?? []).includes(section)) {
    return `section must be one of: ${(shape.sections ?? []).join(', ')}`
  }
  return undefined
}

/**
 * One operation, applied to the cards of a period.
 *
 * Returns the new array, or an error naming what was wrong. Never mutates its
 * input: the caller still holds the document it read, which is what makes a
 * refused write cost nothing.
 */
export function apply(items, shape, op) {
  const cards = Array.isArray(items) ? items : []
  const name = op?.op
  const id = typeof op?.id === 'string' ? op.id.trim() : ''
  const at = cards.findIndex((card) => card?.id === id)

  if (name === 'add') {
    const card = cleanCard(op?.item)
    if (!card) return { error: 'an added card needs an id and a titre' }
    if (cards.some((existing) => existing?.id === card.id)) {
      return { error: `a card called "${card.id}" is already there` }
    }
    // Added to the tray: a card arrives as a proposal, and placing it is a
    // second, deliberate act. Nothing in this format lets a write both invent
    // a card and decide when it is eaten.
    return { items: [...cards, card] }
  }

  if (id === '') return { error: 'this operation needs an id' }
  if (at === -1) return { error: `no card called "${id}"` }
  const card = cards[at]
  const replace = (next) => ({ items: cards.map((one, index) => (index === at ? next : one)) })

  switch (name) {
    case 'place': {
      const section = op.section === undefined ? (shape?.sections ?? [])[0] : op.section
      const issue = placementIssue(shape, op.jour, section)
      if (issue) return { error: issue }
      const ordre = op.ordre
      if (ordre !== undefined && !(typeof ordre === 'number' && Number.isFinite(ordre))) {
        return { error: 'ordre must be a number' }
      }
      // Merged over what was there, so an annotation survives a change of day.
      return replace({
        ...card,
        statut: 'confirme',
        jour: op.jour,
        section,
        ...(ordre === undefined ? {} : { ordre }),
      })
    }

    case 'tray': {
      // Back to the tray: the placement goes with it. An unplaced card is
      // never a confirmed one — the invariant holds even when the placement
      // came from the file itself.
      const { jour: _d, section: _s, ordre: _o, ...rest } = card
      return replace({ ...rest, statut: 'suggestion' })
    }

    case 'dismiss': {
      const { jour: _d, section: _s, ordre: _o, ...rest } = card
      return replace({ ...rest, statut: 'ecartee' })
    }

    case 'set': {
      if (!isPlainObject(op.fields)) return { error: '`fields` must be an object' }
      const next = { ...card }
      for (const [key, value] of Object.entries(op.fields)) {
        if (!WRITABLE.includes(key)) return { error: `"${key}" is not a field of a card` }
        if (value === null) {
          delete next[key]
          continue
        }
        if (key === 'props') {
          const props = cleanProps(value)
          if (props === undefined) return { error: '`props` must be flat text values' }
          next.props = props
          continue
        }
        if (typeof value !== 'string' || (key === 'titre' && value.trim() === '')) {
          return { error: `"${key}" must be a non-empty string` }
        }
        next[key] = value
      }
      return replace(next)
    }

    case 'remove':
      return { items: cards.filter((_, index) => index !== at) }

    default:
      return { error: `unknown operation "${String(name)}"` }
  }
}
