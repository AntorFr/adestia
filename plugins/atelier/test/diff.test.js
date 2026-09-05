/**
 * Le delta d'une dérivation, sur le changement qui a coûté le plus cher.
 *
 * Le cas n'est pas inventé : un meuble à tiroirs avait été coté avec un dessus
 * en plaque pleine alors qu'un plan de travail venait se poser dessus. La règle
 * existait, écrite, dans les fiches — elle n'avait simplement pas été
 * appliquée. Quand elle l'a été, le dessus est devenu deux traverses, les
 * côtés sont passés de 832 à 851, et le débit est tombé de deux plaques à une.
 *
 * Aucune de ces trois conséquences n'a été annoncée. La hauteur des côtés a
 * dû être repérée à l'œil, deux passes plus tard. C'est cet affichage-là que
 * ces tests pinnent.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { diff, diffDesign, rendu } from '../moteur/diff.mjs'

/** Le meuble tel qu'il était coté avant la correction. */
const avant = () => ({
  design: { famille: 'caisson', pose: 'fixe', plan_travail: 'aucun', hors_tout: { l: 1120, p: 600, h: 870 } },
  pieces: [
    { etiquette: 'BLT-A1-BAS', longueur: 1118, largeur: 600, materiau: 'MEL19' },
    { etiquette: 'BLT-A1-DESSUS', longueur: 1120, largeur: 600, materiau: 'MEL19' },
    { etiquette: 'BLT-A1-CÔTÉ-G', longueur: 832, largeur: 600, materiau: 'MEL19', note: 'hauteur libre' },
    { etiquette: 'BLT-A1-CÔTÉ-D', longueur: 832, largeur: 600, materiau: 'MEL19' },
  ],
  debit: [{ plaque: 'P1', materiau: 'MEL19' }, { plaque: 'P2', materiau: 'MEL19' }],
})

/** Le même, une fois la règle du plan de travail appliquée. */
const apres = () => ({
  design: { famille: 'caisson', pose: 'fixe', plan_travail: 'rapporte', hors_tout: { l: 1120, p: 600, h: 870 } },
  pieces: [
    { etiquette: 'BLT-A1-BAS', longueur: 1118, largeur: 600, materiau: 'MEL19' },
    { etiquette: 'BLT-A1-TRAV-HAUT-AV', longueur: 1082, largeur: 100, materiau: 'MEL19' },
    { etiquette: 'BLT-A1-TRAV-HAUT-AR', longueur: 1082, largeur: 100, materiau: 'MEL19' },
    { etiquette: 'BLT-A1-CÔTÉ-G', longueur: 851, largeur: 600, materiau: 'MEL19', note: 'recorrigé' },
    { etiquette: 'BLT-A1-CÔTÉ-D', longueur: 851, largeur: 600, materiau: 'MEL19' },
  ],
  debit: [{ plaque: 'P1', materiau: 'MEL19' }],
})

test('recalculer sans rien changer se dit en un mot', () => {
  const d = diff(avant(), avant())
  assert.equal(d.rien, true)
  assert.equal(rendu(d), 'Rien n\'a bougé.')
})

test('le passage au plan de travail : l\'entrée qui a changé est nommée', () => {
  const d = diff(avant(), apres())
  assert.deepEqual(d.design, [{ champ: 'plan_travail', avant: 'aucun', apres: 'rapporte' }])
})

test('le dessus disparaît, deux traverses apparaissent', () => {
  const d = diff(avant(), apres())
  assert.deepEqual(d.disparues.map((p) => p.etiquette), ['BLT-A1-DESSUS'])
  assert.deepEqual(d.apparues.map((p) => p.etiquette), ['BLT-A1-TRAV-HAUT-AV', 'BLT-A1-TRAV-HAUT-AR'])
})

test('les côtés passent de 832 à 851, et ça se voit sans avoir à le chercher', () => {
  const d = diff(avant(), apres())
  const cotes = d.modifiees.filter((m) => m.etiquette.startsWith('BLT-A1-CÔTÉ'))
  assert.equal(cotes.length, 2)
  for (const c of cotes)
    assert.deepEqual(c.changes, [{ champ: 'longueur', avant: 832, apres: 851 }])
})

test('une note réécrite n\'est pas un changement de conception', () => {
  const d = diff(avant(), apres())
  const changes = d.modifiees.flatMap((m) => m.changes.map((c) => c.champ))
  assert.ok(!changes.includes('note'), 'les notes changent à chaque passe et noieraient les lignes qui comptent')
})

test('la plaque économisée est comptée', () => {
  const d = diff(avant(), apres())
  assert.deepEqual(d.debit, [{ materiau: 'MEL19', avant: 2, apres: 1 }])
})

test('le rendu tient en quelques lignes lisibles', () => {
  const texte = rendu(diff(avant(), apres()))
  assert.match(texte, /design: plan_travail {2}aucun → rapporte/)
  assert.match(texte, /− BLT-A1-DESSUS \(1120 × 600\)/)
  assert.match(texte, /\+ BLT-A1-TRAV-HAUT-AV \(1082 × 100\)/)
  assert.match(texte, /~ BLT-A1-CÔTÉ-G {2}longueur 832 → 851/)
  assert.match(texte, /débit: MEL19 2 → 1 plaque$/m)
})

test('un chemin imbriqué du design est rendu à plat', () => {
  const d = diffDesign({ hors_tout: { l: 1120, h: 870 } }, { hors_tout: { l: 1120, h: 900 } })
  assert.deepEqual(d, [{ champ: 'hors_tout.h', avant: 870, apres: 900 }])
})

test('un chant ajouté est un changement, et se lit comme une liste', () => {
  const a = { pieces: [{ etiquette: 'X', chants: ['rive-avant'] }] }
  const b = { pieces: [{ etiquette: 'X', chants: ['rive-avant', 'about-gauche'] }] }
  assert.match(rendu(diff(a, b)), /~ X {2}chants \[rive-avant\] → \[rive-avant, about-gauche\]/)
})
