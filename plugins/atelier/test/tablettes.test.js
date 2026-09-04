/**
 * Les tablettes, et leurs deux retraits qui ne se recopient pas.
 *
 * La fiche du dressing est catégorique : « deux retraits indépendants, sur des
 * bords opposés ». À l'ARRIÈRE le passage du fond, qui vaut aussi pour le
 * dessus. À l'AVANT un retrait qui ne concerne QUE les tablettes — le dessus
 * et le dessous restent pleine profondeur en façade, affleurants avec les
 * côtés.
 *
 * D'où les 577 du dressing, que rien n'explique si on confond les deux :
 * 600 − 20 de passage − 3 de retrait avant.
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
  lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json'), lit('fixture-regles-tablette.json'),
]

const dressing = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'DRE',
  module: 'A1',
  hors_tout: { l: 760, p: 600, h: 2233 },
  pose: 'fixe',
  plan_travail: 'aucun',
  fond: 'oui',
  dessous: 'encastre',
  facade: 'ouverte',
  tablettes: 3,
  faces_chantees: ['avant', 'gauche', 'droite'],
  materiaux: { principal: { ep: 19 } },
  parametres: {
    marge_fond: 2, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    retrait_fond_dos: 20, retrait_tablette_avant: 3,
  },
  ...sur,
})

const tab = (r, n = 1) => r.pieces.find((p) => p.etiquette === `DRE-A1-TAB-${n}`)

test('le design dit combien de tablettes, le moteur n\'en invente aucune', () => {
  assert.equal(derive(dressing({ tablettes: 3 }), tables()).pieces.filter((p) => p.role === 'TABLETTE').length, 3)
  assert.equal(derive(dressing({ tablettes: 0 }), tables()).pieces.filter((p) => p.role === 'TABLETTE').length, 0)
})

test('une tablette fait 722 de long : la largeur intérieure', () => {
  assert.equal(tab(derive(dressing(), tables())).longueur, 722)
})

test('le retrait avant est le DÉFAUT, même sans porte à dégager', () => {
  // Trois tablettes ici, et trois meubles identiques : le réglage de largeur
  // qu'un retrait coûte est partagé, donc il ne coûte rien.
  const t = tab(derive(dressing(), tables()))
  assert.equal(t.largeur, 576, '600 − 20 de passage − 3 de retrait − 1 de chant')
})

test('on n\'y renonce que pour une raison : trop peu de tablettes', () => {
  // Une ou deux ne justifient pas une largeur de refente de plus. On les
  // aligne sur le dessus et on ne s'embête pas.
  const r = derive(dressing({ tablettes: 2, modules_identiques: 1 }), tables())
  assert.equal(tab(r).largeur, 579, 'alignée sur le dessus')
  assert.equal(r.journal.find((j) => j.table === 'tablette').ligne, 3)
})

test('trois meubles identiques suffisent à mutualiser deux tablettes chacun', () => {
  const r = derive(dressing({ tablettes: 2, modules_identiques: 3 }), tables())
  assert.equal(tab(r).largeur, 576, 'six tablettes partagent le réglage')
})

test('avec des portes, le retrait n\'est plus un choix : la tablette taperait', () => {
  const t = tab(derive(dressing({ facade: 'portes' }), tables()))
  assert.equal(t.largeur, 576, '600 − 20 − 3 − 1 de chant')
})

test('le dessus, lui, ne prend JAMAIS le retrait avant', () => {
  const r = derive(dressing({ facade: 'portes' }), tables())
  assert.equal(r.pieces.find((p) => p.role === 'DESSUS').largeur, 579,
    'pleine profondeur en façade, affleurant avec les côtés')
  assert.equal(tab(r).largeur, 576, 'la tablette, elle, recule')
})

test('sans fond glissé, une tablette ne recule pas de l\'ARRIÈRE', () => {
  const t = tab(derive(dressing({ fond: 'non' }), tables()))
  assert.equal(t.largeur, 596, '600 − 3 de retrait avant − 1 de chant, rien à l\'arrière')
})

test('le dressing n\'a plus besoin de déroger : la règle le couvre', () => {
  // Il en portait une, tant que la table croyait qu'une façade ouverte
  // n'avait rien à dégager. Le vrai critère trouvé, le cas rentre dans la
  // règle — « la dérogation d'aujourd'hui est la ligne de table de demain »,
  // et c'est arrivé pour de bon.
  const r = derive(dressing(), tables())
  assert.equal(tab(r).largeur, 576)
  assert.equal(r.journal.find((j) => j.table === 'tablette').deroge, undefined)
})

test('une dérogation reste possible, et se dit', () => {
  const d = dressing({
    tablettes: 2,
    modules_identiques: 1,
    derogations: [{
      table: 'tablette',
      on_fait: { retrait_avant: 'oui' },
      pourquoi: 'deux tablettes seulement, mais la largeur est déjà réglée pour les portes',
    }],
  })
  const r = derive(d, tables())
  assert.equal(tab(r).largeur, 576)
  assert.deepEqual(r.journal.find((j) => j.table === 'tablette').deroge,
    ['deux tablettes seulement, mais la largeur est déjà réglée pour les portes'])
})

test('sans le millimètre de chant, on retrouve les 577 du meuble construit', () => {
  const d = dressing({
    faces_chantees: [],
    derogations: [{ table: 'tablette', on_fait: { retrait_avant: 'oui' }, pourquoi: 'retrait voulu sur ce projet' }],
  })
  assert.equal(tab(derive(d, tables())).largeur, 577)
})
