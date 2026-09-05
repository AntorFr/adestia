/**
 * Les tables de décision, contre une table réelle.
 *
 * La fixture est la règle du fond de caisson telle qu'elle est écrite dans les
 * fiches savoir-faire, y compris sa ligne « pas de fond » — le cas qui, laissé
 * implicite, a fait appliquer une règle de fond à un meuble qui n'en a pas.
 *
 * Ce que ces tests pinnent n'est pas la menuiserie : c'est que l'exhaustivité
 * reste VÉRIFIÉE. Une table dont un cas ne tombe sur aucune ligne doit le dire,
 * et ne jamais choisir à la place de personne.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable, verifieTable, choisit, pourFamille } from '../moteur/tables.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const brut = () => JSON.parse(readFileSync(join(here, 'fixture-regles-fond.json'), 'utf8'))

/** La fixture, lue et acceptée — l'état de départ de presque chaque test. */
const table = () => {
  const { table, erreurs } = litTable(brut(), 'fixture')
  assert.deepEqual(erreurs, [])
  return table
}

test('la table du fond est lue sans erreur', () => {
  const t = table()
  assert.equal(t.id, 'fond')
  assert.deepEqual(t.appliqueA, ['caisson'])
  assert.equal(t.lignes.length, 5)
})

test('une table sans famille est refusée — elle s\'appliquerait à un meuble qu\'elle ne connaît pas', () => {
  const sans = brut()
  delete sans.applique_a
  const { table, erreurs } = litTable(sans, 'fixture')
  assert.equal(table, null)
  assert.match(erreurs.join('\n'), /applique_a/)
})

test('une cellule hors domaine est refusée en nommant l\'entrée et son domaine', () => {
  const faux = brut()
  faux.lignes[2].quand.dessous = 'flottant'
  const { table, erreurs } = litTable(faux, 'fixture')
  assert.equal(table, null)
  assert.match(erreurs.join('\n'), /« dessous » vaut « flottant »/)
  assert.match(erreurs.join('\n'), /ramene/)
})

test('une sortie inconnue est refusée — une faute de frappe ne devient pas une cote', () => {
  const faux = brut()
  faux.lignes[1].alors.materaiu = 'fond'
  const { erreurs } = litTable(faux, 'fixture')
  assert.match(erreurs.join('\n'), /sortie inconnue « materaiu »/)
})

test('une entrée inconnue dans un `quand` est refusée', () => {
  const faux = brut()
  faux.lignes[0].quand.roulettes = 'oui'
  const { erreurs } = litTable(faux, 'fixture')
  assert.match(erreurs.join('\n'), /entrée inconnue « roulettes »/)
})

test('la table couvre ses douze cas, sans trou ni chevauchement', () => {
  const { trous, chevauchements, verifie } = verifieTable(table())
  assert.equal(verifie, true)
  assert.deepEqual(trous, [])
  assert.deepEqual(chevauchements, [])
})

test('un cas non couvert est nommé, pas tu', () => {
  const ampute = brut()
  ampute.lignes = ampute.lignes.filter((l) => l.quand.dessous !== 'encastre')
  const { table: t } = litTable(ampute, 'fixture')
  const { trous } = verifieTable(t)
  assert.equal(trous.length, 1)
  assert.match(trous[0], /pose=fixe/)
  assert.match(trous[0], /dessous=encastre/)
})

test('deux lignes pour le même cas sont un chevauchement, pas un ordre de priorité', () => {
  const double = brut()
  double.lignes.push({
    quand: { pose: 'fixe', fond: 'oui', dessous: 'ramene' },
    alors: { methode: 'fond-structurel', materiau: 'fond' },
  })
  const { table: t } = litTable(double, 'fixture')
  const { chevauchements } = verifieTable(t)
  assert.equal(chevauchements.length, 1)
  assert.match(chevauchements[0], /lignes 3 et 6/)
})

test('« pas de fond » est une réponse, pas une absence de réponse', () => {
  const r = choisit(table(), { pose: 'mobile', fond: 'non', dessous: 'ramene' })
  assert.equal(r.erreur, undefined)
  assert.equal(r.alors.methode, null)
  assert.equal(r.ligne, 1)
})

test('un caisson fixe au dessous ramené prend le fond traversant', () => {
  const r = choisit(table(), { pose: 'fixe', fond: 'oui', dessous: 'ramene' })
  assert.equal(r.alors.methode, 'fond-rainure-traversant')
  assert.equal(r.alors.materiau, 'fond')
  assert.equal(r.table, 'fond')
})

test('changer le montage du dessous change la méthode — les trois cas sont distincts', () => {
  const t = table()
  const methode = (dessous) => choisit(t, { pose: 'fixe', fond: 'oui', dessous }).alors.methode
  assert.equal(methode('ramene'), 'fond-rainure-traversant')
  assert.equal(methode('pleine-profondeur'), 'fond-rainure-arrete')
  assert.equal(methode('encastre'), 'fond-rainure-encastre')
})

test('un fait que le design ne dit pas est nommé, jamais deviné', () => {
  const r = choisit(table(), { pose: 'fixe', fond: 'oui' })
  assert.match(r.erreur, /le design ne dit pas « dessous »/)
  assert.equal(r.alors, undefined)
})

test('un fait hors domaine se distingue d\'un trou de table', () => {
  const r = choisit(table(), { pose: 'suspendu', fond: 'oui', dessous: 'ramene' })
  assert.match(r.erreur, /hors domaine/)
  assert.doesNotMatch(r.erreur, /aucune ligne/)
})

test('une table d\'une autre famille est écartée, et on sait laquelle', () => {
  const caisson = table()
  const massif = litTable({ ...brut(), id: 'fond-massif', applique_a: ['table-massif'] }, 'x').table
  const { retenues, ecartees } = pourFamille([caisson, massif], 'caisson')
  assert.deepEqual(retenues.map((t) => t.id), ['fond'])
  assert.deepEqual(ecartees.map((t) => t.id), ['fond-massif'])
})

test('au-delà de la borne, l\'exhaustivité est déclarée non vérifiée plutôt que supposée', () => {
  const large = brut()
  for (let i = 0; i < 4; i++) large.entrees[`e${i}`] = Array.from({ length: 10 }, (_, n) => `v${n}`)
  const { table: t } = litTable(large, 'fixture')
  const { verifie, note } = verifieTable(t)
  assert.equal(verifie, false)
  assert.match(note, /n'est pas vérifiée/)
})
