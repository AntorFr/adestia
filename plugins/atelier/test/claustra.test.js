/**
 * Une deuxième famille de meuble — et ce qu'il a fallu ouvrir pour l'avoir.
 *
 * Les tables savaient depuis le début de quelle famille elles parlent :
 * `applique_a` est dans le contrat, et il écarte proprement. Le SQUELETTE, lui,
 * était écrit en dur — un bas et deux côtés, quoi qu'on demande. La porte
 * existait, le socle ne passait pas dedans.
 *
 * Ça s'est vu en dérivant un claustra posé depuis juillet : ses tables étaient
 * bien écartées, et le moteur réclamait quand même un `BAS` et deux `CÔTÉ`,
 * des pièces que ce meuble n'a pas. Pas une colonne manquante dans une table :
 * une famille que le moteur ne savait pas engendrer, et rien pour le dire.
 *
 * Le claustra du bois de chauffage : 6 lames sur chant entre une semelle et une
 * lisse, deux traverses de renfort au dos. Toutes ses pièces sortent à la même
 * largeur — une seule refente pour le meuble entier — et c'est ce qui en fait
 * le bon deuxième cas : peu de règles, mais un repère complètement différent.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { derive } from '../moteur/derive/index.mjs'

/* Le claustra du bois de chauffage, tel qu'il est posé.
   2410 sous plafond, 1200 de large, 100 de profondeur — la profondeur EST la
   largeur de coupe de toutes les pièces, lames comprises, puisqu'une lame est
   sur chant. */
const claustra = (sur = {}) => ({
  famille: 'claustra',
  trigramme: 'CLA',
  module: '',
  hors_tout: { l: 1200, p: 100, h: 2410 },
  lames: 6,
  traverses: 2,
  // Le contreplaqué ne se chante pas : il se ponce et se finit autrement.
  faces_chantees: [],
  materiaux: { principal: { id: 'CP20', ep: 20, chante: false } },
  parametres: {},
  ...sur,
})

const p = (r, e) => r.pieces.find((x) => x.etiquette === e)

test('une lame va d\'une semelle à l\'autre : 2410 − 2 × 20 = 2370', () => {
  const r = derive(claustra(), [])
  const lame = p(r, 'CLA-LAME-1')
  assert.equal(lame.longueur, 2370)
  // Sur chant : ses 100 sont la PROFONDEUR du claustra, pas une face vue.
  assert.equal(lame.largeur, 100)
  assert.equal(lame.ep, 20, 'et c\'est son épaisseur qu\'on voit de face')
})

test('semelle, lisse et traverses font la largeur : 1200', () => {
  const r = derive(claustra(), [])
  for (const e of ['CLA-SEMELLE', 'CLA-LISSE', 'CLA-TRAV-1', 'CLA-TRAV-2']) {
    assert.equal(p(r, e).longueur, 1200, e)
  }
})

test('tout le meuble sort de la MÊME bande — un seul réglage de refente', () => {
  // C'est la propriété qui fait la simplicité de ce meuble, et elle se vérifie :
  // pas une pièce ne sort à une autre largeur que la profondeur du claustra.
  const r = derive(claustra(), [])
  assert.deepEqual([...new Set(r.pieces.map((x) => x.largeur))], [100])
})

test('le jour ne se déclare pas : il tombe de la largeur', () => {
  /* Six lames de 20 dans 1200, cinq jours à se partager le reste.
     (1200 − 120) / 5 = 216, et l'entraxe qui va au plan de perçage vaut le
     jour plus une lame. Écrire ces nombres à la main, c'est se condamner à ce
     qu'une lame de plus les laisse faux sans que rien ne le dise. */
  const r = derive(claustra(), [])
  assert.equal(r.resultats.jour, 216)
  assert.equal(r.resultats.entraxe, 236)
})

test('une lame de plus recalcule le motif, elle ne le contredit pas', () => {
  const r = derive(claustra({ lames: 7 }), [])
  // (1200 − 140) / 6 = 176,67 — et le moteur le dit tel quel plutôt que d'arrondir.
  assert.ok(Math.abs(r.resultats.jour - 176.666) < 0.01, `obtenu ${r.resultats.jour}`)
})

test('sans traverses de renfort, le claustra tient quand même', () => {
  // Sur chant, une lame est vingt-cinq fois plus raide que couchée : les deux
  // traverses du meuble posé sont un choix, pas une nécessité.
  const r = derive(claustra({ traverses: 0 }), [])
  assert.ok(!r.pieces.some((x) => x.role === 'TRAVERSE'))
  assert.equal(r.contraint, true, 'et le meuble reste entièrement déterminé')
})

test('une famille que le moteur ne sait pas engendrer est NOMMÉE, pas devinée', () => {
  /* Le défaut d'origine : les tables du caisson étaient bien écartées, et le
     squelette réclamait quand même un bas et deux côtés. Un meuble d'une autre
     sorte se voyait donc refuser des pièces qu'il n'a pas, sans que le message
     dise jamais le vrai problème. */
  const r = derive(claustra({ famille: 'verriere' }), [])
  const dit = r.issues.find((i) => i.type === 'famille-inconnue')
  assert.ok(dit, `attendu un refus nommé, obtenu : ${r.issues.map((i) => i.type).join(' | ')}`)
  assert.match(dit.message, /verriere/)
  assert.deepEqual(r.pieces, [], 'et surtout aucune pièce inventée')
})
