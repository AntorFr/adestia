/**
 * Every word a bundled plugin says has a French entry — the ones it says on
 * its own screen, and the ones it does NOT say.
 *
 * The second half is the reason this test moved out of `todo/test/` and grew
 * to cover the ten. A plugin's manifest declares words the SHELL draws — a
 * tile's name on the launcher, a field's label and help in the properties
 * form, a block's description in its settings panel — and the plugin never
 * gets to say them itself, so no amount of care inside its own screens keeps
 * them in the reader's language. `Due` and `Not before` shipped that way: a
 * French instance, an English form, and a French translation of the very same
 * words sitting fifty lines away in the plugin's own table.
 *
 * So the table is read the way the SHELL reads it — the manifest's facet
 * modules, imported and called, and `words` taken off what they return. That
 * is the contract; a test that parsed the source for `const FR = {…}` would
 * pass on a plugin that had forgotten to hand it over.
 *
 * It fails on the CLASS — a sentence with no entry, an entry nobody says —
 * never on a list kept in step by hand.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FACETS = ['view', 'blocks', 'chrome', 'layouts']

/**
 * What the shell hands a factory. Inert on purpose: calling a factory only
 * builds components, and anything here that DID something would make this
 * test a way to run a plugin rather than a way to read it.
 */
const apiFor = (id) => ({
  id,
  base: `/plugins/${id}/`,
  locale: 'fr',
  fetch: () => Promise.reject(new Error('no network in this test')),
  ask() {},
  compose() {},
  trail() {},
  PageEditor: () => null,
})

/** The table the shell would end up with, merged across every facet. */
async function tableOf(id, manifest) {
  const merged = {}
  for (const facet of FACETS) {
    if (!manifest[facet]) continue
    const module = await import(`../${id}/${String(manifest[facet]).replace(/^\.\//, '')}`)
    const produced = module.default(apiFor(id))
    if (produced && typeof produced === 'object' && produced.words) Object.assign(merged, produced.words)
  }
  return merged
}

/** Source with its comments removed — this repo quotes `t('…')` in its prose. */
const sourcesOf = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [
      name,
      readFileSync(join(dir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    ])

/**
 * Keys handed to `t(…)` as a literal FIRST argument — what must be translated.
 *
 * Deliberately the narrow reading: `t('%n late', { n })` is one key, and a key
 * built at runtime escapes this, which is the reason not to build one.
 */
function demanded(sources) {
  const found = new Map()
  for (const [name, source] of sources) {
    for (const match of source.matchAll(/\bt\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g)) {
      if (!found.has(match[2])) found.set(match[2], name)
    }
  }
  return found
}

/**
 * Every string the source uses as a VALUE — the wide reading, for the other
 * direction.
 *
 * Wide on purpose, and the width is the point: a key chosen inside the call
 * (`t(n === 1 ? 'sheet' : 'sheets')`) or looked up from a table
 * (`t(vtypeOf(type).n)`, where the word sits in a map of card kinds) is used,
 * and a stricter reading would have the maintainer delete a translation the
 * screen needs. The one thing not counted is a literal in KEY position —
 * otherwise the words table would vouch for itself and nothing could ever be
 * found dead.
 *
 * What it cannot see, and what this test therefore does not claim: a key
 * assembled at runtime, or one that only ever arrives from a data file. A
 * translation for a word no source mentions is reported as dead, which is the
 * right default — the alternative is a table nobody dares prune.
 */
function mentioned(sources) {
  const keys = new Set()
  for (const [, source] of sources) {
    // Anything in value position…
    for (const match of source.matchAll(/(['"])((?:[^'"\\]|\\.)*)\1(\s*)(.?)/g)) {
      if (match[4] !== ':') keys.add(match[2])
    }
    // …plus anything inside a `t(…)`, because a ternary branch
    // (`t(n === 1 ? 'sheet' : 'sheets')`) is indistinguishable from an object
    // key by the reading above, and the first branch would be called dead.
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] !== 't' || source[i + 1] !== '(') continue
      if (/[A-Za-z0-9_$.]/.test(source[i - 1] ?? ' ')) continue
      let depth = 0
      for (let j = i + 1; j < source.length; j += 1) {
        const c = source[j]
        if (c === '(') depth += 1
        else if (c === ')') {
          depth -= 1
          if (depth === 0) break
        } else if (c === "'" || c === '"') {
          let k = j + 1
          let literal = ''
          while (k < source.length && source[k] !== c) {
            if (source[k] === '\\') {
              literal += source[k + 1]
              k += 2
              continue
            }
            literal += source[k]
            k += 1
          }
          keys.add(literal)
          j = k
        }
      }
    }
  }
  return keys
}

/** The words the manifest declares, which the shell says on the plugin's behalf. */
function declared(manifest) {
  const words = new Map()
  const add = (value, where) => {
    if (typeof value === 'string' && value !== '' && !words.has(value)) words.set(value, where)
  }
  add(manifest.tile?.label, 'tile.label')
  for (const [type, fields] of Object.entries(manifest.fields ?? {})) {
    for (const [key, spec] of Object.entries(fields)) {
      add(spec.label, `fields.${type}.${key}.label`)
      add(spec.help, `fields.${type}.${key}.help`)
    }
    // The properties form heads the group with the plugin's own id.
    add(manifest.id, 'the form group')
  }
  for (const [name, spec] of Object.entries(manifest.vocabulary ?? {})) {
    add(spec.description, `vocabulary.${name}.description`)
  }
  return words
}

const plugins = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'adestia-plugin.json')))
  .map((entry) => entry.name)

for (const id of plugins) {
  const manifest = JSON.parse(readFileSync(join(root, id, 'adestia-plugin.json'), 'utf8'))
  const web = join(root, id, 'web')
  const sources = existsSync(web) ? sourcesOf(web) : []

  test(`${id}: every sentence it says is translated`, async () => {
    const table = await tableOf(id, manifest)
    const missing = [
      ...[...demanded(sources)].map(([key, where]) => [key, where]),
      ...[...declared(manifest)].map(([key, where]) => [key, where]),
    ]
      .filter(([key]) => !Object.hasOwn(table, key))
      .map(([key, where]) => `${key}  (${where})`)

    assert.deepEqual(missing, [], `sans traduction française :\n  ${missing.join('\n  ')}`)
  })

  test(`${id}: the table carries no sentence nobody says`, async () => {
    const table = await tableOf(id, manifest)
    const said = mentioned(sources)
    const fromManifest = declared(manifest)
    const orphans = Object.keys(table).filter(
      (key) => !said.has(key) && !fromManifest.has(key),
    )

    assert.deepEqual(orphans, [], `traduit et employé nulle part :\n  ${orphans.join('\n  ')}`)
  })
}
