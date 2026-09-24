import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  badgeOf,
  barState,
  classify,
  fraction,
  fromPages,
  gradeOf,
  labelRows,
  parseLine,
  PROJECT_STATUSES,
  span,
  subprojectsOf,
  under,
} from '../web/model.js'

// ── parseLine: one line, one entry, or null by name ─────────────────────────

test('two dates make a phase', () => {
  assert.deepEqual(parseLine('Cadrage: 2026-01-15 → 2026-03-01'), {
    label: 'Cadrage',
    start: '2026-01-15',
    due: '2026-03-01',
  })
})

test('one date makes a milestone — a phase without a beginning', () => {
  assert.deepEqual(parseLine('Recette: 2026-06-01'), { label: 'Recette', due: '2026-06-01' })
})

test('the ASCII arrow reads like the pretty one', () => {
  assert.deepEqual(parseLine('Réalisation: 2026-03-01 -> 2026-09-30'), {
    label: 'Réalisation',
    start: '2026-03-01',
    due: '2026-09-30',
  })
})

test('the FIRST colon splits, so a label may not hide a second entry', () => {
  // Same cut as `figures`: everything after the first colon is the dates.
  assert.equal(parseLine('a: b: 2026-01-01'), null)
})

test('a phase ending before it starts is unreadable, never swapped', () => {
  assert.equal(parseLine('Retour: 2026-03-01 → 2026-01-01'), null)
})

test('what is not a date is not almost a date', () => {
  assert.equal(parseLine('Cadrage: janvier'), null)
  assert.equal(parseLine('Cadrage: 2026-1-5'), null)
  assert.equal(parseLine('Cadrage: 2026-01-15 → mars'), null)
  assert.equal(parseLine(': 2026-01-15'), null)
  assert.equal(parseLine('juste du texte'), null)
  assert.equal(parseLine('a: 1 → 2 → 3'), null)
})

// ── span: the axis, snapped outward to whole units ──────────────────────────

const PHASES = [
  { label: 'Cadrage', start: '2026-01-15', due: '2026-03-01' },
  { label: 'Recette', due: '2026-06-01' },
]

test('months: floor to the 1st, ceil past the last date, one tick per month', () => {
  const box = span(PHASES, 'months')
  assert.equal(box.min, '2026-01-01')
  assert.equal(box.max, '2026-07-01')
  assert.deepEqual(box.ticks, [
    '2026-01-01',
    '2026-02-01',
    '2026-03-01',
    '2026-04-01',
    '2026-05-01',
    '2026-06-01',
  ])
})

test('weeks start on Monday', () => {
  // 2026-09-09 is a Wednesday; its week starts on Monday the 7th.
  const box = span([{ label: 'x', due: '2026-09-09' }], 'weeks')
  assert.equal(box.min, '2026-09-07')
  assert.equal(box.max, '2026-09-14')
})

test('quarters snap to their first month', () => {
  const box = span(PHASES, 'quarters')
  assert.equal(box.min, '2026-01-01')
  assert.equal(box.max, '2026-07-01')
  assert.deepEqual(box.ticks, ['2026-01-01', '2026-04-01'])
})

test('no dates, no axis — the caller says so instead of drawing one', () => {
  assert.equal(span([], 'months'), null)
})

// ── fraction and classify: geometry and the calendar's own verdicts ─────────

test('fraction is 0 at min and 1 at max', () => {
  const box = { min: '2026-01-01', max: '2026-07-01' }
  assert.equal(fraction('2026-01-01', box), 0)
  assert.equal(fraction('2026-07-01', box), 1)
  assert.ok(Math.abs(fraction('2026-04-01', box) - 0.497) < 0.01)
})

test('a written phase gets the calendar and nothing else', () => {
  const phase = { label: 'x', start: '2026-03-01', due: '2026-04-01' }
  assert.equal(classify(phase, '2026-02-01'), 'ahead')
  assert.equal(classify(phase, '2026-03-15'), 'current')
  assert.equal(classify(phase, '2026-05-01'), 'past')
  const mile = { label: 'y', due: '2026-06-01' }
  assert.equal(classify(mile, '2026-05-31'), 'ahead')
  assert.equal(classify(mile, '2026-06-01'), 'current')
  assert.equal(classify(mile, '2026-06-02'), 'past')
})

