/**
 * Le système de relations, sur la cote qui a coûté deux passes.
 *
 * Un côté de caisson a été coté 832 : la hauteur hors-tout moins l'épaisseur
 * du bas, moins celle du dessus — alors que le dessus, devenu deux traverses
 * posées SUR les côtés, ne les capturait plus. La soustraction avait été faite
 * deux fois, et 832 est un nombre parfaitement plausible.
 *
 * Écrite comme une relation, la même erreur ne produit pas un nombre : elle
 * contredit ce qui est déjà posé, et se refuse en nommant les deux règles en
 * cause. C'est tout ce que ces tests vérifient — plus le cas inverse, celui
 * qu'aucun solveur de contraintes ne signale de lui-même : la cote que rien
 * ne détermine.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { systeme } from '../moteur/derive/systeme.mjs'

/** Le caisson du meuble à tiroirs : 870 hors-tout, bas de 19 qui porte les côtés. */
const caisson = () => {
  const s = systeme()
  s.fixe('meuble/hauteur-hors-tout', 'meuble.h', 870)
  s.fixe('materiau/epaisseur-bas', 'bas.ep', 19)
  // La hauteur hors-tout est une VARIABLE, pas un 870 recopié : une constante
  // qui est en réalité une autre cote, c'est la formule dirigée qu'on remplace.
  s.pose({ nom: 'cote/repose-sur-bas', termes: { 'cote.h': 1, 'bas.ep': 1, 'meuble.h': -1 }, egale: 0 })
  return s
}

test('le côté tombe à 851 sans qu\'une soustraction soit écrite nulle part', () => {
  const { valeurs, contraint } = caisson().resout()
  assert.equal(valeurs['cote.h'], 851)
  assert.equal(contraint, true)
})

test('la double soustraction ne donne plus 832 : elle se refuse, en nommant le conflit', () => {
  const s = caisson()
  s.fixe('materiau/epaisseur-dessus', 'dessus.ep', 19)
  const r = s.pose({
    nom: 'dessus/capture-cote',
    termes: { 'cote.h': 1, 'bas.ep': 1, 'dessus.ep': 1, 'meuble.h': -1 },
    egale: 0,
  })
  assert.equal(r.ok, false)
  assert.equal(r.raison, 'contradiction')
  assert.match(r.message, /« dessus\/capture-cote » contredit/)
  assert.match(r.message, /cote\/repose-sur-bas/)
})

test('après un refus, le système garde ce qui était juste', () => {
  const s = caisson()
  s.fixe('materiau/epaisseur-dessus', 'dessus.ep', 19)
  s.pose({ nom: 'dessus/capture-cote', termes: { 'cote.h': 1, 'bas.ep': 1, 'dessus.ep': 1, 'meuble.h': -1 }, egale: 0 })
  assert.equal(s.resout().valeurs['cote.h'], 851)
})

test('une relation qui n\'apporte rien est signalée — quelqu\'un croit l\'appliquer', () => {
  const s = caisson()
  const r = s.pose({ nom: 'cote/redite', termes: { 'cote.h': 1 }, egale: 851 })
  assert.equal(r.ok, true)
  assert.equal(r.redondante, true)
  assert.deepEqual(r.avec.sort(), ['cote/repose-sur-bas', 'materiau/epaisseur-bas', 'meuble/hauteur-hors-tout'])
})

test('une cote que rien ne détermine est NOMMÉE, jamais remplie au jugé', () => {
  const s = caisson()
  // Le fond entre dans le système, mais sa hauteur n'est liée à rien : c'est
  // le « profondeur 100 par défaut, PAS CALCULÉE » d'un vrai workbook.
  s.pose({ nom: 'fond/dans-la-rainure', termes: { 'fond.h': 1, 'fond.marge': 1, 'meuble.h': -1 }, egale: 0 })
  const { libres, contraint, valeurs } = s.resout()
  assert.equal(contraint, false)
  assert.deepEqual(libres, ['fond.h', 'fond.marge'])
  assert.equal(valeurs['fond.h'], undefined, 'pas de valeur inventée pour une cote libre')
})

test('poser la marge manquante suffit à tout fermer', () => {
  const s = caisson()
  s.pose({ nom: 'fond/dans-la-rainure', termes: { 'fond.h': 1, 'fond.marge': 1, 'meuble.h': -1 }, egale: 0 })
  s.fixe('savoir-faire/marge-fond', 'fond.marge', 5)
  const { valeurs, contraint, libres } = s.resout()
  assert.equal(contraint, true)
  assert.deepEqual(libres, [])
  assert.equal(valeurs['fond.h'], 865)
})

test('une relation se lit dans les deux sens : partir d\'une chute et remonter au meuble', () => {
  const s = systeme()
  s.fixe('materiau/epaisseur-bas', 'bas.ep', 19)
  s.pose({ nom: 'cote/repose-sur-bas', termes: { 'cote.h': 1, 'bas.ep': 1, 'meuble.h': -1 }, egale: 0 })
  s.fixe('stock/chute-en-magasin', 'cote.h', 851)
  assert.equal(s.resout().valeurs['meuble.h'], 870)
})

test('les coefficients non unitaires passent — la largeur du fond en est un', () => {
  const s = systeme()
  // largeur = intérieur + 2 × (profondeur de rainure − engagement perdu)
  s.fixe('caisson/interieur', 'interieur.l', 722)
  s.fixe('savoir-faire/profondeur-rainure', 'rainure.prof', 9)
  s.fixe('savoir-faire/jeu-lateral-fond', 'fond.jeu', 3)
  s.pose({
    nom: 'fond/largeur-engagee',
    termes: { 'fond.l': 1, 'interieur.l': -1, 'rainure.prof': -2, 'fond.jeu': 2 },
    egale: 0,
  })
  assert.equal(s.resout().valeurs['fond.l'], 734)
})

test('une cote sait de quelles règles elle tient sa valeur', () => {
  const origines = caisson().origineDe('cote.h')
  assert.deepEqual(origines.sort(), ['cote/repose-sur-bas', 'materiau/epaisseur-bas', 'meuble/hauteur-hors-tout'])
})

test('un système vide n\'est pas « contraint » — il n\'y a rien à contraindre', () => {
  assert.equal(systeme().resout().contraint, false)
})
