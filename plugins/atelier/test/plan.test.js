/**
 * Le plan de travail : la pièce qui manquait sans le dire.
 *
 * Le meuble poubelle porte un plan en MDF hydrofuge, 800 × 650, affleurant
 * l'enveloppe. Aucune méthode ne le posait — la table du dessus décide de ce
 * que devient le HAUT DU CAISSON (deux traverses), et personne ne faisait
 * exister le panneau qui vient dessus. Il ne sortait pas faux : il ne sortait
 * pas, et rien ne le signalait.
 *
 * C'est le pire défaut du lot après la tablette de zone, et pour la même
 * raison : le plan se tait sur ce qu'il ignore. Sauf qu'ici il ne l'ignorait
 * même pas — il n'avait simplement rien à en dire.
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
const tables = () => [
  lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json'),
  lit('fixture-regles-tablette.json'), lit('fixture-regles-separateur.json'),
  lit('fixture-regles-plan.json'),
]

/** Le meuble poubelle, entier : deux séparateurs, deux zones, un plan MDF. */
const poubelle = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'PBL',
  module: 'C1',
  hors_tout: { l: 800, p: 650, h: 905 },
  pose: 'mobile',
  plan_travail: 'rapporte',
  fond: 'non',
  dessous: 'pleine-profondeur',
  facade: 'ouverte',
  zones: [{ id: 'bacs', axe: 'y', etendue: 350 }, { id: 'outils', axe: 'y' }],
  separateurs: [{ type: 'frontal' }, { type: 'lateral', zone: 'bacs', repere: 'POUB' }],
  tablettes: { nombre: 1, zone: 'outils' },
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: {
    principal: { id: 'MEL19', ep: 19 },
    // Le MDF ne se chante pas : une bande n'y couvrirait rien, on le vernit.
    plan_travail: { id: 'MDF19', ep: 19, chante: false },
  },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    profondeur_traverse: 150, retrait_fond_dos: 20, retrait_tablette_avant: 3,
    seuil_mutualisation: 3,
  },
  ...sur,
})

const plan = (r) => r.pieces.find((p) => p.role === 'PLAN')

test('le plan de travail EXISTE, à l\'emprise exacte du meuble', () => {
  const p = plan(derive(poubelle(), tables()))
  assert.ok(p, 'le meuble en porte un et il doit figurer au débit')
  assert.equal(p.longueur, 800)
  assert.equal(p.largeur, 650)
})

test('il est dans SA matière, pas dans celle du caisson', () => {
  const p = plan(derive(poubelle(), tables()))
  assert.equal(p.materiau, 'MDF19')
  assert.equal(p.ep, 19)
})

test('et il ne porte aucun chant : on ne plaque pas du MDF, on le vernit', () => {
  // Ses quatre bords sont pourtant dehors — c'est la MATIÈRE qui décide, pas
  // le montage, pour qu'un plan en mélaminé se plaque tout seul le jour venu.
  const p = plan(derive(poubelle(), tables()))
  assert.deepEqual(p.chants, [])
  assert.equal(p.longueur, 800, 'aucune bande, donc aucun retrait à compenser')
})

test('sans plan de travail, il n\'y a pas de pièce en trop', () => {
  const r = derive(poubelle({ plan_travail: 'aucun' }), tables())
  assert.equal(plan(r), undefined)
  assert.ok(!r.issues.some((i) => /plan/i.test(i.message)), 'et rien à signaler')
})

test('un plan qui repose sur le meuble sans être le sien ne se débite pas — et se dit', () => {
  /* Le caisson à tiroirs du bureau : le plateau posé dessus est celui du
     BUREAU. Le caisson le supporte — son haut est en traverses pour ça — et
     ne le débite pas. Il dit donc `rapporte` comme le meuble poubelle, et
     n'attend pas la même chose. Ce qui les sépare est déjà écrit : un meuble
     qui débite son plan dit en quoi il est. */
  const r = derive(poubelle({ materiaux: { principal: { id: 'MEL19', ep: 19 } } }), tables())
  assert.equal(plan(r), undefined, 'rien à couper ici')
  const dit = r.issues.find((i) => i.type === 'hors-lot')
  assert.ok(dit, 'mais une pièce absente ne se voit pas : il faut le dire')
  assert.equal(dit.gravite, 'avertissement', 'sans bloquer une coupe qui est juste')
})

test('le cas jamais construit se DIT hors portée, il ne rend pas un nombre', () => {
  const r = derive(poubelle({ plan_travail: 'integre' }), tables())
  const dit = r.issues.find((i) => i.type === 'hors-portee')
  assert.ok(dit, 'un plan intégré n\'a jamais été construit ici')
  assert.match(dit.message, /INTÉGRÉ/, 'et la table dit POURQUOI elle ne répond pas')
  assert.equal(plan(r), undefined, 'surtout : aucune cote inventée')
})
