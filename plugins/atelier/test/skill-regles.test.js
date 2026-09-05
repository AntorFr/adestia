/**
 * Le contrat des tables, tenu contre le code qu'il décrit.
 *
 * Une skill est du markdown : rien ne l'oblige à rester vraie. Celle des
 * exemples a menti pendant un tag entier, dans le plugin dont c'est justement
 * le sujet. Ce test-ci vérifie ce qui se vérifie mécaniquement : que le
 * vocabulaire annoncé à l'agent soit EXACTEMENT celui du registre.
 *
 * Une méthode livrée mais non documentée est une méthode que personne
 * n'utilisera ; une méthode documentée mais absente est une cote refusée au
 * moment de dériver, c'est-à-dire trop tard.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { METHODES } from '../moteur/modele/methodes.mjs'
import { derive } from '../moteur/derive/index.mjs'
import { litTable } from '../moteur/tables.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const skill = readFileSync(join(here, '..', 'skills', 'regles-json', 'SKILL.md'), 'utf8')

/** Une section de la skill, seule — la suivante n'est pas le même sujet. */
const section = (titre) => {
  const debut = skill.indexOf(`## ${titre}`)
  assert.notEqual(debut, -1, `section absente : ${titre}`)
  const suite = skill.indexOf('\n## ', debut + 1)
  return skill.slice(debut, suite === -1 ? undefined : suite)
}

/** Les premières colonnes d'un tableau markdown, entre dos d'apostrophes. */
const colonneUne = (texte) =>
  [...texte.matchAll(/^\| `([^`]+)`[^|]*\|/gm)].map((m) => m[1])

test('la skill cite exactement les méthodes du registre', () => {
  const citees = new Set(colonneUne(section('Le vocabulaire des méthodes')))
  const livrees = new Set(Object.keys(METHODES))
  assert.deepEqual([...citees].sort(), [...livrees].sort())
})

test('elle porte le frontmatter qu\'une skill livrée doit avoir', () => {
  assert.match(skill, /^---\nname: regles-json\n/)
  assert.match(skill, /^description: >/m)
})

test('elle dit les trois invariants qui font la valeur d\'une table', () => {
  for (const mot of ['Exhaustivité', 'Unicité', 'Pas de seuil dans une cellule']) {
    assert.ok(skill.includes(mot), `manque : ${mot}`)
  }
})

test('le manifeste la livre à l\'agent', () => {
  const manifeste = JSON.parse(readFileSync(join(here, '..', 'adestia-plugin.json'), 'utf8'))
  assert.ok(manifeste.skills.includes('./skills/regles-json/SKILL.md'))
})

/* ── Le vocabulaire que l'agent ne peut pas deviner ──────────────────────────
   Les rôles de matière et les étiquettes ne sont écrits nulle part : le seul
   moyen de les apprendre était de lire `methodes.mjs`, ce qu'un agent a
   effectivement fait. Un agent qui lit le code pour trouver un nom finira par
   en inventer un — et une étiquette inventée casse le rapprochement avec le
   débit déjà écrit, en silence, puisque les deux planches ont l'air d'exister.

   Ces deux tests-ci tiennent la doc contre le moteur, comme celui des
   méthodes : ce qui est livré est cité, ce qui est cité est livré. */

/** Un meuble qui exerce TOUTES les méthodes qui posent des pièces. */
const meubleComplet = {
  famille: 'caisson', trigramme: 'PBL', module: 'C1',
  hors_tout: { l: 800, p: 650, h: 905 },
  pose: 'mobile', plan_travail: 'rapporte', fond: 'oui',
  dessous: 'pleine-profondeur', facade: 'ouverte',
  zones: [{ id: 'bacs', axe: 'y', etendue: 350 }, { id: 'outils', axe: 'y' }],
  separateurs: [{ type: 'frontal' }, { type: 'lateral', zone: 'bacs', repere: 'POUB' }],
  tablettes: { nombre: 2, zone: 'outils' }, tiroirs: 1, corps_tiroir: 'oui',
  faces_chantees: ['avant', 'arriere', 'gauche', 'droite'],
  materiaux: {
    principal: { id: 'MEL19', ep: 19 },
    fond: { id: 'MEL8', ep: 8, chante: false },
    fond_tiroir: { id: 'MEL6', ep: 6, chante: false },
    plan_travail: { id: 'MDF19', ep: 19, chante: false },
  },
  parametres: {
    marge_fond: 5, rainure_prof: 9, rainure_encastrement: 5, fond_jeu: 3,
    profondeur_traverse: 150, retrait_fond_dos: 20, retrait_tablette_avant: 3,
    seuil_mutualisation: 3, jeu_facade: 3, jeu_facade_lateral: 2,
    ep_coulisse: 12.5, jeu_coulisse: 1, profondeur_coulisse: 550,
    hauteur_tiroir: 150, rainure_tiroir_prof: 6, retrait_chant: 1,
  },
}

test('la skill dit tous les rôles de matière que les méthodes réclament', () => {
  const cites = new Set(colonneUne(section('Les rôles de matière')))
  /* Un rôle se réclame de deux endroits, et il faut les deux : une PIÈCE le
     nomme quand elle seule sait de quoi elle est faite (le fond de tiroir en
     6 mm dans un corps en 19), une TABLE le nomme quand c'est une décision
     (le fond de caisson, fin ou structurel). Plus `principal`, le défaut. */
  const reclames = new Set(['principal'])
  for (const f of readdirSync(join(here, '..', 'exemples', 'regles'))) {
    const t = JSON.parse(readFileSync(join(here, '..', 'exemples', 'regles', f), 'utf8'))
    for (const l of t.lignes ?? []) if (l.alors?.materiau) reclames.add(l.alors.materiau)
  }
  for (const m of Object.values(METHODES)) {
    const r = m.applique({
      trigramme: 'PBL', module: 'C1', design: meubleComplet, sorties: {}, ferme: [],
      cotes: [{ etiquette: 'PBL-C1-CÔTÉ-G' }, { etiquette: 'PBL-C1-CÔTÉ-D' }],
    })
    for (const p of r.pieces ?? []) if (p.materiau) reclames.add(p.materiau)
  }
  for (const role of reclames) assert.ok(cites.has(role), `rôle de matière non documenté : ${role}`)
  for (const role of cites) assert.ok(reclames.has(role), `rôle documenté que rien ne réclame : ${role}`)
})

test('elle dit toutes les étiquettes et tous les rôles de pièce que le moteur écrit', () => {
  const table = section('Les étiquettes que le moteur écrit')
  // Les tables LIVRÉES : ce que l'agent trouve dans le plugin, pas un montage
  // de test — la doc doit être vraie de ce qui sort de la boîte.
  const tables = readdirSync(join(here, '..', 'exemples', 'regles')).map((f) => {
    const { table, erreurs } = litTable(
      JSON.parse(readFileSync(join(here, '..', 'exemples', 'regles', f), 'utf8')), f,
    )
    assert.deepEqual(erreurs, [], `table livrée illisible : ${f}`)
    return table
  })
  const { pieces } = derive(meubleComplet, tables)
  assert.ok(pieces.length > 10, 'le meuble d\'épreuve doit exercer tout le registre')
  for (const p of pieces) {
    // L'étiquette est citée telle quelle, ou par sa forme numérotée (`-1`).
    const forme = p.etiquette.replace(/-\d+$/, '-1')
    assert.ok(
      table.includes(p.etiquette) || table.includes(forme),
      `étiquette non documentée : ${p.etiquette}`,
    )
    assert.ok(table.includes(`\`${p.role}\``), `rôle de pièce non documenté : ${p.role}`)
  }
})
