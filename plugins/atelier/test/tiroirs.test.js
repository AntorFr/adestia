/**
 * Les façades de tiroir, sur le meuble qui en porte quatre.
 *
 * La règle que la fiche d'agencement pose en toutes lettres : « façade vissée
 * après pose, JAMAIS confondue avec le corps du tiroir ». Le corps a un
 * montant avant fonctionnel ; la façade se visse dessus, par l'intérieur, une
 * fois le tiroir posé et réglé — parce que les coulisses n'ont aucun réglage,
 * et qu'un jeu de 3 mm entre façades voisines ne peut pas dépendre de la
 * position de pose des rails.
 *
 * Les façades se partagent la hauteur utile : trois de 229 et deux jeux de 3
 * font les 693 du meuble réel.
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
  lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json'), lit('fixture-regles-tiroir.json'),
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
  tiroirs: 3,
  faces_chantees: ['avant'],
  materiaux: { principal: { ep: 19 } },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    profondeur_traverse: 100, jeu_facade: 3, jeu_facade_lateral: 2,
  },
  ...sur,
})

const facades = (r) => r.pieces.filter((p) => p.role === 'FAÇADE')

test('le design dit combien de tiroirs, le moteur n\'en invente aucun', () => {
  assert.equal(facades(derive(meuble({ tiroirs: 3 }), tables())).length, 3)
  assert.equal(facades(derive(meuble({ tiroirs: 0 }), tables())).length, 0)
})

/** La hauteur FINIE d'une façade : ce qu'elle occupe, chants posés. */
const finie = (f) => f.longueur + 2
/** Les cotes se coupent au dixième ; comparer des flottants à l'exact ne tient
 *  pas quand une hauteur ne tombe pas ronde — 273,333333 remultiplié par 3 ne
 *  redonne pas 832 à la virgule près, et ce n'est pas une erreur d'atelier. */
const presque = (a, b, message) => assert.ok(Math.abs(a - b) < 0.001, message ?? `${a} ≈ ${b}`)

test('trois façades et deux jeux se partagent la hauteur utile', () => {
  const f = facades(derive(meuble(), tables()))
  // 870 − 19 de bas − 19 de traverse = 832 utiles, et 3 hauteurs FINIES plus
  // deux jeux de 3 les remplissent. La coupe, elle, est 2 mm sous la cote
  // finie : la façade est chantée sur ses quatre bords.
  presque(finie(f[0]) * 3 + 2 * 3, 832)
  assert.ok(f.every((x) => x.longueur === f[0].longueur), 'toutes de la même hauteur')
  assert.equal(f[0].longueur, 273.333333, 'et une cote qui ne tombe pas ronde se voit')
})

test('quatre tiroirs se partagent le même espace, autrement', () => {
  const f = facades(derive(meuble({ tiroirs: 4 }), tables()))
  assert.equal(f.length, 4)
  presque(finie(f[0]) * 4 + 3 * 3, 832)
})

test('en applique, la façade couvre la largeur moins son jeu de chaque côté', () => {
  // 1120 − 2×2 de jeu = 1116 fini, − 2×1 de chant = 1114 coupé.
  assert.equal(facades(derive(meuble(), tables()))[0].largeur, 1114)
})

test('changer le jeu entre façades change leur hauteur, et rien d\'autre', () => {
  const d = meuble()
  d.parametres = { ...d.parametres, jeu_facade: 5 }
  const f = facades(derive(d, tables()))
  presque(finie(f[0]) * 3 + 2 * 5, 832)
  assert.equal(f[0].largeur, 1114, 'la largeur ne bouge pas')
})

test('sans le jeu déclaré, la hauteur reste libre plutôt que devinée', () => {
  const d = meuble()
  delete d.parametres.jeu_facade
  const r = derive(d, tables())
  assert.equal(r.contraint, false)
  assert.ok(r.issues.some((i) => i.type === 'cote-libre' && i.message.includes('param.jeu_facade')))
})

test('une façade est exposée sur ses quatre bords', () => {
  const f = facades(derive(meuble(), tables()))[0]
  assert.deepEqual(f.chants, ['about-droit', 'about-gauche', 'rive-arriere', 'rive-avant'])
})
