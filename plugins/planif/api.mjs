/**
 * Reads the schedule notes and their journal.
 *
 * Read-only, deliberately. Creating or suspending a scheduled turn goes
 * through the AGENT — it edits the note like any other file. A UI that wrote
 * these directly would be a second author on a file whose body is executed as
 * a prompt, which is exactly the surface the design puts behind a risk zone.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const EVERY = /^(\d+)\s*(m|h|d)$/

// Mirrors the server's parseAt: a list of wall-clock times, sorted, refused
// under the same 15-minute floor measured around the clock.
function readAt(value) {
  const minutes = []
  for (const part of value.split(',')) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(part.trim())
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      return { problem: 'cannot read `at` (expected times like 06:30, 12:30)' }
    }
    minutes.push(Number(match[1]) * 60 + Number(match[2]))
  }
  minutes.sort((a, b) => a - b)
  for (let i = 0; i < minutes.length && minutes.length > 1; i++) {
    const previous = i === 0 ? minutes[minutes.length - 1] - 1440 : minutes[i - 1]
    if (minutes[i] - previous < 15) {
      return { problem: 'two of these times are under the 15-minute floor apart' }
    }
  }
  return { minutes }
}

// The next listed time strictly after `from` — knowable from the wall clock
// alone, where an every-note's next needs its last run.
function nextAtMs(atMinutes, from) {
  const date = new Date(from)
  for (const daysAhead of [0, 1]) {
    for (const m of atMinutes) {
      const at = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + daysAhead,
        Math.floor(m / 60),
        m % 60,
      ).getTime()
      if (at > from) return at
    }
  }
  return null
}

function parseNote(id, source) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  const fields = {}
  for (const line of (match?.[1] ?? '').split('\n')) {
    const separator = line.indexOf(':')
    if (separator > 0) {
      fields[line.slice(0, separator).trim()] = line
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
    }
  }
  const body = (match ? source.slice(match[0].length) : source).trim()
  const every = EVERY.exec(fields.every ?? '')
  const minutes = every
    ? Number(every[1]) * (every[2] === 'm' ? 1 : every[2] === 'h' ? 60 : 1440)
    : 0
  const at = fields.at !== undefined ? readAt(fields.at) : null

  return {
    id,
    title: fields.title ?? id,
    every: fields.every ?? null,
    everyMinutes: minutes,
    at: fields.at ?? null,
    atMinutes: at?.minutes ?? null,
    enabled: fields.enabled !== 'false',
    // A mission's lifecycle, read the way the server reads it: `until` makes
    // it a mission, `done` is the agent's own tick, `expired` the product's.
    until: fields.until ?? null,
    done: fields.done ?? null,
    expired: fields.expired ?? null,
    // The body is shown because it IS the prompt: a scheduled turn nobody can
    // read the text of is a scheduled turn nobody can predict.
    body,
    problem: problemOf(fields, minutes, at, body),
  }
}

// One cadence per note, read the way the server reads it — a tile that calls
// healthy what the clock refuses would be worse than no tile at all.
function problemOf(fields, minutes, at, body) {
  if (fields.every !== undefined && fields.at !== undefined) {
    return 'carries both `every` and `at` — one cadence per note'
  }
  if (at) {
    if (at.problem) return at.problem
  } else if (!minutes) {
    return 'cannot read `every` (expected 30m, 2h, 1d…)'
  } else if (minutes < 15) {
    return 'below the 15-minute floor'
  }
  if (fields.until && !/^\d{4}-\d{2}-\d{2}$/.test(fields.until)) {
    return 'cannot read `until` (expected a day like 2026-08-29)'
  }
  return body === '' ? 'the note is empty — its body is the prompt' : null
}

export default async function api(app, opts) {
  // Derived from what the host tells us, never from cwd: a plugin guessing at
  // the workspace works on the developer's machine and nowhere else.
  const dir = join(opts.workspaceRoot, 'planif')
  const statePath = join(opts.dataDir, 'schedule-state.json')

  app.get('/notes', async () => {
    let files = []
    try {
      files = (await readdir(dir)).filter((name) => name.endsWith('.md')).sort()
    } catch {
      // No directory is an instance with no scheduled turns, not an error.
      return { notes: [], enabled: opts.scheduleEnabled ?? false }
    }

    let lastRun = {}
    try {
      lastRun = JSON.parse(await readFile(statePath, 'utf8')).lastRun ?? {}
    } catch {
      /* never run yet */
    }

    const notes = []
    for (const file of files) {
      const id = file.replace(/\.md$/, '')
      try {
        const note = parseNote(id, await readFile(join(dir, file), 'utf8'))
        const last = lastRun[id]
        // A fixed-time note's next run is on the wall clock, last run or not;
        // an every-note's next only exists once there is a run to count from.
        const next =
          note.atMinutes && !note.problem
            ? nextAtMs(note.atMinutes, Date.now())
            : last && note.everyMinutes
              ? last + note.everyMinutes * 60_000
              : null
        notes.push({
          ...note,
          lastRun: last ? new Date(last).toISOString() : null,
          nextRun: next ? new Date(next).toISOString() : null,
        })
      } catch {
        continue
      }
    }
    return { notes, enabled: opts.scheduleEnabled ?? false }
  })
}
