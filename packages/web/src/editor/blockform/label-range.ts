import { bulletText, makeCodec } from './codec.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `- Cadrage: 2026-01-15 → 2026-03-01` (a phase), `- Recette: 2026-06-01` (a
 * milestone: `due` alone) — the reading `project-management` makes of its
 * lines, so a line it would show by name as unreadable is kept here too.
 * Both arrows are read, `→` is written; a line that ends before it starts is
 * not swapped, it is kept.
 */
export const labelRange = makeCodec(
  (line) => {
    const text = bulletText(line)
    if (text === null) return null
    const cut = text.indexOf(':')
    if (cut === -1) return null
    const label = text.slice(0, cut).trim()
    if (!label) return null
    const parts = text.slice(cut + 1).trim().split(/\s*(?:→|->)\s*/)
    if (parts.length === 2) {
      const [start = '', due = ''] = parts
      if (!DATE.test(start) || !DATE.test(due) || due < start) return null
      return { label, start, due }
    }
    if (parts.length === 1 && DATE.test(parts[0] as string)) return { label, start: '', due: parts[0] as string }
    return null
  },
  (c) => {
    const range = c['start'] ? `${c['start']} → ${c['due'] ?? ''}` : (c['due'] ?? '')
    return `- ${c['label'] ?? ''}: ${range}`
  },
)
