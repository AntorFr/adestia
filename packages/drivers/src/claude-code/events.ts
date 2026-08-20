/**
 * Turning a tool call into one readable line.
 *
 * The rule inherited from the predecessor, and it is a privacy rule, not a
 * cosmetic one: the trace shows the tool NAME and a SHORT target — never the
 * full input, which routinely carries a file's contents or a whole command.
 */

const MAX_TARGET = 78

/** Fields that actually say what a call is about, most telling first. */
const TELLING_FIELDS = [
  'file_path',
  'path',
  'command',
  'pattern',
  'url',
  'query',
  'prompt',
  'description',
] as const

export function toolTarget(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const record = input as Record<string, unknown>

  for (const field of TELLING_FIELDS) {
    const value = record[field]
    if (typeof value === 'string' && value.length > 0) return truncate(value)
  }
  return undefined
}

function truncate(value: string): string {
  // Flattened first: a newline in a trace line would let tool input mimic the
  // interface's own structure.
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= MAX_TARGET ? flat : `${flat.slice(0, MAX_TARGET - 1)}…`
}
