/**
 * The project blocks speak English and French, and French has not moved.
 *
 * `blocs-fr.txt` is what `:::timeline` and `:::subproject` said in French
 * BEFORE their words went through a table — captured from the code as it
 * stood, on a pinned day. The French run reproduces it letter for letter (B-1);
 * the English run says nothing accented or French of its own. Seeded titles
 * (Alpha…Echo, "Phase one") are ASCII, so any accent in English is the plugin's.
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { tour, transcript } from './render.js'

const here = dirname(fileURLToPath(import.meta.url))
const blocks = new URL('../web/blocks.js', import.meta.url).href
const ACCENTED = /[À-ÖØ-öø-ÿŒœ]/u
const FRENCH_WORDS = /(?<![\p{L}\p{N}_])(?:le|la|les|des|du|pour|avec|une|un|aucun|rien|sous|en|à|auj\.|clos|échu)(?![\p{L}\p{N}_])/iu

test('in French, the blocks say what they said before the table', async () => {
  const before = readFileSync(join(here, 'blocs-fr.txt'), 'utf8')
  assert.equal(transcript(await tour(blocks, 'fr')), before)
})

test('in English, the blocks say nothing French', async () => {
  const faults = []
  for (const [name, text] of await tour(blocks, 'en')) {
    for (const line of text.split('\n')) {
      if (ACCENTED.test(line) || FRENCH_WORDS.test(line)) faults.push(`${name}: ${line}`)
    }
  }
  assert.deepEqual(faults, [])
})

test('in English, the states and empty sentences are the English ones', async () => {
  const all = transcript(await tour(blocks, 'en'))
  for (const wanted of ['under way', 'late', 'ahead', 'today', '2 closed projects', '1 closed project', 'Q4 2026',
    'No sub-project below this page', 'Planning…']) {
    assert.ok(all.includes(wanted), wanted)
  }
})
