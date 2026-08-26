/**
 * Dragging tiles into a new order, in edit mode.
 *
 * Pointer Events, like the split's gutter and for the same reason: mouse,
 * touch and pen through one code path, so this works on the device the
 * feature was asked for rather than only on the one it was written on.
 *
 * The arrows are not an afterthought. A mosaic reorderable only by dragging
 * is a mosaic some people cannot reorder at all, and "hold and drag" is also
 * the hardest gesture to discover — so edit mode offers both, and the
 * keyboard route is the one the tests can actually exercise.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { applyOrder, indexAt, moveItem, readOrder, writeOrder, type Box } from './order.js'

export interface Reorder<T> {
  /** The items as they should be drawn now, mid-drag included. */
  readonly items: readonly T[]
  /** The key being carried, so the tile can be drawn as lifted. */
  readonly carried: string | undefined
  /** Props for the mosaic element; it must be the tiles' direct parent. */
  readonly listProps: Record<string, unknown>
  /** Props for one tile, by its position in `items`. */
  tileProps(index: number): Record<string, unknown>
  /** Moves a tile one step, for the arrows and the keyboard. */
  nudge(index: number, by: -1 | 1): void
}

export interface ReorderOptions<T> {
  readonly source: readonly T[]
  readonly keyOf: (item: T) => string
  readonly storageKey: string
  /** Dragging is off until somebody says they are editing. */
  readonly editing: boolean
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined
}

export function useReorder<T>(options: ReorderOptions<T>): Reorder<T> {
  const { source, keyOf, storageKey, editing } = options
  const storage =
    options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)

  const [order, setOrder] = useState<readonly string[]>(() => readOrder(storage, storageKey))
  const [carried, setCarried] = useState<string | undefined>(undefined)
  const list = useRef<HTMLElement | null>(null)

  /**
   * What is drawn: the stated order over what exists.
   *
   * Derived on every render rather than mirrored into state, so a plugin
   * switched on — or off — while this screen is open lands in the mosaic
   * without a second source of truth to keep in step.
   */
  const items = applyOrder(source, order, keyOf)

  const commit = useCallback(
    (next: readonly T[]) => {
      const keys = next.map(keyOf)
      setOrder(keys)
      writeOrder(storage, storageKey, keys)
    },
    [keyOf, storage, storageKey],
  )

  const nudge = useCallback(
    (index: number, by: -1 | 1) => {
      const next = moveItem(items, index, index + by)
      if (next !== items) commit(next)
    },
    [commit, items],
  )

  // Leaving edit mode with a finger still down would leave a tile stuck in
  // its lifted state, unable to be put anywhere.
  useEffect(() => {
    if (!editing) setCarried(undefined)
  }, [editing])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, index: number) => {
      if (!editing) return
      const tile = event.currentTarget
      tile.setPointerCapture(event.pointerId)
      setCarried(keyOf(items[index] as T))
      // Or the browser starts a text selection across the mosaic instead.
      event.preventDefault()
    },
    [editing, items, keyOf],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>, index: number) => {
      if (carried === undefined || !list.current) return
      const boxes: Box[] = [...list.current.children].map((child) =>
        child.getBoundingClientRect(),
      )
      const over = indexAt(boxes, event.clientX, event.clientY)
      if (over === undefined || over === index) return
      // Committed as the finger passes, not on release: the mosaic reflowing
      // under the tile IS the feedback that says where it will land.
      commit(moveItem(items, index, over))
    },
    [carried, commit, items],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setCarried(undefined)
  }, [])

  return {
    items,
    carried,
    nudge,
    listProps: {
      ref: (element: HTMLElement | null) => {
        list.current = element
      },
    },
    tileProps: (index: number) =>
      editing
        ? {
            onPointerDown: (event: React.PointerEvent<HTMLElement>) => onPointerDown(event, index),
            onPointerMove: (event: React.PointerEvent<HTMLElement>) => onPointerMove(event, index),
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
          }
        : {},
  }
}
