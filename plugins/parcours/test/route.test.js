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

test('la route ne s’encode plus d’un bloc — mais l’ancienne se relit encore', () => {
  // La barre oblique est légale dans un fragment (RFC 3986) : l'encoder
  // rendait chaque adresse illisible pour rien. Ce qui a été écrit à l'ancienne
  // — un favori, un lien posé dans une fiche il y a des mois — reste lu.
  assert.equal(
    routeDuParcours('domaines/voyages/x/assets/val.parcours.json'),
    '#/parcours/domaines/voyages/x/assets/val.parcours.json',
  )
  assert.equal(
    parcoursDeLaRoute('#/parcours/domaines%2Fvoyages%2Fx%2Fassets%2Fval.parcours.json'),
    'domaines/voyages/x/assets/val.parcours.json',
  )
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
