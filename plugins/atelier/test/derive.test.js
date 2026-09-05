/**
 * La dérivation complète, contre les cotes d'un meuble réellement conçu.
 *
 * Le meuble à tiroirs du bureau : 1120 × 600 × 870, mélaminé 19, plan de
 * travail rapporté, fond de 8 en rainure encastré dans le bas. Ses cotes ont
 * demandé quatre passes de correction et une relecture à l'œil.
 *
 * Elles sont ici attendues au millimètre — 851, 1082, 1094 — et aucune n'est
 * écrite dans le design : il ne porte que le hors-tout, l'épaisseur, quatre
 * décisions de montage et trois paramètres de savoir-faire.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (nom) => {
  const { table, erreurs } = litTable(JSON.parse(readFileSync(join(here, nom), 'utf8')), nom)
  assert.deepEqual(erreurs, [])
  return table
}
const tables = () => [lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json')]

/** Le design du meuble à tiroirs — les décisions, rien que les décisions. */
const design = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'BLT',
  hors_tout: { l: 1120, p: 600, h: 870 },
  pose: 'fixe',
  plan_travail: 'rapporte',
  fond: 'oui',
  dessous: 'encastre',
  materiaux: { principal: { id: 'MEL19', ep: 19 }, fond: { id: 'MEL8', ep: 8, chante: false } },
  parametres: {
    marge_fond: 5,
    rainure_prof: 9,
    rainure_encastrement: 5,
    fond_jeu: 3,
    profondeur_traverse: 100,
  },
  ...sur,
})

/** La profondeur des traverses n'est calculée par rien : le design la pose. */
const avecTraverses = (d) => {
  const r = derive(d, tables())
  return r
}

const cote = (r, etiquette) => r.pieces.find((p) => p.etiquette === etiquette)

test('les pièces du meuble sortent de quatre décisions, pas d\'une liste', () => {
  const r = avecTraverses(design())
  assert.deepEqual(r.pieces.map((p) => p.etiquette), [
    'BLT-A1-BAS',
    'BLT-A1-CÔTÉ-G',
    'BLT-A1-CÔTÉ-D',
    'BLT-A1-TRAV-HAUT-AV',
    'BLT-A1-TRAV-HAUT-AR',
    'BLT-A1-FOND',
  ])
})

test('le côté fait 851 × 600, comme sur le vrai plan', () => {
  const c = cote(avecTraverses(design()), 'BLT-A1-CÔTÉ-G')
  assert.equal(c.longueur, 851)
  assert.equal(c.largeur, 600)
  assert.equal(c.ep, 19)
})

test('la traverse haute fait 1082 — la largeur intérieure, jamais écrite', () => {
  assert.equal(cote(avecTraverses(design()), 'BLT-A1-TRAV-HAUT-AV').longueur, 1082)
})

test('le fond encastré fait 851 × 1094, au millimètre du plan réel', () => {
  const f = cote(avecTraverses(design()), 'BLT-A1-FOND')
  // 870 − 5 de marge − (19 du bas − 5 de rainure d'encastrement)
  assert.equal(f.longueur, 851)
  // 1120 − 2×19 + 2×(9 − 3) : le fond n'est pas tenu par l'emboîtement
  assert.equal(f.largeur, 1094)
  assert.equal(f.ep, 8, 'la MATIÈRE vient de la table, et son épaisseur avec')
})

test('les deux rainures ne se confondent pas : 4 mm en dépendent', () => {
  const avec9 = design()
  avec9.parametres = { ...avec9.parametres, rainure_encastrement: 9 }
  assert.equal(cote(avecTraverses(avec9), 'BLT-A1-FOND').longueur, 855)
})

test('le journal dit quelle table, quelle ligne, quelle méthode', () => {
  assert.deepEqual(avecTraverses(design()).journal, [
    { table: 'dessus', ligne: 1, methode: 'dessus-traverses' },
    { table: 'fond', ligne: 5, methode: 'fond-rainure-encastre' },
  ])
})

test('chaque cote dit de quelles règles elle vient', () => {
  const c = cote(avecTraverses(design()), 'BLT-A1-CÔTÉ-G')
  assert.ok(c.de.includes('BLT-A1-CÔTÉ-G/bute-z'), `attendu dans ${c.de}`)
  assert.ok(c.de.includes('meuble/hauteur-hors-tout'))
})

test('un meuble sans fond ne reçoit aucune pièce de fond, et ce n\'est pas une erreur', () => {
  const r = avecTraverses(design({ fond: 'non' }))
  assert.ok(!r.pieces.some((p) => p.role === 'FOND'))
  assert.deepEqual(r.journal[1], { table: 'fond', ligne: 1, methode: null })
  assert.deepEqual(r.issues.filter((i) => i.type !== 'cote-libre'), [])
})

test('un meuble mobile prend un fond structurel, plein et de la même épaisseur', () => {
  const r = avecTraverses(design({ pose: 'mobile' }))
  const f = cote(r, 'BLT-A1-FOND')
  assert.equal(r.journal[1].methode, 'fond-structurel')
  assert.equal(f.ep, 19)
  assert.equal(f.largeur, 1082, 'entre les côtés, pas engagé en rainure')
  assert.equal(f.longueur, 851, 'posé sur le bas')
})

test('une décision non prise remonte en issue bloquante, nommée', () => {
  const d = design()
  delete d.dessous
  const r = derive(d, tables())
  const manque = r.issues.find((i) => i.type === 'non-tranche')
  assert.match(manque.message, /le design ne dit pas « dessous »/)
  assert.equal(manque.gravite, 'bloquant')
  assert.ok(!r.pieces.some((p) => p.role === 'FOND'), 'aucun fond inventé faute de réponse')
})

test('un paramètre de savoir-faire absent laisse une cote libre, jamais un défaut muet', () => {
  const d = design()
  delete d.parametres.marge_fond
  const r = derive(d, tables())
  assert.equal(r.contraint, false)
  assert.ok(r.issues.some((i) => i.type === 'cote-libre' && i.message.includes('param.marge_fond')),
    `attendu parmi ${r.issues.map((i) => i.message)}`)
})

test('les tables d\'une autre famille sont écartées, et nommées', () => {
  const massif = { ...lit('fixture-regles-fond.json'), id: 'fond-massif', appliqueA: ['table-massif'] }
  const r = derive(design(), [...tables(), massif])
  assert.deepEqual(r.ecartees, ['fond-massif'])
})

test('rien n\'est refusé sur un design cohérent', () => {
  assert.deepEqual(avecTraverses(design()).refuses, [])
})
