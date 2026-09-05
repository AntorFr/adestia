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
import { bloquantes, derive } from '../moteur/derive/index.mjs'

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
  separateurs: [{ type: 'frontal' }],
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
  const s = sep(derive(poubelle({ separateurs: [{ type: 'lateral' }] }), tables()))
  assert.deepEqual(s.chants, ['rive-avant'])
  assert.equal(s.largeur, 649, '650 de profondeur, moins le chant avant')
})

test('sous un dessus plein, il s\'arrête dessous de la même façon', () => {
  const r = derive(poubelle({ plan_travail: 'aucun' }), tables())
  assert.equal(r.journal.find((j) => j.table === 'dessus').methode, 'dessus-plaque-entre')
  assert.equal(sep(r).longueur, 867, 'deux épaisseurs de panneau, quelle que soit la pièce du haut')
})

test('« aucun séparateur » est une réponse, et n\'en pose pas', () => {
  const r = derive(poubelle({ separateurs: [] }), tables())
  assert.equal(sep(r), undefined)
  assert.deepEqual(r.journal.find((j) => j.table === 'separateur').methode, null)
})

test('dans un caisson fixe à fond glissé, le séparateur latéral recule aussi', () => {
  const d = poubelle({ pose: 'fixe', fond: 'oui', dessous: 'encastre', separateurs: [{ type: 'lateral' }] })
  d.parametres = { ...d.parametres, retrait_fond_dos: 20 }
  assert.equal(sep(derive(d, tables())).largeur, 629, '650 − 20 de passage de fond − 1 de chant')
})

test('et sans le paramètre du passage, la cote reste libre plutôt que devinée', () => {
  const r = derive(poubelle({ pose: 'fixe', fond: 'oui', dessous: 'encastre', separateurs: [{ type: 'lateral' }] }), tables())
  assert.equal(sep(r).largeur, undefined)
  assert.ok(r.issues.some((i) => i.type === 'cote-libre' && i.message.includes('param.retrait_fond_dos')))
})

/* ── Le meuble poubelle en vrai : deux séparateurs à la fois ─────────────────
   Il en porte un médian FRONTAL, qui coupe la profondeur et fait dos aux deux
   zones, et un LATÉRAL entre les deux bacs. Le second ne vit pas dans le
   meuble : il vit dans la zone des bacs, et se cote sur SA profondeur — 350
   d'étendue, 349 coupé parce que sa rive avant se chante. Le coter sur le
   meuble donnerait 649, la cote qu'aucune scie ne rattrape.

   C'est l'ensemble du chantier en un cas : la liste (deux pièces, pas une),
   le zonage (l'étendue déduite, pas déclarée) et le contenant (la relation
   qui pointe la zone plutôt que le meuble). */
test('deux séparateurs à la fois, dont un qui vit dans une zone', () => {
  const r = derive(poubelle({
    zones: [{ id: 'bacs', axe: 'y', etendue: 350 }, { id: 'outils', axe: 'y' }],
    separateurs: [{ type: 'frontal' }, { type: 'lateral', zone: 'bacs', repere: 'BACS' }],
    tablettes: { nombre: 1, zone: 'outils' },
  }), tables())

  const median = r.pieces.find((p) => p.etiquette === 'PBL-C1-SÉP-MÉDIAN')
  const entreBacs = r.pieces.find((p) => p.etiquette === 'PBL-C1-SÉP-BACS')

  assert.equal(median.longueur, 867)
  assert.equal(median.largeur, 762, 'le médian tient toute la largeur intérieure')
  assert.equal(entreBacs.longueur, 867)
  assert.equal(entreBacs.largeur, 349, 'coupé à 349 pour finir à 350 : la zone des bacs')
  assert.equal(r.zones.outils, 281, 'ce qui reste, séparateur déduit')
  // Rien qui arrête une coupe. Ce cas ne charge qu'une partie des tables, donc
  // le moteur signale au passage les décisions que personne n'y lit — c'est
  // exactement ce qu'on lui demande de faire.
  assert.deepEqual(bloquantes(r.issues), [])
})
