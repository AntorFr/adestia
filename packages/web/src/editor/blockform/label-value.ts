import { bulletText, makeCodec } from './codec.js'

/** `- Rôle: Personne` (a written `list`): the first colon splits, the rest is the value. */
export const labelValue = makeCodec(
  (line) => {
    const text = bulletText(line)
    if (text === null) return null
    const cut = text.indexOf(':')
    if (cut === -1) return null
    return { label: text.slice(0, cut).trim(), value: text.slice(cut + 1).trim() }
  },
  (c) => `- ${c['label'] ?? ''}: ${c['value'] ?? ''}`.replace(/: $/, ':'),
)
