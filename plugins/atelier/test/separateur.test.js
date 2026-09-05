/**
 * Les séparateurs, sur le meuble poubelle qui en porte deux.
 *
 * Ce meuble est ouvert sur ses DEUX grandes faces — poubelles d'un côté,
 * outils de l'autre — et n'a donc aucun panneau de fond. C'est le séparateur
 * médian, frontal et pleine largeur, qui « fait dos commun aux deux zones,
 * remplace le panneau de fond absent pour la tenue au vrillage ».
 *
 * Il ne porte AUCUN chant, et c'est la règle qui le dit plutôt qu'une
 * exception : aucun de ses bords ne débouche, ils sont tous pris entre le bas,
 * les côtés et les traverses. Le séparateur latéral, lui, montre sa rive avant.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (n) => {
  const { table, erreurs } = litTable(JSON.parse(readFileSync(join(here, n), 'utf8')), n)
  assert.deepEqual(erreurs, [])
  return table
}
const tables = () => [
  lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json'),
  lit('fixture-regles-separateur.json'),
]

/** Le meuble poubelle : 800 × 650 × 905, mobile, plan de travail, sans fond. */
const poubelle = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'PBL',
  module: 'C1',
  hors_tout: { l: 800, p: 650, h: 905 },
  pose: 'mobile',
  plan_travail: 'rapporte',
  fond: 'non',
  dessous: 'pleine-profondeur',
  facade: 'ouverte',
  separateur: 'frontal',
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: { principal: { id: 'MEL19', ep: 19 }, fond: { id: 'MEL8', ep: 8, chante: false } },
  parametres: { marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3, profondeur_traverse: 150 },
  ...sur,
})

const sep = (r) => r.pieces.find((p) => p.role === 'SÉPARATEUR')

test('le séparateur médian fait 867 de haut : sur le bas, sous les traverses', () => {
  assert.equal(sep(derive(poubelle(), tables())).longueur, 867, '905 − 19 − 19')
})

test('frontal, il court sur toute la largeur intérieure : 762', () => {
  assert.equal(sep(derive(poubelle(), tables())).largeur, 762, '800 − 2×19')
})

test('et il ne porte aucun chant — aucun de ses bords ne débouche', () => {
  assert.deepEqual(sep(derive(poubelle(), tables())).chants, [])
})

test('latéral, il montre sa rive avant et se coupe en retrait', () => {
  const s = sep(derive(poubelle({ separateur: 'lateral' }), tables()))
  assert.deepEqual(s.chants, ['rive-avant'])
  assert.equal(s.largeur, 649, '650 de profondeur, moins le chant avant')
})

test('sous un dessus plein, il s\'arrête dessous de la même façon', () => {
  const r = derive(poubelle({ plan_travail: 'aucun' }), tables())
  assert.equal(r.journal.find((j) => j.table === 'dessus').methode, 'dessus-plaque-entre')
  assert.equal(sep(r).longueur, 867, 'deux épaisseurs de panneau, quelle que soit la pièce du haut')
})

test('« aucun séparateur » est une réponse, et n\'en pose pas', () => {
  const r = derive(poubelle({ separateur: 'aucun' }), tables())
  assert.equal(sep(r), undefined)
  assert.deepEqual(r.journal.find((j) => j.table === 'separateur').methode, null)
})

test('dans un caisson fixe à fond glissé, le séparateur latéral recule aussi', () => {
  const d = poubelle({ pose: 'fixe', fond: 'oui', dessous: 'encastre', separateur: 'lateral' })
  d.parametres = { ...d.parametres, retrait_fond_dos: 20 }
  assert.equal(sep(derive(d, tables())).largeur, 629, '650 − 20 de passage de fond − 1 de chant')
})

test('et sans le paramètre du passage, la cote reste libre plutôt que devinée', () => {
  const r = derive(poubelle({ pose: 'fixe', fond: 'oui', dessous: 'encastre', separateur: 'lateral' }), tables())
  assert.equal(sep(r).largeur, undefined)
  assert.ok(r.issues.some((i) => i.type === 'cote-libre' && i.message.includes('param.retrait_fond_dos')))
})