test('elapsed and still open is LATE — but only where a status was read', () => {
  const dates = { label: 'x', start: '2026-03-01', due: '2026-04-01' }
  // A page: its status has spoken, and it disagrees with the calendar.
  assert.equal(classify({ ...dates, finished: false }, '2026-05-01'), 'late')
  // The same dates written in a block: no page, no status, no lateness to
  // invent — the guess this block refuses everywhere else.
  assert.equal(classify(dates, '2026-05-01'), 'past')
})

test('closed stays closed, even inside its own span', () => {
  const phase = { label: 'x', start: '2026-03-01', due: '2026-04-01', finished: true }
  assert.equal(classify(phase, '2026-03-15'), 'done')
  assert.equal(classify(phase, '2026-05-01'), 'done')
  assert.equal(classify(phase, '2026-01-01'), 'done')
})

// ── fromPages: the queried scope, and what it refuses to invent ─────────────

const INDEX = [
  { path: 'chantiers/adestia/INDEX.md', title: 'Adestia v1', fields: {}, finished: false },
  {
    path: 'chantiers/adestia/socle/INDEX.md',
    title: 'Socle de contenu',
    fields: { start: '2026-07-01', due: '2026-08-15' },
    finished: true,
  },
  {
    path: 'chantiers/adestia/editeur/INDEX.md',
    title: 'Éditeur de blocs',
    fields: { start: '2026-08-01', due: '2026-09-30' },
    finished: false,
  },
  { path: 'chantiers/adestia/v1.md', title: 'v1.0', fields: { due: '2026-09-12' }, finished: false },
  { path: 'chantiers/adestia/note.md', title: 'Note', fields: {}, finished: false },
  {
    path: 'chantiers/adestia/editeur/lot2.md',
    title: 'Lot 2',
    fields: { due: '2026-10-01' },
    finished: false,
  },
  { path: 'chantiers/autre/INDEX.md', title: 'Ailleurs', fields: { due: '2026-09-01' }, finished: false },
]

test('children: sub-folders by their index, own pages, nothing from elsewhere', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'children')
  assert.deepEqual(
    entries.map((e) => e.label),
    ['Socle de contenu', 'Éditeur de blocs', 'v1.0'],
  )
  // Not the page carrying the block, not a dateless page, not another branch,
  // and not a page one folder deeper — that is its own folder's business.
  assert.ok(!entries.some((e) => ['Adestia v1', 'Note', 'Ailleurs', 'Lot 2'].includes(e.label)))
})

test('subtree reaches the page one folder deeper', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'subtree')
  assert.ok(entries.some((e) => e.label === 'Lot 2'))
})

test('due alone is a milestone, start with it a phase — the written rules', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'children')
  const mile = entries.find((e) => e.label === 'v1.0')
  assert.equal(mile.start, undefined)
  assert.equal(mile.due, '2026-09-12')
  const phase = entries.find((e) => e.label === 'Socle de contenu')
  assert.equal(phase.start, '2026-07-01')
})

test('the workflow wins over the calendar: a finished page is drawn done', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'children')
  const socle = entries.find((e) => e.label === 'Socle de contenu')
  assert.equal(socle.finished, true)
  // Even on a day inside its own span.
  assert.equal(classify(socle, '2026-08-01'), 'done')
})

test('a bar carries the page it stands for, so it can be opened', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'children')
  assert.equal(entries[0].path, 'chantiers/adestia/socle/INDEX.md')
})

test('a page with start but no due is named, never given an end', () => {
  const { entries, unread } = fromPages(
    [{ path: 'a/x.md', title: 'Sans fin', fields: { start: '2026-01-01' }, finished: false }],
    'a',
    'children',
  )
  assert.deepEqual(entries, [])
  assert.deepEqual(unread, ['Sans fin'])
})

test('a page whose start follows its due is unreadable, never swapped', () => {
  const { entries, unread } = fromPages(
    [
      {
        path: 'a/x.md',
        title: 'À l’envers',
        fields: { start: '2026-03-01', due: '2026-01-01' },
        finished: false,
      },
    ],
    'a',
    'children',
  )
  assert.deepEqual(entries, [])
  assert.deepEqual(unread, ['À l’envers'])
})

