/**
 * Le retrait de chant, sur la pièce qui l'avait perdu.
 *
 * Le bas du meuble à tiroirs traverse le caisson et porte ses deux abouts
 * chantés. Sans le retrait, il ressort plaqué à 1122 pour une ouverture de
 * 1120. Il avait été sorti à 1120 — « le même mécanisme que le dessous du
 * dressing, celui-là je l'avais fait, juste oublié ici sur une pièce pourtant
 * identique dans son principe ».
 *
 * Ce que ces tests pinnent, plus que le nombre : que le retrait se DÉDUISE —
 * de l'ancrage de la pièce, et de ce que le meuble ferme. Une règle « retirer
 * 1 mm par bord chanté » appliquée partout rétrécirait des pièces qui n'ont
 * rien à ajuster ; celle-ci ne s'applique qu'aux bords qui affleurent
 * réellement quelque chose, sans qu'on ait à le déclarer pièce par pièce.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'
import { bordsPlaques, lineaireDeChant, retraitsDe } from '../moteur/modele/chants.mjs'
import { entre, traverse } from '../moteur/modele/ancrages.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (nom) => litTable(JSON.parse(readFileSync(join(here, nom), 'utf8')), nom).table
const tables = () => [lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json')]

const design = (chants) => ({
  famille: 'caisson',
  trigramme: 'BLT',
  hors_tout: { l: 1120, p: 600, h: 870 },
  pose: 'fixe',
  plan_travail: 'rapporte',
  fond: 'oui',
  dessous: 'encastre',
  materiaux: { principal: { ep: 19 } },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3, profondeur_traverse: 100,
  },
  chants,
})

const piece = (r, e) => r.pieces.find((p) => p.etiquette === e)

test('un bas traversant aux abouts chantés se coupe à 1118, pas 1120', () => {
  const r = derive(design({ 'BLT-A1-BAS': ['about-gauche', 'about-droit', 'rive-avant'] }), tables())
  assert.equal(piece(r, 'BLT-A1-BAS').longueur, 1118)
})

test('sans chant, la même pièce fait 1120 — le retrait n\'est pas un réflexe', () => {
  const r = derive(design({}), tables())
  assert.equal(piece(r, 'BLT-A1-BAS').longueur, 1120)
})

test('la rive avant est un bord LIBRE : elle ne retire rien sur la profondeur', () => {
  const r = derive(design({ 'BLT-A1-BAS': ['rive-avant'] }), tables())
  const bas = piece(r, 'BLT-A1-BAS')
  assert.equal(bas.longueur, 1120, 'aucun about chanté')
  assert.equal(bas.largeur, 600, 'la façade ouverte est simplement repoussée d\'1 mm, uniformément')
})

test('une traverse qui passe ENTRE les côtés n\'ajuste rien, même chantée', () => {
  const r = derive(design({ 'BLT-A1-TRAV-HAUT-AV': ['about-gauche', 'about-droit'] }), tables())
  assert.equal(piece(r, 'BLT-A1-TRAV-HAUT-AV').longueur, 1082, 'elle est déjà en retrait par construction')
})

test('un seul about chanté ne retire qu\'un millimètre', () => {
  const r = derive(design({ 'BLT-A1-BAS': ['about-gauche'] }), tables())
  assert.equal(piece(r, 'BLT-A1-BAS').longueur, 1119)
})

test('« abouts » vaut pour les deux bords de la longueur', () => {
  assert.deepEqual(bordsPlaques(['abouts']), ['about-gauche', 'about-droit'])
  const r = derive(design({ 'BLT-A1-BAS': ['abouts'] }), tables())
  assert.equal(piece(r, 'BLT-A1-BAS').longueur, 1118)
})

test('le retrait par bord se règle par le design, il n\'est pas gravé', () => {
  const d = design({ 'BLT-A1-BAS': ['abouts'] })
  d.parametres.retrait_chant = 2
  assert.equal(piece(derive(d, tables()), 'BLT-A1-BAS').longueur, 1116)
})

test('l\'ajustement se déduit de l\'ancrage et du meuble, sans rien déclarer par pièce', () => {
  const bas = { etiquette: 'BAS', orientation: 'horizontal' }
  const chants = ['about-gauche', 'about-droit']
  assert.deepEqual(retraitsDe(bas, chants, [traverse(bas, 'x').ancre]), { longueur: 2, largeur: 0 })
  assert.deepEqual(retraitsDe(bas, chants, [entre(bas, 'x', ['A', 'B']).ancre]), { longueur: 0, largeur: 0 })
  // Et un axe que le meuble ne ferme pas n'ajuste rien, même traversé.
  assert.deepEqual(retraitsDe(bas, chants, [traverse(bas, 'x').ancre], 1, ['x']), { longueur: 0, largeur: 0 })
})

test('des portes ferment la profondeur : la rive avant redevient une cote d\'ajustement', () => {
  const d = design({ 'BLT-A1-BAS': ['rive-avant'] })
  d.facade = 'portes'
  assert.equal(piece(derive(d, tables()), 'BLT-A1-BAS').largeur, 599)
})

test('le linéaire de chant se compte sur les cotes finies', () => {
  const { detail, total } = lineaireDeChant(
    [{ etiquette: 'BAS', longueur: 1118, largeur: 600 }, { etiquette: 'CÔTÉ-G', longueur: 851, largeur: 600 }],
    { BAS: ['abouts', 'rive-avant'], 'CÔTÉ-G': ['rive-avant'] },
  )
  assert.equal(detail[0].mm, 600 + 600 + 1118)
  assert.equal(total, 600 + 600 + 1118 + 851)
})

test('le workbook dérivé porte le linéaire de chant, prêt pour le BOM', () => {
  const r = derive(design({ 'BLT-A1-BAS': ['abouts', 'rive-avant'], 'BLT-A1-CÔTÉ-G': ['rive-avant'] }), tables())
  assert.equal(r.chant.detail.length, 2)
  assert.equal(r.chant.total, 600 + 600 + 1118 + 851)
})
