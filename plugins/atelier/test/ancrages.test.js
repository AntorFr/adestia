/**
 * Le caisson du meuble à tiroirs, monté par ancrages et résolu.
 *
 * Aucune cote n'est écrite dans ce test en dehors du hors-tout et de
 * l'épaisseur du panneau : 851, 1082 et 1118 doivent tomber du montage. Ce
 * sont les cotes réelles du projet, celles qui ont demandé quatre passes.
 *
 * Le point qui compte n'est pas que le solveur trouve 851 : c'est qu'il trouve
 * 832 quand on lui dit que le dessus capture les côtés, et 851 quand on lui dit
 * qu'il repose dessus. Les deux montages sont justes ; ce qui manquait, c'était
 * de POSER la question — et c'est le travail d'une table, pas d'une mémoire.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { systeme } from '../moteur/derive/systeme.mjs'
import {
  axesDe, bute, constante, entre, relationsDOrientation, relationsDuMeuble, traverse, v,
} from '../moteur/modele/ancrages.mjs'

const p = (etiquette, orientation) => ({ etiquette, orientation })

const BAS = p('BAS', 'horizontal')
const COTE_G = p('CÔTÉ-G', 'lateral')
const COTE_D = p('CÔTÉ-D', 'lateral')
const TRAV = p('TRAV-HAUT-AV', 'horizontal')
const DESSUS = p('DESSUS', 'horizontal')

/** Le squelette commun : hors-tout, épaisseurs, orientations, le bas porteur. */
const caisson = (pieces, ep = 19) => {
  const s = systeme()
  const refuses = []
  const pose = (r) => { const x = s.pose(r); if (!x.ok) refuses.push(x) }

  for (const r of relationsDuMeuble({ l: 1120, p: 600, h: 870 })) pose(r)
  for (const piece of pieces) {
    pose(constante(`materiau/ep-${piece.etiquette}`, v(piece.etiquette, 'ep'), ep))
    for (const r of relationsDOrientation(piece)) pose(r)
  }
  // Le bas est porteur : il traverse, les côtés viendront reposer dessus.
  pose(traverse(BAS, 'x'))
  pose(traverse(BAS, 'y'))
  return { s, pose, refuses }
}

test('l\'orientation dit sur quel axe du meuble tombe chaque cote de débit', () => {
  assert.deepEqual(axesDe('lateral'), { ep: 'x', longueur: 'z', largeur: 'y' })
  assert.deepEqual(axesDe('horizontal'), { ep: 'z', longueur: 'x', largeur: 'y' })
  assert.deepEqual(axesDe('frontal'), { ep: 'y', longueur: 'z', largeur: 'x' })
})

test('une orientation inconnue est refusée plutôt que devinée', () => {
  assert.throws(() => axesDe('oblique'), /orientation inconnue/)
})

test('avec un dessus en traverses, le côté fait 851 — sans qu\'aucun 851 soit écrit', () => {
  const { s, pose } = caisson([BAS, COTE_G, COTE_D, TRAV])
  pose(bute(COTE_G, 'z', ['BAS']))
  pose(traverse(COTE_G, 'y'))
  pose(entre(TRAV, 'x', ['CÔTÉ-G', 'CÔTÉ-D']))

  const { valeurs } = s.resout()
  assert.equal(valeurs['CÔTÉ-G.longueur'], 851, 'la hauteur du côté')
  assert.equal(valeurs['CÔTÉ-G.largeur'], 600, 'la profondeur du meuble')
  assert.equal(valeurs['TRAV-HAUT-AV.longueur'], 1082, '1120 − 19 − 19, jamais écrit')
  assert.equal(valeurs['BAS.longueur'], 1120)
})

test('avec un dessus en plaque pleine, le même côté fait 832 — et c\'est juste aussi', () => {
  const { s, pose } = caisson([BAS, COTE_G, DESSUS])
  pose(bute(COTE_G, 'z', ['BAS', 'DESSUS']))
  assert.equal(s.resout().valeurs['CÔTÉ-G.longueur'], 832)
})

test('les deux montages ensemble se contredisent — l\'erreur ne peut plus passer', () => {
  const { s, pose } = caisson([BAS, COTE_G, DESSUS])
  pose(bute(COTE_G, 'z', ['BAS']))
  const r = s.pose(bute(COTE_G, 'z', ['BAS', 'DESSUS']))
  assert.equal(r.ok, false)
  assert.equal(r.raison, 'contradiction')
  assert.match(r.message, /CÔTÉ-G\/bute-z/)
})

test('la profondeur des traverses n\'est calculée par rien — elle sort en cote libre', () => {
  const { s, pose } = caisson([BAS, COTE_G, COTE_D, TRAV])
  pose(bute(COTE_G, 'z', ['BAS']))
  pose(traverse(COTE_G, 'y'))
  pose(entre(TRAV, 'x', ['CÔTÉ-G', 'CÔTÉ-D']))

  const { contraint, libres } = s.resout()
  assert.equal(contraint, false)
  // « Profondeur des traverses hautes prise à 100 mm par défaut — pas calculée,
  //   à confirmer » : c'était une note de bas de page, c'est devenu bloquant.
  assert.ok(libres.includes('TRAV-HAUT-AV.largeur'), `attendu parmi ${libres}`)
  assert.ok(libres.includes('TRAV-HAUT-AV.y'))
})

test('poser la profondeur manquante ferme le système', () => {
  const { s, pose } = caisson([BAS, COTE_G, COTE_D, TRAV])
  pose(bute(COTE_G, 'z', ['BAS']))
  pose(traverse(COTE_G, 'y'))
  pose(traverse(COTE_D, 'y'))
  pose(bute(COTE_D, 'z', ['BAS']))
  pose(entre(TRAV, 'x', ['CÔTÉ-G', 'CÔTÉ-D']))
  pose(constante('projet/profondeur-traverse', v('TRAV-HAUT-AV', 'largeur'), 100))

  const { contraint, libres, valeurs } = s.resout()
  assert.deepEqual(libres, [])
  assert.equal(contraint, true)
  assert.equal(valeurs['CÔTÉ-D.longueur'], 851)
})

test('changer l\'épaisseur du panneau déplace les cotes qui en dépendent, pas les autres', () => {
  // Le nominal n'est pas le réel — « un coup de pied à coulisse avant de
  // calculer quoi que ce soit qui dépende de l'épaisseur ». Remesurer doit
  // coûter une entrée, pas une reprise de toutes les cotes.
  const monte = (ep) => {
    const { s, pose } = caisson([BAS, COTE_G, COTE_D, TRAV], ep)
    pose(bute(COTE_G, 'z', ['BAS']))
    pose(entre(TRAV, 'x', ['CÔTÉ-G', 'CÔTÉ-D']))
    return s.resout().valeurs
  }
  const en19 = monte(19)
  const en18 = monte(18)

  assert.equal(en19['CÔTÉ-G.longueur'], 851)
  assert.equal(en18['CÔTÉ-G.longueur'], 852)
  assert.equal(en18['TRAV-HAUT-AV.longueur'], 1084)
  assert.equal(en18['BAS.longueur'], en19['BAS.longueur'], 'le bas traverse : il ne dépend d\'aucune épaisseur')
})

test('une cote dit de quel montage elle vient', () => {
  const { s, pose } = caisson([BAS, COTE_G])
  pose(bute(COTE_G, 'z', ['BAS']))
  const origines = s.origineDe('CÔTÉ-G.longueur')
  assert.ok(origines.includes('CÔTÉ-G/bute-z'), `attendu dans ${origines}`)
  assert.ok(origines.includes('meuble/hauteur-hors-tout'))
})
