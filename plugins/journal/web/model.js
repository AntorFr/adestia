/**
 * The journal model: a folder is a journal, a page in it is an entry.
 *
 * The storage question this plugin answers, because it decides everything
 * else: **one markdown file per entry**, never one file holding a history.
 *
 * Four reasons, and none of them is taste:
 *
 *  - `PUT /api/pages/*` writes a whole file under an optimistic revision. One
 *    file per journal means the agent appending an entry collides with the
 *    person editing an old one, every time. Per entry, a conflict touches
 *    only the entry actually disputed.
 *  - the agent adds entries with its own file tools. Writing a NEW file
 *    cannot damage the history; rewriting a file that holds two hundred
 *    entries can.
 *  - "edit mode on this section only" is then free: an entry IS a page, so it
 *    is the shell's own page editor, with its own revision and its own
 *    diagnostics. A single file would need a section grammar the content
 *    engine does not have — and would still rewrite the whole file on save.
 *  - `GET /api/pages/index` publishes frontmatter per page, so an entry's
 *    `date` and its own fields are queryable by every other app. Entries
 *    buried in one file are invisible to it.
 *
 * What a journal is, on disk:
 *
 * ```
 * journal/atelier/
 *   INDEX.md              type: journal   ← the cover, dresses the tile
 *   2026-08-25-1430.md    type: entree
 *   2026-08-24.md         type: entree
 * ```
 *
 * The cover may also be the folder's homonymous page (`atelier/atelier.md`),
 * or the page BESIDE the folder (`journal/atelier.md`) — the three spellings
 * the workspace already uses for "this page is that folder's overview" all
 * resolve to the same journal.
 */

/** A page id is its path without the extension: stable, and readable. */
export const idOf = (path) => path.replace(/\.md$/, '')

/** The folder a path sits in — `''` for a page at the root. */
export function folderOf(path) {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)

/**
 * True for a page that IS its folder's overview rather than one of its
 * contents — the two spellings the workspace already reads, `INDEX.md` and a
 * page named after its folder.
 */
export function isIndexPage(path) {
  const name = baseName(path).replace(/\.md$/, '')
  return name === 'INDEX' || name === baseName(folderOf(path))
}

/**
 * The folder whose pages a journal cover speaks for.
 *
 * An index page speaks for the folder it sits in; any other page speaks for
 * the folder named after it. Which means a person can file a journal either
 * way round without being told which one this plugin prefers.
 */
export function journalFolder(path) {
  return isIndexPage(path) ? folderOf(path) : idOf(path)
}

const pad = (value) => String(value).padStart(2, '0')

/**
 * When an entry happened, as a sortable string.
 *
 * `date:` in the frontmatter is the contract. The file name is read as a
 * fallback rather than as an equal: entries written by hand are named after
 * their moment, and refusing to order a page because somebody forgot a field
 * would drop it at the bottom of its own journal.
 */
export function entryWhen(entry) {
  const declared = entry.fields?.date
  if (typeof declared === 'string' && declared.trim() !== '') return declared.trim()

  const match = /^(\d{4}-\d{2}-\d{2})(?:[-T ](\d{2})[:h]?(\d{2}))?/.exec(baseName(entry.path))
  if (!match) return ''
  return match[2] ? `${match[1]}T${match[2]}:${match[3]}` : match[1]
}

/**
 * Newest first.
 *
 * A journal is read from its most recent entry — the history is what you
 * scroll INTO, not what you scroll past. Entries with no readable moment sort
 * last rather than first: an undated page at the top would look like today's.
 */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.when !== b.when) {
      if (a.when === '') return 1
      if (b.when === '') return -1
      return a.when < b.when ? 1 : -1
    }
    return a.path < b.path ? 1 : -1
  })
}

/**
 * Every journal in the workspace, with its entries.
 *
 * Entries are matched by FOLDER as well as by type. `entree` is a common word
 * in a shared namespace — a recipe app could claim it tomorrow — and reading
 * only the ones that sit inside a journal means a collision costs nothing
 * here rather than filling somebody's journal with starters.
 */
