/**
 * Jusqu'où va le dessous — et pourquoi ce n'est pas au code d'en décider.
 *
 * Trouvé en dérivant un meuble DÉJÀ POSÉ, ce qui est la seule façon dont ça
 * pouvait l'être : le rangement du garage a son dessous à 600 pour 620 de
 * meuble, et le moteur en calculait 619. Le socle posait la profondeur du bas
 * en dur, traversante, avant toute décision — alors que c'en est une.
 *
 * Le pire du défaut n'est pas le millimètre : c'est que rien ne le signalait.
 * Pas de cote libre, pas de contradiction — un nombre faux, plausible, sur une
 * pièce qu'on débite.
 *
 * Et ce que départage les deux montages n'est pas le goût, c'est un COMPTE, le
 * même arbitrage que le retrait de tablette. Ramené, tout l'horizontal tombe à
 * la même profondeur : une refente, un réglage. Traversant, c'est une rainure
 * qui prend le fond et on paie trois réglages. Le garage a peu de pièces et
 * choisit le premier ; le dressing a beaucoup de tablettes et le même meuble
 * plusieurs fois, et le second se justifie. Les deux meubles existent, les deux
 * sont justes, et c'est exactement pour ça que ça vit dans une table.
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
const tables = () => ['dessus', 'dessous', 'fond', 'tablette', 'separateur', 'plan']
  .map((n) => lit(`fixture-regles-${n}.json`))

const bas = (r) => r.pieces.find((p) => p.role === 'BAS')
const dessus = (r) => r.pieces.find((p) => p.role === 'DESSUS')

/* Le rangement du garage, module A1. Posé le 24/08, 450 × 620 × 1919.
   Sa profondeur se déclare à 621 : c'est ce que le meuble MESURE une fois les
   bandes posées — côté coupé 620 plus son chant avant. Le 620 qu'on avait en
   tête n'a jamais décrit ce meuble, et déclarer le vrai nombre fait tomber
   toutes les coupes rondes sans une seule dérogation. */
const garage = (sur = {}) => ({
  famille: 'caisson', trigramme: 'GAR', module: 'A1',
  hors_tout: { l: 450, p: 621, h: 1919 },
  pose: 'fixe', plan_travail: 'aucun', facade: 'ouverte',
  fond: 'oui', dessous: 'ramene',
  separateurs: [], tablettes: 5, tiroirs: 0,
  faces_chantees: ['avant', 'gauche', 'droite'],
  materiaux: {
    principal: { id: 'MEL19', ep: 19, chante: true },
    fond: { id: 'MEL8', ep: 8, chante: false },
  },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 2,
    retrait_fond_dos: 20, retrait_chant: 1, seuil_mutualisation: 3,
  },
  ...sur,
})

test('ramené : le dessous recule, et le moteur le fait enfin', () => {
  const r = derive(garage(), tables())
  // 621 − 20 de retrait − 1 de chant avant. La pièce posée au garage fait 600.
  assert.equal(bas(r).largeur, 600)
})

test('et tout l\'horizontal tombe à la MÊME profondeur — c\'est tout l\'intérêt', () => {
  const r = derive(garage(), tables())
  // Une seule refente, un seul réglage : c'est ce qu'on achète en raccourcissant
  // le dessous, et c'est ce qui rend le montage préférable sur un petit meuble.
  assert.equal(bas(r).largeur, dessus(r).largeur)
})

test('traversant : le dessous garde sa pleine profondeur', () => {
  // Le montage du dressing : la rainure prend le fond, le dessous ne recule pas.
  // Sa pièce posée fait 600 dans un meuble de 600, quand le dessus fait 580.
  const r = derive(garage({ dessous: 'encastre' }), tables())
  assert.equal(bas(r).largeur, 620, 'pleine profondeur, moins son seul chant avant')
  assert.notEqual(bas(r).largeur, dessus(r).largeur, 'et il ne partage plus le réglage du dessus')
})

test('encastré et pleine profondeur se coupent pareil : c\'est l\'usinage qui diffère', () => {
  const a = derive(garage({ dessous: 'encastre' }), tables())
  const b = derive(garage({ dessous: 'pleine-profondeur' }), tables())
  assert.equal(bas(a).largeur, bas(b).largeur)
})

test('sans table pour en décider, la profondeur du bas est une cote LIBRE', () => {
  /* La bascule qui a du prix : cette cote était posée en dur par le socle, donc
     un meuble qui n'a pas tranché la question sortait quand même un nombre.
     Maintenant elle manque, elle est nommée, et rien ne s'écrit. */
  const sansDessous = tables().filter((t) => t.id !== 'dessous')
  const r = derive(garage(), sansDessous)
  assert.equal(bas(r).largeur, undefined)
  assert.ok(
    r.issues.some((i) => i.gravite === 'bloquant' && /GAR-A1-BAS\.y/.test(i.message)),
    `attendu la cote libre nommée, obtenu : ${r.issues.map((i) => i.message).join(' | ')}`,
  )
})
