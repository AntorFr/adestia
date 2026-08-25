/**
 * Collections: entering a body of pages by a facet, not by folders.
 *
 * The principle this implements, from the design: you enter through a grid of
 * cards, then descend — never a long list. Projects by trade, gifts by person,
 * recipes by course: one mechanic, and the level of grouping is itself a grid
 * of cards.
 *
 * What is different from the version this was ported from: the grouping is
 * DECLARED IN A PAGE rather than hardcoded in the shell.
 *
 * ```markdown
 * ---
 * type: collection
 * title: Projets
 * ico: 🗂
 * of: projet          # collects pages whose `type` is this
 * groupBy: cat        # the facet that becomes the first grid
 * ---
 * ```
 *
 * That is the whole reason to rewrite rather than transcribe: agent-gw kept a
 * map of `{'diy/projets': {key: 'cat', …}}` in the launcher, so a new
 * collection meant a code change. Here the agent writes a page and the
 * collection exists — which is what "a new domain is zero code" was supposed
 * to mean.
 */

export const idOf = (path) => path.replace(/\.md$/, '')

/**
 * Whether a page's life is over — asked of the SERVER, never decided here.
 *
 * `/api/pages/index` publishes `finished` for every page, computed by the
 * content engine: it is what knows that `réalisé` closes a page while
 * `acheté` closes only a purchase. A plugin can import nothing but React, so
 * a copy of that table here is the one thing guaranteed to drift — and the
 * predecessor proved it, archiving a trip in one screen that another still
 * showed as live.
 *
 * An index that does not say (an older server) means nothing is finished:
 * everything stays visible, which is the direction that loses nobody's page.
 */
const isFinished = (entry) => entry.finished === true

/** Reads the declarations and the pages they collect, in one pass. */
export function buildCollections(entries) {
  const declarations = []
  const pages = []

  for (const entry of entries) {
    const fields = entry.fields ?? {}
    if (fields.type === 'collection') {
      declarations.push({
        id: idOf(entry.path),
        path: entry.path,
        title: entry.title,
        icon: typeof fields.ico === 'string' ? fields.ico : '🗂',
        of: typeof fields.of === 'string' ? fields.of : null,
        groupBy: typeof fields.groupBy === 'string' ? fields.groupBy : null,
        // Labels for facet values, so `cat: menuiserie` can show as
        // "Menuiserie" without the collection code knowing any vocabulary.
        labels: parseLabels(fields.labels),
      })
    } else if (typeof fields.type === 'string') {
      pages.push({
        id: idOf(entry.path),
        path: entry.path,
        title: entry.title,
        type: fields.type,
        fields,
        finished: isFinished(entry),
      })
    }
  }

  return {
    // A declaration with no `of` collects nothing and says so, rather than
    // collecting everything — a collection that silently matched every page
    // would look like a bug in the pages, not in the declaration.
    collections: declarations.map((declaration) => {
      const members = declaration.of ? pages.filter((page) => page.type === declaration.of) : []
      return {
        ...declaration,
        members,
        /**
         * The living and the settled, split once here.
         *
         * A collection of projects fills up with finished ones within a year,
         * and a grid where nine cards out of ten are done is a grid nobody
         * scans. So the finished leave for a fold at the bottom — they are
         * never dropped: what was done is exactly what somebody comes looking
         * for when they want to know how it went last time.
         */
        live: members.filter((page) => !page.finished),
        archived: members.filter((page) => page.finished),
        problem: declaration.of ? null : 'declares no `of:` — it collects nothing',
      }
    }),
    pages,
  }
}

/** `labels: menuiserie=Menuiserie, dev=Développement` — flat, and readable. */
function parseLabels(raw) {
  const labels = {}
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  for (const item of items) {
    const [key, ...rest] = String(item).split('=')
    if (rest.length > 0) labels[key.trim()] = rest.join('=').trim()
  }
  return labels
}

/**
 * The facets of a collection, as cards.
 *
 * Sorted by count, then name: the biggest group is where someone is most
 * likely heading, and alphabetical order alone buries it under whatever starts
 * with A.
 */
export function facetsOf(collection, t = (key) => key) {
  if (!collection.groupBy) return null

  const groups = new Map()
  for (const page of collection.members) {
    const raw = page.fields[collection.groupBy]
    // A page missing the facet is not dropped: it lands in "Uncategorised",
    // where somebody can see it and fix it. Silently hiding it would make the
    // collection lie about its own size.
    const values = Array.isArray(raw) ? raw.map(String) : [raw == null ? '' : String(raw)]
    for (const value of values) {
      if (!groups.has(value)) groups.set(value, { pages: [], archived: [] })
      groups.get(value)[page.finished ? 'archived' : 'pages'].push(page)
    }
  }

  return [...groups.entries()]
    .map(([value, group]) => ({
      value,
      label: value === '' ? t('Uncategorised') : (collection.labels[value] ?? prettify(value)),
      // `pages` is what is LIVE, and the archived ride along: a facet whose
      // work is all done still deserves a card — it is where the history is —
      // but it sorts below the ones with something happening in them.
      pages: group.pages,
      archived: group.archived,
    }))
    .sort((a, b) => {
      if (a.value === '') return 1
      if (b.value === '') return -1
      if (b.pages.length !== a.pages.length) return b.pages.length - a.pages.length
      return a.label.localeCompare(b.label)
    })
}

/** "1 page", "3 pages" — a stray plural is an interface nobody proofread. */
export function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** `rangement-garage` → `Rangement garage`. */
export function prettify(value) {
  const words = String(value).replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value
}

/**
 * A member's status, when it declares one.
 *
 * Read rather than interpreted: the vocabulary belongs to whoever writes the
 * pages, and a collection that only understood four hardcoded statuses would
 * be a collection that silently ignores the fifth.
 */
export function statusOf(page) {
  const status = page.fields.status ?? page.fields.statut
  return typeof status === 'string' && status !== '' ? status : null
}
