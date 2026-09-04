/**
 * La chaîne complète, sur l'erreur qui a coûté le plus cher.
 *
 * design → table → méthode → relations → cotes, sans qu'aucune cote soit
 * écrite en route. Un seul champ du design change — `plan_travail` — et le
 * meuble change de pièces ET de cotes.
 *
 * C'est l'erreur du 30 août rendue impossible. La règle existait, écrite dans
 * une fiche : « avec plan de travail rapporté → dessus en 2 traverses ». Elle
 * n'a pas été appliquée, non par ignorance, mais parce que personne n'a pensé
 * à se demander si elle s'appliquait. Une table pose la question à chaque
 * dérivation, et elle ne peut pas l'oublier.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { choisit, litTable } from '../moteur/tables.mjs'
import { applique } from '../moteur/modele/methodes.mjs'
import { systeme } from '../moteur/derive/systeme.mjs'
import { constante, relationsDOrientation, relationsDuMeuble, traverse, v } from '../moteur/modele/ancrages.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const tableDessus = () => {
  const { table, erreurs } = litTable(
    JSON.parse(readFileSync(join(here, 'fixture-regles-dessus.json'), 'utf8')),
    'fixture-regles-dessus.json',
  )
  assert.deepEqual(erreurs, [])
  return table
}

/**
 * Le caisson du meuble à tiroirs, dérivé de bout en bout.
 *
 * Aucun nombre ici que le design n'en porte : le hors-tout et l'épaisseur.
 */
function derive(design) {
  const trigramme = 'BLT'
  const module = 'A1'
  const s = systeme()
  const journal = []

  const bas = { etiquette: `${trigramme}-${module}-BAS`, role: 'BAS', orientation: 'horizontal' }
  const cotes = ['G', 'D'].map((r) => ({
    etiquette: `${trigramme}-${module}-CÔTÉ-${r}`, role: 'CÔTÉ', orientation: 'lateral',
  }))

  // La table est interrogée : c'est ELLE qui décide du montage du dessus.
  // Le design ENTIER : la table décide de ses entrées, pas l'appelant.
  const verdict = choisit(tableDessus(), design)
  assert.equal(verdict.erreur, undefined, verdict.erreur)
  journal.push({ table: verdict.table, ligne: verdict.ligne, methode: verdict.alors.methode })

  const { pieces: duDessus, relations: relDessus, erreur } = applique(
    verdict.alors.methode, { trigramme, module, cotes }, `${verdict.table} ligne ${verdict.ligne}`,
  )
  assert.equal(erreur, undefined, erreur)

  const pieces = [bas, ...cotes, ...duDessus]
  const refuses = []
  const pose = (r) => { const x = s.pose(r); if (!x.ok) refuses.push(x) }

  for (const r of relationsDuMeuble(design.hors_tout)) pose(r)
  for (const piece of pieces) {
    pose(constante(`materiau/ep-${piece.etiquette}`, v(piece.etiquette, 'ep'), design.epaisseur))
    for (const r of relationsDOrientation(piece)) pose(r)
  }
  pose(traverse(bas, 'x'))
  pose(traverse(bas, 'y'))
  for (const c of cotes) pose(traverse(c, 'y'))
  for (const r of relDessus) pose(r)

  const { valeurs, libres, contraint } = s.resout()
  return {
    journal, refuses, libres, contraint,
    pieces: pieces.map((p) => ({
      etiquette: p.etiquette,
      role: p.role,
      longueur: valeurs[v(p.etiquette, 'longueur')],
      largeur: valeurs[v(p.etiquette, 'largeur')],
    })),
  }
}

const design = (plan_travail) => ({
  famille: 'caisson',
  plan_travail,
  // La table du dessus croise trois entrées : un fond en rainure derrière un
  // dessus plein oblige à le ramener, ce qui n'est pas le sujet ici.
  pose: 'fixe',
  fond: 'non',
  hors_tout: { l: 1120, p: 600, h: 870 },
  epaisseur: 19,
})

