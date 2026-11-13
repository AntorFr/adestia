/**
 * What the four line codecs share (AD-forms-1, AD-forms-2).
 *
 * A block's body is lines. A codec reads them into `rows` (what a form can
 * edit) and `kept` (the lines it cannot read, with the index they stood at),
 * and writes them back. The promise that matters is the one nobody sees: an
 * unedited block comes back byte for byte, and an edited one changes only the
 * lines the user touched.
 */

/** One row: a value per column key. */
export type Cells = Readonly<Record<string, string>>

export interface Row {
  readonly cells: Cells
  /**
   * The line this row was read from. While the cells still say what it says,
   * it is written back as it stood — `*` bullets, spacing, `->` and all.
   */
  readonly raw?: string
}

/** A line the codec could not read, riding along at its index. */
export interface Kept {
  readonly index: number
  readonly line: string
}

export interface Decoded {
  readonly rows: readonly Row[]
  readonly kept: readonly Kept[]
}

export interface Codec {
  /** One line into cells, or null when this codec cannot read it. */
  parse(line: string): Cells | null
  /** Cells into the canonical line. */
  format(cells: Cells): string
  read(lines: readonly string[]): Decoded
  write(rows: readonly Row[], kept: readonly Kept[]): string[]
}
