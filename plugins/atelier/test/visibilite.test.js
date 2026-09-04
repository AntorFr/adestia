/**
 * Quels bords se chantent — les cas de l'atelier, pas une théorie.
 *
 * Un meuble à roulettes montre son dos à chaque déplacement ; un meuble fixe
 * contre un mur ne le montre jamais. Deux meubles accolés ne montrent pas
 * leurs côtés joints — et on les chante quand même, parfois, pour n'avoir
 * qu'un réglage de bande à faire sur les trois.
 *
 * Le dedans suit la même règle que le dehors : un bord se chante s'il DÉBOUCHE
 * sur une face qu'on regarde. C'est ce qui fait qu'on plaque l'avant de la
 * traverse avant et rien d'autre — sa rive arrière regarde l'intérieur, ses
 * abouts sont pris entre les côtés.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'
import { chantsParDefaut, ecartsAuDefaut } from '../moteur/modele/visibilite.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (n) => litTable(JSON.parse(readFileSync(join(here, n), 'utf8')), n).table
const tables = () => [lit('fixture-regles-dessus.json'), lit('fixture-regles-fond.json')]

const design = (sur = {}) => ({
  famille: 'caisson',
  trigramme: 'BLT',
  hors_tout: { l: 1120, p: 600, h: 870 },
  pose: 'fixe',
  plan_travail: 'rapporte',
  fond: 'oui',
  dessous: 'encastre',
  materiaux: { principal: { ep: 19 } },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3, profondeur_traverse: 100,
  },
  ...sur,
})

const piece = (r, e) => r.pieces.find((p) => p.etiquette === e)

test('un meuble fixe contre un mur ne chante pas son dos', () => {
  const r = derive(design({ visible: ['avant'] }), tables())
  assert.deepEqual(piece(r, 'BLT-A1-BAS').chants, ['rive-avant'])
  assert.deepEqual(piece(r, 'BLT-A1-CÔTÉ-G').chants, ['rive-avant'])
  // Et la traverse arrière non plus : elle ne se chante QUE si l'arrière du
  // meuble se chante. Un bord qui débouche sur une face qu'on ne regarde pas
  // reste brut, où qu'il soit dans le meuble.
  assert.deepEqual(piece(r, 'BLT-A1-TRAV-HAUT-AR').chants, [])
})

test('un meuble à roulettes montre son dos, donc il le chante', () => {
  const r = derive(design({ pose: 'mobile', visible: ['avant', 'arriere', 'gauche', 'droite'] }), tables())
  assert.deepEqual(piece(r, 'BLT-A1-CÔTÉ-G').chants, ['rive-arriere', 'rive-avant'])
  assert.deepEqual(piece(r, 'BLT-A1-BAS').chants,
    ['about-droit', 'about-gauche', 'rive-arriere', 'rive-avant'])
})

test('la traverse avant se chante devant, et rien d\'autre — quand le dos se chante aussi', () => {
  const r = derive(design({ visible: ['avant', 'arriere'] }), tables())
  assert.deepEqual(piece(r, 'BLT-A1-TRAV-HAUT-AV').chants, ['rive-avant'],
    'sa rive arrière regarde l\'intérieur, ses abouts sont pris entre les côtés')
  assert.deepEqual(piece(r, 'BLT-A1-TRAV-HAUT-AR').chants, ['rive-arriere'])
})

test('un fond en rainure n\'a aucun bord dehors — donc aucun chant', () => {
  const r = derive(design({ visible: ['avant', 'arriere', 'gauche', 'droite'] }), tables())
  assert.deepEqual(piece(r, 'BLT-A1-FOND').chants, [])
})

test('le cas du dressing : on chante un côté invisible pour standardiser', () => {
  // Trois meubles accolés : les côtés joints ne se voient pas. On les plaque
  // quand même — une passe, un réglage — mais pas le fond.
  const d = design({
    visible: ['avant'],
    chants: { 'BLT-A1-CÔTÉ-G': ['rive-avant', 'rive-arriere'] },
  })
  const r = derive(d, tables())
  assert.deepEqual(piece(r, 'BLT-A1-CÔTÉ-G').chants, ['rive-avant', 'rive-arriere'])
  assert.deepEqual(piece(r, 'BLT-A1-CÔTÉ-D').chants, ['rive-avant'], 'l\'autre côté suit le défaut')
})

test('et cet écart est NOMMÉ, pas noyé dans une liste de chants', () => {
  const d = design({
    visible: ['avant'],
    chants: { 'BLT-A1-CÔTÉ-G': ['rive-avant', 'rive-arriere'] },
  })
  assert.deepEqual(derive(d, tables()).ecartsChant, [
    { etiquette: 'BLT-A1-CÔTÉ-G', ajoutes: ['rive-arriere'], retires: [] },
  ])
})

test('une surcharge remplace, elle ne s\'ajoute pas : [] retire tout', () => {
  const d = design({ visible: ['avant', 'arriere'], chants: { 'BLT-A1-BAS': [] } })
  const r = derive(d, tables())
  assert.deepEqual(piece(r, 'BLT-A1-BAS').chants, [])
  assert.deepEqual(r.ecartsChant[0].retires, ['rive-arriere', 'rive-avant'])
})

test('changer les faces regardées change les cotes de coupe', () => {
  const devant = derive(design({ visible: ['avant'] }), tables())
  const tout = derive(design({ visible: ['avant', 'arriere', 'gauche', 'droite'] }), tables())
  assert.equal(piece(devant, 'BLT-A1-BAS').longueur, 1120, 'aucun about chanté')
  assert.equal(piece(tout, 'BLT-A1-BAS').longueur, 1118, 'deux abouts chantés')
  assert.equal(piece(devant, 'BLT-A1-CÔTÉ-G').largeur, 599)
  assert.equal(piece(tout, 'BLT-A1-CÔTÉ-G').largeur, 598, 'les deux rives, cette fois')
})

test('une tablette EN RETRAIT se chante comme une affleurante', () => {
  // Le critère est le regard, pas la géométrie : son bord avant est tourné
  // vers l'avant et rien ne le cache. Reculé de 5 mm pour ne pas taper une
  // porte, il reste ce qu'on voit le plus en ouvrant le meuble.
  const affleurante = { etiquette: 'TAB-1', regardeVers: { 'rive-avant': 'avant' } }
  const enRetrait = { etiquette: 'TAB-2', regardeVers: { 'rive-avant': 'avant' } }
  assert.deepEqual(chantsParDefaut([affleurante, enRetrait], ['avant']), {
    'TAB-1': ['rive-avant'],
    'TAB-2': ['rive-avant'],
  })
})

test('un bord tourné vers une face non regardée reste brut, où qu\'il soit', () => {
  const dedans = { etiquette: 'TRAV', regardeVers: { 'rive-arriere': 'arriere' } }
  assert.deepEqual(chantsParDefaut([dedans], ['avant']), {})
  assert.deepEqual(chantsParDefaut([dedans], ['avant', 'arriere']), { TRAV: ['rive-arriere'] })
})

test('sans faces déclarées, rien n\'est chanté — on ne devine pas ce qui se voit', () => {
  const r = derive(design(), tables())
  assert.deepEqual(chantsParDefaut(r.pieces, []), {})
  assert.deepEqual(piece(r, 'BLT-A1-BAS').chants, [])
})

test('ecartsAuDefaut ne parle que de ce qui diffère', () => {
  const pieces = [{ etiquette: 'X', regardeVers: { 'rive-avant': 'avant' } }]
  assert.deepEqual(ecartsAuDefaut(pieces, ['avant'], { X: ['rive-avant'] }), [])
})
