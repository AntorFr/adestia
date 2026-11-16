import { bulletText, makeCodec } from './codec.js'

/** The levels a `choice` cell of this format takes, as written. */
export const LEVELS = ['High', 'Medium', 'Low'] as const

/** The level a word names whatever its case, as written, or null. */
export function levelOf(word: string): string | null {
  return LEVELS.find((level) => level.toLowerCase() === word.trim().toLowerCase()) ?? null
}

/**
 * `- Fournisseur: High — Marc` (`risks`): label, level, owner optional after a
 * spaced em dash. The level is read whatever its case and written capitalised;
 * a word outside the three keeps the line, never a guess.
 */
export const labelLevelOwner = makeCodec(
  (line) => {
    const text = bulletText(line)
    if (text === null) return null
    const cut = text.indexOf(':')
    if (cut === -1) return null
    const label = text.slice(0, cut).trim()
    if (!label) return null
    const [word = '', ...tail] = text.slice(cut + 1).trim().split(/\s+—\s+/)
    const level = levelOf(word)
    if (level === null) return null
    return { label, level, owner: tail.join(' — ') }
  },
  (c) => `- ${c['label'] ?? ''}: ${levelOf(c['level'] ?? '') ?? c['level'] ?? ''}${c['owner']?.trim() ? ` — ${c['owner'].trim()}` : ''}`,
)