export function buildModel(entries) {
  const journals = new Map()

  for (const entry of entries) {
    if (entry.fields?.type !== 'journal') continue
    const folder = journalFolder(entry.path)
    // First wins, and the index is sorted by path: two covers for one folder
    // give the same answer on every reload rather than one that depends on
    // how the tree was walked.
    if (journals.has(folder)) continue
    journals.set(folder, {
      id: folder,
      folder,
      path: entry.path,
      title: entry.title,
      ico: typeof entry.fields.ico === 'string' ? entry.fields.ico : null,
      couleur: typeof entry.fields.couleur === 'string' ? entry.fields.couleur : null,
      description: typeof entry.fields.description === 'string' ? entry.fields.description : null,
      finished: entry.finished === true,
      entries: [],
    })
  }

  for (const entry of entries) {
    if (entry.fields?.type !== 'entree') continue
    const journal = journals.get(folderOf(entry.path))
    if (!journal) continue
    journal.entries.push({
      id: idOf(entry.path),
      path: entry.path,
      // The index's `title` falls back to the file name, which for an entry is
      // its date — shown as a heading it would read as a bug. Only a title
      // somebody actually wrote is a title here.
      title: typeof entry.fields.title === 'string' ? entry.fields.title : null,
      when: entryWhen(entry),
      finished: entry.finished === true,
    })
  }

  for (const journal of journals.values()) journal.entries = sortEntries(journal.entries)

  return [...journals.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** `2026-08-25T14:30` for a moment — the shape `date:` is written in. */
export function stamp(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * Where a new entry goes.
 *
 * Named after its moment, to the minute, so a folder listing is already a
 * chronology outside this app — in an IDE, in git, in the agent's own file
 * tools. Two entries in the same minute get a suffix rather than one
 * overwriting the other.
 */
export function newEntryPath(folder, date, taken = []) {
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`
  const used = new Set(taken.map(idOf))
  let candidate = `${folder}/${base}`
  for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${folder}/${base}-${suffix}`
  return `${candidate}.md`
}

/** The shortest entry the page contract allows, and not a line more. */
export function entryMarkdown({ when, title, body }) {
  const front = ['---', 'type: entree', `date: ${when}`]
  if (title && title.trim() !== '') front.push(`title: ${title.trim()}`)
  front.push('---', '')
  return `${front.join('\n')}\n${(body ?? '').trim()}\n`
}

/** The cover a journal gets when this app creates one. */
export function journalMarkdown({ title, ico }) {
  const front = ['---', `title: ${title.trim()}`, 'type: journal']
  if (ico && ico.trim() !== '') front.push(`ico: ${ico.trim()}`)
  front.push('---', '')
  return front.join('\n')
}

/** A folder name from a title: lowercase, no accents, no surprises. */
export function slugify(title) {
  const slug = String(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  // A title with nothing latin in it still deserves a folder: the slug is a
  // handle, and the title stays in the cover's frontmatter where it is read.
  return slug || 'journal'
}

/** A moment, in the reader's language. Falls back to what was written. */
export function formatWhen(when, locale) {
  if (!when) return ''
  const parsed = new Date(when.length === 10 ? `${when}T00:00` : when)
  if (Number.isNaN(parsed.getTime())) return when
  const options =
    when.length === 10
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  return parsed.toLocaleDateString(locale, options)
}

const WORDS = {
  fr: {
    'Journals': 'Journaux',
    'No journal yet.': 'Aucun journal pour le moment.',
    'Nothing written yet.': 'Rien d’écrit pour le moment.',
    'New entry': 'Nouvelle entrée',
    'Write': 'Écrire',
    'Title (optional)': 'Titre (facultatif)',
    'What happened?': 'Qu’est-ce qui s’est passé ?',
    'Add': 'Ajouter',
    'Older entries': 'Entrées plus anciennes',
    'Show more': 'Voir plus',
    'entries': 'entrées',
    'entry': 'entrée',
    'Loading…': 'Chargement…',
    'could not write that entry': 'impossible d’écrire cette entrée',
    'another author just took that name — try again':
      'un autre auteur vient de prendre ce nom — réessaie',
    'A journal is a folder of entries. Ask the agent for one, or name it here.':
      'Un journal est un dossier d’entrées. Demande-le à l’agent, ou nomme-le ici.',
    'Name of the journal': 'Nom du journal',
    'Create': 'Créer',
  },
}

export const words = (locale) => {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}