test('a page carrying no date at all is silent, not an unreadable line', () => {
  const { entries, unread } = fromPages(
    [{ path: 'a/x.md', title: 'Note', fields: {}, finished: false }],
    'a',
    'children',
  )
  assert.deepEqual(entries, [])
  assert.deepEqual(unread, [])
})

test('what is not an ISO date in a header is not a date', () => {
  const { entries, unread } = fromPages(
    [{ path: 'a/x.md', title: 'Bientôt', fields: { due: 'bientôt' }, finished: false }],
    'a',
    'children',
  )
  assert.deepEqual(entries, [])
  assert.deepEqual(unread, [])
})

test('entries come back in date order, so bars stack down the page', () => {
  const { entries } = fromPages(INDEX, 'chantiers/adestia', 'subtree')
  const dates = entries.map((e) => e.start ?? e.due)
  assert.deepEqual(dates, [...dates].sort())
})

test('under matches the core walk: a folder is its index, not its contents', () => {
  assert.equal(under('a/b/INDEX.md', 'a', 'children'), true)
  assert.equal(under('a/b/page.md', 'a', 'children'), false)
  assert.equal(under('a/b/page.md', 'a', 'subtree'), true)
  assert.equal(under('a/page.md', 'a', 'children'), true)
  assert.equal(under('a/INDEX.md', 'a', 'children'), false)
  assert.equal(under('autre/x.md', 'a', 'subtree'), false)
})

test('milestone labels take the lowest row where they clear, and never overlap', () => {
  // The bench's case: three milestones, the first two a few days apart, the
  // third far enough to share the first row — but only if it truly clears.
  const labels = [
    { at: 0.5, chars: 16 },
    { at: 0.52, chars: 22 },
    { at: 0.8, chars: 19 },
  ]
  const wide = labelRows(labels, 1000)
  assert.deepEqual(wide.map((one) => one.row), [0, 1, 0])
  // Narrow: the third no longer clears the first, so it climbs a row — the
  // alternation it replaced put it on the first one regardless.
  const narrow = labelRows(labels, 400)
  assert.equal(new Set(narrow.map((one) => one.row)).size, 3)
})

test('a label that would run past the right edge reads leftwards', () => {
  const [late] = labelRows([{ at: 0.95, chars: 20 }], 500)
  assert.equal(late.end, true)
  const [early] = labelRows([{ at: 0.1, chars: 20 }], 500)
  assert.equal(early.end, false)
})

test('before the chart is measured, labels alternate', () => {
  const rows = labelRows([{ at: 0.1, chars: 5 }, { at: 0.2, chars: 5 }, { at: 0.3, chars: 5 }], 0)
  assert.deepEqual(rows.map((one) => one.row), [0, 1, 0])
})

// ── project-status: the judgement, and when the page's life speaks first ────

const project = (fields, extra = {}) => ({
  path: 'chantiers/a/INDEX.md',
  title: 'Un projet',
  fields: { type: 'project-management', ...fields },
  finished: false,
  tone: 'underway',
  ...extra,
})

test('a running project shows what its owner says about it', () => {
  assert.deepEqual(badgeOf(project({ status: 'en cours', 'project-status': 'en danger' })), {
    word: 'en danger',
    tone: 'red',
  })
})

test('a project nobody can advance says THAT, whatever grade it carries', () => {
  // « nominal » à côté de « bloqué » serait un projet qui se dit bien portant
  // pendant que personne ne peut y toucher.
  const page = project({ status: 'bloqué', 'project-status': 'nominal' }, { tone: 'waiting' })
  assert.deepEqual(badgeOf(page), { word: 'bloqué', tone: 'waiting' })
})

test('a closed project says it is closed — its last grade is stale', () => {
  const page = project(
    { status: 'clos', 'project-status': 'en danger' },
    { finished: true, tone: 'settled' },
  )
  assert.deepEqual(badgeOf(page), { word: 'clos', tone: 'settled' })
})

test('a running project nobody has graded falls back to its status', () => {
  assert.deepEqual(badgeOf(project({ status: 'en cours' })), { word: 'en cours', tone: 'underway' })
})

