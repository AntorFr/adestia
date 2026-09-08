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

const str = (value) => (typeof value === 'string' && value !== '' ? value : null)

/**
 * A frontmatter list, however it was written.
 *
 * The index parses `[a, b]` into an array and a lone value into a scalar, and
 * somebody writing one file will write `files: devis.pdf` sooner or later.
 * Reading both costs a line and saves a page that looks empty for no reason
 * anybody can see.
 */
const list = (value) =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : str(value) ? [String(value)] : []

export function buildModel(entries, stores = []) {
  const tasks = {}
  const lists = {}
  const configs = []

  for (const entry of entries) {
    const fields = entry.fields ?? {}
    const id = idOf(entry.path)

    if (fields.type === 'tache') {
      tasks[id] = {
        id,
        path: entry.path,
        title: entry.title,
        // Which store carries it, on an instance composing several. Absent
        // everywhere else, and the screen then draws no provenance at all —
        // a mark on every row is not a mark.
        store: entry.store,
        // `done` carries WHEN, not merely whether: the predecessor's corpus
        // writes `done: 2026-07-22`, which is strictly more information than
        // a boolean and costs nothing to honour. Truthy-but-not-"false" is
        // closed; a bare `true` (this plugin's own former format) still
        // counts, so no page written either way reads wrong.
        done: fields.done === true || (typeof fields.done === 'string' && fields.done !== '' && fields.done !== 'false'),
        doneOn: typeof fields.done === 'string' ? fields.done : null,
        due: str(fields.due),
        /**
         * The date before which the task is not to be thought about.
         *
         * `start` means PAS AVANT — never "I have begun". The word is
         * iCalendar's `DTSTART` and Microsoft Graph's `startDateTime`;
         * Taskwarrior uses the same five letters for the opposite idea, which
         * is exactly why this sentence is written down rather than assumed.
         */
        start: str(fields.start),
        /**
         * Who carries it. One handle, never a list: a task with two owners
         * has none, and that is the failure this field exists to end.
         * Absent means UP FOR GRABS, which is a state and not a blank.
         */
        assignee: str(fields.assignee),
        /**
         * Documents, cited rather than copied — logical paths, resolved like
         * a link. The file lives wherever it lives, in one copy, and two
         * tasks may point at the same one.
         *
         * Deliberately NOT the files sitting in the page's folder, which is
         * what the core calls a page's attachments: every task shares one
         * folder, so a single PDF dropped there would show under all of them.
         */
        files: list(fields.files),
        /**
         * Whether the page says anything under its frontmatter — the core's
         * own answer, published on the index. Never computed here: a body is
         * not in the fields, and asking page by page would be one request per
         * row.
         */
        body: entry.body === true,
        pri: typeof fields.pri === 'number' ? fields.pri : null,
        dom: str(fields.dom),
        projet: str(fields.projet),
        sub: Array.isArray(fields.sub) ? fields.sub.map(String) : [],
      }
    } else if (fields.type === 'todo-config') {
      // Collected rather than taken on sight: which one wins depends on its
      // STORE, and that is decided once the whole listing is read.
      configs.push({ store: entry.store, fields })
    } else if (fields.type === 'liste') {
      lists[id] = {
        id,
        title: entry.title,
        icon: str(fields.ico) ?? '📋',
        refs: Array.isArray(fields.refs) ? fields.refs.map(String) : [],
      }
    }
  }

  return { tasks, lists, config: settings(configs, stores), stores }
}

/**
 * The instance's own settings, and WHICH copy of them counts.
 *
 * The default store wins. That is not a tidiness rule: a shared circle is
 * mounted by several instances, so a `todo-config` written there would tell
 * every one of them that it is the same person — the `me` below is precisely
 * the field that must not travel. Reading it from the store this shell writes
 * to is what keeps the answer personal.
 *
 * Failing that, the first by path, which is what the index's ordering makes
 * stable: "last wins" would depend on how the folder happened to be walked.
 */
function settings(configs, stores) {
  if (configs.length === 0) return {}
  const home = stores.find((store) => store.default)?.id
  const mine = home === undefined ? undefined : configs.find((config) => config.store === home)
  return (mine ?? configs[0]).fields
}

/**
 * Which handle is the person at this screen.
 *
 * Two mountings are supported and they answer differently. Several instances
 * sharing a folder cannot tell who they are — `auth: none` yields a placeholder
 * identity that names nobody — so the settings page says it. One instance with
 * real accounts already knows, per visitor, and needs no configuration at all.
 *
 * So: the written answer wins where it exists, the session answers otherwise,
 * and NEITHER means the "mine" facet is not offered. A wrong "mine" is worse
 * than no "mine": it hides other people's work behind your name.
 */
