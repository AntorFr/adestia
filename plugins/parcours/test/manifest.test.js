/**
 * Les deux moitiés d'un bloc, confrontées.
 *
 * Le manifeste dit ce qu'un `:::parcours` EST, le module dit à quoi il
 * RESSEMBLE. Les deux se lisent à deux endroits différents et par deux
 * processus différents — d'où ce banc : une divergence entre elles ne casse
 * rien, elle rend le bloc inerte. Le shell le signale au chargement, mais un
 * signalement au démarrage arrive après la livraison.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const manifeste = JSON.parse(await readFile(join(ICI, '..', 'demeura-plugin.json'), 'utf8'))

test('le manifeste déclare le bloc que le module dessine, et rien d’autre', async () => {
  const { default: blocks } = await import('../web/blocks.js')
  const { tags } = blocks({ id: 'parcours', locale: 'fr' })

  assert.deepEqual(Object.keys(tags).sort(), Object.keys(manifeste.vocabulary).sort())
  for (const [nom, composant] of Object.entries(tags)) {
    assert.equal(typeof composant, 'function', `${nom} doit être un composant`)
  }
})

test('un parcours n’a pas de corps : ses attributs sont tout son sens', () => {
  const spec = manifeste.vocabulary.parcours
  assert.equal(spec.content, 'empty')
  assert.equal(spec.attributes.source.required, true)
  // La vue est un ensemble FERMÉ : une troisième valeur serait un diagnostic,
  // pas un défaut silencieux, et la fiche le dirait à qui l'a écrite.
  assert.deepEqual(spec.attributes.vue.values, ['carte', 'lien'])
  assert.equal(spec.attributes.vue.default, 'carte')
})

test('le plugin s’active depuis `features`, et le manifeste le dit', () => {
  // Ni tuile ni domaine : un parcours s'accroche à la fiche qui en parle. Le
  // déclarer `app` lui donnerait une case dans le lanceur qui n'ouvre rien.
  assert.equal(manifeste.kind, 'feature')
  assert.equal(manifeste.tile, undefined)
})
