/**
 * `appui` on a hand-written preparation, judged by the validator.
 *
 * The skill says it: the face laid on the bench to slot a CHANT is not a
 * taste, and on a face the question does not arise. The validator only
 * checked it on the preparations a junction derives; a preparation typed by
 * hand carried anything, or nothing, unseen.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { calepine } from '../moteur/debit/calepine.mjs'
import { valide } from '../web/regles.js'

const MEL19 = { id: 'MEL19', ep: 19, plaque: { l: 2800, h: 2070 }, derasage: 0 }

const workbook = (preparations) => {
  const pieces = [{ etiquette: 'A', longueur: 851, largeur: 600, materiau: 'MEL19', ep: 19, preparations }]
  const { debit } = calepine(pieces, [MEL19])
  return { schemaVersion: '4.0', materiaux: [MEL19], pieces, debit }
}

test('an appui on a face preparation is refused — the question does not arise there', () => {
  const errs = valide(workbook([
    { type: 'lamello', sur: 'face', appui: 'face', lignes: [{ u: 100, depuis: 'about-gauche', points: [{ v: 50 }] }] },
  ]))
  assert.ok(errs.some((e) => /appui n'a pas de sens sur une face/.test(e)), errs.join('\n'))
})

test('an appui outside the vocabulary is refused on a chant', () => {
  const errs = valide(workbook([
    { type: 'lamello', sur: 'about-gauche', appui: 'dessus', points: [{ v: 50 }] },
  ]))
  assert.ok(errs.some((e) => /appui « dessus » \(face\|contre-face\)/.test(e)), errs.join('\n'))
})

test('a well-declared appui on a chant passes', () => {
  const errs = valide(workbook([
    { type: 'lamello', sur: 'about-gauche', appui: 'contre-face', points: [{ v: 50 }] },
  ]))
  assert.deepEqual(errs.filter((e) => /appui/.test(e)), [])
})
