/**
 * The operations, which are now the ONLY way a period changes.
 *
 * Everything the old overlay guarded is guarded here instead, and by one
 * implementation the front, the server and the agent all run — so what a drag
 * predicts, what the API applies and what the agent's tool does cannot differ.
 *
 * The invariant worth naming: an unplaced card is never confirmed. It used to
 * be enforced twice, badly, at two ends of a merge; it is one line here.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { apply } from '../web/ops.js'

const SHAPE = {
  debut: '2026-09-01',
  fin: '2026-09-04',
  sections: ['matin', 'midi', 'goûter', 'soir'],
}

const ITEMS = [
  { id: 'yaourt', titre: 'Yaourt', statut: 'confirme', jour: '2026-09-01', section: 'matin', ordre: 1 },
  { id: 'poulet', titre: 'Poulet au citron', statut: 'suggestion', hint: 'Le soir' },
]

test('placing a card confirms it and keeps what it already carried', () => {
  const { items } = apply(ITEMS, SHAPE, {
    op: 'place',
    id: 'poulet',
    jour: '2026-09-03',
    section: 'soir',
    ordre: 1.5,
  })
  const card = items.find((one) => one.id === 'poulet')
  assert.equal(card.statut, 'confirme')
  assert.equal(card.jour, '2026-09-03')
  assert.equal(card.ordre, 1.5)
  // Merged, not replaced: an annotation survives a change of day.
  assert.equal(card.hint, 'Le soir')
  // And the input was not touched — a refused write must cost nothing.
  assert.equal(ITEMS[1].jour, undefined)
})

test('a placement is checked against the page, not against a table here', () => {
  assert.match(apply(ITEMS, SHAPE, { op: 'place', id: 'poulet', jour: '2026-10-01' }).error, /outside/)
  assert.match(apply(ITEMS, SHAPE, { op: 'place', id: 'poulet', jour: 'jeudi' }).error, /YYYY/)
  assert.match(
    apply(ITEMS, SHAPE, { op: 'place', id: 'poulet', jour: '2026-09-02', section: 'apéro' }).error,
    /section must be one of/,
  )
  // A period with no dates cannot place anything, and says why.
  assert.match(apply(ITEMS, {}, { op: 'place', id: 'poulet', jour: '2026-09-02' }).error, /no dates/)
  // Without a section, the first one the page declares.
  assert.equal(
    apply(ITEMS, SHAPE, { op: 'place', id: 'poulet', jour: '2026-09-02' }).items[1].section,
    'matin',
  )
})

test('leaving the timeline takes the placement with it', () => {
  for (const op of ['tray', 'dismiss']) {
    const { items } = apply(ITEMS, SHAPE, { op, id: 'yaourt' })
    const card = items[0]
    assert.equal(card.statut, op === 'tray' ? 'suggestion' : 'ecartee')
    // The invariant: an unplaced card is never a confirmed one.
    assert.equal(card.jour, undefined)
    assert.equal(card.section, undefined)
    assert.equal(card.ordre, undefined)
    assert.equal(card.titre, 'Yaourt')
  }
})

test('`props` are free in their keys and closed in their shape', () => {
  const { items } = apply(ITEMS, SHAPE, {
    op: 'set',
    id: 'yaourt',
    fields: { props: { 'énergie': '72 kcal', 'sel': 0.06 } },
  })
  // Any key at all — that is the wager of this format.
  assert.deepEqual(items[0].props, { 'énergie': '72 kcal', sel: '0.06' })
  // Values are text because nothing here ever computes with them; a number
  // would only invite somebody to start.
  assert.match(apply(ITEMS, SHAPE, { op: 'set', id: 'yaourt', fields: { props: { a: { b: 1 } } } }).error, /flat text/)
  // A field that is not a card's is refused rather than quietly stored.
  assert.match(apply(ITEMS, SHAPE, { op: 'set', id: 'yaourt', fields: { jour: '2026-09-02' } }).error, /not a field/)
  // Null clears.
  assert.equal(apply(ITEMS, SHAPE, { op: 'set', id: 'poulet', fields: { hint: null } }).items[1].hint, undefined)
})

test('adding a card puts it in the tray, never on a day', () => {
  const { items } = apply(ITEMS, SHAPE, {
    op: 'add',
    item: { id: 'soupe', titre: 'Soupe', jour: '2026-09-02', statut: 'confirme' },
  })
  const card = items.at(-1)
  assert.equal(card.id, 'soupe')
  // Inventing a card and deciding when it is eaten are two acts, and the
  // format lets a write do only the first.
  assert.equal(card.jour, undefined)
  assert.equal(card.statut, 'confirme')
  assert.match(apply(ITEMS, SHAPE, { op: 'add', item: { id: 'x' } }).error, /titre/)
  assert.match(apply(ITEMS, SHAPE, { op: 'add', item: { id: 'yaourt', titre: 'Bis' } }).error, /already there/)
})

test('an operation that names nothing changes nothing', () => {
  assert.match(apply(ITEMS, SHAPE, { op: 'place', id: 'fantome', jour: '2026-09-02' }).error, /no card/)
  assert.match(apply(ITEMS, SHAPE, { op: 'tray' }).error, /needs an id/)
  assert.match(apply(ITEMS, SHAPE, { op: 'burn', id: 'yaourt' }).error, /unknown operation/)
  assert.equal(apply(ITEMS, SHAPE, { op: 'remove', id: 'yaourt' }).items.length, 1)
})
