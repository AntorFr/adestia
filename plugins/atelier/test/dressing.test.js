/**
 * Le dressing du bureau, dérivé en entier et comparé au meuble construit.
 *
 * C'est le test de non-régression du modèle : un projet que rien n'a servi à
 * écrire les règles, mesuré contre elles. Trois meubles accolés, 760 × 600 ×
 * 2233, façade ouverte, dessus abouté, fond de 8 encastré dans le dessous.
 *
 * Les LONGUEURS doivent tomber au millimètre. Les largeurs sortent 1 mm sous
 * le plan réel, uniformément, parce que la rive avant est chantée et que le
 * projet n'a pas rendu ce millimètre d'avance — l'erreur est celle-là, elle
 * est connue, et c'est le plan qui l'a, pas le moteur.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable, verifieTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (n) => {
  const { table, erreurs } = litTable(JSON.parse(readFileSync(join(here, n), 'utf8')), n)
  assert.deepEqual(erreurs, [])
  return table
}
const tables = () => [lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json')]

/** Le dressing tel que sa fiche le décrit — des décisions, pas des cotes. */
const dressing = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'DRE',
  module: 'A1',
  hors_tout: { l: 760, p: 600, h: 2233 },
  pose: 'fixe',
  plan_travail: 'aucun',
  fond: 'oui',
  dessous: 'encastre',
  faces_chantees: ['avant', 'gauche', 'droite'],
  materiaux: { principal: { ep: 19 } },
  parametres: {
    marge_fond: 2, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3, retrait_fond_dos: 20,
  },
  ...sur,
})

const cotes = () => Object.fromEntries(
  derive(dressing(), tables()).pieces.map((p) => [p.etiquette, [p.longueur, p.largeur]]),
)

test('la table du dessus couvre ses douze cas', () => {
  const { trous, chevauchements } = verifieTable(lit('fixture-regles-dessus.json'))
  assert.deepEqual(trous, [])
  assert.deepEqual(chevauchements, [])
})

test('le dessous traversant sort à 758 — 760 moins ses deux abouts chantés', () => {
  assert.equal(cotes()['DRE-A1-BAS'][0], 758)
})

test('les côtés sortent à 2214 : le dessus s\'aboute, il ne les capture pas', () => {
  assert.equal(cotes()['DRE-A1-CÔTÉ-G'][0], 2214)
  assert.equal(cotes()['DRE-A1-CÔTÉ-D'][0], 2214)
})

test('le dessus sort à 722 de long et RAMENÉ à 579 pour laisser passer le fond', () => {
  const [longueur, largeur] = cotes()['DRE-A1-DESSUS']
  assert.equal(longueur, 722, '760 − 2×19, entre les côtés')
  assert.equal(largeur, 579, '600 − 20 de passage − 1 de chant avant')
})

test('le fond encastré sort à 2217 × 734, au millimètre du meuble construit', () => {
  // 2233 − 2 de marge − (19 du dessous − 5 de rainure d'encastrement) = 2217.
  // 760 − 2×19 + 2×(9 − 3) = 734. Deux formules, deux fiches, aucun nombre
  // écrit dans le design.
  assert.deepEqual(cotes()['DRE-A1-FOND'], [2217, 734])
})

test('sans fond, le dessus n\'a plus rien à laisser passer et file pleine profondeur', () => {
  const r = derive(dressing({ fond: 'non' }), tables())
  const dessus = r.pieces.find((p) => p.role === 'DESSUS')
  assert.equal(dessus.largeur, 599, 'plus de retrait de passage, seulement le chant')
  assert.equal(r.journal[0].methode, 'dessus-plaque-entre')
})

test('un meuble mobile ne ramène rien : son fond est plein, pas glissé en rainure', () => {
  const r = derive(dressing({ pose: 'mobile' }), tables())
  assert.equal(r.journal[0].methode, 'dessus-plaque-entre')
  assert.equal(r.pieces.find((p) => p.role === 'DESSUS').largeur, 599)
})

test('un plan de travail l\'emporte : deux traverses, et rien à ramener', () => {
  const r = derive(dressing({ plan_travail: 'rapporte' }), tables())
  assert.equal(r.journal[0].methode, 'dessus-traverses')
  assert.ok(!r.pieces.some((p) => p.role === 'DESSUS'))
})