export function meOf(config, identity) {
  const declared = str(config?.me)
  if (declared) return declared
  const userId = str(identity?.userId)
  // The ungated instance's placeholder names nobody, and taking it would file
  // every task under a user called "local".
  return userId && userId !== 'local' ? userId : null
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Whether a task is not yet to be thought about.
 *
 * The whole value of `start:` is this predicate: a deferred task LEAVES the
 * live views instead of adding to today's noise, and comes back on its own
 * the morning it becomes doable. It is what OmniFocus calls deferring,
 * todo.txt spells `t:` and Taskwarrior `wait` — all three hide.
 *
 * A closed task is never deferred: `done` has already answered.
 */
export function isDeferred(task, day = today()) {
  return !task.done && task.start !== null && task.start > day
}

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
    Later: 'Plus tard',
    'not before their start date': 'pas avant leur date de début',
    'No domain': 'Sans domaine',
    'New task': 'Nouvelle tâche',
    'Due date': 'Échéance',
    'Start date': 'Date de début',
    Domain: 'Domaine',
    'New domain…': 'Nouveau domaine…',
    Add: 'Ajouter',
    Open: 'Ouvrir',
    'could not create that task': 'création impossible',
    'another author just took that name — try again': 'un autre auteur vient de prendre ce nom — réessayez',
    // The six that shipped in English for want of an entry here.
    'Loading…': 'Chargement…',
    'Nothing here.': 'Rien ici.',
    Todo: 'Todo',
    // v2
    Who: 'Qui',
    Mine: 'Pour moi',
    Everyone: 'Tous',
    Unassigned: 'À prendre',
    Assignee: 'Porteur',
    'Not before': 'Dès le',
    'Due on': 'Pour le',
    Project: 'Chantier',
    Note: 'Note',
    Attachments: 'Pièces jointes',
    Subtasks: 'Sous-tâches',
    Back: 'Retour',
    Details: 'Détail',
    'from %n': 'de %n',
    Overdue: 'En retard',
    'This week': 'Cette semaine',
    Done: 'Fait',
    'Done this week': 'Faites cette semaine',
    'Add a task here…': 'Ajouter une tâche ici…',
    '%open to do': '%open à faire',
    '%n late': '%n en retard',
    '%n later': '%n plus tard',
    '%n unassigned': '%n à prendre',
    Beyond: 'Plus loin',
    'that task no longer exists': "cette tâche n'existe plus",
    'that task has no frontmatter': "cette tâche n'a pas d'entête",
    'the agent changed that task — reloading': "l'agent a modifié cette tâche — rechargement",
    'could not save': 'enregistrement impossible',
    today: 'auj.',
    'from %d': 'dès le %d',
    'Tasks here': "Tâches d'ici",
    'this folder and below': 'ce dossier et ses sous-dossiers',
    'nothing to do here': 'rien à faire ici',
  },
}

/**
 * The keys a locale actually answers.
 *
 * Exported for one reason: a test proves that every `t('…')` written in this
 * plugin has an entry here. Eight of them shipped in English once — added to
 * the code after the words file had been committed, so a review of the diff
 * showed a screen full of French and a table that did not have it. The class
 * is what is pinned, never the eight.
 */
export function known(locale) {
  return Object.keys(WORDS[String(locale ?? '').slice(0, 2)] ?? {})
}

export function words(locale) {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key, values) => {
    let text = table[key] ?? key
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replace(`%${name}`, String(value))
    }
    return text
  }
}

/**
 * The dynamic lists.
 *
 * Kept few and obvious on purpose. A view for every possible query is a view
 * nobody scans; these are the questions a todo list actually gets asked.
 *
 * Four of them are about what is DOABLE, so a deferred task appears in none of
 * them — that is the point of a start date, not a side effect. The fifth
 * exists so deferring is not the same as forgetting.
 */
