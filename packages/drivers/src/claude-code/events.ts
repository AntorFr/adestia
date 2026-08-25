/**
 * Turning a tool call into one readable line.
 *
 * The rule inherited from the predecessor, and it is a privacy rule, not a
 * cosmetic one: the trace shows the tool NAME and a SHORT target — never the
 * full input, which routinely carries a file's contents or a whole command.
 */

import type { ProposedFileEdit } from '../permissions.js'

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

/**
 * This engine's file-writing tools, normalized for the permission broker's
 * content rule. Only `Write` and `Edit` translate: they are the shapes a rule
 * can replay to know the resulting file. Anything else — `Bash` above all —
 * returns undefined and stays under the name-based policy, which is why
 * auto-allowing Bash remains the operator's own decision to reason about.
 */
export function proposedFileEdit(tool: string, input: unknown): ProposedFileEdit | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const record = input as Record<string, unknown>
  const path = record['file_path']
  if (typeof path !== 'string' || path.length === 0) return undefined

  if (tool === 'Write' && typeof record['content'] === 'string') {
    return { kind: 'write', path, content: record['content'] }
  }
  if (
    tool === 'Edit' &&
    typeof record['old_string'] === 'string' &&
    typeof record['new_string'] === 'string'
  ) {
    return {
      kind: 'edit',
      path,
      oldText: record['old_string'],
      newText: record['new_string'],
      all: record['replace_all'] === true,
    }
  }
  return undefined
}
