import { bulletText, makeCodec } from './codec.js'

/**
 * `- Avancement: 62 % — 8 lots sur 13` (`figures`).
 *
 * The same cut the reader makes: the first colon splits label from the rest,
 * and the rest splits on a spaced em dash into the figure and its caption. A
 * line without a colon is a tile the reader keeps with no label; the form
 * does not guess a label for it and keeps it as written.
 */
export const labelValueCaption = makeCodec(
  (line) => {
    const text = bulletText(line)
    if (text === null) return null
    const cut = text.indexOf(':')
    if (cut === -1) return null
    const [value = '', ...tail] = text.slice(cut + 1).trim().split(/\s+—\s+/)
    return { label: text.slice(0, cut).trim(), value, caption: tail.join(' — ') }
  },
  (c) => {
    const value = c['value'] ?? ''
    const caption = c['caption'] ?? ''
    return `- ${c['label'] ?? ''}: ${value}${caption ? ` — ${caption}` : ''}`.replace(/: $/, ':')
  },
)
