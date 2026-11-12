import { makeCodec } from './codec.js'
import type { Cells } from './types.js'

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export function isDelimiter(line: string): boolean {
  return line.includes('-') && DELIMITER.test(line)
}

/** The cells of `| a | b |`, with `\|` left as written; null for anything else. */
function split(line: string): string[] | null {
  const text = line.trim()
  if (!text.startsWith('|') || isDelimiter(line)) return null
  const cells: string[] = []
  let cell = ''
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i] as string
    if (ch === '\\' && text[i + 1] === '|') {
      cell += '\\|'
      i += 1
    } else if (ch === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  if (cell.trim() !== '') return null // no closing pipe: left to the reader, kept here
  return cells
}

/** Cells of a table row are keyed `c0`, `c1`…; the first row read is the header. */
export const cellKey = (index: number): string => `c${index}`

export function cellsOf(row: Cells): string[] {
  const out: string[] = []
  for (let i = 0; row[cellKey(i)] !== undefined; i += 1) out.push(row[cellKey(i)] as string)
  return out
}

/**
 * A pipe table (`table`). Rows are its header and body lines; the delimiter
 * line (`| --- | :-: |`) is not a row, so it rides along in `kept` at its
 * index, alignment colons and all. When the rows come back with another
 * number of columns than it has, it is rewritten to match — the one kept line
 * this codec ever changes.
 */
export const table = makeCodec(
  (line) => {
    const cells = split(line)
    if (!cells || cells.length === 0) return null
    return Object.fromEntries(cells.map((cell, i) => [cellKey(i), cell]))
  },
  (c) => `| ${cellsOf(c).join(' | ')} |`,
  (lines, rows) => {
    const width = rows[0] ? cellsOf(rows[0].cells).length : 0
    return lines.map((line) => {
      if (!isDelimiter(line) || width === 0) return line
      const count = line.trim().replace(/^\||\|$/g, '').split('|').length
      return count === width ? line : `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
    })
  },
)
