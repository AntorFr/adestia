/**
 * The shape of the screen, held where it can be held.
 *
 * Everything asserted here is a judgement rather than a mechanism: what
 * happens to a card whose section was renamed, to one placed outside the
 * period, to a file that declares no dates at all. Each of those is a way to
 * LOSE something silently, and a screen that loses a card explains nothing.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { daysOf, dropRank, layout, merge, sectionsOf } from '../web/model.js'

const PLAN = {
  version: 1,
  titre: 'Corse — la semaine',
  debut: '2026-08-08',
  fin: '2026-08-10',
  items: [
    { id: 'a', titre: 'Pâtes', statut: 'confirme', jour: '2026-08-09', section: 'soir', ordre: 2 },
    { id: 'b', titre: 'Salade', statut: 'confirme', jour: '2026-08-09', section: 'soir', ordre: 1 },
    { id: 'c', titre: 'Poulet', statut: 'suggestion' },
    { id: 'd', titre: 'Refusé', statut: 'ecartee' },
  ],
}

const empty = { items: {} }

test('a period covers every day between its bounds, inclusive', () => {
  assert.deepEqual(daysOf(PLAN), ['2026-08-08', '2026-08-09', '2026-08-10'])
  // No dates is not an error: it is a tray of ideas, and the screen says so.
  assert.deepEqual(daysOf({ items: [] }), [])
  // Backwards bounds would otherwise loop forever.
  assert.deepEqual(daysOf({ debut: '2026-08-10', fin: '2026-08-08' }), [])
})

test('sections are declared per file, and fall back to the three', () => {
  assert.deepEqual(sectionsOf({}), ['matin', 'midi', 'soir'])
  assert.deepEqual(sectionsOf({ sections: ['midi', 'soir'] }), ['midi', 'soir'])
  // A declaration of nothing is a mistake, not a request for no sections.
  assert.deepEqual(sectionsOf({ sections: [] }), ['matin', 'midi', 'soir'])
})

test('placed, waiting and set aside are told apart by the DATA', () => {
  const view = layout(PLAN, empty)
  assert.equal(view.dated, true)
  const soir = view.days[1].groups.find((group) => group.name === 'soir')
  // `ordre` decides the run of a section, not the order of the file.
  assert.deepEqual(soir.cards.map((card) => card.id), ['b', 'a'])
  assert.deepEqual(view.tray.map((card) => card.id), ['c'])
  // Set aside is kept in the file and proposed to nobody.
  assert.equal(view.tray.some((card) => card.id === 'd'), false)
})

test('a card whose section is no longer declared is shown, not dropped', () => {
  const plan = {
    ...PLAN,
    sections: ['matin', 'soir'],
    items: [{ id: 'x', titre: 'Café', statut: 'confirme', jour: '2026-08-08', section: 'goûter' }],
  }
  const day = layout(plan, empty).days[0]
  assert.deepEqual(day.groups.map((group) => group.name), ['matin', 'soir', 'goûter'])
  const extra = day.groups.at(-1)
  assert.equal(extra.known, false)
  assert.deepEqual(extra.cards.map((card) => card.id), ['x'])
})

test('a card placed outside the period is held aside, never lost', () => {
  const plan = {
    ...PLAN,
    items: [{ id: 'x', titre: 'Hors', statut: 'confirme', jour: '2026-09-01', section: 'soir' }],
  }
  const view = layout(plan, empty)
  assert.deepEqual(view.strays.map((card) => card.id), ['x'])
  assert.equal(view.days.every((day) => day.groups.every((group) => group.cards.length === 0)), true)
})

test('the overlay wins on what it carries, and is silent on the rest', () => {
  const overlay = { items: { c: { statut: 'confirme', jour: '2026-08-10', section: 'midi', ordre: 1 } } }
  const merged = merge(PLAN, overlay)
  const card = merged.find((item) => item.id === 'c')
  assert.equal(card.jour, '2026-08-10')
  // The title came from the file and the overlay never mentioned it.
  assert.equal(card.titre, 'Poulet')
  // An overlay for an id the file no longer holds resurrects nothing.
  assert.equal(merge(PLAN, { items: { ghost: { jour: '2026-08-08' } } }).length, PLAN.items.length)
})

test('null is how a gesture says "back to the tray"', () => {
  const overlay = { items: { a: { statut: 'suggestion', jour: null, section: null } } }
  const view = layout(PLAN, overlay)
  assert.deepEqual(view.tray.map((card) => card.id).sort(), ['a', 'c'])
})

test('a drop between two cards renumbers nobody', () => {
  const cards = [{ ordre: 1 }, { ordre: 2 }]
  assert.equal(dropRank(cards, 1), 1.5)
  assert.equal(dropRank(cards, 0), 0)
  assert.equal(dropRank(cards, 2), 3)
  assert.equal(dropRank([], 0), 1)
  // Out-of-range indexes are clamped rather than producing NaN ranks.
  assert.equal(Number.isFinite(dropRank(cards, 99)), true)
})
