import type { Cells, Codec, Decoded, Kept, Row } from './types.js'

/** `- text`, `* text`, `+ text`: the text of a bullet line, or null. */
export function bulletText(line: string): string | null {
  const m = /^\s*[-*+]\s+(.*)$/.exec(line)
  return m ? (m[1] as string) : null
}

/** The bullet the page already uses: `*` when the editor wrote the lines, `-` when a person did. */
function markerOf(rows: readonly Row[]): string | null {
  for (const row of rows) {
    const m = row.raw === undefined ? null : /^\s*([-*+])\s/.exec(row.raw)
    if (m) return m[1] as string
  }
  return null
}

function sameCells(a: Cells, b: Cells): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) if ((a[key] ?? '') !== (b[key] ?? '')) return false
  return true
}

/**
 * A codec from the two functions that say its line format.
 *
 * `read` and `write` are the same for the four formats, which is the point of
 * AD-forms-1: the format is a closed list, not a template a plugin invents.
 */
export function makeCodec(
  parse: (line: string) => Cells | null,
  format: (cells: Cells) => string,
  finish: (lines: string[], rows: readonly Row[]) => string[] = (lines) => lines,
): Codec {
  const read = (lines: readonly string[]): Decoded => {
    const rows: Row[] = []
    const kept: Kept[] = []
    lines.forEach((line, index) => {
      const cells = parse(line)
      if (cells) rows.push({ cells, raw: line })
      else kept.push({ index, line })
    })
    return { rows, kept }
  }
  const write = (rows: readonly Row[], kept: readonly Kept[]): string[] => {
    const sorted = [...kept].sort((a, b) => a.index - b.index)
    const out: string[] = []
    // A line written with another bullet than its neighbours would start a second list.
    const marker = markerOf(rows)
    const bullet = (line: string) => (marker ? line.replace(/^(\s*)[-*+](\s)/, `$1${marker}$2`) : line)
    let r = 0
    let k = 0
    while (r < rows.length || k < sorted.length) {
      const next = sorted[k]
      if (next && (next.index <= out.length || r >= rows.length)) {
        out.push(next.line)
        k += 1
        continue
      }
      const row = rows[r] as Row
      r += 1
      const unchanged = row.raw !== undefined && ((c) => c !== null && sameCells(c, row.cells))(parse(row.raw))
      out.push(unchanged ? (row.raw as string) : bullet(format(row.cells)))
    }
    return finish(out, rows)
  }
  return { parse, format, read, write }
}
