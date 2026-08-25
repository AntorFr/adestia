/**
 * A page's status, as a colour and a fate.
 *
 * Two questions, one vocabulary: what does this status LOOK like, and does it
 * mean the page is over. Both were guessed once and both were wrong on the
 * real corpus, which is why the table below is a transcription of what a body
 * of pages actually writes rather than a list of words that sound right.
 *
 * Three families, and the distinction is semantic rather than decorative:
 * something is UNDERWAY (the accent — it is the normal state of a live page),
 * something is WAITING on the world (a warning — you cannot advance it), or
 * something is SETTLED (a success — nothing more is owed). A status nobody
 * declared, or one this table has never met, falls to "underway": the safe
 * direction, because it keeps the page visible.
 */

/** The three families a status can belong to. */
export type StatusTone = 'underway' | 'waiting' | 'settled'

const TONES: Readonly<Record<string, StatusTone>> = {
  // Underway — the accent. A live page's normal state.
  'en cours': 'underway',
  'en-cours': 'underway',
  encours: 'underway',
  'idée': 'underway',
  idee: 'underway',
  'en réflexion': 'underway',
  'réflexion': 'underway',
  veille: 'underway',
  'référence retenue': 'underway',
  'reference retenue': 'underway',

  // Waiting on the world — you cannot advance it yourself.
  'bloqué': 'waiting',
  bloque: 'waiting',
  'en attente': 'waiting',
  'à acheter': 'waiting',
  'à-acheter': 'waiting',
  'a acheter': 'waiting',
  'commandé': 'waiting',
  commande: 'waiting',

  // Settled — nothing more is owed.
  clos: 'settled',
  fait: 'settled',
  'terminé': 'settled',
  termine: 'settled',
  'réalisé': 'settled',
  realise: 'settled',
  'choix fait': 'settled',
  'décidé': 'settled',
  'acheté': 'settled',
  achete: 'settled',
  offert: 'settled',
  done: 'settled',
  closed: 'settled',
  'archivé': 'settled',
  archive: 'settled',
}

const normalise = (status: unknown): string =>
  typeof status === 'string' ? status.toLowerCase().trim() : ''

export function toneOf(status: unknown): StatusTone {
  return TONES[normalise(status)] ?? 'underway'
}

/**
 * Whether a status means the page is finished, and can leave the grid of live
 * ones for the fold at the bottom.
 *
 * `acheté` is settled as a COLOUR everywhere — the purchase happened — but it
 * only ARCHIVES a page that is itself a purchase. A gift bought is still a
 * gift to give, so it stays among the living. That distinction is the
 * predecessor's, and it is the kind of thing a colour table alone cannot say.
 */
export function isFinished(fields: Readonly<Record<string, unknown>>): boolean {
  const status = normalise(fields['status'] ?? fields['statut'])
  if (status === '') return false
  if (TONES[status] !== 'settled') return false
  if (status === 'acheté' || status === 'achete') return fields['type'] === 'achat'
  return true
}