test('sans plan de travail : un dessus plein ABOUTÉ, et des côtés de 851', () => {
  const r = derive(design('aucun'))
  assert.deepEqual(r.journal, [{ table: 'dessus', ligne: 2, methode: 'dessus-plaque-entre' }])
  assert.deepEqual(r.pieces.map((p) => p.etiquette), [
    'BLT-A1-BAS', 'BLT-A1-CÔTÉ-G', 'BLT-A1-CÔTÉ-D', 'BLT-A1-DESSUS',
  ])
  // Le montage de la maison : le dessus s'aboute entre les côtés, il ne les
  // coiffe pas. Le côté ne perd donc que le bas — 851, comme sous traverses.
  assert.equal(r.pieces.find((p) => p.role === 'CÔTÉ').longueur, 851)
  assert.equal(r.pieces.find((p) => p.role === 'DESSUS').longueur, 1082)
})

test('la plaque qui COIFFE existe, et c\'est elle qui donnait 832', () => {
  // Possible, jamais appliquée ici. La garder nommée est ce qui permet de dire
  // en quoi elle diffère : le côté y perd deux épaisseurs au lieu d'une.
  const s = systeme()
  const d = design('aucun')
  const cotes = ['G', 'D'].map((r) => ({ etiquette: `BLT-A1-CÔTÉ-${r}`, role: 'CÔTÉ', orientation: 'lateral' }))
  const bas = { etiquette: 'BLT-A1-BAS', role: 'BAS', orientation: 'horizontal' }
  const { pieces: duDessus, relations } = applique('dessus-plaque-pleine', { trigramme: 'BLT', module: 'A1', cotes })
  for (const r of relationsDuMeuble(d.hors_tout)) s.pose(r)
  for (const piece of [bas, ...cotes, ...duDessus]) {
    s.pose(constante(`ep-${piece.etiquette}`, v(piece.etiquette, 'ep'), 19))
    for (const r of relationsDOrientation(piece)) s.pose(r)
  }
  s.pose(traverse(bas, 'x'))
  for (const r of relations) s.pose(r)
  assert.equal(s.resout().valeurs['BLT-A1-CÔTÉ-G.longueur'], 832)
})

test('avec plan de travail rapporté : deux traverses, et des côtés de 851', () => {
  const r = derive(design('rapporte'))
  assert.deepEqual(r.journal, [{ table: 'dessus', ligne: 1, methode: 'dessus-traverses' }])
  assert.deepEqual(r.pieces.map((p) => p.etiquette), [
    'BLT-A1-BAS', 'BLT-A1-CÔTÉ-G', 'BLT-A1-CÔTÉ-D', 'BLT-A1-TRAV-HAUT-AV', 'BLT-A1-TRAV-HAUT-AR',
  ])
  assert.equal(r.pieces.find((p) => p.role === 'CÔTÉ').longueur, 851)
  assert.equal(r.pieces.find((p) => p.etiquette.includes('TRAV')).longueur, 1082)
})

test('un seul champ du design sépare les deux meubles', () => {
  const a = derive(design('aucun'))
  const b = derive(design('rapporte'))
  assert.notDeepEqual(a.pieces, b.pieces)
  assert.equal(a.pieces.find((p) => p.role === 'BAS').longueur, b.pieces.find((p) => p.role === 'BAS').longueur)
})

test('aucune relation n\'est refusée sur un design cohérent', () => {
  for (const pt of ['aucun', 'rapporte', 'integre']) assert.deepEqual(derive(design(pt)).refuses, [])
})

test('la profondeur des traverses reste non déterminée, et le dit', () => {
  const r = derive(design('rapporte'))
  assert.equal(r.contraint, false)
  assert.ok(r.libres.includes('BLT-A1-TRAV-HAUT-AV.largeur'), `attendu parmi ${r.libres}`)
  // Le dessus plein, lui, ferme tout : il traverse en y.
  assert.equal(derive(design('aucun')).contraint, true)
})

test('une table qui nomme une méthode que le moteur ignore est refusée, pas devinée', () => {
  const { erreur, pieces } = applique('dessus-en-toile-de-jute', { trigramme: 'X', module: 'A1', cotes: [] }, 'dessus ligne 3')
  assert.match(erreur, /méthode inconnue « dessus-en-toile-de-jute » \(dessus ligne 3\)/)
  assert.match(erreur, /connues : dessus-plaque-entre, dessus-plaque-entre-ramene/)
  assert.deepEqual(pieces, [])
})

test('« aucune méthode » est une réponse valide, et ne pose rien', () => {
  const r = applique(null, { trigramme: 'X', module: 'A1', cotes: [] })
  assert.deepEqual(r, { pieces: [], relations: [] })
})
