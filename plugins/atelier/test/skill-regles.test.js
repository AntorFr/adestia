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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { METHODES } from '../moteur/modele/methodes.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const skill = readFileSync(join(here, '..', 'skills', 'regles-json', 'SKILL.md'), 'utf8')

test('la skill cite exactement les méthodes du registre', () => {
  const citees = new Set([...skill.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]))
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
