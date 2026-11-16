import { bulletText, makeCodec } from './codec.js'
import { isIsoDate } from './validate.js'

/** What the `check` cell holds when the box is ticked; an empty cell is an empty box. */
export const DONE = 'done'

/**
 * `- Recette: 2026-11-20` or `- Recette: 2026-11-20 — done` (`milestones`).
 *
 * The date is the one `label-range` reads as a milestone, so a line can move
 * between the two blocks. The flag is the word `done` after a spaced em dash;
 * anything else after it, or a date that is not a calendar day, keeps the line.
 */
export const labelDateDone = makeCodec(
  (line) => {
    const text = bulletText(line)
    if (text === null) return null
    const cut = text.indexOf(':')
    if (cut === -1) return null
    const label = text.slice(0, cut).trim()
    if (!label) return null
    const parts = text.slice(cut + 1).trim().split(/\s+—\s+/)
    const [date = '', flag] = parts
    if (parts.length > 2 || !isIsoDate(date)) return null
    if (flag !== undefined && flag !== DONE) return null
    return { label, date, done: flag === undefined ? '' : DONE }
  },
  (c) => `- ${c['label'] ?? ''}: ${c['date'] ?? ''}${c['done'] ? ` — ${DONE}` : ''}`,
)
