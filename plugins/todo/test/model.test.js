/**
 * The todo model, tested as plain JavaScript.
 *
 * Deliberately not a Adestia package: a bundled plugin is an ordinary plugin,
 * and a plugin author has no monorepo. If this can only be tested from inside
 * the repository, the contract is not what it claims to be.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assigneesOf,
  buildModel,
  byDomain,
  dynamicLists,
  hueOf,
  initialsOf,
  isDeferred,
  meOf,
  newTaskPath,
  progressOf,
  resolveList,
  setField,
  slugify,
  taskFolder,
  taskMarkdown,
  toggleDone,
} from '../web/model.js'

const page = (path, fields, title = path) => ({ path, title, fields })
const day = (offset) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

test('a task is a page carrying type: tache', () => {
  const { tasks } = buildModel([
    page('t/a.md', { type: 'tache', done: false, dom: 'atelier' }, 'Poncer'),
    page('note.md', { type: 'fiche' }),
    page('plain.md', {}),
  ])
  assert.deepEqual(Object.keys(tasks), ['t/a'])
  assert.equal(tasks['t/a'].title, 'Poncer')
  assert.equal(tasks['t/a'].dom, 'atelier')
})

test('a list holds references, never copies', () => {
  const { lists } = buildModel([page('l/today.md', { type: 'liste', refs: ['t/a', 't/b'] }, 'Today')])
  assert.deepEqual(lists['l/today'].refs, ['t/a', 't/b'])
})

test('a reference to a task that is gone is dropped, not shown broken', () => {
  const { tasks, lists } = buildModel([
    page('t/a.md', { type: 'tache' }),
    page('l/x.md', { type: 'liste', refs: ['t/a', 't/vanished'] }),
  ])
  assert.equal(resolveList(lists['l/x'], tasks).tasks.length, 1)
})

test('dynamic lists answer the four questions a todo list actually gets', () => {
  const { tasks } = buildModel([
    page('t/late.md', { type: 'tache', done: false, due: day(-3) }),
    page('t/today.md', { type: 'tache', done: false, due: day(0) }),
    page('t/soon.md', { type: 'tache', done: false, due: day(3) }),
    page('t/far.md', { type: 'tache', done: false, due: day(30) }),
    page('t/done.md', { type: 'tache', done: true, due: day(-9) }),
  ])
  const byId = Object.fromEntries(dynamicLists(tasks).map((l) => [l.id, l.tasks.map((t) => t.id)]))

  assert.deepEqual(byId.late, ['t/late'])
  assert.deepEqual(byId.today, ['t/today'])
  assert.deepEqual(byId.soon, ['t/soon'])
  // A closed task is in none of them: "open" is what a todo list is for.
  assert.equal(byId.open.includes('t/done'), false)
  assert.equal(byId.open.length, 4)
})

test('undated tasks sort last — a date is information, its absence is not', () => {
  const { tasks } = buildModel([
    page('t/none.md', { type: 'tache', done: false }),
    page('t/soon.md', { type: 'tache', done: false, due: day(1) }),
  ])
  const open = dynamicLists(tasks).find((l) => l.id === 'open')
  assert.deepEqual(open.tasks.map((t) => t.id), ['t/soon', 't/none'])
})

test('domains group the base, with the undomained last', () => {
  const groups = byDomain([
    { id: 'a', dom: 'maison' },
    { id: 'b', dom: null },
    { id: 'c', dom: 'atelier' },
  ])
  assert.deepEqual(groups.map((g) => g.dom), ['atelier', 'maison', 'No domain'])
})

test('progress counts what is left', () => {
  assert.deepEqual(progressOf([{ done: true }, { done: false }]), { open: 1, percent: 50 })
  assert.deepEqual(progressOf([]), { open: 0, percent: 0 })
})

const TODAY = new Date().toISOString().slice(0, 10)

test('ticking writes the DATE, and edits nothing else', () => {
  // A checkbox must not reformat somebody's note — and `done` carries WHEN,
  // the predecessor's own convention, richer than a boolean for free.
  const before = '---\ntype: tache\ndone: false\ndue: 2026-09-01\n---\n\nGrain 120.\n'
  const after = toggleDone(before, true)
  assert.equal(after, `---\ntype: tache\ndone: ${TODAY}\ndue: 2026-09-01\n---\n\nGrain 120.\n`)
})

test('ticking a task that never had a done field adds one', () => {
  const after = toggleDone('---\ntype: tache\n---\n\nBody.\n', true)
  assert.equal(after, `---\ntype: tache\ndone: ${TODAY}\n---\n\nBody.\n`)
})

test('unticking removes the line — absence means open', () => {
  // `done: false` would be a third state nobody defined; the sibling shell
  // treats absence as open, and sharing one store means sharing one meaning.
  const before = `---\ntype: tache\ndone: ${TODAY}\ndue: 2026-09-01\n---\n\nBody.\n`
  const after = toggleDone(before, false)
  assert.equal(after, '---\ntype: tache\ndue: 2026-09-01\n---\n\nBody.\n')
})

test('a date-valued done reads as closed, a bare true still does too', () => {
  const { tasks } = buildModel([
    page('t/dated.md', { type: 'tache', done: '2026-07-22' }),
    page('t/legacy.md', { type: 'tache', done: true }),
    page('t/open.md', { type: 'tache' }),
  ])
  assert.equal(tasks['t/dated'].done, true)
  assert.equal(tasks['t/dated'].doneOn, '2026-07-22')
  assert.equal(tasks['t/legacy'].done, true)
  assert.equal(tasks['t/open'].done, false)
})

test('a page with no frontmatter cannot be ticked, and says so by returning null', () => {
  assert.equal(toggleDone('# Just a heading\n', true), null)
})

test('a new task is filed in the language’s own word for the folder', () => {
  assert.equal(taskFolder({}, 'fr'), 'taches')
  assert.equal(taskFolder({}, 'fr-CA'), 'taches')
  assert.equal(taskFolder({}, 'en'), 'todo')
  assert.equal(taskFolder({}, undefined), 'todo')
})

test('a settings page overrides the folder, and slashes around it are forgiven', () => {
  const { config } = buildModel([
    page('reglages.md', { type: 'todo-config', folder: '/perso/taches/' }),
  ])
  assert.equal(taskFolder(config, 'fr'), 'perso/taches')
  // An empty value is a field somebody cleared, not a folder called "".
  assert.equal(taskFolder({ folder: '  ' }, 'fr'), 'taches')
})

test('two settings pages give the same answer on every reload', () => {
  // The index is sorted by path, so "first wins" is a stable rule; "last
  // wins" would depend on how the folder happened to be walked.
  const { config } = buildModel([
    page('a.md', { type: 'todo-config', folder: 'un' }),
    page('b.md', { type: 'todo-config', folder: 'deux' }),
  ])
  assert.equal(config.folder, 'un')
})

test('a settings page is not a task and not a list', () => {
  const { tasks, lists } = buildModel([page('reglages.md', { type: 'todo-config', folder: 'x' })])
  assert.deepEqual(Object.keys(tasks), [])
  assert.deepEqual(Object.keys(lists), [])
})

test('a title becomes a file name a URL can carry', () => {
  assert.equal(slugify('Réparer la fenêtre — côté jardin !'), 'reparer-la-fenetre-cote-jardin')
  assert.equal(slugify('  Poncer la porte (garage)  '), 'poncer-la-porte-garage')
  // Nothing latin left is still a task: the id is a handle, the title lives
  // in the frontmatter.
  assert.equal(slugify('买菜'), 'tache')
})

test('a name already taken is suffixed, never reused', () => {
  // "Appeler le plombier" happens twice a year, and the second one must not
  // land on the first one's page.
  assert.equal(newTaskPath('taches', 'Appeler le plombier', []), 'taches/appeler-le-plombier.md')
  assert.equal(
    newTaskPath('taches', 'Appeler le plombier', ['taches/appeler-le-plombier']),
    'taches/appeler-le-plombier-2.md',
  )
  assert.equal(
    newTaskPath('taches', 'Appeler le plombier', ['taches/appeler-le-plombier', 'taches/appeler-le-plombier-2']),
    'taches/appeler-le-plombier-3.md',
  )
})

test('a captured task is the shortest page the contract allows', () => {
  assert.equal(taskMarkdown({ title: 'Poncer la porte' }), '---\ntype: tache\ntitle: Poncer la porte\n---\n')
  assert.equal(
    taskMarkdown({ title: 'Poncer la porte', due: '2026-09-01', dom: 'atelier' }),
    '---\ntype: tache\ntitle: Poncer la porte\ndue: 2026-09-01\ndom: atelier\n---\n',
  )
})

test('a captured task has no done line — absence means open', () => {
  // The same thing a tick says when it reopens a task. Two ways to write
  // "not done" is how two shells start disagreeing.
  assert.equal(taskMarkdown({ title: 'x' }).includes('done'), false)
})

test('a title that would break the frontmatter is quoted, and read back whole', () => {
  const markdown = taskMarkdown({ title: 'Appeler: le plombier' })
  assert.equal(markdown, "---\ntype: tache\ntitle: 'Appeler: le plombier'\n---\n")
  // Quoted only when it must be, so the file looks like one a person wrote.
  assert.equal(taskMarkdown({ title: "L'évier fuit" }), "---\ntype: tache\ntitle: L'évier fuit\n---\n")
  assert.equal(taskMarkdown({ title: '- ranger' }), "---\ntype: tache\ntitle: '- ranger'\n---\n")
})


// ── Ce que la v2 ajoute ──────────────────────────────────────────────────

test('a task deferred to a future date leaves every live view', () => {
  // The whole value of `start:`. Planning something for November must not add
  // to the noise of today — otherwise the field is decoration.
  const { tasks } = buildModel([
    page('t/now.md', { type: 'tache', due: day(0) }),
    page('t/later.md', { type: 'tache', due: day(1), start: day(20) }),
  ])
  const byId = Object.fromEntries(dynamicLists(tasks).map((l) => [l.id, l.tasks.map((t) => t.id)]))

  assert.deepEqual(byId.open, ['t/now'])
  assert.deepEqual(byId.soon, [])
  assert.deepEqual(byId.later, ['t/later'])
})

test('a start date that has passed defers nothing — it is simply a normal task', () => {
  const { tasks } = buildModel([page('t/a.md', { type: 'tache', due: day(-2), start: day(-9) })])
  const byId = Object.fromEntries(dynamicLists(tasks).map((l) => [l.id, l.tasks.map((t) => t.id)]))
  // And it can be LATE: it is `due` that decides that, never `start`.
  assert.deepEqual(byId.late, ['t/a'])
  assert.deepEqual(byId.later, [])
})

test('a closed task is never deferred — done has already answered', () => {
  assert.equal(isDeferred({ done: true, start: day(30) }, day(0)), false)
  assert.equal(isDeferred({ done: false, start: day(30) }, day(0)), true)
  assert.equal(isDeferred({ done: false, start: null }, day(0)), false)
})

test('deferred tasks read as a calendar, earliest first', () => {
  const { tasks } = buildModel([
    page('t/b.md', { type: 'tache', start: day(40) }),
    page('t/a.md', { type: 'tache', start: day(10) }),
  ])
  const later = dynamicLists(tasks).find((l) => l.id === 'later')
  assert.deepEqual(later.tasks.map((t) => t.id), ['t/a', 't/b'])
})

test('who is "me": the written answer wins, then the session, then nobody', () => {
  assert.equal(meOf({ me: 'antoine' }, { userId: 'a.berard' }), 'antoine')
  assert.equal(meOf({}, { userId: 'a.berard' }), 'a.berard')
  assert.equal(meOf({}, undefined), null)
  // The ungated instance's placeholder names nobody: taking it would file
  // every task under a user called "local".
  assert.equal(meOf({}, { userId: 'local' }), null)
})

test('the settings that count are the DEFAULT store\'s', () => {
  // A shared circle is mounted by several instances, so a `me` written there
  // would tell every one of them it is the same person.
  const shared = { path: 'famille/reglages.md', title: 'r', fields: { type: 'todo-config', me: 'celine' }, store: 'famille' }
  const mine = { path: 'perso/reglages.md', title: 'r', fields: { type: 'todo-config', me: 'antoine' }, store: 'perso' }
  const stores = [{ id: 'famille' }, { id: 'perso', default: true }]

  // Whatever the order the listing happens to arrive in.
  assert.equal(buildModel([shared, mine], stores).config.me, 'antoine')
  assert.equal(buildModel([mine, shared], stores).config.me, 'antoine')
  // With no store table at all — the single-store instance — nothing changes.
  assert.equal(buildModel([shared, mine]).config.me, 'celine')
})

test('the people are discovered from the base, like the domains are', () => {
  const { tasks } = buildModel([
    page('t/a.md', { type: 'tache', assignee: 'celine' }),
    page('t/b.md', { type: 'tache', assignee: 'antoine' }),
    page('t/c.md', { type: 'tache', assignee: 'celine' }),
    page('t/d.md', { type: 'tache' }),
  ])
  assert.deepEqual(assigneesOf(Object.values(tasks)), ['antoine', 'celine'])
})

test('a handle keeps its colour, and adding somebody repaints nobody', () => {
  const before = hueOf('antoine')
  assert.equal(hueOf('antoine'), before)
  // Derived from the handle, not from a position in a list.
  assert.equal(hueOf('antoine'), before)
  assert.notEqual(hueOf('antoine'), null)
  // Always a NAME from the closed table — never a hex a skin cannot restyle.
  assert.match(hueOf('celine'), /^[a-z]+$/)
})

test('two letters survive being read without the colour', () => {
  assert.equal(initialsOf('antoine'), 'AN')
  assert.equal(initialsOf('jean-marc'), 'JM')
  assert.equal(initialsOf('a'), 'A')
})

test('attachments are read as a list, however the one file was written', () => {
  const { tasks } = buildModel([
    page('t/a.md', { type: 'tache', files: ['admin/devis.pdf', 'diy/avant.jpg'] }),
    page('t/b.md', { type: 'tache', files: 'admin/devis.pdf' }),
    page('t/c.md', { type: 'tache' }),
  ])
  assert.deepEqual(tasks['t/a'].files, ['admin/devis.pdf', 'diy/avant.jpg'])
  assert.deepEqual(tasks['t/b'].files, ['admin/devis.pdf'])
  assert.deepEqual(tasks['t/c'].files, [])
})

test('whether a task carries a note is the index\'s answer, never a guess', () => {
  const { tasks } = buildModel([
    { path: 't/a.md', title: 'a', fields: { type: 'tache' }, body: true },
    { path: 't/b.md', title: 'b', fields: { type: 'tache' }, body: false },
    { path: 't/c.md', title: 'c', fields: { type: 'tache' } },
  ])
  assert.equal(tasks['t/a'].body, true)
  assert.equal(tasks['t/b'].body, false)
  // An older server that does not publish it: no marker, rather than a wrong one.
  assert.equal(tasks['t/c'].body, false)
})

test('capture writes the two new fields, and only when they were given', () => {
  assert.equal(
    taskMarkdown({ title: 'Ramoner', start: '2026-11-03', assignee: 'antoine' }),
    '---\ntype: tache\ntitle: Ramoner\nstart: 2026-11-03\nassignee: antoine\n---\n',
  )
  assert.equal(taskMarkdown({ title: 'Ramoner' }), '---\ntype: tache\ntitle: Ramoner\n---\n')
})

test('a field is set, replaced and cleared in place, moving nothing else', () => {
  const page = '---\ntype: tache\ntitle: Poncer\ndom: atelier\n---\n\nGrain 120.\n'

  // Added where a human adding one would put it, and the body is untouched.
  const added = setField(page, 'assignee', 'antoine')
  assert.match(added, /\ndom: atelier\nassignee: antoine\n---/)
  assert.match(added, /\n\nGrain 120\.\n$/)

  // Replaced in place: the line keeps its position.
  assert.match(setField(added, 'assignee', 'celine'), /\nassignee: celine\n---/)

  // Cleared entirely — absence is how this contract spells "not set", and an
  // empty `assignee:` would be a second way to say it.
  assert.equal(setField(added, 'assignee', ''), page)

  assert.equal(setField('no frontmatter\n', 'assignee', 'x'), null)
})
