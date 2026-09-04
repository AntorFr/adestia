/**
 * La commande `derive`, sur l'exemple livré avec le plugin.
 *
 * Elle est le seul endroit où la chaîne se voit en entier — tables lues,
 * méthodes choisies, cotes calculées, delta rendu — et c'est par elle qu'on
 * s'en sert. Ce que ces tests pinnent : qu'un meuble incomplet ne s'écrive
 * pas, et qu'une table cassée arrête tout en se nommant.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const outil = join(here, '..', 'tools', 'atelier.mjs')
const exemples = join(here, '..', 'exemples')

/** Une copie jetable de l'exemple, que les tests peuvent réécrire. */
const bac = () => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-derive-'))
  cpSync(exemples, dir, { recursive: true })
  return { dir, wb: join(dir, 'meuble-tiroirs.workbook.json'), regles: join(dir, 'regles') }
}

const lance = (args) => {
  try {
    return { out: execFileSync(process.execPath, [outil, ...args], { encoding: 'utf8' }), code: 0 }
  } catch (e) {
    return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status }
  }
}

test('l\'exemple livré se dérive entièrement, aux cotes que la règle impose', () => {
  const { wb, regles } = bac()
  const { out, code } = lance(['derive', wb, '--regles', regles])
  assert.equal(code, 0)
  assert.match(out, /dessus ligne 2 → dessus-traverses/)
  assert.match(out, /fond ligne 5 → fond-rainure-encastre/)
  assert.match(out, /BLT-A1-BAS \(1118 × 599\)/)
  assert.match(out, /BLT-A1-CÔTÉ-G \(851 × 599\)/)
  // 599 et non 600 : le meuble fait 600 de profondeur FINIE, et ces deux
  // pièces portent un chant sur leur rive avant. Le plan réel les a sorties à
  // 600 — c'est l'écart, et c'est le plan qui a tort : plaquées, elles
  // faisaient 601 pour une enveloppe de 600.
  assert.match(out, /BLT-A1-TRAV-HAUT-AV \(1082 × 100\)/)
  assert.match(out, /BLT-A1-FOND \(851 × 1094\)/)
})

test('sans --ecrit, rien n\'est touché', () => {
  const { wb, regles } = bac()
  const avant = readFileSync(wb, 'utf8')
  lance(['derive', wb, '--regles', regles])
  assert.equal(readFileSync(wb, 'utf8'), avant)
})

test('avec --ecrit, le dérivé est écrit ET signé de son design', () => {
  const { wb, regles } = bac()
  assert.equal(lance(['derive', wb, '--regles', regles, '--ecrit']).code, 0)
  const apres = JSON.parse(readFileSync(wb, 'utf8'))
  assert.equal(apres.pieces.length, 6)
  assert.match(apres.derive.de, /^fnv1a64:/)
  assert.equal(lance(['etat', wb]).out.includes('à jour'), true)
})

test('un meuble incomplet n\'est pas écrit — il dit ce qui manque', () => {
  const { wb, regles } = bac()
  const brut = JSON.parse(readFileSync(wb, 'utf8'))
  delete brut.design.parametres.profondeur_traverse
  writeFileSync(wb, JSON.stringify(brut))
  const { out, code } = lance(['derive', wb, '--regles', regles, '--ecrit'])
  assert.equal(code, 1)
  assert.match(out, /param\.profondeur_traverse : aucune règle ne la détermine/)
  assert.match(out, /rien n'est écrit/)
  assert.equal(JSON.parse(readFileSync(wb, 'utf8')).pieces.length, 0)
})

test('une table cassée arrête la dérivation en se nommant', () => {
  const { wb, regles } = bac()
  const dessus = join(regles, 'dessus.json')
  const t = JSON.parse(readFileSync(dessus, 'utf8'))
  t.lignes[0].quand.plan_travail = 'en-verre'
  writeFileSync(dessus, JSON.stringify(t))
  const { out, code } = lance(['derive', wb, '--regles', regles])
  assert.equal(code, 1)
  assert.match(out, /dessus\.json/)
  assert.match(out, /hors domaine/)
})

test('sans --regles, le moteur refuse plutôt que d\'aller chercher des tables tout seul', () => {
  const { wb } = bac()
  const { out, code } = lance(['derive', wb])
  assert.equal(code, 2)
  assert.match(out, /les tables vivent dans la mémoire/)
})

/* ── `chant` : ajouter, retirer, et voir les cotes suivre ─────────────────── */

test('ajouter un chant recoupe la pièce, et rien d\'autre', () => {
  const { wb, regles } = bac()
  const brut = JSON.parse(readFileSync(wb, 'utf8'))
  brut.design.faces_chantees = ['avant']
  delete brut.design.chants
  writeFileSync(wb, JSON.stringify(brut))
  lance(['chant', wb, '--regles', regles, '--ecrit'])

  const { out, code } = lance(['chant', wb, '--regles', regles, '+BLT-A1-CÔTÉ-G:rive-arriere'])
  assert.equal(code, 0)
  assert.match(out, /~ BLT-A1-CÔTÉ-G {2}largeur 599 → 598/)
  assert.doesNotMatch(out, /CÔTÉ-D {2}largeur/, 'l\'autre côté ne bouge pas')
})

test('un chant hors des faces chantées est signalé comme un écart', () => {
  const { wb, regles } = bac()
  const brut = JSON.parse(readFileSync(wb, 'utf8'))
  brut.design.faces_chantees = ['avant']
  delete brut.design.chants
  writeFileSync(wb, JSON.stringify(brut))
  const { out } = lance(['chant', wb, '--regles', regles, '+BLT-A1-CÔTÉ-G:rive-arriere'])
  assert.match(out, /s'écarte des faces chantées : \+rive-arriere/)
})

test('changer les faces chantées suffit à rechanter tout le meuble', () => {
  const { wb, regles } = bac()
  const brut = JSON.parse(readFileSync(wb, 'utf8'))
  brut.design.faces_chantees = ['avant']
  delete brut.design.chants
  writeFileSync(wb, JSON.stringify(brut))
  lance(['chant', wb, '--regles', regles, '--ecrit'])

  const { out } = lance(['chant', wb, '--regles', regles, '--chante', 'avant,arriere,gauche,droite'])
  assert.match(out, /~ BLT-A1-BAS {2}longueur 1120 → 1118/)
  assert.match(out, /BLT-A1-TRAV-HAUT-AR .*rive-arriere/)
})

test('sans surcharge, aucune clé `chants` n\'est écrite — l\'empreinte ne bouge pas pour rien', () => {
  const { wb, regles } = bac()
  const brut = JSON.parse(readFileSync(wb, 'utf8'))
  brut.design.faces_chantees = ['avant']
  delete brut.design.chants
  writeFileSync(wb, JSON.stringify(brut))
  lance(['chant', wb, '--regles', regles, '--ecrit'])
  assert.equal(JSON.parse(readFileSync(wb, 'utf8')).design.chants, undefined)
})
