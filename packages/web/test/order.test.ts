/**
 * The stated order of the mosaics.
 *
 * What it guards is the decision that this is a PERMUTATION and not a grid:
 * a name the instance no longer has leaves no hole, and a name it has just
 * gained is not lost because an old preference never heard of it. Those two
 * are what a positional layout would get wrong every time the config changes.
 */

import { describe, expect, it } from 'vitest'

import { applyOrder, indexAt, moveItem, readOrder, writeOrder } from '../src/app/order.js'

const named = (...names: string[]) => names.map((id) => ({ id }))
const idOf = (item: { id: string }) => item.id

describe('applying a stated order', () => {
  it('leaves the natural order alone when nobody stated one', () => {
    const items = named('a', 'b', 'c')
    expect(applyOrder(items, [], idOf)).toBe(items)
  })

  it('lays the tiles out as stated', () => {
    expect(applyOrder(named('a', 'b', 'c'), ['c', 'a', 'b'], idOf).map(idOf)).toEqual(['c', 'a', 'b'])
  })

  it('leaves no hole where a tile went away', () => {
    // A plugin switched off must not leave a gap in the mosaic — the whole
    // reason this is an order of names rather than a grid of positions.
    expect(applyOrder(named('a', 'c'), ['c', 'b', 'a'], idOf).map(idOf)).toEqual(['c', 'a'])
  })

  it('puts an unmentioned tile at the end rather than dropping it', () => {
    // A newly enabled plugin appears; a preference written last month has
    // never heard of it and must not be able to hide it.
    expect(applyOrder(named('a', 'b', 'new'), ['b', 'a'], idOf).map(idOf)).toEqual(['b', 'a', 'new'])
  })

  it('keeps unmentioned tiles in the order they arrived', () => {
    expect(applyOrder(named('x', 'y', 'a'), ['a'], idOf).map(idOf)).toEqual(['a', 'x', 'y'])
  })
})

describe('moving one tile', () => {
  it('takes it out and puts it back where asked', () => {
    expect(moveItem(named('a', 'b', 'c'), 0, 2).map(idOf)).toEqual(['b', 'c', 'a'])
    expect(moveItem(named('a', 'b', 'c'), 2, 0).map(idOf)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op at the ends and on itself', () => {
    // What makes the arrows safe to press twice at the edge of a row.
    const items = named('a', 'b')
    expect(moveItem(items, 0, 0)).toBe(items)
    expect(moveItem(items, 0, -1)).toBe(items)
    expect(moveItem(items, 1, 2)).toBe(items)
    expect(moveItem(items, 5, 0)).toBe(items)
  })
})

describe('which tile is under the finger', () => {
  const boxes = [
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 110, top: 0, right: 210, bottom: 100 },
  ]

  it('names the tile the point is inside', () => {
    expect(indexAt(boxes, 50, 50)).toBe(0)
    expect(indexAt(boxes, 150, 50)).toBe(1)
  })

  it('names nothing in the gutter between them', () => {
    // Containment, not nearest-centre: on the seam the answer is "neither",
    // which is what stops two neighbours swapping back and forth under a
    // finger that is holding still.
    expect(indexAt(boxes, 105, 50)).toBeUndefined()
    expect(indexAt(boxes, 50, 400)).toBeUndefined()
  })
})

describe('remembering an order', () => {
  const store = () => {
    const map = new Map<string, string>()
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
  }

  it('round-trips', () => {
    const storage = store()
    writeOrder(storage, 'k', ['b', 'a'])
    expect(readOrder(storage, 'k')).toEqual(['b', 'a'])
  })

  it('reads nothing as no stated order', () => {
    expect(readOrder(store(), 'k')).toEqual([])
    expect(readOrder(undefined, 'k')).toEqual([])
  })

  it('survives a value somebody else wrote', () => {
    // User-writable storage. A shape the shell did not expect used to be the
    // kind of thing that throws mid-render and blanks a whole screen.
    const storage = store()
    storage.map.set('k', '{"not":"an array"}')
    expect(readOrder(storage, 'k')).toEqual([])
    storage.map.set('k', 'not json at all')
    expect(readOrder(storage, 'k')).toEqual([])
    storage.map.set('k', '["a", 7, null, "b"]')
    expect(readOrder(storage, 'k')).toEqual(['a', 'b'])
  })

  it('lets a refusing storage pass rather than throwing', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readOrder(refusing, 'k')).toEqual([])
    expect(() => writeOrder(refusing, 'k', ['a'])).not.toThrow()
  })
})
