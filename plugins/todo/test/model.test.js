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
  buildModel,
  byDomain,
  dynamicLists,
  newTaskPath,
  progressOf,
  resolveList,
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
