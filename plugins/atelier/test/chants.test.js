/**
 * Le retrait de chant, sur la pièce qui l'avait perdu.
 *
 * Le bas du meuble à tiroirs traverse le caisson et porte ses deux abouts
 * chantés. Sans le retrait, il ressort plaqué à 1122 pour une ouverture de
 * 1120. Il avait été sorti à 1120 — « le même mécanisme que le dessous du
 * dressing, celui-là je l'avais fait, juste oublié ici sur une pièce pourtant
 * identique dans son principe ».
 *
 * La règle est celle de l'atelier, et elle ne souffre pas d'exception : on
 * cote FINI, et pas de surépaisseur visible sur le meuble. Deux pièces qui
 * doivent affleurer ont la même cote finie, quel que soit le nombre de chants
 * que chacune porte — un côté chanté sur un bord et un dessous chanté sur ses
 * deux abouts se rejoignent au même nu. La cote de coupe se déduit en dernier.
 *
 * Un débord d'un millimètre existe dans les projets, mais c'est une DÉROGATION
 * assumée (« moche et assumé, moins pire que reprendre la pièce qui tient
 * l'équerrage »), jamais un défaut du calcul.
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

test('une rive avant chantée retire, elle aussi : il n\'y a pas de bord dispensé', () => {
  const r = derive(design({ 'BLT-A1-BAS': ['rive-avant'] }), tables())
  const bas = piece(r, 'BLT-A1-BAS')
  assert.equal(bas.longueur, 1120, 'aucun about chanté')
  assert.equal(bas.largeur, 599, 'le meuble fait 600 fini, donc on coupe à 599')
})

test('une traverse chantée sur ses abouts se coupe en retrait comme les autres', () => {
  const r = derive(design({ 'BLT-A1-TRAV-HAUT-AV': ['about-gauche', 'about-droit'] }), tables())
  // 1082 est sa place FINIE entre les côtés ; plaquée, elle doit y tenir.
  assert.equal(piece(r, 'BLT-A1-TRAV-HAUT-AV').longueur, 1080)
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

test('le retrait ne dépend que des chants de la pièce, pas de sa façon de tenir', () => {
  const bas = { etiquette: 'BAS', orientation: 'horizontal' }
  assert.deepEqual(retraitsDe(bas, ['about-gauche', 'about-droit']), { longueur: 2, largeur: 0 })
  assert.deepEqual(retraitsDe(bas, ['rive-avant']), { longueur: 0, largeur: 1 })
  assert.deepEqual(retraitsDe(bas, []), { longueur: 0, largeur: 0 })
})

test('un côté à UN chant et un dessous à DEUX se rejoignent au même nu', () => {
  // 600 de profondeur finie pour les deux, deux cotes de coupe différentes.
  const cote = { etiquette: 'CÔTÉ', orientation: 'lateral' }
  const dessous = { etiquette: 'DESSOUS', orientation: 'horizontal' }
  assert.equal(600 - retraitsDe(cote, ['rive-avant']).largeur, 599)
  assert.equal(600 - retraitsDe(dessous, ['rive-avant', 'rive-arriere']).largeur, 598)
})

test('une bande de 2 mm retire 2 mm par bord', () => {
  const bas = { etiquette: 'BAS', orientation: 'horizontal' }
  assert.deepEqual(retraitsDe(bas, { bords: ['about-gauche', 'about-droit'], epaisseur: 2 }),
    { longueur: 4, largeur: 0 })
  const d = design({ 'BLT-A1-BAS': { bords: ['abouts'], epaisseur: 2 } })
  assert.equal(piece(derive(d, tables()), 'BLT-A1-BAS').longueur, 1116)
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
  // Sur les cotes de COUPE : c'est le bord nu qu'il faut couvrir, et le bas
  // chanté sur sa rive avant est débité à 599 de profondeur, pas 600.
  assert.equal(r.chant.total, 599 + 599 + 1118 + 851)
})
