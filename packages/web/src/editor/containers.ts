/**
 * What the editor knows of containers (AD-32): how a fresh one is built, how
 * deep a block may go, and the change of a band's column count.
 *
 * Pure judgments on the ProseMirror model, so they are testable without a view.
 * `section` holds blocks and bands, `columns` holds `col`, a `col` holds blocks
 * only; the validator judges the same by the parent chain.
 */

import { Fragment, type Node as ProseNode, type Schema } from '@milkdown/kit/prose/model'

import { pmId } from './vocabulary.js'

export const CONTAINERS: ReadonlySet<string> = new Set(['section', 'columns', 'col'])

/** The columns a band is given when it is inserted. */
export const DEFAULT_COLUMNS = 2
export const COLUMN_CHOICES = [2, 3] as const

/** Can a block called `name` sit inside a container called `parent`? */
export function mayHold(parent: string, name: string): boolean {
  if (parent === 'section') return name !== 'section' && name !== 'col'
  if (parent === 'col') return name !== 'section' && name !== 'columns' && name !== 'col'
  return false
}

/**
 * A container ready to be set down. Each place a person can type in starts with
 * an empty paragraph (written as nothing), since a container with no child
 * leaves no caret to type into; a band starts with its columns.
 */
export function freshContainer(schema: Schema, name: string): ProseNode | null {
  const type = schema.nodes[pmId(name)]
  const paragraph = schema.nodes['paragraph']
  if (!type || !paragraph) return null
  const blank = () => paragraph.create()
  if (name === 'columns') {
    const col = schema.nodes[pmId('col')]
    if (!col) return null
    return type.create(
      { attributes: {} },
      Array.from({ length: DEFAULT_COLUMNS }, () => col.create({ attributes: {} }, blank())),
    )
  }
  return type.create({ attributes: {} }, blank())
}

/** A column with nothing in it: no child, or only empty paragraphs (which are written as nothing). */
export function isHollow(node: ProseNode): boolean {
  let hollow = true
  node.forEach((child) => {
    if (!(child.type.name === 'paragraph' && child.content.size === 0)) hollow = false
  })
  return hollow
}

export function columnsOf(band: ProseNode): number {
  let count = 0
  band.forEach((child) => {
    if (child.type.name === 'col') count++
  })
  return count
}

/** Does the band's last column hold something? Then it cannot be taken away: that would delete data. */
export function lastColumnHolds(band: ProseNode): boolean {
  const last = band.lastChild
  return Boolean(last && last.type.name === 'col' && !isHollow(last))
}

/**
 * The band with `count` columns: a column added empty, or the last one removed
 * only if it is empty. Returns null when the change would delete data — the
 * caller refuses it and says so.
 */
export function withColumnCount(band: ProseNode, schema: Schema, count: number): ProseNode | null {
  const col = schema.nodes[pmId('col')]
  const paragraph = schema.nodes['paragraph']
  if (!col || !paragraph) return null
  const have = columnsOf(band)
  if (count === have) return band
  const kids: ProseNode[] = []
  band.forEach((child) => kids.push(child))
  if (count > have) {
    for (let i = have; i < count; i++) kids.push(col.create({ attributes: {} }, paragraph.create()))
  } else {
    for (let i = have; i > count; i--) {
      const last = kids[kids.length - 1]
      if (!last || last.type !== col || !isHollow(last)) return null
      kids.pop()
    }
  }
  return band.copy(Fragment.from(kids))
}
