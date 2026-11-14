import type { PluginGalleryColumn, PluginGalleryLine } from '@antorfr/adestia-schemas'

import type { Cells } from './types.js'

/**
 * Why a value is refused; the form says it in the user's language under the
 * field (`docs/ecrans.md`, E-35). A code, not a sentence, so the words stay in
 * the shell's catalogue.
 */
export type Refusal =
  | 'required' // « Fill this in »
  | 'number' // « Write a number, with its unit if any »
  | 'date' // not a date written 2026-03-01
  | 'order' // a due before the start
  | 'colon' // a label holding the colon that ends it
  | 'dash' // a figure holding the spaced dash that starts its caption
  | 'newline' // a line is one line

export interface Problem {
  readonly key: string
  readonly refusal: Refusal
}

/**
 * A numeric value: a figure, its unit allowed (`3`, `62 %`, `14 of 37`). What
 * is refused is a value that starts with letters and holds no digit —
 * `three` — which the tile would show as a word where a number belongs.
 */
export function isNumericValue(value: string): boolean {
  const text = value.trim()
  if (text === '') return true
  return !(/^\p{L}/u.test(text) && !/\d/.test(text))
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** One cell against its column, or null when it is fine. */
export function refuseCell(column: PluginGalleryColumn, value: string): Refusal | null {
  if (/[\r\n]/.test(value)) return 'newline'
  const text = value.trim()
  if (text === '') return column.required ? 'required' : null
  if (column.kind === 'number' && !isNumericValue(text)) return 'number'
  if (column.kind === 'date' && !isIsoDate(text)) return 'date'
  return null
}

/** One row: its cells, then the rules that look across columns or at the line format. */
export function validateRow(
  columns: readonly PluginGalleryColumn[],
  line: PluginGalleryLine,
  cells: Cells,
): Problem[] {
  const out: Problem[] = []
  for (const column of columns) {
    const refusal = refuseCell(column, cells[column.key] ?? '')
    if (refusal) out.push({ key: column.key, refusal })
  }
  const has = (key: string) => out.some((p) => p.key === key)
  if (line === 'label-range' && !has('start') && !has('due')) {
    const start = (cells['start'] ?? '').trim()
    const due = (cells['due'] ?? '').trim()
    if (start && due && due < start) out.push({ key: 'due', refusal: 'order' })
  }
  if (line !== 'table' && !has('label') && (cells['label'] ?? '').includes(':')) {
    out.push({ key: 'label', refusal: 'colon' })
  }
  if (line === 'label-value-caption') {
    if (!has('value') && /\s—\s/.test(` ${cells['value'] ?? ''} `)) out.push({ key: 'value', refusal: 'dash' })
    if (!has('value') && (cells['caption'] ?? '').trim() && !(cells['value'] ?? '').trim()) {
      out.push({ key: 'value', refusal: 'required' })
    }
  }
  return out
}
