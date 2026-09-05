/**
 * Le corps du tiroir — ce sur quoi la façade se visse, et qui n'est pas elle.
 *
 * Sa largeur perd de chaque côté l'épaisseur d'une coulisse et son jeu : « ≥ 1
 * mm de jeu de chaque côté pour que les rails coulissent ». Sa profondeur est
 * celle de la COULISSE, pas celle du meuble — une 550 fait un tiroir de 550,
 * quel que soit le caisson qui la reçoit.
 *
 * Et il peut ne pas exister encore : le meuble réel a arrêté ses façades en
 * laissant les corps de côté, « leur matière étant encore en réflexion ».
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
  lit('fixture-regles-tiroir.json'), lit('fixture-regles-tiroir-corps.json'),
]

const meuble = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'BLT',
  module: 'A1',
  hors_tout: { l: 1120, p: 600, h: 870 },
  pose: 'fixe',
  plan_travail: 'rapporte',
  fond: 'oui',
  dessous: 'encastre',
  facade: 'ouverte',
  tiroirs: 2,
  corps_tiroir: 'monte',
  faces_chantees: ['avant'],
  materiaux: { principal: { id: 'MEL19', ep: 19 }, fond: { id: 'MEL8', ep: 8, chante: false }, fond_tiroir: { id: 'MEL6', ep: 6, chante: false } },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    profondeur_traverse: 100, jeu_facade: 3, jeu_facade_lateral: 2,
    ep_coulisse: 12.5, jeu_coulisse: 1, profondeur_coulisse: 550,
    hauteur_tiroir: 150, rainure_tiroir_prof: 6,
  },
  ...sur,
})

const p = (r, e) => r.pieces.find((x) => x.etiquette === e)

test('« plus tard » est une réponse : des façades sans corps', () => {
  const r = derive(meuble({ corps_tiroir: 'plus-tard' }), tables())
  assert.equal(r.pieces.filter((x) => x.role === 'FAÇADE').length, 2)
  assert.equal(r.pieces.filter((x) => x.role?.startsWith('TIROIR-')).length, 0)
  assert.equal(r.journal.find((j) => j.table === 'tiroir-corps').methode, null)
})

test('un corps monté fait cinq pièces par tiroir', () => {
  const r = derive(meuble(), tables())
  assert.equal(r.pieces.filter((x) => x.role?.startsWith('TIROIR-')).length, 10, '2 tiroirs × 5')
})

test('le flanc court sur la profondeur de la COULISSE, pas du meuble', () => {
  const f = p(derive(meuble(), tables()), 'BLT-A1-T1-CÔTÉ-G')
  assert.equal(f.longueur, 550, 'une 550 fait un tiroir de 550 dans un caisson de 600')
  assert.equal(f.largeur, 150, 'la hauteur du tiroir')
})

test('le montant avant passe entre les flancs, coulisses déduites', () => {
  // 1120 − 2×19 de côtés − 2×12,5 de coulisse − 2×1 de jeu = 1055 hors-tout,
  // puis − 2×19 de flancs pour ce qui passe entre eux.
  assert.equal(p(derive(meuble(), tables()), 'BLT-A1-T1-MONTANT').longueur, 1017)
})

test('changer de coulisse déplace le tiroir, et rien d\'autre', () => {
  const d = meuble()
  d.parametres = { ...d.parametres, ep_coulisse: 10, profondeur_coulisse: 450 }
  const r = derive(d, tables())
  assert.equal(p(r, 'BLT-A1-T1-CÔTÉ-G').longueur, 450)
  assert.equal(p(r, 'BLT-A1-T1-MONTANT').longueur, 1022, '5 mm de plus de chaque côté')
  assert.equal(p(r, 'BLT-A1-CÔTÉ-G').longueur, 851, 'le caisson ne bouge pas')
})

test('le fond de tiroir sort en 6 mm, PLUS large que l\'intérieur', () => {
  const f = p(derive(meuble(), tables()), 'BLT-A1-T1-FOND')
  assert.equal(f.ep, 6, 'sa matière, pas celle du caisson')
  // Il s'engage DANS les rainures, donc il déborde de l'intérieur de ce qu'il
  // y entre — exactement comme le fond du caisson, 1094 pour 1082 dedans.
  assert.equal(f.longueur, 1029, '1017 d\'intérieur + 2 × 6 d\'engagement')
  assert.deepEqual(f.chants, [], 'un panneau fin caché ne se chante pas')
})

test('sans les cotes de coulisse, rien n\'est deviné', () => {
  const d = meuble()
  delete d.parametres.ep_coulisse
  const r = derive(d, tables())
  assert.equal(r.contraint, false)
  assert.ok(r.issues.some((i) => i.type === 'cote-libre' && i.message.includes('param.ep_coulisse')))
})
