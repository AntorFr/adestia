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

test('façade ouverte : la tablette affleure, et ne recule que pour le fond', () => {
  const t = tab(derive(dressing(), tables()))
  // 600 − 20 de passage − 1 de chant avant. Pas de retrait avant.
  assert.equal(t.largeur, 579)
})

test('avec des portes : les 3 mm de dégagement s\'ajoutent au passage du fond', () => {
  const t = tab(derive(dressing({ facade: 'portes' }), tables()))
  assert.equal(t.largeur, 576, '600 − 20 − 3 − 1 de chant')
})

test('le dessus, lui, ne prend JAMAIS le retrait avant', () => {
  const r = derive(dressing({ facade: 'portes' }), tables())
  assert.equal(r.pieces.find((p) => p.role === 'DESSUS').largeur, 579,
    'pleine profondeur en façade, affleurant avec les côtés')
  assert.equal(tab(r).largeur, 576, 'la tablette, elle, recule')
})

test('sans fond glissé, une tablette ne recule pas de l\'arrière', () => {
  const t = tab(derive(dressing({ fond: 'non' }), tables()))
  assert.equal(t.largeur, 599, 'seulement le chant avant')
})

test('le dressing déroge : façade ouverte ET 3 mm de retrait, avec sa raison', () => {
  // Le vrai cas. La règle dit qu'une façade ouverte n'a rien à dégager ; ce
  // projet recule quand même ses tablettes. Sans dérogation il faudrait
  // déclarer des portes qui n'existent pas — et le meuble suivant hériterait
  // du mensonge.
  const d = dressing({
    derogations: [{
      table: 'tablette',
      on_fait: { retrait_avant: 'oui' },
      pourquoi: 'pas de porte à dégager ici, mais 3 mm de retrait voulus sur ce projet',
    }],
  })
  const r = derive(d, tables())
  assert.equal(tab(r).largeur, 576, '600 − 20 − 3 − 1 de chant')
  assert.equal(r.pieces.find((p) => p.role === 'DESSUS').largeur, 579, 'le dessus ne déroge pas')

  // Et la dérogation est DITE, pas dissoute dans une cote.
  const ligne = r.journal.find((j) => j.table === 'tablette')
  assert.deepEqual(ligne.deroge, ['pas de porte à dégager ici, mais 3 mm de retrait voulus sur ce projet'])
})

test('sans le millimètre de chant, on retrouve les 577 du meuble construit', () => {
  const d = dressing({
    faces_chantees: [],
    derogations: [{ table: 'tablette', on_fait: { retrait_avant: 'oui' }, pourquoi: 'retrait voulu sur ce projet' }],
  })
  assert.equal(tab(derive(d, tables())).largeur, 577)
})
