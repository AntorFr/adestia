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

  return {
    id,
    title: fields.title ?? id,
    every: fields.every ?? null,
    everyMinutes: minutes,
    enabled: fields.enabled !== 'false',
    // A mission's lifecycle, read the way the server reads it: `until` makes
    // it a mission, `done` is the agent's own tick, `expired` the product's.
    until: fields.until ?? null,
    done: fields.done ?? null,
    expired: fields.expired ?? null,
    // The body is shown because it IS the prompt: a scheduled turn nobody can
    // read the text of is a scheduled turn nobody can predict.
    body,
    problem: !minutes
      ? 'cannot read `every` (expected 30m, 2h, 1d…)'
      : minutes < 15
        ? 'below the 15-minute floor'
        : fields.until && !/^\d{4}-\d{2}-\d{2}$/.test(fields.until)
          ? 'cannot read `until` (expected a day like 2026-08-29)'
          : body === ''
            ? 'the note is empty — its body is the prompt'
            : null,
  }
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
        notes.push({
          ...note,
          lastRun: last ? new Date(last).toISOString() : null,
          nextRun:
            last && note.everyMinutes
              ? new Date(last + note.everyMinutes * 60_000).toISOString()
              : null,
        })
      } catch {
        continue
      }
    }
    return { notes, enabled: opts.scheduleEnabled ?? false }
  })
}
