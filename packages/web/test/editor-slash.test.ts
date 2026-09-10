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
  it('offers the blocks whose attributes it can satisfy', () => {
    expect(items().map((item) => item.key)).toEqual(['callout', 'gallery', 'figures', 'table', 'list'])
  })

  it('keeps out a block with a required attribute it cannot ask for', () => {
    const keys = items().map((item) => item.key)
    // `content` needs a `type` — its own title. `app` needs an `id`, and the
    // core's table says it is drawn by nobody.
    expect(keys).not.toContain('content')
    expect(keys).not.toContain('app')
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

  it('keeps out a contributed block that requires an attribute', () => {
    registerBlocks({
      carte: {
        content: 'empty',
        description: 'A map.',
        attributes: { source: { required: true } },
      },
    })
    expect(items().map((item) => item.key)).not.toContain('carte')
  })

  it('puts them in one group rather than loose among the commonmark ones', () => {
    const builder = fakeBuilder()
    buildBlockMenu(builder as never)
    expect(builder.groups).toHaveLength(1)
    expect(builder.groups[0]?.key).toBe('adestia')
  })
})
