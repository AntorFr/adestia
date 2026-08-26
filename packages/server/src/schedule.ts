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
 *   instance that was down for a day must not wake up and run yesterday.
 *
 * A note carrying `until:` is a MISSION: a recurrence that must end. It runs
 * on its cadence like any other until its goal is met — the agent ticks
 * `done:` itself in its own frontmatter — and past its deadline the product
 * stamps `expired:`
 * and gives it one final turn to escalate. The deadline deliberately has NO
 * grace window, inverting the rule above: an occurrence is a rhythm and
 * missing one is fine, but a deadline is an obligation, and an instance that
 * was down past it still owes the escalation when it wakes up.
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
  /**
   * Deadline day (YYYY-MM-DD) that makes the note a MISSION: a recurrence
   * that must end. Live through the whole day; past it, one final turn runs
   * and the note is stamped `expired`.
   */
  readonly until?: string
  /**
   * Day the mission was accomplished — the agent's own tick, date-valued like
   * the todo convention: absence means open, the value says when. A note
   * carrying it never runs again.
   */
  readonly done?: string
  /** Day the deadline fired. Product-written only; the note never runs again. */
  readonly expired?: string
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

/** Strict calendar day, the one shape `until`, `done` and `expired` carry. */
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function dayOf(epochMs: number): string {
  const date = new Date(epochMs)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`
}

/** First instant AFTER the given day — local time, like the operator's clock. */
function endOfDayMs(day: string): number {
  const [year, month, dayOfMonth] = day.split('-').map(Number)
  return new Date(year!, month! - 1, dayOfMonth! + 1).getTime()
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

  // Read leniently, close on ANY value: a `done: true` from a confused hand
  // still means "stop running this", which is always the safe reading. The
  // strict date shape is enforced where it matters — at the write gate.
  const closed: Pick<ScheduledNote, 'done' | 'expired'> = {
    ...(fields['done'] ? { done: fields['done'] } : {}),
    ...(fields['expired'] ? { expired: fields['expired'] } : {}),
  }

  if ('problem' in every) {
    return {
      id,
      title,
      body: body.trim(),
      everyMinutes: 0,
      enabled: false,
      ...closed,
      problem: every.problem,
    }
  }

  const until = fields['until']
  if (until !== undefined && !DAY.test(until)) {
    // An unreadable deadline must NOT degrade into an immortal cron: the whole
    // point of `until` is that the mission is guaranteed to end.
    return {
      id,
      title,
      body: body.trim(),
      everyMinutes: every.minutes,
      enabled: false,
      ...closed,
      problem: `cannot read "until: ${until}" — expected a day like 2026-08-29`,
    }
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
      ...closed,
      problem: 'the note is empty — its body is the prompt',
    }
  }

  return {
    id,
    title,
    body: body.trim(),
    everyMinutes: every.minutes,
    enabled,
    ...(until ? { until } : {}),
    ...closed,
  }
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
  // A closed mission never runs again — done or expired, the story is over.
  if (note.done || note.expired) return false
  // Past its deadline a mission has no ordinary occurrences left; what it
  // gets instead is the single final turn `isExpiryDue` triggers.
  if (note.until && now >= endOfDayMs(note.until)) return false

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
  if (note.done || note.expired) return false
  if (note.until && now >= endOfDayMs(note.until)) return false
  return now - last > note.everyMinutes * 60_000 + GRACE_MINUTES * 60_000
}

/**
 * The deadline has passed and the mission is still open: its final turn is
 * owed. Deliberately WITHOUT a grace window, inverting the rule occurrences
 * live under — an occurrence is a rhythm, missing one is fine; the deadline
 * is an obligation, and an instance that was down past it still owes the
 * escalation when it wakes up. Late beats never for a final turn.
 */
export function isExpiryDue(note: ScheduledNote, now: number): boolean {
  if (!note.enabled || note.problem) return false
  if (!note.until || note.done || note.expired) return false
  return now >= endOfDayMs(note.until)
}

/** Where a mission's note and its run log live, for the frames below. */
export interface MissionPaths {
  readonly notePath: string
  readonly logPath: string
}

/**
 * The frame a scheduled prompt arrives under.
 *
 * Without it the agent cannot tell this turn from a person typing, and answers
 * as though someone were reading — asking questions nobody will see, or
 * waiting for a confirmation that will never come.
 *
 * A mission (a note with `until:`) gets three more things: its deadline, a
 * run log that is its only memory between turns, and the way to end itself —
 * ticking `done:` in its own frontmatter.
 */
export function frameScheduledPrompt(note: ScheduledNote, mission?: MissionPaths): string {
  const missionLines =
    note.until && mission
      ? [
          `This is a mission with a deadline: it must conclude by the end of ${note.until}.`,
          `Your log from previous runs is at ${mission.logPath} — read it first (it may not`,
          `exist yet), and append a dated entry saying what you did or found this run.`,
          `If — and only if — the mission's goal is accomplished, end it: edit`,
          `${mission.notePath} and add the line "done: YYYY-MM-DD" (today's date) to its`,
          `frontmatter. That exact edit is the only change to that file this turn is`,
          `allowed to make; anything else will be refused.`,
        ]
      : []
  return [
    `[Scheduled turn — the note "${note.title}" is due, and its body follows verbatim.`,
    `Nobody is reading: do not ask questions, and do not wait for confirmation.`,
    `Anything needing a decision should be written down, not asked.`,
    ...missionLines,
    `]`,
    '',
    note.body,
  ].join('\n')
}

/**
 * The frame of a mission's final turn, once its deadline has passed.
 *
 * The note is stamped `expired` BEFORE this runs (recorded-then-run, like
 * `lastRun`), so the frame speaks in the past: the mission is already over,
 * and this turn exists to leave things tidy — the escalation the body asked
 * for, and a last line in the log.
 */
export function frameExpiredPrompt(note: ScheduledNote, mission: MissionPaths): string {
  return [
    `[Scheduled turn — the mission "${note.title}" reached its deadline (${note.until})`,
    `without being finished. It has been marked expired and will never run again;`,
    `this is its final turn. Nobody is reading: do not ask questions.`,
    `Its body follows verbatim — apply what it says about the deadline case`,
    `(typically creating a follow-up action), then append a closing entry to your`,
    `log at ${mission.logPath}.]`,
    '',
    note.body,
  ].join('\n')
}

/**
 * Insert or replace one `field: value` line in a note's frontmatter — how the
 * PRODUCT stamps `expired:`.
 */
export function stampField(source: string, field: string, value: string): string {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) return `---\n${field}: ${value}\n---\n${source}`

  const lines = (match[1] ?? '').split('\n')
  const existing = lines.findIndex((line) => line.trimStart().startsWith(`${field}:`))
  if (existing === -1) lines.push(`${field}: ${value}`)
  else lines[existing] = `${field}: ${value}`

  return `---\n${lines.join('\n')}\n---\n${source.slice(match[0].length)}`
}