export function dynamicLists(tasks, t = (key) => key, day = today()) {
  const all = Object.values(tasks)
  const open = all.filter((task) => !task.done)
  const doable = open.filter((task) => !isDeferred(task, day))
  const later = open.filter((task) => isDeferred(task, day))

  return [
    {
      id: 'late',
      title: t('Late'),
      icon: '🔥',
      description: t('past its due date'),
      tasks: doable.filter((task) => task.due && task.due < day).sort(byDue),
    },
    {
      id: 'today',
      title: t('Today'),
      icon: '📅',
      description: t('due today'),
      tasks: doable.filter((task) => task.due === day),
    },
    {
      id: 'soon',
      title: t('Next 7 days'),
      icon: '🗓',
      description: t('due within the week'),
      tasks: doable.filter((task) => task.due && task.due > day && task.due <= plusDays(day, 7)).sort(byDue),
    },
    {
      id: 'open',
      title: t('Everything open'),
      icon: '📥',
      description: t('the whole base, undone'),
      tasks: doable.slice().sort(byDue),
    },
    {
      id: 'later',
      title: t('Later'),
      icon: '🌱',
      description: t('not before their start date'),
      tasks: later.slice().sort(byStart),
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

/** Deferred tasks sort by when they wake up — the list reads as a calendar. */
function byStart(a, b) {
  if (a.start === b.start) return 0
  if (!a.start) return 1
  if (!b.start) return -1
  return a.start < b.start ? -1 : 1
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
 * The handles the base already uses.
 *
 * Discovered rather than declared, exactly as domains are. There is no roster
 * page and no settings list: a name nobody has been given is a name nobody
 * needs, and the day one deserves decoration it will be a page like everything
 * else. Sorted so the same base always offers the same menu.
 */
export function assigneesOf(tasks) {
  return [...new Set(tasks.map((task) => task.assignee).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
}

/**
 * The twelve named hues, in the order a skin declares them.
 *
 * Named, never a hex: the skin decides what `indigo` looks like, and a plugin
 * that hardcoded a colour would be a plugin that looks wrong under the next
 * livery.
 */
const HUES = [
  'indigo',
  'rose',
  'emeraude',
  'ambre',
  'violet',
  'turquoise',
  'orange',
  'bleu',
  'vert',
  'rouge',
  'gris',
  'ardoise',
]

/**
 * A stable colour for a handle.
 *
 * Derived rather than stored, so a base with no configuration still shows
 * people apart — and derived from the HANDLE rather than from its position in
 * a list, so adding somebody does not repaint everybody else.
 */
export function hueOf(handle) {
  let sum = 0
  for (const char of String(handle)) sum = (sum * 31 + char.codePointAt(0)) % 100000
  return HUES[sum % HUES.length]
}

/**
 * Two letters for a face.
 *
 * The colour alone is never the label — this design system requires every pill
 * to survive being read by somebody who cannot separate the hues, and a plain
 * dot would fail that. `jean-marc` gives JM, `antoine` gives AN.
 */
export function initialsOf(handle) {
  const parts = String(handle).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const letters =
    parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] ?? String(handle)).slice(0, 2)
  return letters.toLocaleUpperCase()
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
 * Sets, or clears, one scalar field of a page's frontmatter.
 *
 * The same surgery `toggleDone` performs, generalised for the fields the sheet
 * lets a person change. In place, one line, nothing else moved — a form must
 * not reformat a page the agent wrote.
 *
 * An empty value REMOVES the line rather than writing `field:` with nothing
 * after it: absence is how this contract spells "not set", and an empty string
 * would be a second way to say it that every reader would have to know about.
 */
export function setField(markdown, key, value) {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  if (!match) return null

  const front = match[1]
  const line = new RegExp(`^${key}:.*$`, 'm')

  if (value === '' || value === null || value === undefined) {
    const cleared = front.replace(new RegExp(`\\n?^${key}:.*$`, 'm'), '')
    return cleared === front ? markdown : markdown.replace(front, cleared)
  }

  const written = `${key}: ${Array.isArray(value) ? `[${value.map(yamlScalar).join(', ')}]` : yamlScalar(value)}`
  const replaced = front.replace(line, written)
  return markdown.replace(front, replaced !== front ? replaced : `${front}\n${written}`)
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
 * Still the SHORTEST page the contract allows: type, title, and the fields the
 * capture bar actually offers. Everything else a task can carry — `pri`,
 * `projet`, `sub`, `files`, a body — is written on the sheet or by the agent,
 * because a form asking for all of them would be a second copy of the
 * authoring contract, in JavaScript, drifting from the skill that states it.
 *
 * No `done:` line either: absence means open, and this file must say the same
 * thing as the one a tick produces.
 */
export function taskMarkdown({ title, due, start, dom, assignee } = {}) {
  const lines = ['type: tache', `title: ${yamlScalar(title)}`]
  if (due) lines.push(`due: ${yamlScalar(due)}`)
  if (start) lines.push(`start: ${yamlScalar(start)}`)
  if (assignee) lines.push(`assignee: ${yamlScalar(assignee)}`)
  if (dom) lines.push(`dom: ${yamlScalar(dom)}`)
  return `---\n${lines.join('\n')}\n---\n`
}
