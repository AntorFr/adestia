/**
 * The order the tiles are laid out in, when somebody has stated one.
 *
 * A PERMUTATION and nothing else — decided rather than fallen into. A free
 * grid with positions would let a mosaic grow holes, and a hole is a layout
 * that has to be repaired by hand every time a plugin is switched on or a
 * folder stops holding pages. What can be expressed here is "this before
 * that", which survives both.
 *
 * Kept per browser, like the model choice and the rail width: it is how one
 * person likes to find their own screen, not a property of the workspace
 * every reader of the instance would inherit.
 */

/** The two mosaics on the landing canvas, each with its own order. */
export const ORDER_KEY_APPS = 'golem.order.apps'
export const ORDER_KEY_SECTIONS = 'golem.order.sections'

type Readable = Pick<Storage, 'getItem'>
type Writable = Pick<Storage, 'getItem' | 'setItem'>

export function readOrder(storage: Readable | undefined, key: string): readonly string[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // Checked rather than trusted: this is user-writable storage, and a shape
    // the shell did not expect would otherwise throw mid-render and blank the
    // whole landing canvas over a preference.
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    // Private windows throw on access; a corrupt value throws on parse. Both
    // mean the same thing here: no stated order, so the natural one.
    return []
  }
}

export function writeOrder(storage: Writable | undefined, key: string, order: readonly string[]): void {
  try {
    storage?.setItem(key, JSON.stringify([...order]))
  } catch {
    /* an order that cannot persist still holds for this visit */
  }
}

/**
 * The stated order, applied to what actually exists right now.
 *
 * Two rules, and between them they are why this is an order of NAMES rather
 * than a grid of positions:
 *
 *   - a name the instance no longer has is skipped. Turning a plugin off must
 *     not leave a gap where its tile used to be;
 *   - anything the order does not mention goes at the END, in the order it
 *     arrived. A newly enabled plugin appears, rather than vanishing because
 *     a preference written last month never heard of it.
 */
export function applyOrder<T>(
  items: readonly T[],
  order: readonly string[],
  keyOf: (item: T) => string,
): readonly T[] {
  if (order.length === 0) return items
  const remaining = new Map(items.map((item) => [keyOf(item), item]))
  const placed: T[] = []
  for (const key of order) {
    const item = remaining.get(key)
    if (item === undefined) continue
    placed.push(item)
    remaining.delete(key)
  }
  return [...placed, ...remaining.values()]
}

/** One tile picked up and put down elsewhere. Out-of-range indices are a no-op. */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to) return items
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}

/** A tile's box, as far as this file is concerned. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * Which tile is under the finger.
 *
 * Containment rather than nearest-centre: with tiles of equal size the two
 * agree, and containment does not oscillate between two neighbours while the
 * finger sits still on the seam between them.
 */
export function indexAt(boxes: readonly Box[], x: number, y: number): number | undefined {
  const found = boxes.findIndex(
    (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
  )
  return found === -1 ? undefined : found
}
