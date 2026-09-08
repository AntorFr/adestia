/**
 * Un séparateur borné par ce qui le surmonte.
 *
 * Le meuble à tiroirs du bureau : son séparateur médian fait 693 et le moteur
 * en calculait 832. Les deux nombres étaient justes, mais répondaient à deux
 * questions — 832 est la hauteur du bas jusque sous les traverses hautes, 693
 * la hauteur du bas jusque sous la TABLETTE PLEINE LARGEUR qui le surmonte.
 *
 *     19 (bas) + 693 + 19 (tablette) + 120 (compartiment) + 19 (traverse) = 870
 *
 * Et cette tablette n'existait pas dans le fichier : elle vient d'un arbitrage
 * — l'agent avait proposé deux traverses, Monsieur a tranché pour une tablette
 * complète, « pas grosse différence de matière, moins prise de tête » — que
 * personne n'avait écrit. Le moteur ne pouvait pas la deviner, et le fichier
 * décrivait encore le montage écarté.
 *
 * Rien de neuf n'a été inventé pour le décrire : une tablette pleine largeur
 * ne s'AJOUTE pas au meuble, elle le PARTAGE en hauteur, exactement comme un
 * séparateur le partage en largeur. Les zones savaient déjà faire.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { litTable } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const lit = (n) => litTable(JSON.parse(readFileSync(join(here, n), 'utf8')), n).table
const tables = () => ['dessus', 'dessous', 'fond', 'tablette', 'separateur', 'plan']
  .map((n) => lit(`fixture-regles-${n}.json`))

/** Le caisson à tiroirs du bureau, tel qu'il est débité — 601 de profondeur. */
const blt = (sur = {}) => ({
  famille: 'caisson', trigramme: 'BLT', module: 'A1',
  hors_tout: { l: 1120, p: 601, h: 870 },
  pose: 'fixe', plan_travail: 'rapporte', facade: 'ouverte',
  fond: 'oui', dessous: 'encastre',
  zones: [
    // Sous la tablette pleine largeur, et le compartiment à tiroir au-dessus.
    { id: 'bas', axe: 'z', etendue: 693 },
    { id: 'tiroir', axe: 'z' },
  ],
  separateurs: [{ type: 'lateral', zone: 'bas', repere: 'MÉDIAN' }],
  tablettes: [{ nombre: 1, partage: 'z' }],
  faces_chantees: ['avant', 'gauche', 'droite'],
  materiaux: { principal: { id: 'MEL19', ep: 19 }, fond: { id: 'MEL8', ep: 8, chante: false } },
  parametres: {
    retrait_chant: 1, profondeur_traverse: 100, marge_fond: 5,
    rainure_prof: 9, rainure_bas_prof: 8, fond_jeu: 3, retrait_fond_dos: 20,
    seuil_mutualisation: 3,
  },
  ...sur,
})

const p = (r, e) => r.pieces.find((x) => x.etiquette === e)

test('le séparateur s\'arrête sous la tablette, pas sous le toit', () => {
  const r = derive(blt(), tables())
  assert.equal(p(r, 'BLT-A1-SÉP-MÉDIAN').longueur, 693)
})

test('et la hauteur du compartiment à tiroir se DÉDUIT, elle ne se déclare pas', () => {
  /* Le bas, la zone basse, la tablette, le compartiment et la traverse
     remplissent les 870 du meuble. Une seule relation, et les 120 en tombent —
     écrire ce nombre à la main, c'est se condamner à ce qu'une tablette
     déplacée le laisse faux sans que rien ne le dise. */
  const r = derive(blt(), tables())
  assert.equal(r.zones.tiroir, 120)
})

test('sans zone verticale, il monte jusqu\'en haut comme avant', () => {
  // Le cas ordinaire ne bouge pas : un séparateur qui ne vit dans aucune zone
  // de hauteur va du bas à ce qui ferme le toit.
  const r = derive(blt({
    zones: [], separateurs: [{ type: 'lateral', repere: 'MÉDIAN' }],
    tablettes: [{ nombre: 1 }],
  }), tables())
  assert.equal(p(r, 'BLT-A1-SÉP-MÉDIAN').longueur, 832, '870 − 19 de bas − 19 de traverse')
})

test('la tablette qui partage tient toute la largeur intérieure', () => {
  const r = derive(blt(), tables())
  // 1120 − 2 × 19 : elle porte le tiroir pleine largeur qui la surmonte.
  assert.equal(p(r, 'BLT-A1-TAB-1').longueur, 1082)
})
