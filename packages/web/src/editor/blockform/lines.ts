/**
 * A block's body as lines, and back (E-35).
 *
 * The editor holds a block as a node; the form speaks lines. The bridge is the
 * editor's own serializer and parser, so what the form reads is what a save
 * would write, and what it writes goes through the same parser as typing does.
 */

/** The lines between the fences of one block serialized alone. */
export function bodyLines(markdown: string): string[] {
  const lines = markdown.replace(/\n+$/, '').split('\n')
  if (lines.length < 2) return []
  return lines.slice(1, -1)
}

/**
 * `lines` fenced as a block, to be parsed. The fence is longer than any a
 * body could hold, so a kept line that reads `:::` cannot end it early.
 */
export function fenced(name: string, lines: readonly string[]): string {
  return [`::::::${name}`, ...lines, '::::::'].join('\n')
}

/** The text of a raw view as lines: empty text is no line at all. */
export function linesOfText(text: string): string[] {
  return text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n')
}
