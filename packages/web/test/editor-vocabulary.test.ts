/**
 * The editor knows every block the vocabulary declares.
 *
 * The defect this exists for shipped on 2026-09-09 and was found by a person:
 * the core gained `content`, `figures`, `table` and `list`, the editor's node
 * list was hand-written and named three, and every page holding one of the
 * four opened on an EMPTY editing surface. Milkdown threw "cannot match target
 * parser", the rejection went unhandled, and the reader drew the same page
 * perfectly — so nothing anywhere said a word.
 *
 * `adestiaVocabulary` reads the table now, and `PM_ID` keeps `:::table` out of
 * the word GFM already owns. Neither arrived with a test, which is what this
 * file is: the tripwire for anyone who puts a hand-written list back. Three
 * nodes are still written out by hand up there, and they are allowed to be —
 * what is not allowed is a block in the table with no node at all.
 *
 * What is checked is the COUNT, because Milkdown's `$node` does not carry its
 * name at runtime: the type says `id`, the build does not ship it. So "one node
 * per declared block, plus the two the grammar needs" is the strongest thing
 * this suite can assert without booting an editor.
 *
 * What the count cannot see, the bench can: `bench/scenarios/journal-blocs.mjs`
 * opens a real editor over a page holding each block, saves it, and reads the
 * file back off disk.
 */

import { VOCABULARY, forgetContributedBlocks, registerBlocks } from '@antorfr/adestia-content'
import { afterEach, describe, expect, it } from 'vitest'

import { adestiaVocabulary, editorBlocks, grammarRemarks } from '../src/editor/vocabulary.js'

/** Frontmatter and wikilinks: nodes the grammar needs that are not blocks. */
const BEYOND_THE_BLOCKS = 2

const registered = () => adestiaVocabulary().length - grammarRemarks.length - BEYOND_THE_BLOCKS

afterEach(() => {
  forgetContributedBlocks()
})

describe('the editor vocabulary', () => {
  it('registers one node per block of the closed core', () => {
    expect(editorBlocks().map((spec) => spec.name)).toEqual(Object.keys(VOCABULARY))
    expect(registered()).toBe(Object.keys(VOCABULARY).length)
  })

  it('covers the four renderings the core gained on 2026-09-09', () => {
    // Named rather than counted, because these four are the ones that broke:
    // a table they were absent from still had the right LENGTH before the
    // count above existed, and would again if somebody removed one.
    const names = editorBlocks().map((spec) => spec.name)
    expect(names).toEqual(expect.arrayContaining(['content', 'figures', 'table', 'list']))
  })

  it('registers a node for a block a plugin contributes', () => {
    const before = registered()
    registerBlocks({
      parcours: { content: 'empty', description: 'A walk, drawn from its json.' },
    })
    expect(editorBlocks().map((spec) => spec.name)).toContain('parcours')
    expect(registered()).toBe(before + 1)
  })

  it('drops it again when its plugin goes', () => {
    registerBlocks({ parcours: { content: 'empty', description: 'A walk.' } })
    forgetContributedBlocks()
    expect(editorBlocks().map((spec) => spec.name)).not.toContain('parcours')
  })
})
