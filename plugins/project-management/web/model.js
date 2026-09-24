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
      // What its owner SAYS about it, and which family its lifecycle status
      // belongs to. Both carried here rather than looked up at drawing time,
      // so one walk feeds both blocks: a planning and a list of sub-projects
      // cannot disagree about a project if they read the same entry.
      ...(gradeOf(page.fields) ? { grade: gradeOf(page.fields) } : {}),
      ...(page.tone ? { tone: page.tone } : {}),
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
 * Where each milestone label goes: which row above the bars, and whether it
 * reads leftwards from its line.
 *
 * `labels` are `{ at, chars }` — the position on the axis (0…1) and the
 * label's length — in date order; `width` is the chart's, in pixels. Each
 * label takes the LOWEST row where it clears the last label already there;
 * one that would run past the right edge ends at its line instead of
 * starting there. As many rows as that takes, so two labels never write over
 * each other however close their dates — alternating rows only ever cleared
 * immediate neighbours, and a third label landed on the first.
 *
 * Without a width — not measured yet — rows simply alternate, which is right
 * for two neighbours and is replaced on the next frame.
 */
export function labelRows(labels, width, { charWidth = 6.8, gap = 8 } = {}) {
  if (!width) return labels.map((_, index) => ({ row: index % 2, end: false }))
  const edges = []
  return labels.map(({ at, chars }) => {
    const x = at * width
    const w = chars * charWidth
    const end = x - 4 + w > width
    const left = end ? x + 2 - w : x - 4
    let row = edges.findIndex((edge) => edge + gap <= left)
    if (row === -1) {
      row = edges.length
      edges.push(0)
    }
    edges[row] = left + w
    return { row, end }
  })
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

/**
 * ── The project's OWN status: how it is going, not where it is in its life ──
 *
 * Two questions, two fields, and they are not the same question. `status:` is
 * the word every page in the instance carries — where this one stands in its
 * life, and whether it is over. `project-status:` is a judgement somebody
 * makes about a project that is RUNNING: it is going fine, it wants watching,
 * it is in trouble.
 *
 * Only projects have one, which is why the word is declared by this plugin
 * for the type it claims rather than added to the engine's table. And only
 * RUNNING projects show one — see `badgeOf`.
 *
 * The words are the ones drawn, never a colour's name. A pill reading "Red"
 * says the colour out loud and teaches nothing; "en danger" is the thing
 * itself, and the hue underneath only makes it findable among twenty rows.
 */
const GRADES = {
  nominal: 'green',
  'à surveiller': 'amber',
  'en danger': 'red',
}

/** The words a project's own status is written with, in worsening order. */
export const PROJECT_STATUSES = Object.keys(GRADES)

const lower = (value) => (typeof value === 'string' ? value.toLowerCase().trim() : '')

/** `'En Danger'` → `'red'`; anything this plugin has not declared → undefined. */
export function gradeOf(fields) {
  return GRADES[lower(fields?.['project-status'])]
}

/**
 * The ONE badge a sub-project wears, and which of the two fields speaks.
 *
 * A precedence rather than an addition: the life of the page speaks first. A
 * project nobody can advance, or one that is over, says THAT — "nominal"
 * beside "bloqué" would be a project claiming to be fine while nobody can
 * touch it. Only once the page's life has nothing urgent to say does the
 * judgement get the pill.
 *
 * Two pills side by side were refused for the reason the core draws one: a
 * row has space for a single state, and two of them make the reader ask which
 * one wins instead of reading which one it is.
 *
 * `tone` and `finished` are the ENGINE's verdict, published by the page index
 * — never re-derived here. A second copy of that table inside a plugin is
 * exactly how `réalisé` came to close a page in one view and not in the next.
 */
export function badgeOf(page) {
  const status = page?.fields?.['status'] ?? page?.fields?.['statut']
  const word = typeof status === 'string' && status.trim() !== '' ? status.trim() : undefined
  if (page?.finished === true) return word ? { word, tone: 'settled' } : undefined
  if (page?.tone === 'waiting') return word ? { word, tone: 'waiting' } : undefined
  const grade = gradeOf(page?.fields)
  if (grade) return { word: lower(page.fields['project-status']), tone: grade }
  return word ? { word, tone: 'underway' } : undefined
}

/**
 * The sub-projects below a page — the rows `:::subproject` draws.
 *
 * Scoped by POSITION like everything else here (`under`, the core's own
 * walk), then kept by TYPE: a project's folder holds its sub-projects AND the
 * loose notes filed beside them, and a block named after sub-projects that
 * listed a reading note would be lying in its own name.
 *
 * Which is the one place this block is stricter than `:::timeline`, and
 * deliberately: a planning takes any page carrying a date because a date IS
 * the eligibility it can check, while a list of sub-projects has a word for
 * what it wants. A folder whose projects are not typed gets an empty block
 * saying so, which is better than a list of everything filed nearby.
 */
export function subprojectsOf(pages, base, depth, type = 'project-management') {
  return pages
    .filter((page) => under(page.path, base, depth) && page.fields?.['type'] === type)
    .map((page) => ({
      path: page.path,
      label: page.title || page.path,
      badge: badgeOf(page),
      finished: page.finished === true,
      due: DATE_FIELD(page.fields?.due),
      start: DATE_FIELD(page.fields?.start),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * The state a BAR is drawn in — the calendar's, unless somebody has spoken.
 *
 * `classify` answers from the dates and the workflow, and one of its answers
 * is an INFERENCE: `late` means "the due date has passed and the status is
 * still open". A project whose owner has graded it carries an ASSERTION about
 * that same question, and an assertion beats an inference — otherwise a
 * planning draws two reds meaning different things, and neither can be told
 * from the other.
 *
 * The page's life still speaks first, exactly as it does in a row — the bench
 * caught the one case where it did not. A project blocked while wearing
 * "nominal" drew a GREEN bar under a row that read "bloqué": one page saying
 * two things about one project, which is precisely what sharing this walk
 * between the two blocks exists to prevent. When the lifecycle has something
 * to say, the grade is dropped and the bar keeps the calendar's own answer —
 * that project really is late, and it really is blocked.
 *
 * Closed wins over everything: a finished project is finished, and whatever
 * grade it wore when it closed is stale by definition.
 */
export function barState(entry, today) {
  if (entry.finished === true) return 'done'
  if (entry.tone === 'waiting') return classify(entry, today)
  return entry.grade ?? classify(entry, today)
}
