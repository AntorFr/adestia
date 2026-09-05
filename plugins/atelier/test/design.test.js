/**
 * La source, sa signature, et l'accord entre les deux.
 *
 * Ce que ces tests pinnent : qu'un workbook ne puisse pas laisser croire que
 * ses cotes viennent du design qu'il porte alors qu'elles n'en viennent plus.
 * Sans dépôt git sur `memory/`, c'est la seule chose qui le dise.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { canonique, empreinte } from '../moteur/empreinte.mjs'
import {
  empreinteDesign, litDesign, fraicheur, signature, journalise, versQuatre,
} from '../moteur/design.mjs'

const design = () => ({
  famille: 'caisson',
  hors_tout: { l: 1120, p: 600, h: 870 },
  pose: 'fixe',
  parametres: { marge_fond: 5 },
})

/* ── l'empreinte ─────────────────────────────────────────────────────────── */

test('l\'ordre des clés ne change pas l\'empreinte — sinon réécrire le fichier périmerait un dérivé juste', () => {
  const a = { famille: 'caisson', hors_tout: { l: 1120, p: 600, h: 870 } }
  const b = { hors_tout: { p: 600, h: 870, l: 1120 }, famille: 'caisson' }
  assert.equal(empreinte(a), empreinte(b))
})

test('l\'empreinte est stable dans le temps — la changer périmerait tous les workbooks en silence', () => {
  const attendu = 'fnv1a64:4c1e6d224f5d14b7'
  assert.equal(empreinte({ famille: 'caisson', hors_tout: { l: 1120, p: 600, h: 870 } }), attendu)
})

test('la forme canonique traverse listes, imbrication et null', () => {
  assert.equal(canonique({ b: [1, { z: null, a: 2 }], a: 'x' }), '{"a":"x","b":[1,{"a":2,"z":null}]}')
})

test('changer une cote d\'entrée change l\'empreinte', () => {
  const avant = empreinteDesign(design())
  const apres = empreinteDesign({ ...design(), hors_tout: { l: 1120, p: 600, h: 900 } })
  assert.notEqual(avant, apres)
})

test('le journal ne change pas l\'empreinte — annoter n\'est pas décider', () => {
  const avant = empreinteDesign(design())
  const apres = empreinteDesign(journalise(design(), { champ: 'pose', avant: 'mobile', apres: 'fixe' }))
  assert.equal(avant, apres)
})

test('une dérogation, elle, change l\'empreinte : elle change le calcul', () => {
  const avec = { ...design(), derogations: [{ table: 'debit/derasage', on_fait: 'aucun', pourquoi: 'meuble de garage, éclats tolérés' }] }
  assert.notEqual(empreinteDesign(design()), empreinteDesign(avec))
})

/* ── la fraîcheur ────────────────────────────────────────────────────────── */

test('un workbook signé de son propre design est frais', () => {
  const d = design()
  const wb = { schemaVersion: '4.0', design: d, derive: signature(d, 'test') }
  assert.equal(fraicheur(wb).etat, 'frais')
})

test('changer le design périme le dérivé, sans y toucher', () => {
  const d = design()
  const wb = { schemaVersion: '4.0', design: d, derive: signature(d, 'test'), pieces: [{ etiquette: 'A' }] }
  const modifie = { ...wb, design: { ...d, pose: 'mobile' } }
  const f = fraicheur(modifie)
  assert.equal(f.etat, 'perime')
  assert.notEqual(f.de, f.attendu)
  assert.deepEqual(modifie.pieces, wb.pieces, 'les pièces ne bougent pas : c\'est la signature qui parle')
})

test('un workbook d\'avant le moteur est orphelin, pas en faute', () => {
  assert.equal(fraicheur({ schemaVersion: '3.0', pieces: [] }).etat, 'orphelin')
})

test('un design sans dérivation qui s\'en réclame est « non signé »', () => {
  assert.equal(fraicheur({ schemaVersion: '4.0', design: design() }).etat, 'non-signe')
})

/* ── l'enveloppe ─────────────────────────────────────────────────────────── */

test('un design sans famille est refusé — rien ne dirait quelles tables s\'appliquent', () => {
  const { design: d, erreurs } = litDesign({ hors_tout: {} })
  assert.equal(d, null)
  assert.match(erreurs.join('\n'), /famille/)
})

test('une dérogation sans raison est refusée : elle ne peut pas devenir une ligne de table', () => {
  const { erreurs } = litDesign({ ...design(), derogations: [{ table: 'debit/derasage', on_fait: 'aucun' }] })
  assert.match(erreurs.join('\n'), /pourquoi/)
})

test('une dérogation motivée passe', () => {
  const { erreurs } = litDesign({
    ...design(),
    derogations: [{ table: 'debit/derasage', on_fait: 'aucun', pourquoi: 'meuble de garage : éclats tolérés, réparables à la colle blanche' }],
  })
  assert.deepEqual(erreurs, [])
})

test('l\'enveloppe ne juge pas le contenu propre à une famille', () => {
  const { erreurs } = litDesign({ famille: 'claustra', lames: 42, ce_que_le_moteur_ignore: true })
  assert.deepEqual(erreurs, [])
})

/* ── le journal et la migration ──────────────────────────────────────────── */

test('journaliser n\'écrase rien et horodate', () => {
  const d = design()
  const apres = journalise(d, { champ: 'plan_travail', avant: 'aucun', apres: 'rapporte', pourquoi: 'il y a un plan de travail' })
  assert.equal(d.journal, undefined, 'le design d\'origine n\'est pas muté')
  assert.equal(apres.journal.length, 1)
  assert.equal(apres.journal[0].champ, 'plan_travail')
  assert.match(apres.journal[0].le, /^\d{4}-\d{2}-\d{2}T/)
})

test('3.0 → 4.0 ne fabrique pas de design : le dérivé reste orphelin, et le dit', () => {
  const migre = versQuatre({ schemaVersion: '3.0', pieces: [{ etiquette: 'A' }] })
  assert.equal(migre.schemaVersion, '4.0')
  assert.equal(migre.design, undefined)
  assert.equal(fraicheur(migre).etat, 'orphelin')
})

test('migrer du 4.0 ne fait rien, migrer du 2.0 est refusé', () => {
  const deja = { schemaVersion: '4.0', design: design() }
  assert.equal(versQuatre(deja), deja)
  assert.throws(() => versQuatre({ schemaVersion: '2.0' }), /attendu du 3\.0/)
})
