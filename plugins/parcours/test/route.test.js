/**
 * L'adresse d'un parcours, dans les deux sens.
 *
 * Le bloc fabrique la route, la vue la relit : deux consommateurs, une seule
 * règle d'encodage. Ce banc existe parce qu'une divergence entre les deux ne
 * se voit pas — le lien marche, et il ouvre un écran vide.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { ficheDuParcours, parcoursDeLaRoute, routeDuParcours } from '../web/route.js'

test('la route se relit dans le chemin qui l’a faite', () => {
  for (const chemin of [
    'domaines/voyages/broceliande-2026/assets/val-sans-retour.parcours.json',
    'sujets/un dossier avec des espaces/assets/x.parcours.json',
    'domaines/été/assets/randonnée #2.parcours.json',
  ]) {
    assert.equal(parcoursDeLaRoute(routeDuParcours(chemin)), chemin)
  }
})

test('une adresse qui ne nomme aucun parcours ne rend rien', () => {
  assert.equal(parcoursDeLaRoute('#/parcours'), undefined)
  assert.equal(parcoursDeLaRoute('#/parcours/'), undefined)
  assert.equal(parcoursDeLaRoute(''), undefined)
  assert.equal(parcoursDeLaRoute(undefined), undefined)
})

test('la fiche d’un parcours est le dossier au-dessus de ses assets', () => {
  assert.equal(
    ficheDuParcours('domaines/voyages/broceliande-2026/assets/val.parcours.json'),
    'domaines/voyages/broceliande-2026',
  )
  // Un parcours posé ailleurs que dans des `assets/` garde son dossier : on ne
  // remonte pas d'un cran au hasard pour faire joli.
  assert.equal(ficheDuParcours('sujets/x/val.parcours.json'), 'sujets/x/val.parcours.json')
})
