/**
 * The planif write gate — what lets a mission end itself without ever letting
 * a turn edit an instruction.
 *
 * A scheduled note's body runs verbatim as a prompt, which makes the planif
 * folder an executable security boundary. The contract, enforced here as the
 * permission broker's content rule:
 *
 * - ticking `done: YYYY-MM-DD` in a note's frontmatter — the act that
 *   finishes a mission — passes without asking anyone;
 * - ANY other change to the zone must be approved by a human, even when the
 *   editing tool's name is blanket auto-allowed. Unattended, that resolves to
 *   the unattended policy: deny by default.
 *
 * The rule judges the RESULTING file, not the tool call's looks: it replays
 * the edit against what is on disk and allows only when the sole difference
 * is the `done` line. Anything it cannot replay — a missing anchor, a file
 * being created, a note without frontmatter — is sensitive by construction
 * and falls to "ask". Refusing wrongly costs one more occurrence of a
 * mission bounded by its deadline; allowing wrongly rewrites a prompt.
 */

import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import type { EditRuling, ProposedFileEdit } from '@antorfr/golem-drivers'

/** The one line an agent may add, change or remove: a date-valued `done`. */
const DONE_LINE = /^done:\s*\d{4}-\d{2}-\d{2}\s*$/

export function planifEditRule(
  planifDir: string,
): (edit: ProposedFileEdit) => Promise<EditRuling> {
  const zone = resolve(planifDir)

  return async (edit) => {
    const target = resolve(edit.path)
    // Not this rule's zone — the name-based policy decides, as before.
    if (target !== zone && !target.startsWith(zone + sep)) return undefined

    let current: string
    try {
      current = await readFile(target, 'utf8')
    } catch {
      // Creating a file in the zone is authoring an instruction.
      return 'ask'
    }

    const proposed = replay(edit, current)
    if (proposed === undefined) return 'ask'
    return onlyTicksDone(current, proposed) ? 'allow' : 'ask'
  }
}

/** The file as the edit would leave it — or undefined when it cannot land. */
function replay(edit: ProposedFileEdit, current: string): string | undefined {
  if (edit.kind === 'write') return edit.content
  if (edit.oldText === '' || !current.includes(edit.oldText)) return undefined
  return edit.all
    ? current.split(edit.oldText).join(edit.newText)
    : current.replace(edit.oldText, edit.newText)
}

/**
 * True when the two sources differ ONLY by date-valued `done` lines in the
 * frontmatter — added, removed or re-dated. The body must be byte-identical:
 * the body is the prompt, and one changed byte there is a changed instruction.
 */
function onlyTicksDone(current: string, proposed: string): boolean {
  const before = split(current)
  const after = split(proposed)
  // A note without frontmatter has nowhere legitimate to put `done`.
  if (!before || !after) return false
  if (before.body !== after.body) return false

  const rest = (lines: readonly string[]): readonly string[] =>
    lines.filter((line) => !DONE_LINE.test(line))
  const restBefore = rest(before.frontmatter)
  const restAfter = rest(after.frontmatter)
  return (
    restBefore.length === restAfter.length &&
    restBefore.every((line, index) => line === restAfter[index])
  )
}

function split(
  source: string,
): { frontmatter: readonly string[]; body: string } | undefined {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) return undefined
  return { frontmatter: (match[1] ?? '').split('\n'), body: source.slice(match[0].length) }
}
