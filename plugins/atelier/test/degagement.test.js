/**
 * De combien une pièce recule pour ne pas taper le fond.
 *
 * Trouvé sur un meuble construit — l'imprimante 3D — et c'est un défaut qui se
 * cachait derrière une corrélation. Le séparateur et la tablette devinaient le
 * montage du fond à partir de `pose` : « fixe » voulait dire fond en rainure,
 * retenu du dos, donc reculer du retrait ; tout le reste voulait dire ne rien
 * reculer du tout.
 *
 * Ça marchait par accident, parce que les meubles fixes du corpus ont bien un
 * fond en rainure. Mais un meuble MOBILE a un fond STRUCTUREL : un panneau
 * plein de 19 mm entre les côtés, sur lequel le séparateur vient buter. Le
 * moteur le faisait filer jusqu'au dos, à 669 dans un meuble de 670, quand la
 * pièce posée fait 651.
 *
 * Le fond pose donc lui-même ce qu'il occupe, et qui le consomme n'a plus à
 * savoir laquelle des quatre méthodes a répondu — ni à tourner après elle.
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

/** Le caisson de l'imprimante 3D : mobile, donc fond plein et structurel. */
const imp = (sur = {}) => ({
  famille: 'caisson', trigramme: 'IMP', module: 'C1',
  hors_tout: { l: 720, p: 670, h: 740 },
  pose: 'mobile', plan_travail: 'rapporte', facade: 'ouverte',
  fond: 'oui', dessous: 'pleine-profondeur',
  separateurs: [{ type: 'lateral' }], tablettes: 2, tiroirs: 0,
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: { principal: { id: 'MEL19', ep: 19 } },
  parametres: {
    retrait_chant: 1, profondeur_traverse: 150, marge_fond: 2,
    rainure_prof: 9, rainure_bas_prof: 8, fond_jeu: 2, retrait_fond_dos: 20,
    seuil_mutualisation: 3,
  },
  ...sur,
})

const p = (r, role) => r.pieces.find((x) => x.role === role)

test('un fond STRUCTUREL fait reculer de son épaisseur', () => {
  const r = derive(imp(), tables())
  // 670 de meuble − 19 de fond = 651 de place, moins 1 de chant avant.
  assert.equal(p(r, 'SÉPARATEUR').largeur, 650)
  assert.equal(p(r, 'TABLETTE').largeur, 650, 'la tablette devinait le même faux')
})

test('un fond en RAINURE fait reculer de son retrait, pas de son épaisseur', () => {
  const r = derive(imp({ pose: 'fixe', dessous: 'encastre' }), tables())
  // 670 − 20 de retrait du dos = 650, moins 1 de chant.
  assert.equal(p(r, 'SÉPARATEUR').largeur, 649)
})

test('sans fond, rien à dégager — et ce n\'est pas un défaut de commodité', () => {
  /* La grandeur n'est jamais choisie par le pipeline : soit une méthode de
     fond la pose, soit il n'y a pas de pièce de fond du tout et elle vaut
     zéro. Un meuble sans fond a bien toute sa profondeur. */
  const r = derive(imp({ fond: 'non' }), tables())
  assert.equal(p(r, 'SÉPARATEUR').largeur, 669, '670 moins son seul chant avant')
})

test('le montage ne se devine plus de la POSE, qui n\'y était que corrélée', () => {
  // Le même meuble, mobile et fixe, avec le même fond déclaré : ce qui change
  // la cote est le montage du fond, pas la façon dont le meuble est posé.
  const mobile = derive(imp(), tables())
  const fixe = derive(imp({ pose: 'fixe', dessous: 'encastre' }), tables())
  assert.notEqual(p(mobile, 'SÉPARATEUR').largeur, p(fixe, 'SÉPARATEUR').largeur)
})

/* ── Une tablette par colonne ────────────────────────────────────────────────
   Le caisson de l'imprimante a un séparateur latéral et UNE tablette par
   colonne, 331,5 chacune. La déclaration ne nommait qu'une zone pour toutes
   les tablettes du meuble : celui-ci ne pouvait donc pas s'écrire du tout, et
   le moteur sortait deux tablettes pleine largeur — deux panneaux qui ne
   rentrent nulle part.

   La déclaration devient une liste, comme celle des séparateurs. Et une zone
   ne divise qu'un axe : la tablette y prend son étendue et garde celle du
   meuble sur l'autre — sans quoi une tablette du meuble poubelle, dont la
   zone partage la PROFONDEUR, perdrait sa largeur. */

test('une tablette par colonne, chacune dans sa zone', () => {
  const r = derive(imp({
    zones: [
      { id: 'gauche', axe: 'x', etendue: 331.5 },
      { id: 'droite', axe: 'x' },
    ],
    separateurs: [{ type: 'lateral' }],
    tablettes: [{ nombre: 1, zone: 'gauche' }, { nombre: 1, zone: 'droite' }],
  }), tables())

  const [g, d] = r.pieces.filter((x) => x.role === 'TABLETTE')
  assert.equal(g.longueur, 331.5, 'la colonne gauche, telle qu\'on l\'a décidée')
  assert.equal(d.longueur, 331.5, 'et la droite, DÉDUITE de ce qui reste')
  assert.equal(r.zones.droite, 331.5)
  // Leur profondeur reste celle du meuble : la zone ne partage que la largeur.
  assert.equal(g.largeur, 650, '670 − 19 de fond structurel − 1 de chant')
})

test('les numéros restent continus d\'un lot à l\'autre', () => {
  // C'est ce qui est écrit au crayon sur les panneaux : l'atelier ne compte
  // pas par zone.
  const r = derive(imp({
    zones: [{ id: 'gauche', axe: 'x', etendue: 331.5 }, { id: 'droite', axe: 'x' }],
    separateurs: [{ type: 'lateral' }],
    tablettes: [{ nombre: 2, zone: 'gauche' }, { nombre: 1, zone: 'droite' }],
  }), tables())
  assert.deepEqual(
    r.pieces.filter((x) => x.role === 'TABLETTE').map((x) => x.etiquette),
    ['IMP-C1-TAB-1', 'IMP-C1-TAB-2', 'IMP-C1-TAB-3'],
  )
})
