/**
 * The two halves of a page type, confronted.
 *
 * The manifest CLAIMS the frontmatter type — that half is data, because the
 * server reads it to refuse two plugins over one word, and it cannot execute a
 * browser module to find out. The layouts module says what the type LOOKS
 * LIKE. They are read at two different moments by two different processes, so
 * a divergence between them does not break anything: it makes the page open as
 * ordinary prose, silently, for a reason nobody can see from the screen.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const manifest = JSON.parse(await readFile(join(ROOT, 'adestia-plugin.json'), 'utf8'))

test('the manifest claims exactly the types the module draws', async () => {
  const { default: layouts } = await import('../web/layouts.js')
  const { types } = layouts({ id: 'meals', locale: 'fr', fetch: () => Promise.reject(new Error('no')) })

  assert.deepEqual(Object.keys(types).sort(), [...manifest.types].sort())
  for (const [name, component] of Object.entries(types)) {
    assert.equal(typeof component, 'function', `${name} must be a component`)
  }
})

test('a period is a page, so the plugin has no screen and no tile of its own', () => {
  // The whole point of the shape: a period lives in whatever folder its page
  // lives in — a trip's, a health carnet's — so there is nothing to launch and
  // no folder to absorb. Declaring either would claim ground that is not ours.
  assert.equal(manifest.kind, 'feature')
  assert.equal(manifest.tile, undefined)
  assert.equal(manifest.view, undefined)
  assert.equal(manifest.absorbs, undefined)
  // And no block: the page IS the frise, it does not host one.
  assert.equal(manifest.blocks, undefined)
  assert.equal(manifest.vocabulary, undefined)
})

test('every path the manifest names exists', async () => {
  const declared = [
    manifest.layouts,
    manifest.api,
    ...(manifest.styles ?? []),
    ...(manifest.skills ?? []),
    ...(manifest.mcpServers ?? []).flatMap((server) => server.args ?? []),
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
  assert.deepEqual(manifest.skills, ['./skills/json/SKILL.md'])
})

test('the agent gets a WRITER, and few tools', () => {
  // The agent must not open the data file with a file tool: a file tool cannot
  // state the revision it read, which is the only thing keeping it from
  // erasing a card somebody just dragged. Hence a server, and hence two tools
  // — every declared tool costs context on every turn.
  assert.equal(manifest.mcpServers.length, 1)
  assert.equal(manifest.mcpServers[0].name, 'meals')
})
