/**
 * Every sentence this plugin says has a French entry.
 *
 * Written after eight shipped in English. Not for want of care: the words were
 * added to `model.js` AFTER that file had been committed, and the four commits
 * that followed staged the screens by explicit path — which is the right
 * discipline and is exactly what left the table behind. The diff of each of
 * them showed French on screen and no French in the table, and nobody can see
 * a line that is not in the diff.
 *
 * So the test reads the plugin's own source and asks the table. It fails on
 * the CLASS — a sentence written today with no entry — rather than on the
 * eight, which any list would have to be kept in step with by hand.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { known } from '../web/model.js'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web')

/**
 * Every literal key handed to `t(…)`.
 *
 * Both quote styles, and the second argument ignored — `t('%n late', { n })`
 * is one key. A key built at runtime would escape this, which is the reason
 * not to build one.
 */
function keysUsed() {
  const found = new Map()
  for (const name of readdirSync(web).filter((file) => file.endsWith('.js'))) {
    // Comments first: this very repository documents its own helpers by
    // quoting `t('…')` in prose, and a scanner that read those would report a
    // key nobody calls. Crude on purpose — it reads source written here, not
    // arbitrary JavaScript.
    const source = readFileSync(join(web, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const match of source.matchAll(/\bt\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g)) {
      if (!found.has(match[2])) found.set(match[2], name)
    }
  }
  return found
}

test('every sentence the plugin says is translated', () => {
  const table = new Set(known('fr'))
  const missing = [...keysUsed()]
    .filter(([key]) => !table.has(key))
    .map(([key, file]) => `${key}  (${file})`)

  assert.deepEqual(missing, [], `sans entrée dans WORDS.fr :\n  ${missing.join('\n  ')}`)
})

test('the table carries no sentence nobody says', () => {
  // The other direction, and it is not pedantry: a key left behind after the
  // screen that used it was rewritten is a translation somebody will maintain
  // for a sentence that no longer exists.
  const used = new Set(keysUsed().keys())
  const orphans = known('fr').filter((key) => !used.has(key))

  assert.deepEqual(orphans, [], `dans WORDS.fr et employé nulle part :\n  ${orphans.join('\n  ')}`)
})
