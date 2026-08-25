/**
 * The todo model: one base, attributes, and references.
 *
 * A task is a PAGE with `type: tache` in its frontmatter. There is no second
 * store and no task database — which is what lets the agent create, edit and
 * close tasks with its own file tools, and lets a person edit the same task in
 * the page editor without anything having to synchronise.
 *
 * Lists come in two kinds, and the distinction is the whole design:
 *
 *  - a CURATED list is a page (`type: liste`) holding `refs: [ids]`. It is
 *    judgement — "what I am doing today" — and nothing computes it.
 *  - a DYNAMIC list is a query over frontmatter. It is always current, costs
 *    nothing, and cannot be wrong.
 *
 * Both point at the same tasks. Ticking one anywhere ticks it everywhere,
 * because there is only ever one task.
 */

/** A page id is its path without the extension: stable, and readable. */
export const idOf = (path) => path.replace(/\.md$/, '')

export function buildModel(entries) {
  const tasks = {}
  const lists = {}
  let config = null

  for (const entry of entries) {
    const fields = entry.fields ?? {}
    const id = idOf(entry.path)

    if (fields.type === 'tache') {
      tasks[id] = {
        id,
        path: entry.path,
        title: entry.title,
        // `done` carries WHEN, not merely whether: the predecessor's corpus
        // writes `done: 2026-07-22`, which is strictly more information than
        // a boolean and costs nothing to honour. Truthy-but-not-"false" is
        // closed; a bare `true` (this plugin's own former format) still
        // counts, so no page written either way reads wrong.
        done: fields.done === true || (typeof fields.done === 'string' && fields.done !== '' && fields.done !== 'false'),
        doneOn: typeof fields.done === 'string' ? fields.done : null,
        due: typeof fields.due === 'string' ? fields.due : null,
        pri: typeof fields.pri === 'number' ? fields.pri : null,
        dom: typeof fields.dom === 'string' ? fields.dom : null,
        projet: typeof fields.projet === 'string' ? fields.projet : null,
        sub: Array.isArray(fields.sub) ? fields.sub.map(String) : [],
      }
    } else if (fields.type === 'todo-config' && config === null) {
      // The instance's own settings, read from the index like everything
      // else: no second store, and the agent changes them with the file
      // tools it already has. The FIRST one wins — the index is sorted by
      // path, so two settings pages give the same answer on every reload
      // rather than an answer that depends on how the folder was walked.
      config = fields
    } else if (fields.type === 'liste') {
      lists[id] = {
        id,
        title: entry.title,
        icon: typeof fields.ico === 'string' ? fields.ico : '📋',
        refs: Array.isArray(fields.refs) ? fields.refs.map(String) : [],
      }
    }
  }

  return { tasks, lists, config: config ?? {} }
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The dynamic lists.
 *
 * Kept few and obvious on purpose. A view for every possible query is a view
 * nobody scans; these are the four questions a todo list actually gets asked.
 */
/**
 * The plugin's own words.
 *
 * A plugin ships these itself — the shell translates the shell and cannot
 * know a sentence it has never seen. What it hands over is `api.locale`.
 */
const WORDS = {
  fr: {
    Late: 'En retard',
    'past its due date': 'échéance dépassée',
    Today: "Aujourd'hui",
    'due today': "pour aujourd'hui",
    'Next 7 days': 'Sous 7 jours',
    'due within the week': 'dans la semaine',
    'Everything open': 'Tout ce qui reste',
    'the whole base, undone': 'toute la base, non faite',
    'No domain': 'Sans domaine',
    'to do': 'à faire',
    late: 'en retard',
    'curated by reference': 'sélection par référence',
    'a live query, nothing to maintain': 'une requête vivante, rien à tenir à jour',
    'Your lists': 'Vos listes',
    'Live views': 'Vues dynamiques',
    'Everything, by domain': 'Tout, par domaine',
    'New task': 'Nouvelle tâche',
    'Due date': 'Échéance',
    Domain: 'Domaine',
    Add: 'Ajouter',
    Open: 'Ouvrir',
    'could not create that task': 'création impossible',
    'another author just took that name — try again': 'un autre auteur vient de prendre ce nom — réessayez',
  },
}

export function words(locale) {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}

export function dynamicLists(tasks, t = (key) => key) {
  const all = Object.values(tasks)
  const open = all.filter((task) => !task.done)
  const day = today()

  return [
    {
      id: 'late',
      title: t('Late'),
      icon: '🔥',
      description: t('past its due date'),
      tasks: open.filter((task) => task.due && task.due < day).sort(byDue),
    },
    {
      id: 'today',
      title: t('Today'),
      icon: '📅',
      description: t('due today'),
      tasks: open.filter((task) => task.due === day),
    },
    {
      id: 'soon',
      title: t('Next 7 days'),
      icon: '🗓',
      description: t('due within the week'),
      tasks: open.filter((task) => task.due && task.due > day && task.due <= plusDays(day, 7)).sort(byDue),
    },
    {
      id: 'open',
      title: t('Everything open'),
      icon: '📥',
      description: t('the whole base, undone'),
      tasks: open.sort(byDue),
    },
  ]
}

function plusDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Undated tasks sort last: a date is information, its absence is not. */
function byDue(a, b) {
  if (a.due === b.due) return 0
  if (!a.due) return 1
  if (!b.due) return -1
  return a.due < b.due ? -1 : 1
}

/** A curated list, resolved against the base. */
export function resolveList(list, tasks) {
  return {
    ...list,
    curated: true,
    // A reference to a task that no longer exists is dropped rather than shown
    // as a broken row: the list is a selection, and a selection of nothing is
    // simply shorter.
    tasks: list.refs.map((ref) => tasks[ref]).filter(Boolean),
  }
}

export function progressOf(tasks) {
  if (tasks.length === 0) return { open: 0, percent: 0 }
  const open = tasks.filter((task) => !task.done).length
  return { open, percent: Math.round((100 * (tasks.length - open)) / tasks.length) }
}

/** Groups the base by domain, for the "everything" view. */
export function byDomain(tasks, t = (key) => key) {
  const groups = new Map()
  for (const task of tasks) {
    const key = task.dom ?? ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(task)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([dom, items]) => ({ dom: dom || t('No domain'), tasks: items }))
}

/**
 * Flips `done:` in a page's frontmatter.
 *
 * Rewriting the file rather than keeping an overlay: a tick is just a write,
 * and one source of truth beats two that agree most of the time. The line is
 * edited in place so nothing else about the page moves — a checkbox must not
 * reformat someone's note.
 *
 * Closing writes the DATE (`done: 2026-08-24`), reopening removes the line:
 * both are the predecessor's own conventions, adopted because they carry
 * more than a boolean and cost nothing. That shared shape is what lets two
 * shells tick the same file without disagreeing about what it says.
 */
export function toggleDone(markdown, done) {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  if (!match) return null

  const front = match[1]

  if (!done) {
    // Absence means open — a `done: false` line would be a third state
    // nobody defined.
    const cleared = front.replace(/\n?^done:.*$/m, '')
    return cleared === front ? markdown : markdown.replace(front, cleared)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const replaced = front.replace(/^done:.*$/m, `done: ${stamp}`)
  if (replaced !== front) return markdown.replace(front, replaced)

  // No `done` at all: added at the end of the frontmatter, where a human
  // adding one would put it.
  return markdown.replace(front, `${front}\ndone: ${stamp}`)
}

/**
 * Where a NEW task is filed.
 *
 * A folder name is a word before it is a path, so it follows the instance's
 * language like every other word this plugin ships: `taches` in French,
 * `todo` elsewhere. That default is a guess about filing, though, and only
 * the person filing knows — so a page of `type: todo-config` overrides it
 * for the whole instance, and the agent changes it with the file tools it
 * already has.
 *
 * It decides nothing about READING: a task is found by its `type:` wherever
 * it sits, so a base spread over several folders is merely a base spread
 * over several folders.
 */
const FOLDERS = { fr: 'taches' }

export function taskFolder(config, locale) {
  const declared = typeof config?.folder === 'string' ? config.folder.trim() : ''
  const fallback = FOLDERS[String(locale ?? '').slice(0, 2)] ?? 'todo'
  return (declared || fallback).replace(/^\/+|\/+$/g, '')
}

/**
 * A title, as a file name.
 *
 * Accents folded and punctuation dropped, because the page id ends up in URLs,
 * in `refs:` lists and in whatever the agent types at a shell — three places
 * where `Poncer la porte (garage).md` is a small tax paid forever.
 */
export function slugify(title) {
  const slug = String(title)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  // A title with nothing latin in it still deserves a file: the id is a
  // handle, and the title stays in the frontmatter where it is read from.
  return slug || 'tache'
}

/**
 * A free path for a new task.
 *
 * Two tasks may legitimately be called the same thing — "appeler le plombier"
 * happens twice a year — so a taken name is suffixed rather than refused. The
 * server refuses to overwrite anyway (a PUT with no revision on an existing
 * file is a 409), which is what makes this a courtesy rather than a guard.
 */
export function newTaskPath(folder, title, taken = []) {
  const base = `${folder}/${slugify(title)}`
  const used = new Set(taken)
  let candidate = base
  let n = 2
  while (used.has(candidate)) candidate = `${base}-${n++}`
  return `${candidate}.md`
}

/**
 * A YAML scalar that survives being read back.
 *
 * Quoted only when it must be, so the file a person opens looks like the file
 * they would have written: `title: Poncer la porte`, not `title: "Poncer la
 * porte"`. Single quotes when quoting is needed, since the index parser reads
 * frontmatter line by line and strips one layer of them.
 */
function yamlScalar(raw) {
  const text = String(raw).trim()
  const risky = text === '' || /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) || /:\s|\s#/.test(text)
  return risky ? `'${text.replace(/'/g, "''")}'` : text
}

/**
 * The page a captured task becomes.
 *
 * Deliberately the SHORTEST page the contract allows: type, title, and the
 * two fields the list itself displays. Everything else a task can carry —
 * `pri`, `projet`, `sub`, a body — is written in the page editor or by the
 * agent, because a form that asked for all of them would be a second copy of
 * the authoring contract, in JavaScript, drifting from the skill that states
 * it. No `done:` line either: absence means open, and this file must say the
 * same thing as the one a tick produces.
 */
export function taskMarkdown({ title, due, dom } = {}) {
  const lines = ['type: tache', `title: ${yamlScalar(title)}`]
  if (due) lines.push(`due: ${yamlScalar(due)}`)
  if (dom) lines.push(`dom: ${yamlScalar(dom)}`)
  return `---\n${lines.join('\n')}\n---\n`
}
