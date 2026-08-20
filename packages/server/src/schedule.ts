/**
 * Scheduled turns — the agent acting without anyone asking.
 *
 * A scheduled entry is a markdown note whose BODY is run verbatim as a prompt.
 * That makes it an instruction, not memory, and it is why the whole design
 * below leans toward refusing rather than guessing:
 *
 * - the body reaches the agent unchanged, preceded by a frame saying where it
 *   came from — without that, the agent cannot tell a scheduled turn from a
 *   person, and answers as if someone were reading;
 * - a missed occurrence is LOST past a short grace window, never replayed. An
 *   instance that was down for a day must not wake up and run yesterday;
 * - a scheduled turn is unattended by definition, so every permission it
 *   raises is decided by the unattended policy — deny, unless the operator
 *   said otherwise.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface ScheduledNote {
  /** File name without extension; also its id. */
  readonly id: string
  readonly title: string
  /** The prompt, verbatim. */
  readonly body: string
  /** Minutes past each hour, or every N minutes — see `parseEvery`. */
  readonly everyMinutes: number
  readonly enabled: boolean
  /** Why this note cannot run, when it cannot. */
  readonly problem?: string
}

export interface ScheduleState {
  /** Last run, per note id, as epoch ms. */
  readonly lastRun: Record<string, number>
}

/** Frequency floor. A finer cadence burns subscription quota for nothing. */
export const MIN_PERIOD_MINUTES = 15
/** How late an occurrence may still run — covers a long turn, not an outage. */
export const GRACE_MINUTES = 5

/**
 * `every: 30m` / `every: 2h` / `every: 1d`.
 *
 * A real cron expression was considered and refused for v1: the notes are
 * written by an agent and read by a person, and "every 30m" is unambiguous to
 * both. A cron field that nobody can read at a glance is a scheduled turn
 * nobody can predict.
 */
export function parseEvery(value: unknown): { minutes: number } | { problem: string } {
  if (typeof value !== 'string') return { problem: 'missing "every" (e.g. every: 30m)' }
  const match = /^(\d+)\s*(m|h|d)$/.exec(value.trim())
  if (!match) return { problem: `cannot read "${value}" — expected something like 30m, 2h or 1d` }

  const amount = Number.parseInt(match[1]!, 10)
  const minutes = amount * (match[2] === 'm' ? 1 : match[2] === 'h' ? 60 : 1440)

  if (minutes < MIN_PERIOD_MINUTES) {
    // Reported as invalid rather than silently rounded up: a note that says
    // "every 5m" and runs every 15 is a note that lies to whoever wrote it.
    return { problem: `every ${value} is below the ${MIN_PERIOD_MINUTES}-minute floor` }
  }
  return { minutes }
}

/** Frontmatter, shallowly — a scheduled note has no nested settings. */
function frontmatterOf(source: string): { fields: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) return { fields: {}, body: source }

  const fields: Record<string, string> = {}
  for (const line of (match[1] ?? '').split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    fields[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return { fields, body: source.slice(match[0].length) }
}

export function parseNote(id: string, source: string): ScheduledNote {
  const { fields, body } = frontmatterOf(source)
  const every = parseEvery(fields['every'])
  const title = fields['title'] ?? id
  const enabled = fields['enabled'] !== 'false'

  if ('problem' in every) {
    return { id, title, body: body.trim(), everyMinutes: 0, enabled: false, problem: every.problem }
  }
  if (body.trim() === '') {
    // The body IS the prompt; an empty one would open a turn that asks
    // nothing and bills for it.
    return {
      id,
      title,
      body: '',
      everyMinutes: every.minutes,
      enabled: false,
      problem: 'the note is empty — its body is the prompt',
    }
  }
  return { id, title, body: body.trim(), everyMinutes: every.minutes, enabled }
}

export async function readSchedule(dir: string): Promise<readonly ScheduledNote[]> {
  let files: string[]
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith('.md'))
  } catch {
    // No schedule directory is an instance with no scheduled turns.
    return []
  }

  const notes: ScheduledNote[] = []
  for (const file of files.sort()) {
    try {
      notes.push(parseNote(file.replace(/\.md$/, ''), await readFile(join(dir, file), 'utf8')))
    } catch {
      continue
    }
  }
  return notes
}

export function isDue(note: ScheduledNote, state: ScheduleState, now: number): boolean {
  if (!note.enabled || note.problem) return false

  const last = state.lastRun[note.id]
  const period = note.everyMinutes * 60_000

  // A note never run before does NOT fire immediately: adding one would
  // otherwise run it the moment it is saved, which is rarely what "every day"
  // was meant to say.
  if (last === undefined) return false

  const elapsed = now - last
  if (elapsed < period) return false

  // Past the grace window the occurrence is lost rather than replayed: an
  // instance down for a day must not wake up and run yesterday.
  return elapsed <= period + GRACE_MINUTES * 60_000
}

/** A note whose window was missed entirely — reported, never run. */
export function isMissed(note: ScheduledNote, state: ScheduleState, now: number): boolean {
  const last = state.lastRun[note.id]
  if (last === undefined || !note.enabled || note.problem) return false
  return now - last > note.everyMinutes * 60_000 + GRACE_MINUTES * 60_000
}

/**
 * The frame a scheduled prompt arrives under.
 *
 * Without it the agent cannot tell this turn from a person typing, and answers
 * as though someone were reading — asking questions nobody will see, or
 * waiting for a confirmation that will never come.
 */
export function frameScheduledPrompt(note: ScheduledNote): string {
  return [
    `[Scheduled turn — the note "${note.title}" is due, and its body follows verbatim.`,
    `Nobody is reading: do not ask questions, and do not wait for confirmation.`,
    `Anything needing a decision should be written down, not asked.]`,
    '',
    note.body,
  ].join('\n')
}
