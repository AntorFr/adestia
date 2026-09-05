/**
 * Le calepinage, jugé par le validateur du contrat.
 *
 * Un plan de débit ne se relit pas : il se vérifie. Ces tests produisent un
 * `debit[]` et le passent à `valide()` — celui-là même qui refuse un
 * chevauchement, une pièce hors zone utile, un trait de scie trop mince ou une
 * pièce que personne ne peut couper. Un plan que le validateur accepte est un
 * plan qu'on peut poser sur la scie.
 *
 * Et le sujet du module : les DEUX sens. L'ancien optimiseur empilait sur la
 * hauteur de la plaque et n'essayait rien d'autre ; la question posée à la
 * main sur un vrai projet valait une plaque entière.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { calepine, compareLesSens } from '../moteur/debit/calepine.mjs'
import { valide } from '../web/regles.js'

const MEL19 = { id: 'MEL19', ep: 19, plaque: { l: 2800, h: 2070 }, derasage: 0 }

/** Un workbook minimal, juste ce qu'il faut pour que `valide` ait prise. */
const workbook = (pieces, materiaux = [MEL19]) => {
  const { debit, journal } = calepine(pieces, materiaux)
  return {
    wb: { schemaVersion: '4.0', materiaux, pieces, debit },
    journal,
  }
}

const piece = (etiquette, longueur, largeur, materiau = 'MEL19') =>
  ({ etiquette, longueur, largeur, materiau, ep: 19 })

test('un plan produit passe le validateur du contrat', () => {
  const { wb } = workbook([
    piece('A', 851, 600), piece('B', 851, 600),
    piece('C', 1082, 100), piece('D', 1082, 100),
    piece('E', 1118, 600),
  ])
  assert.deepEqual(valide(wb), [])
})

test('toutes les pièces sont débitées, et une seule fois', () => {
  const pieces = Array.from({ length: 9 }, (_, i) => piece(`P${i}`, 400 + i * 10, 300))
  const { wb } = workbook(pieces)
  const errs = valide(wb)
  assert.deepEqual(errs.filter((e) => /jamais débitée|placée \d+ fois/.test(e)), [])
})

test('les deux sens sont comparés, et le perdant est dit', () => {
  const { journal } = workbook([piece('A', 2500, 600), piece('B', 2500, 600)])
  assert.equal(journal.length, 1)
  assert.ok(journal[0].autre, 'ce que l\'autre sens aurait coûté')
  assert.notEqual(journal[0].sens, journal[0].autre.sens)
})

test('le sens qui économise une plaque l\'emporte, même au prix d\'un réglage', () => {
  // Des pièces de 2500 de long : elles ne tiennent QUE sur la longueur de la
  // plaque (2800), pas sur sa hauteur (2070). Un seul sens sait les couper.
  const pieces = Array.from({ length: 3 }, (_, i) => piece(`L${i}`, 2500, 400))
  const { retenu } = compareLesSens(pieces, MEL19)
  assert.equal(retenu.debout, false, 'couché : la longueur de plaque est le seul budget assez grand')
  assert.equal(retenu.impossible, false)
  assert.equal(retenu.plaques.length, 1)
})

test('une pièce qu\'aucun sens ne peut couper est signalée, pas oubliée', () => {
  const { journal, wb } = workbook([piece('ÉNORME', 3000, 600)])
  assert.match(journal[0].impossible, /ne tient dans aucun sens/)
  // Et elle reste dans le plan plutôt que de disparaître en silence.
  assert.ok(wb.debit.length > 0)
})

test('deux bandes au même réglage ne comptent qu\'une refente', () => {
  const { wb } = workbook([
    piece('A', 900, 300), piece('B', 900, 300), piece('C', 900, 300),
    piece('D', 900, 300), piece('E', 900, 300), piece('F', 900, 300),
  ])
  const refentes = wb.debit[0].etapes.filter((e) => e.type === 'refente')
  assert.equal(refentes.length, 1, 'un seul geste : le guide est réglé une fois')
  assert.ok(refentes[0].bandes.length > 1, 'et il en sort plusieurs bandes')
})

test('le dérasage apparaît quand la matière le demande, et pas sinon', () => {
  const avec = calepine([piece('A', 500, 300)], [{ ...MEL19, derasage: 10 }])
  assert.equal(avec.debit[0].etapes[0].type, 'derasage')
  const sans = calepine([piece('A', 500, 300)], [MEL19])
  assert.notEqual(sans.debit[0].etapes[0].type, 'derasage')
})

test('chaque matière a son plan, et les plaques se suivent', () => {
  const MEL8 = { id: 'MEL8', ep: 8, plaque: { l: 2800, h: 2070 } }
  const { wb } = workbook(
    [piece('A', 851, 600), piece('F', 851, 1094, 'MEL8')],
    [MEL19, MEL8],
  )
  assert.deepEqual(wb.debit.map((p) => [p.plaque, p.materiau]), [['P1', 'MEL19'], ['P2', 'MEL8']])
  assert.deepEqual(valide(wb), [])
})
