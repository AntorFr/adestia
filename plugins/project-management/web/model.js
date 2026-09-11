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

/**
 * ── The queried scope: one bar per page below ───────────────────────────────
 *
 * The letter's open model: a phase IS an item. There is no `timeline` page
 * type and no phase file — any page carrying dates enters the planning, which
 * is what lets a bar be clicked into the sub-worksite it stands for. `due:`
 * alone is a milestone, `start:` with it a phase: the SAME two rules the
 * written lines follow, so one planning cannot mean two things.
 *
 * `start:` and `due:` are `todo`'s words, taken at their own meaning and not
 * redefined — `start:` is "not before", never "I have begun".
 */

/** A folder's own index page IS the folder, never one of its contents. */
function isIndexPage(path) {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '') ?? ''
  return /^index$/i.test(file) || (parts.length > 1 && file === parts.at(-2))
}

const folderOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * Whether a page falls in the block's scope — the core's own walk for
 * `:::list{source=children}`, so a planning and a list of sub-worksites never
 * disagree about what "below" means. One folder down, only its index stands
 * for it: a worksite is its folder, not the pages filed inside it.
 */
export function under(path, base, depth) {
  const folder = folderOf(path)
  const inside = base === '' ? true : folder === base || folder.startsWith(`${base}/`)
  if (!inside) return false
  if (depth === 'subtree') return true
  const rest = base === '' ? folder : folder.slice(base.length + 1).replace(/^\//, '')
  if (folder === base) return !isIndexPage(path)
  if (depth === 'self') return false
  return !rest.includes('/') && isIndexPage(path)
}

const DATE_FIELD = (value) => (typeof value === 'string' && DATE.test(value.trim()) ? value.trim() : undefined)

/**
 * The index's pages, as timeline entries — the eligible ones only.
 *
 * ELIGIBILITY, and it is deliberately the calendar's: a page carrying `due:`
 * enters, a page carrying neither date does not. The letter's finer filter
 * (only types with a declared workflow) needs `pm-config` to say which types
 * those are; until it exists this is the honest approximation, and it is the
 * letter's own fallback — "ni l'un ni l'autre : rien, et jamais une date
 * devinée". A page whose `start:` sits after its `due:` is unreadable exactly
 * like the written line that does, and comes back named rather than swapped.
 */
export function fromPages(pages, base, depth) {
  const entries = []
  const unread = []
  for (const page of pages) {
    if (!under(page.path, base, depth)) continue
    const due = DATE_FIELD(page.fields?.due)
    const start = DATE_FIELD(page.fields?.start)
    const label = page.title || page.path
    if (!due) {
      if (start) unread.push(label)
      continue
    }
    if (start && start > due) {
      unread.push(label)
      continue
    }
    entries.push({
      label,
      ...(start ? { start } : {}),
      due,
      path: page.path,
      finished: page.finished === true,
    })
  }
  entries.sort((a, b) => ((a.start ?? a.due) < (b.start ?? b.due) ? -1 : 1))
  return { entries, unread }
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
 * Where an entry stands — the calendar and the workflow, and what their
 * DISAGREEMENT means.
 *
 * The workflow wins when it has spoken: a worksite the content engine calls
 * finished is `done` whatever its dates say, and nobody maintains a
 * percentage beside it. What the calendar adds is the case worth seeing:
 * an item whose `due` has passed while its status says it is still open is
 * `late`. Both facts are already on file; drawing them as one state would
 * hide the only thing a planning is read for.
 *
 * `finished` is absent — not false — on a WRITTEN phase, which has no page
 * and therefore no status. So a written phase whose dates have elapsed is
 * `past` and never `late`: nothing here knows whether it went well, and
 * inventing lateness from a date alone would be exactly the guess this
 * block refuses everywhere else.
 */
export function classify(entry, today) {
  if (entry.finished === true) return 'done'
  if (entry.due < today) return entry.finished === false ? 'late' : 'past'
  if ((entry.start ?? entry.due) > today) return 'ahead'
  return 'current'
}
