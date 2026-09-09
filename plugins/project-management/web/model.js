/**
 * The written scope of `:::timeline` — lines into entries, entries into
 * geometry. Pure on purpose: this is the half `node --test` can hold, and
 * the component above it stays thin enough to read in one screen.
 *
 * One line is one entry. Two dates make a PHASE, one date makes a MILESTONE —
 * the letter's own words: a milestone IS a phase without a beginning, which
 * is why both carry `due` and only a phase carries `start`. A line this
 * module cannot read comes back as `null` and the caller shows it BY NAME,
 * never guesses: a planning that invents a date lies with confidence.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `'Cadrage: 2026-01-15 → 2026-03-01'` → phase, `'Recette: 2026-06-01'` →
 * milestone, anything else → null.
 *
 * The FIRST colon splits label from dates — the same cut `figures` makes,
 * so the two data-bearing bodies read the same way. Both arrows are
 * accepted (`→`, `->`): the pretty one is what the skill teaches, the ASCII
 * one is what a keyboard produces. A phase that ends before it starts is
 * unreadable, not silently swapped.
 */
export function parseLine(text) {
  const cut = text.indexOf(':')
  if (cut === -1) return null
  const label = text.slice(0, cut).trim()
  const rest = text.slice(cut + 1).trim()
  if (!label) return null
  const parts = rest.split(/\s*(?:→|->)\s*/)
  if (parts.length > 2) return null
  if (parts.length === 2) {
    const [start, due] = parts
    if (!DATE.test(start) || !DATE.test(due) || due < start) return null
    return { label, start, due }
  }
  if (!DATE.test(rest)) return null
  return { label, due: rest }
}

const utc = (iso) => Date.parse(`${iso}T00:00:00Z`)
const iso = (date) => date.toISOString().slice(0, 10)

/** The first day of the week / month / quarter holding `date`. Weeks start Monday. */
function startOfUnit(date, scale) {
  const d = new Date(date)
  if (scale === 'weeks') {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  } else if (scale === 'quarters') {
    d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3, 1)
  } else {
    d.setUTCDate(1)
  }
  return d
}

function nextUnit(date, scale) {
  const d = new Date(date)
  if (scale === 'weeks') d.setUTCDate(d.getUTCDate() + 7)
  else if (scale === 'quarters') d.setUTCMonth(d.getUTCMonth() + 3)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

/**
 * The axis the entries need: `min`/`max` snapped OUTWARD to whole units of
 * the scale, and a tick at each unit start. The closing boundary gets no
 * tick — a label at 100% has nowhere to go but out of the box.
 *
 * Null when nothing carries a date; the caller says so instead of drawing
 * an axis around nothing.
 */
export function span(entries, scale) {
  const dates = entries.flatMap((entry) => [entry.start, entry.due]).filter(Boolean)
  if (dates.length === 0) return null
  const lowest = dates.reduce((a, b) => (a < b ? a : b))
  const highest = dates.reduce((a, b) => (a > b ? a : b))
  const min = startOfUnit(new Date(utc(lowest)), scale)
  const max = nextUnit(startOfUnit(new Date(utc(highest)), scale), scale)
  const ticks = []
  for (let at = new Date(min); at < max; at = nextUnit(at, scale)) ticks.push(iso(at))
  return { min: iso(min), max: iso(max), ticks }
}

/** Where a date sits on the axis, 0 at `min` and 1 at `max`. */
export function fraction(date, box) {
  return (utc(date) - utc(box.min)) / (utc(box.max) - utc(box.min))
}

/**
 * What the calendar alone can say about an entry — nothing here reads a
 * status, deliberately: a written phase has no page to carry one. `current`
 * is the phase containing today (the letter: "où l'on en est" costs no
 * field); a milestone is `current` only on its very day.
 */
export function classify(entry, today) {
  if (entry.due < today) return 'past'
  if ((entry.start ?? entry.due) > today) return 'ahead'
  return 'current'
}
