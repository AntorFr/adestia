/**
 * Une pièce ne vit pas dans le meuble : elle vit dans une ZONE du meuble.
 *
 * Le défaut qu'Alfred a trouvé en dérivant son meuble poubelle, et qui est le
 * pire du lot. Ce meuble est coupé en deux par un séparateur FRONTAL : les
 * poubelles d'un côté (350 de profondeur), les outils de l'autre (281). Sa
 * tablette vit dans la zone outils.
 *
 * `tablette-fixe` ne connaît que `meuble.y`. Elle a donc coté cette tablette
 * sur la profondeur du meuble entier — une cote physiquement absurde — et
 * SANS lever la moindre erreur. Ses mots : « un trou se voit, une méthode qui
 * répond un nombre faux et plausible ne se voit pas. »
 *
 * C'est le mode d'échec que ce moteur existe pour supprimer, réintroduit dans
 * une méthode. Premier temps : cesser de mentir. Savoir répondre vient après.
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
  lit('fixture-regles-tablette.json'), lit('fixture-regles-separateur.json'),
]

/** Le meuble poubelle : ouvert des deux côtés, coupé par un séparateur frontal. */
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
  separateur: 'frontal',
  tablettes: 1,
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: { principal: { id: 'MEL19', ep: 19 } },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    profondeur_traverse: 150, retrait_fond_dos: 20, retrait_tablette_avant: 3,
    seuil_mutualisation: 3,
  },
  ...sur,
})

const tab = (r) => r.pieces.find((p) => p.role === 'TABLETTE')

test('une tablette derrière un séparateur frontal ne se cote pas en silence', () => {
  const r = derive(poubelle(), tables())
  // Elle sortait à 649 — la profondeur du meuble ENTIER, alors que le
  // séparateur la coupe en deux. Un nombre faux, plausible, et muet. Mieux
  // vaut pas de cote du tout qu'une cote qu'on coupera.
  assert.equal(tab(r).largeur, undefined)
})

test('et le moteur le DIT plutôt que de laisser passer', () => {
  const r = derive(poubelle(), tables())
  assert.equal(r.contraint, false, 'rien n\'est déterminé tant que la zone ne l\'est pas')
  assert.ok(
    r.issues.some((i) => i.gravite === 'bloquant' && /zone/i.test(i.message)),
    `attendu une issue de zone, obtenu : ${r.issues.map((i) => i.message).join(' | ')}`,
  )
})

test('sans séparateur frontal, rien ne change : la tablette tient tout le meuble', () => {
  const r = derive(poubelle({ separateur: 'aucun' }), tables())
  assert.equal(tab(r).largeur, 649, '650 − 1 de chant ; une seule tablette, donc pas de retrait avant')
  assert.equal(r.contraint, true)
})
