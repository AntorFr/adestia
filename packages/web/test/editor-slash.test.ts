/**
 * The blocks Crepe's `/` menu offers, and the ones it must not.
 *
 * The rule under test is not cosmetic: a menu that inserts a block the server
 * will refuse to save hands somebody a dead end on the page they are looking
 * at. `content` and `app` both carry a required attribute with no default, the
 * editor has nowhere to ask for one, so they stay out until it has.
 */

import { forgetContributedBlocks, registerBlocks } from '@antorfr/adestia-content'
import { afterEach, describe, expect, it } from 'vitest'

import { buildBlockMenu } from '../src/editor/slash.js'

interface Item {
  readonly key: string
  readonly label: string
  readonly icon: string
}

/** Crepe's builder, reduced to what the menu actually calls. */
function fakeBuilder() {
  const groups: { key: string; label: string; items: Item[] }[] = []
  return {
    groups,
    addGroup(key: string, label: string) {
      const items: Item[] = []
      groups.push({ key, label, items })
      const group = {
        addItem(itemKey: string, item: Omit<Item, 'key'>) {
          items.push({ key: itemKey, ...item })
          return group
        },
      }
      return group
    },
  }
}

function items() {
  const builder = fakeBuilder()
  buildBlockMenu(builder as never)
  return builder.groups.flatMap((group) => group.items)
}

afterEach(() => {
  forgetContributedBlocks()
})

describe('the block menu', () => {
  it('offers every block of the core but the one nothing draws', () => {
    // A block's settings open where it is inserted now, so a required
    // attribute is something to ASK for — `content` comes in on its `type`.
    // `app` stays out: the core's own table says nothing draws it.
    expect(items().map((item) => item.key)).toEqual(['callout', 'row', 'gallery', 'content', 'figures', 'table', 'list'])
    expect(items().map((item) => item.key)).not.toContain('app')
  })

  it('names the container block so it cannot be taken for Crepe’s own table', () => {
    expect(items().find((item) => item.key === 'table')?.label).toBe('bloc-table')
  })

  it('offers a block a plugin contributed, glyph or no glyph', () => {
    registerBlocks({ parcours: { content: 'empty', description: 'A walk.' } })
    const walk = items().find((item) => item.key === 'parcours')
    expect(walk?.label).toBe('parcours')
    expect(walk?.icon).not.toBe('')
  })

  it('offers a contributed block that requires an attribute, to be asked for', () => {
    registerBlocks({
      carte: {
        content: 'empty',
        description: 'A map.',
        attributes: { source: { required: true } },
      },
    })
    expect(items().map((item) => item.key)).toContain('carte')
  })

  it('puts them in one group rather than loose among the commonmark ones', () => {
    const builder = fakeBuilder()
    buildBlockMenu(builder as never)
    expect(builder.groups).toHaveLength(1)
    expect(builder.groups[0]?.key).toBe('adestia')
  })
})