test('a page that says nothing about itself wears no badge at all', () => {
  // Une pastille vide serait un état, et « personne n'a rien dit » n'en est pas un.
  assert.equal(badgeOf(project({})), undefined)
})

test('the grade is read whatever its case and spacing', () => {
  assert.equal(gradeOf({ 'project-status': '  En Danger ' }), 'red')
  assert.equal(gradeOf({ 'project-status': 'excellent' }), undefined)
  assert.equal(gradeOf({}), undefined)
})

test('the three words are disjoint from the lifecycle vocabulary', () => {
  // Ce qui rend la précédence lisible dans le fichier : aucun mot ne peut être
  // écrit dans les deux champs, donc on sait toujours lequel des deux parle.
  const lifecycle = ['en cours', 'bloqué', 'en attente', 'clos', 'fait', 'terminé', 'idée']
  for (const word of PROJECT_STATUSES) assert.equal(lifecycle.includes(word), false)
})

// ── subprojectsOf: what a list of sub-projects is a list OF ─────────────────

const CORPUS = [
  project(
    { status: 'en cours', 'project-status': 'en danger' },
    { path: 'chantiers/a/socle/INDEX.md', title: 'Socle' },
  ),
  project(
    { status: 'clos' },
    { path: 'chantiers/a/editeur/INDEX.md', title: 'Éditeur', finished: true, tone: 'settled' },
  ),
  { path: 'chantiers/a/note.md', title: 'Note de lecture', fields: {}, finished: false, tone: 'underway' },
]

test('a list of sub-projects lists sub-projects, not what is filed beside them', () => {
  const rows = subprojectsOf(CORPUS, 'chantiers/a', 'children')
  assert.deepEqual(rows.map((row) => row.label), ['Éditeur', 'Socle'])
  assert.equal(rows.some((row) => row.label === 'Note de lecture'), false)
})

test('each row carries the one badge its page has earned', () => {
  const rows = subprojectsOf(CORPUS, 'chantiers/a', 'children')
  assert.deepEqual(rows.find((row) => row.label === 'Socle').badge, { word: 'en danger', tone: 'red' })
  assert.equal(rows.find((row) => row.label === 'Éditeur').finished, true)
})

// ── barState: an assertion beats an inference ──────────────────────────────

test('a graded bar is drawn as its owner graded it, not as the calendar reads it', () => {
  // Sans note, la barre serait « late » : la date est passée et le statut est
  // encore ouvert. C'est une déduction, et elle cède devant une affirmation.
  const entry = { label: 'Socle', due: '2026-01-01', finished: false }
  assert.equal(barState(entry, '2026-09-24'), 'late')
  assert.equal(barState({ ...entry, grade: 'green' }, '2026-09-24'), 'green')
})

test('closed still wins over a grade — whatever it wore when it closed is stale', () => {
  assert.equal(barState({ due: '2026-01-01', finished: true, grade: 'red' }, '2026-09-24'), 'done')
})

test('a blocked project drops its grade on the bar, as its row already did', () => {
  // Trouvé au banc : la ligne disait « bloqué » et la barre, deux blocs plus
  // bas, était verte. Une page qui dit deux choses d'un même projet est
  // exactement ce que partager cette marche doit empêcher.
  const entry = { label: 'Le mode ask', due: '2026-09-10', finished: false, grade: 'green', tone: 'waiting' }
  assert.equal(barState(entry, '2026-09-24'), 'late')
})

test('an ungraded bar keeps exactly the calendar it had', () => {
  const entry = { label: 'Socle', start: '2026-10-01', due: '2026-11-01', finished: false }
  assert.equal(barState(entry, '2026-09-24'), classify(entry, '2026-09-24'))
})

test('the planning carries the grade onto its entries, from the same walk', () => {
  const pages = [
    project(
      { status: 'en cours', 'project-status': 'à surveiller', due: '2026-11-01' },
      { path: 'chantiers/a/socle/INDEX.md', title: 'Socle' },
    ),
  ]
  assert.equal(fromPages(pages, 'chantiers/a', 'children').entries[0].grade, 'amber')
})
