/**
 * The two halves of a block, confronted.
 *
 * The manifest says what a `:::meals` IS, the module says what it LOOKS LIKE.
 * They are read at two different moments by two different processes — the
 * server validates pages, the browser draws them — so a divergence between
 * them breaks nothing: it makes the block INERT. The shell reports it at load,
 * but a report at boot arrives after delivery.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const manifest = JSON.parse(
  await (await import('node:fs/promises')).readFile(join(ROOT, 'adestia-plugin.json'), 'utf8'),
)

test('the manifest declares the block the module draws, and no other', async () => {
  const { default: blocks } = await import('../web/blocks.js')
  const { tags } = blocks({ id: 'meals', locale: 'fr', fetch: () => Promise.reject(new Error('no')) })

  assert.deepEqual(Object.keys(tags).sort(), Object.keys(manifest.vocabulary).sort())
  for (const [name, component] of Object.entries(tags)) {
    assert.equal(typeof component, 'function', `${name} must be a component`)
  }
})

test('a period has no body: its attributes are its whole meaning', () => {
  const spec = manifest.vocabulary.meals
  assert.equal(spec.content, 'empty')
  assert.equal(spec.attributes.source.required, true)
  // A closed set, so a third value is a diagnostic rather than a silent default.
  assert.deepEqual(spec.attributes.vue.values, ['frise', 'lien'])
  assert.equal(spec.attributes.vue.default, 'frise')
})

test('the plugin activates from `features`, and the manifest says so', () => {
  // Neither tile nor domain: a week of meals hangs off the fiche that holds
  // it. Declaring it an app would give it a launcher square opening nothing.
  assert.equal(manifest.kind, 'feature')
  assert.equal(manifest.tile, undefined)
  // The folder wins over the manifest, so they had better agree.
  assert.equal(manifest.id, 'meals')
  assert.equal(ROOT.split('/').at(-1), manifest.id)
})

test('every path the manifest names exists', async () => {
  const declared = [
    manifest.blocks,
    manifest.view,
    manifest.api,
    ...(manifest.styles ?? []),
    ...(manifest.skills ?? []),
  ].filter(Boolean)
  assert.equal(declared.length, 5)
  for (const relative of declared) {
    await access(join(ROOT, relative))
  }
})

test('the contract is delivered under the name the prose can point at', () => {
  // Delivery namespaces the folder as `<plugin id>-<skill folder>`, so the
  // folder is `json` and the skill the agent reads is `meals-json` — the shape
  // every other data contract here already has (`voyage-json`, `parcours-json`).
  assert.equal(manifest.skills[0], './skills/json/SKILL.md')
})
