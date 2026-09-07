/**
 * What a period of meals IS, with no DOM anywhere near it.
 *
 * The whole shape of the screen is decided here — which cards are placed,
 * which wait in the tray, what a day is made of, where a drop lands — so that
 * the parts that are hard to get right are the parts a test can hold. The
 * components below this file only paint what these functions return.
 *
 * Two decisions are worth stating because they are what keeps a file readable
 * after somebody edits it by hand:
 *
 * - **Placement is read off the DATA, not off the status.** The contract says
 *   a `confirme` card carries a `jour` and a `suggestion` does not, and the
 *   agent is asked to hold that invariant. But a file that breaks it must
 *   still draw something sane rather than dropping a card into neither list,
 *   so `jour` decides where a card goes and `statut` only decides whether it
 *   is shown at all.
 * - **Nothing is ever dropped for being unrecognised.** A card filed under a
 *   section the file no longer declares still appears, in a group of its own
 *   after the declared ones. A card that vanishes because somebody renamed a
 *   section is a data loss the screen would never explain.
 */

/** The sections a file gets when it declares none. */
export const SECTIONS = ['matin', 'midi', 'soir']

/** Closed, and enforced on both sides: an overlay cannot invent a status. */
export const STATUTS = ['suggestion', 'confirme', 'ecartee']

/** A period longer than this is a mistake in the file, not a plan. */
const MAX_DAYS = 400

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** `2026-08-08` → a UTC timestamp, or undefined for anything else. */
export function dayValue(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return undefined
  const time = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(time) ? undefined : time
}

/** The sections the PAGE declares, or the three every period gets for free. */
export function sectionsOf(shape) {
  const declared = shape?.sections
  if (!Array.isArray(declared)) return SECTIONS
  const names = declared.filter((name) => typeof name === 'string' && name.trim() !== '')
  return names.length > 0 ? names : SECTIONS
}

/**
 * Every day the period covers, in order.
 *
 * Empty when either bound is missing or the pair is backwards — which is not
 * an error state: a file with no dates is a tray of ideas, and the screen says
 * so rather than drawing an empty calendar.
 */
export function daysOf(shape) {
  const from = dayValue(shape?.debut)
  const to = dayValue(shape?.fin)
  if (from === undefined || to === undefined || to < from) return []
  const days = []
  const DAY = 86_400_000
  for (let time = from; time <= to && days.length < MAX_DAYS; time += DAY) {
    days.push(new Date(time).toISOString().slice(0, 10))
  }
  return days
}

/** A card is placed when it names a day. Nothing else decides it. */
export const isPlaced = (item) => dayValue(item?.jour) !== undefined

/** Kept in the file, never proposed again. */
export const isDismissed = (item) => item?.statut === 'ecartee'

/** The rank a card sorts by inside its section — written, or its file order. */
const rankOf = (item, fallback) =>
  typeof item?.ordre === 'number' && Number.isFinite(item.ordre) ? item.ordre : fallback

/**
 * The whole screen, in one value.
 *
 * `dated` is what tells the view whether to draw a timeline at all: a period
 * with no bounds is a live tray and an honest sentence, not an empty grid.
 */
export function layout(shape, items) {
  const cards = Array.isArray(items) ? items.filter((item) => item && typeof item.id === 'string') : []
  const ranked = cards.map((item, index) => ({ item, rank: rankOf(item, index) }))
  const days = daysOf(shape)
  const declared = sectionsOf(shape)
  const known = new Set(days)

  const tray = ranked
    .filter(({ item }) => !isPlaced(item) && !isDismissed(item))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)

  // A card placed on a day the period does not cover is not lost — it is
  // shown at the end, where somebody can drag it back in.
  const strays = ranked
    .filter(({ item }) => isPlaced(item) && !isDismissed(item) && !known.has(item.jour))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item)

  const placed = ranked.filter(
    ({ item }) => isPlaced(item) && !isDismissed(item) && known.has(item.jour),
  )

  const timeline = days.map((date) => {
    const ofDay = placed.filter(({ item }) => item.jour === date)
    // Declared sections first, in the file's order; then whatever else the
    // day's cards claim, so a renamed section costs a heading and not a card.
    const extra = []
    for (const { item } of ofDay) {
      const name = typeof item.section === 'string' && item.section !== '' ? item.section : declared[0]
      if (!declared.includes(name) && !extra.includes(name)) extra.push(name)
    }
    const groups = [...declared, ...extra].map((name) => ({
      name,
      known: declared.includes(name),
      cards: ofDay
        .filter(({ item }) => (item.section ?? declared[0]) === name)
        .sort((a, b) => a.rank - b.rank)
        .map(({ item }) => item),
    }))
    return { date, groups }
  })

  return { dated: days.length > 0, days: timeline, tray, strays }
}

/**
 * The rank of a card dropped at `index` among `cards`.
 *
 * Fractional on purpose: inserting between two neighbours must not renumber
 * anybody, because renumbering writes a gesture for every card in the section
 * and the overlay would grow by a screenful on one drag.
 */
export function dropRank(cards, index) {
  const rank = (card, fallback) =>
    typeof card?.ordre === 'number' && Number.isFinite(card.ordre) ? card.ordre : fallback
  const at = Math.max(0, Math.min(index, cards.length))
  const before = at > 0 ? rank(cards[at - 1], at - 1) : undefined
  const after = at < cards.length ? rank(cards[at], at) : undefined
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return after - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

/** Words this plugin ships itself — the shell cannot translate a sentence it has never seen. */
const FR = {
  'Ask the agent for ideas — they land here.': 'Demande des idées à l’agent — elles arrivent ici.',
  'An idea for now — the tray is live, the timeline waits for dates.':
    'Une idée pour l’instant — le tray est vivant, la frise attend des dates.',
  'Someone changed this period while you were reading it. Reloaded.':
    'Quelqu’un a modifié cette période pendant que tu la lisais. Rechargée.',
  'Drop a card here': 'Déposez une carte ici',
  'Nothing here yet': 'Rien ici pour l’instant',
  'Out of the period': 'Hors période',
  'Set aside': 'Écartée',
  'Set this one aside': 'Écarter celle-ci',
  'Back to the tray': 'Remettre au tray',
  'Ideas': 'Idées',
  'Close': 'Fermer',
  'loading…': 'chargement…',
  'This period cannot be read.': 'Cette période est illisible.',
  'No period in this address.': 'Aucune période dans cette adresse.',
  'In ': 'Dans ',
  'Click for the detail · Drag to move': 'Clic pour le détail · Glisser pour déplacer',
}

/** Keyed by the English sentence, so a missing translation degrades to English. */
export function words(locale) {
  const fr = String(locale ?? '').slice(0, 2) === 'fr'
  return (key) => (fr ? (FR[key] ?? key) : key)
}

/** A day's heading, in the reader's own language. */
export function dayLabel(iso, locale) {
  const time = dayValue(iso)
  if (time === undefined) return iso
  return new Date(time).toLocaleDateString(locale || undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
