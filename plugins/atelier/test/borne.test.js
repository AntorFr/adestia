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
const tables = () => ['dessus', 'dessous', 'fond', 'tablette', 'separateur', 'plan', 'tiroir']
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
    seuil_mutualisation: 3, jeu_facade: 3, jeu_facade_lateral: 2,
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

/* ── Des façades par lot, et à l'intersection de deux zones ──────────────────
   Le meuble à tiroirs en porte deux lots : une façade pleine largeur dans le
   compartiment du haut, et trois dans la colonne de droite. Une déclaration
   unique ne pouvait pas les décrire, et le meuble sortait sans AUCUNE façade —
   quatre panneaux jamais débités, et le moteur muet.

   Les trois de droite vivent à l'intersection de deux zones : la colonne leur
   donne leur largeur, la zone sous la tablette leur hauteur. C'est pour ça
   qu'un lot nomme autant de zones qu'il en faut.

   Rien ici ne touche au CORPS du tiroir : flancs, dos, montant et fond
   dépendent d'un montage sur coulisses qui n'est pas tranché. Une façade est
   un panneau qu'on débite sans savoir sur quoi le tiroir coulissera. */

const avecTiroirs = (sur = {}) => blt({
  zones: [
    { id: 'bas', axe: 'z', etendue: 693 },
    { id: 'tiroir', axe: 'z' },
    { id: 'gauche', axe: 'x', etendue: 531 },
    { id: 'droite', axe: 'x' },
  ],
  separateurs: [{ type: 'lateral', zone: 'bas', repere: 'MÉDIAN' }],
  tablettes: [{ nombre: 1, partage: 'z' }],
  tiroirs: [
    { nombre: 1, zone: 'tiroir' },
    { nombre: 3, zone: ['droite', 'bas'] },
  ],
  ...sur,
})

test('une façade prend sa hauteur de la zone qu\'elle ferme', () => {
  /* Le compartiment du haut fait 120, déduit. La façade s'y cote — et non sur
     la hauteur utile du caisson, qui est ce que le moteur faisait quand il ne
     savait poser qu'un seul lot de façades pleine largeur. */
  const r = derive(avecTiroirs(), tables())
  const seule = p(r, 'BLT-A1-FAÇADE-1')
  assert.equal(r.zones.tiroir, 120)
  assert.ok(Math.abs(seule.longueur - 120) <= 2, `attendu ~120, obtenu ${seule.longueur}`)
})

test('et trois façades se partagent la colonne ET la zone sous la tablette', () => {
  /* C'est le cas qui a demandé qu'un lot puisse nommer PLUSIEURS zones : leur
     largeur vient de la colonne de droite, leur hauteur de la zone sous la
     tablette pleine largeur. Une seule zone n'aurait donné que l'une des deux.

     La colonne de droite vaut 532, déduite : 1120 − 2×19 de côtés − 19 de
     séparateur − 531 déclarés pour la colonne gauche. */
  const r = derive(avecTiroirs(), tables())
  assert.equal(r.zones.droite, 532)
  const trois = ['BLT-A1-FAÇADE-2', 'BLT-A1-FAÇADE-3', 'BLT-A1-FAÇADE-4'].map((e) => p(r, e))
  for (const f of trois) assert.ok(Math.abs(f.largeur - 532) <= 2, `largeur ${f.largeur}`)
  // Trois hauteurs et deux jeux remplissent les 693 de la zone : ~229 chacune.
  for (const f of trois) assert.ok(Math.abs(f.longueur - 229) <= 2, `hauteur ${f.longueur}`)
  assert.equal(trois[0].longueur, trois[2].longueur, 'et toutes de même hauteur')
})

/* Les tolérances de 2 mm ci-dessus ne sont pas de la paresse : une façade
   perd ses chants sur ses quatre bords, donc 2 mm par axe, SI elle s'encastre
   dans son ouverture. Si elle la RECOUVRE, elle ne les perd pas et gagne même
   un recouvrement. Ce montage n'est pas tranché — « j'ai pas encore décidé sur
   quoi partir en terme de montage de tiroir » — et les quatre panneaux ne sont
   pas débités. Ces tests épinglent donc ce qui est décidé (quelle zone donne
   quel axe) et laissent ouvert ce qui ne l'est pas. */

test('les numéros sont continus, comme pour les tablettes', () => {
  const r = derive(avecTiroirs(), tables())
  assert.deepEqual(
    r.pieces.filter((x) => x.role === 'FAÇADE').map((x) => x.etiquette),
    ['BLT-A1-FAÇADE-1', 'BLT-A1-FAÇADE-2', 'BLT-A1-FAÇADE-3', 'BLT-A1-FAÇADE-4'],
  )
})

test('le CORPS du tiroir n\'est pas posé pour autant', () => {
  // Le montage sur coulisses n'est pas tranché : une façade se débite sans
  // lui, et `tiroirs-corps` s'en occupera le jour où il le sera.
  const r = derive(avecTiroirs(), tables())
  assert.ok(!r.pieces.some((x) => String(x.role).startsWith('TIROIR-')))
})
