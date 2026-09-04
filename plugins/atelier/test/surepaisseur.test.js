/**
 * Le chant posé en surépaisseur — la dérogation d'un panneau déjà débité.
 *
 * Deux meubles de l'atelier la portent. Sur celui de l'imprimante, la revue
 * des chants n'avait pas suivi un changement de montage, et l'erreur a été
 * vue le panneau déjà coupé : « ARBITRAGE : on ne touche PAS aux cotes, le
 * chant se pose EN SURÉPAISSEUR. Le bas finit donc à 722 × 671 et déborde de
 * 1 mm sous le caisson sur ces trois bords — moche et assumé, moins pire que
 * reprendre la pièce qui tient l'équerrage de tout le meuble. »
 *
 * La décision porte sur CETTE pièce et ne dit rien de la règle : elle vise
 * donc une pièce, pas une table. Et elle laisse une trace sur la pièce, sans
 * quoi un débord d'un millimètre ne se retrouve que sur le meuble monté.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { litDesign } from '../moteur/design.mjs'
import { derive } from '../moteur/derive/index.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (n) => litTable(JSON.parse(readFileSync(join(here, n), 'utf8')), n).table
const tables = () => [lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json')]

/** Le meuble de l'imprimante : mobile, plan de travail, fond structurel. */
const imp3d = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'IMP',
  module: 'C1',
  hors_tout: { l: 720, p: 670, h: 740 },
  pose: 'mobile',
  plan_travail: 'rapporte',
  fond: 'oui',
  dessous: 'pleine-profondeur',
  facade: 'ouverte',
  // Meuble mobile : on voit son dos à chaque déplacement.
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: { principal: { ep: 19 } },
  parametres: { marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3, profondeur_traverse: 100 },
  ...sur,
})

const bas = (r) => r.pieces.find((p) => p.etiquette === 'IMP-C1-BAS')

test('la règle rend d\'avance ce que les bandes ajouteront : 718 × 668', () => {
  const b = bas(derive(imp3d(), tables()))
  assert.equal(b.longueur, 718, '720 − 2 abouts chantés')
  assert.equal(b.largeur, 668, '670 − 2 rives chantées')
})

test('la dérogation de pièce garde la cote ronde, et le débord avec', () => {
  // Le panneau est coupé : on ne le reprend pas, la bande passe par-dessus.
  const r = derive(imp3d({
    derogations: [{
      piece: 'IMP-C1-BAS',
      on_fait: { compense_chant: 'non' },
      pourquoi: 'panneau déjà débité — reprendre la pièce qui tient l\'équerrage coûte plus qu\'un millimètre visible',
    }],
  }), tables())
  const b = bas(r)
  assert.equal(b.longueur, 720, 'la cote du panneau déjà coupé')
  assert.equal(b.largeur, 670)
  assert.equal(b.chant_en_surepaisseur, true, 'et la pièce le dit')
})

test('elle ne déborde que sur la pièce visée', () => {
  const r = derive(imp3d({
    derogations: [{ piece: 'IMP-C1-BAS', on_fait: { compense_chant: 'non' }, pourquoi: 'panneau déjà débité, on ne le reprend pas' }],
  }), tables())
  const cote = r.pieces.find((p) => p.role === 'CÔTÉ')
  assert.equal(cote.largeur, 668, 'les côtés compensent normalement')
  assert.equal(cote.chant_en_surepaisseur, undefined)
})

test('une dérogation sans table NI pièce est refusée', () => {
  const { erreurs } = litDesign({
    famille: 'caisson',
    derogations: [{ on_fait: { compense_chant: 'non' }, pourquoi: 'parce que voilà, une raison assez longue' }],
  })
  assert.match(erreurs.join('\n'), /`table` ou `piece` manquante/)
})

test('et une dérogation de pièce reste soumise au `pourquoi`', () => {
  const { erreurs } = litDesign({
    famille: 'caisson',
    derogations: [{ piece: 'IMP-C1-BAS', on_fait: { compense_chant: 'non' } }],
  })
  assert.match(erreurs.join('\n'), /pourquoi/)
})
