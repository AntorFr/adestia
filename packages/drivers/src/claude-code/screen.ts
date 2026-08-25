/**
 * What the CLI's output LOOKS like, as opposed to what it sent.
 *
 * Ink does not print text; it paints frames, and between two frames it only
 * emits the cells that changed, jumping over the ones that did not. So the
 * byte stream is not the message. Captured from 2.1.237, the CLI's own
 * `OAuth error: Invalid code…` arrives as
 *
 *     OAuth error: Invalid ESC[23G code. Please make ESC[41G sure the full
 *     ESC[55G c ESC[57G de was ESC[64G copied
 *
 * — the `o` of `code` is never sent at all, because it was already on screen
 * from the previous frame. Strip the escapes and you get `cde`; strip them
 * from a token and you get a token with holes in it, which is how a
 * successful authorization still ended in "the CLI did not return a token".
 *
 * The fix is to stop reading the stream and start replaying it: keep a grid,
 * apply the moves, and read the cells. The CLI uses five escapes to do all of
 * its drawing (G, C, A, B, K) plus carriage returns and newlines; everything
 * else is a mode switch that changes no cell and is skipped.
 */

const ESC = '\u001b'
const BEL = '\u0007'
const STRING_TERMINATOR = '\u009c'

/** Terminal rows to keep. Matches the pty the flow asks for. */
const ROWS = 40
/** Columns, ditto — wide enough that no URL or token ever wraps. */
const COLUMNS = 400

/** Parameters of a CSI sequence, with the terminal's own default of 1. */
function firstParam(params: string, fallback = 1): number {
  const value = Number.parseInt(params.split(';')[0] ?? '', 10)
  return Number.isFinite(value) ? value : fallback
}

/**
 * Replay a terminal stream and return what it drew.
 *
 * Text with no escapes in it comes back unchanged, which is what makes this
 * safe to put under every matcher: a CLI that prints plain lines is simply a
 * terminal on which nothing ever moved.
 */
export function renderScreen(stream: string): string {
  const grid: string[][] = []
  let row = 0
  let column = 0

  const cellsOf = (index: number): string[] => {
    while (grid.length <= index) grid.push([])
    return grid[index]!
  }
  const put = (character: string) => {
    if (column >= COLUMNS) return
    const cells = cellsOf(row)
    while (cells.length < column) cells.push(' ')
    cells[column] = character
    column += 1
  }

  for (let index = 0; index < stream.length; index += 1) {
    const character = stream[index]!

    if (character === ESC) {
      const next = stream[index + 1]
      if (next === '[') {
        // CSI: parameters, then one final letter.
        let end = index + 2
        while (end < stream.length && /[0-9;?]/.test(stream[end]!)) end += 1
        const params = stream.slice(index + 2, end)
        const final = stream[end]
        index = end
        switch (final) {
          case 'G':
            column = Math.max(0, firstParam(params) - 1)
            break
          case 'C':
            column += firstParam(params)
            break
          case 'D':
            column = Math.max(0, column - firstParam(params))
            break
          case 'A':
            row = Math.max(0, row - firstParam(params))
            break
          case 'B':
            row += firstParam(params)
            break
          case 'H': {
            const [first = '1', second = '1'] = params.split(';')
            row = Math.max(0, Number.parseInt(first, 10) - 1 || 0)
            column = Math.max(0, Number.parseInt(second, 10) - 1 || 0)
            break
          }
          case 'K': {
            const cells = cellsOf(row)
            const mode = firstParam(params, 0)
            if (mode === 0) cells.length = Math.min(cells.length, column)
            else if (mode === 1) for (let i = 0; i <= column && i < cells.length; i += 1) cells[i] = ' '
            else cells.length = 0
            break
          }
          case 'J':
            // Erase display: whatever it clears, it clears no text we still
            // need — the CLI only uses it when starting a screen over.
            if (firstParam(params, 0) === 2) grid.length = 0
            break
          default:
            // Colours, modes, cursor visibility: nothing moves, nothing draws.
            break
        }
        continue
      }
      if (next === ']') {
        // OSC — the hyperlink carrying the authorization URL. It draws its
        // LABEL, not its target, so the target is skipped here; the link is
        // read from the raw stream, where it survives whole.
        let end = index + 2
        while (end < stream.length && stream[end] !== BEL && stream[end] !== ESC) end += 1
        index = stream[end] === ESC ? end + 1 : end
        continue
      }
      // Two-character escapes (charset selection, save/restore cursor).
      index += 1
      continue
    }

    if (character === '\r') column = 0
    else if (character === '\n') {
      // Carriage return too: the pty this runs under translates an outgoing
      // newline to CR-NL (ONLCR), so a bare `\n` never means "down a line,
      // same column" in anything this reads.
      column = 0
      row += 1
      if (row >= ROWS) {
        grid.shift()
        row = ROWS - 1
      }
    } else if (character === '\b') column = Math.max(0, column - 1)
    else if (character >= ' ' && character !== STRING_TERMINATOR) put(character)
  }

  return grid.map((cells) => cells.join('').replace(/\s+$/, '')).join('\n')
}
