import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Clock, readState, writeState } from '../src/clock.js'
import {
  GRACE_MINUTES,
  MIN_PERIOD_MINUTES,
  dayOf,
  frameExpiredPrompt,
  frameScheduledPrompt,
  isDue,
  isExpiryDue,
  isMissed,
  parseEvery,
  parseNote,
  readSchedule,
  stampField,
  type ScheduledNote,
} from '../src/schedule.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-sched-'))
})

const MINUTE = 60_000
const note = (overrides: Partial<ScheduledNote> = {}): ScheduledNote => ({
  id: 'daily',
  title: 'Daily',
  body: 'Summarise yesterday.',
  everyMinutes: 60,
  enabled: true,
  ...overrides,
})

describe('reading a cadence', () => {
  it('accepts minutes, hours and days', () => {
    expect(parseEvery('30m')).toEqual({ minutes: 30 })
    expect(parseEvery('2h')).toEqual({ minutes: 120 })
    expect(parseEvery('1d')).toEqual({ minutes: 1440 })
  })

  it('refuses a cadence below the floor rather than rounding it up', () => {
    // A note that says "every 5m" and runs every 15 lies to whoever wrote it.
    const result = parseEvery('5m')
    expect(result).toHaveProperty('problem')
    expect((result as { problem: string }).problem).toContain(String(MIN_PERIOD_MINUTES))
  })

  it('says what it expected when it cannot read the value', () => {
    expect((parseEvery('sometimes') as { problem: string }).problem).toContain('30m')
    expect(parseEvery(undefined)).toHaveProperty('problem')
  })
})

describe('reading a note', () => {
  it('takes the body as the prompt, verbatim', () => {
    const parsed = parseNote(
      'daily',
      '---\ntitle: Daily digest\nevery: 1d\n---\n\nSummarise yesterday.\n',
    )
    expect(parsed).toMatchObject({ title: 'Daily digest', everyMinutes: 1440, enabled: true })
    expect(parsed.body).toBe('Summarise yesterday.')
  })

  it('refuses an empty note', () => {
    // The body IS the prompt: an empty one opens a turn that asks nothing and
    // bills for it.
    const parsed = parseNote('x', '---\nevery: 1h\n---\n\n')
    expect(parsed.enabled).toBe(false)
    expect(parsed.problem).toContain('its body is the prompt')
  })

  it('carries a bad cadence as a problem rather than refusing the file', () => {
    const parsed = parseNote('x', '---\nevery: 1s\n---\n\nDo a thing.\n')
    expect(parsed.problem).toBeTruthy()
    expect(parsed.enabled).toBe(false)
  })

  it('honours enabled: false', () => {
    expect(parseNote('x', '---\nevery: 1h\nenabled: false\n---\n\nBody.\n').enabled).toBe(false)
  })

  it('falls back to the file name for a title', () => {
    expect(parseNote('morning-brief', '---\nevery: 1d\n---\n\nBody.\n').title).toBe('morning-brief')
  })
})

describe('reading a directory', () => {
  it('reads every note', async () => {
    await mkdir(join(root, 'planif'), { recursive: true })
    await writeFile(join(root, 'planif', 'a.md'), '---\nevery: 1h\n---\n\nA.\n')
    await writeFile(join(root, 'planif', 'b.md'), '---\nevery: 1d\n---\n\nB.\n')
    expect((await readSchedule(join(root, 'planif'))).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('treats a missing directory as no schedule', async () => {
    expect(await readSchedule(join(root, 'nowhere'))).toEqual([])
  })
})

describe('when a note fires', () => {
  const now = 1_000_000_000

  it('does not fire a note that has never run', () => {
    // Adding one would otherwise run it the moment it is saved, which "every
    // day" rarely means.
    expect(isDue(note(), { lastRun: {} }, now)).toBe(false)
  })

  it('fires once its period has elapsed', () => {
    expect(isDue(note(), { lastRun: { daily: now - 61 * MINUTE } }, now)).toBe(true)
    expect(isDue(note(), { lastRun: { daily: now - 59 * MINUTE } }, now)).toBe(false)
  })

  it('still fires inside the grace window', () => {
    // Covers a long turn holding the slot, not an outage.
    const late = now - (60 + GRACE_MINUTES - 1) * MINUTE
    expect(isDue(note(), { lastRun: { daily: late } }, now)).toBe(true)
  })

  it('loses an occurrence past the grace window instead of replaying it', () => {
    // An instance down for a day must not wake up and run yesterday.
    const yesterday = now - 24 * 60 * MINUTE
    expect(isDue(note(), { lastRun: { daily: yesterday } }, now)).toBe(false)
    expect(isMissed(note(), { lastRun: { daily: yesterday } }, now)).toBe(true)
  })

  it('never fires a disabled or broken note', () => {
    const past = { lastRun: { daily: now - 120 * MINUTE } }
    expect(isDue(note({ enabled: false }), past, now)).toBe(false)
    expect(isDue(note({ problem: 'bad cadence' }), past, now)).toBe(false)
  })
})

describe('the prompt frame', () => {
  it('tells the agent nobody is reading', () => {
    // Without it the agent answers as though someone were — asking questions
    // nobody will see, waiting for a confirmation that never comes.
    const framed = frameScheduledPrompt(note())
    expect(framed).toContain('Nobody is reading')
    expect(framed).toContain('do not ask questions')
  })

  it('passes the body through verbatim', () => {
    expect(frameScheduledPrompt(note({ body: 'Exact words.' }))).toContain('Exact words.')
  })
})

describe('the clock', () => {
  const setup = async (files: Record<string, string>) => {
    const dir = join(root, 'planif')
    await mkdir(dir, { recursive: true })
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(dir, name), contents)
    }
    return {
      dir,
      statePath: join(root, 'data', 'schedule-state.json'),
      missionLogDir: join(root, 'memory', 'missions'),
    }
  }

  it('dates a new note instead of running it', async () => {
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(1000)

    expect(runTurn).not.toHaveBeenCalled()
    expect((await readState(statePath)).lastRun['a']).toBe(1000)
  })

  it('runs a due note through the given turn function', async () => {
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nDo the thing.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const prompts: string[] = []
    const runTurn = vi.fn(async (prompt: string) => {
      prompts.push(prompt)
    })
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(61 * MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(prompts[0]).toContain('Do the thing.')
  })

  it('runs one at a time — they share one subscription', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'a.md': '---\nevery: 1h\n---\n\nA.\n',
      'b.md': '---\nevery: 1h\n---\n\nB.\n',
    })
    await writeState(statePath, { lastRun: { a: 0, b: 0 } })

    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(61 * MINUTE)
    expect(runTurn).toHaveBeenCalledOnce()
  })

  it('does not retry a failing note every tick', async () => {
    // A retry loop against a subscription is expensive and silent; a failed
    // note waits for its next occurrence like any other.
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const runTurn = vi.fn(async () => {
      throw new Error('the CLI died')
    })
    const logs: string[] = []
    const clock = new Clock({ dir, statePath, missionLogDir, runTurn, log: (m) => logs.push(m) })

    await clock.tick(61 * MINUTE)
    await clock.tick(62 * MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(logs.join('\n')).toContain('failed')
  })

  it('says out loud when an occurrence was missed', async () => {
    // A silently skipped occurrence is indistinguishable from a clock that is
    // not running at all.
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const logs: string[] = []
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, missionLogDir, runTurn, log: (m) => logs.push(m) }).tick(48 * 60 * MINUTE)

    expect(runTurn).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('missed its window')
  })

  it('never runs a note it cannot read', async () => {
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 3s\n---\n\nToo often.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(10 * 60 * MINUTE)
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('survives a corrupted journal rather than refusing to tick', async () => {
    const { dir, statePath, missionLogDir } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await mkdir(join(root, 'data'), { recursive: true })
    await writeFile(statePath, '{ half-written')
    const runTurn = vi.fn(async () => undefined)
    await expect(new Clock({ dir, statePath, missionLogDir, runTurn }).tick(1000)).resolves.toBeUndefined()
  })
})

describe('a mission — a note with a deadline', () => {
  // Local-time day boundaries, built the way endOfDayMs computes them.
  const during = new Date(2026, 7, 28, 12).getTime() // Aug 28, noon
  const after = new Date(2026, 7, 30, 12).getTime() // past the whole until day

  const mission = (overrides: Partial<ScheduledNote> = {}): ScheduledNote =>
    note({ until: '2026-08-29', ...overrides })

  it('reads until, done and expired from the frontmatter', () => {
    const parsed = parseNote(
      'resa',
      '---\nevery: 2h\nuntil: 2026-08-29\ndone: 2026-08-25\n---\n\nWatch the inbox.\n',
    )
    expect(parsed.until).toBe('2026-08-29')
    expect(parsed.done).toBe('2026-08-25')
  })

  it('refuses an unreadable deadline instead of running an immortal cron', () => {
    // The whole point of `until` is that the mission is guaranteed to end.
    const parsed = parseNote('x', '---\nevery: 2h\nuntil: friday\n---\n\nBody.\n')
    expect(parsed.enabled).toBe(false)
    expect(parsed.problem).toContain('until')
  })

  it('closes on ANY done value, not only a well-formed date', () => {
    // Lenient read, strict write: a `done: true` from a confused hand still
    // means "stop running this", which is always the safe reading.
    const parsed = parseNote('x', '---\nevery: 2h\nuntil: 2026-08-29\ndone: true\n---\n\nBody.\n')
    expect(isDue(parsed, { lastRun: { x: during - 3 * 60 * MINUTE } }, during)).toBe(false)
  })

  it('fires ordinary occurrences while the deadline is ahead', () => {
    expect(isDue(mission(), { lastRun: { daily: during - 61 * MINUTE } }, during)).toBe(true)
    expect(isExpiryDue(mission(), during)).toBe(false)
  })

  it('never fires again once done or expired', () => {
    const ran = { lastRun: { daily: during - 61 * MINUTE } }
    expect(isDue(mission({ done: '2026-08-25' }), ran, during)).toBe(false)
    expect(isDue(mission({ expired: '2026-08-30' }), ran, during)).toBe(false)
    expect(isMissed(mission({ done: '2026-08-25' }), { lastRun: { daily: 0 } }, after)).toBe(false)
  })

  it('owes the final turn once the deadline day is over', () => {
    expect(isExpiryDue(mission(), after)).toBe(true)
    // ...but not while the until day itself is still running: live through it.
    expect(isExpiryDue(mission(), new Date(2026, 7, 29, 23).getTime())).toBe(false)
  })

  it('still owes the final turn long after — the deadline has no grace window', () => {
    // Inverts the occurrence rule on purpose: an occurrence is a rhythm, the
    // deadline is an obligation. An instance down past it still escalates.
    const weeksLater = after + 21 * 24 * 60 * MINUTE
    expect(isExpiryDue(mission(), weeksLater)).toBe(true)
    expect(isDue(mission(), { lastRun: { daily: 0 } }, weeksLater)).toBe(false)
  })

  it('never expires a disabled, broken, done or expired note', () => {
    expect(isExpiryDue(mission({ enabled: false }), after)).toBe(false)
    expect(isExpiryDue(mission({ problem: 'bad' }), after)).toBe(false)
    expect(isExpiryDue(mission({ done: '2026-08-25' }), after)).toBe(false)
    expect(isExpiryDue(mission({ expired: '2026-08-30' }), after)).toBe(false)
  })
})

describe('the mission frames', () => {
  const paths = { notePath: '/w/planif/resa.md', logPath: '/w/memory/missions/resa.md' }
  const mission = note({ until: '2026-08-29' })

  it('tells a mission how to end itself, and where its memory lives', () => {
    const framed = frameScheduledPrompt(mission, paths)
    expect(framed).toContain('2026-08-29')
    expect(framed).toContain(paths.logPath)
    expect(framed).toContain(paths.notePath)
    expect(framed).toContain('done: YYYY-MM-DD')
    // The plain-note frame is untouched by the feature.
    expect(frameScheduledPrompt(note())).not.toContain('mission')
  })

  it('frames the final turn in the past — the mission is already stamped', () => {
    const framed = frameExpiredPrompt(mission, paths)
    expect(framed).toContain('deadline')
    expect(framed).toContain('final turn')
    expect(framed).toContain(paths.logPath)
    expect(framed).toContain(mission.body)
  })
})

describe('stamping a field — the product\'s own pen', () => {
  it('adds the field to an existing frontmatter', () => {
    const stamped = stampField('---\nevery: 2h\n---\n\nBody.\n', 'expired', '2026-08-30')
    expect(stamped).toBe('---\nevery: 2h\nexpired: 2026-08-30\n---\n\nBody.\n')
  })

  it('replaces the field when it is already there', () => {
    const stamped = stampField('---\nexpired: old\nevery: 2h\n---\nBody.\n', 'expired', '2026-08-30')
    expect(stamped).toBe('---\nexpired: 2026-08-30\nevery: 2h\n---\nBody.\n')
  })

  it('leaves the body untouched to the byte', () => {
    const source = '---\nevery: 2h\n---\n\nThe  body,   spacing and all.\n'
    const stamped = stampField(source, 'expired', '2026-08-30')
    expect(stamped.endsWith('\nThe  body,   spacing and all.\n')).toBe(true)
  })
})

describe('the clock and a mission', () => {
  const setup = async (files: Record<string, string>) => {
    const dir = join(root, 'planif')
    await mkdir(dir, { recursive: true })
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(dir, name), contents)
    }
    return {
      dir,
      statePath: join(root, 'data', 'schedule-state.json'),
      missionLogDir: join(root, 'memory', 'missions'),
    }
  }
  const after = new Date(2026, 7, 30, 12).getTime()

  it('frames a due mission with its note and log paths', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'resa.md': '---\nevery: 1h\nuntil: 2026-08-29\n---\n\nWatch the inbox.\n',
    })
    const during = new Date(2026, 7, 28, 12).getTime()
    await writeState(statePath, { lastRun: { resa: during - 61 * MINUTE } })

    const prompts: string[] = []
    const runTurn = vi.fn(async (prompt: string) => {
      prompts.push(prompt)
    })
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(during)

    expect(prompts[0]).toContain(join(dir, 'resa.md'))
    expect(prompts[0]).toContain(join(missionLogDir, 'resa.md'))
  })

  it('stamps expired, then runs the final turn', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'resa.md': '---\nevery: 1h\nuntil: 2026-08-29\n---\n\nWatch the inbox.\n',
    })
    await writeState(statePath, { lastRun: { resa: 0 } })

    const prompts: string[] = []
    const runTurn = vi.fn(async (prompt: string) => {
      prompts.push(prompt)
    })
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(after)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(prompts[0]).toContain('final turn')
    const stamped = await readFile(join(dir, 'resa.md'), 'utf8')
    expect(stamped).toContain(`expired: ${dayOf(after)}`)
  })

  it('runs the final turn only once — the stamp survives the next tick', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'resa.md': '---\nevery: 1h\nuntil: 2026-08-29\n---\n\nWatch the inbox.\n',
    })
    await writeState(statePath, { lastRun: { resa: 0 } })

    const runTurn = vi.fn(async () => undefined)
    const clock = new Clock({ dir, statePath, missionLogDir, runTurn })
    await clock.tick(after)
    await clock.tick(after + MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
  })

  it('does not retry a failing final turn — stamped means over', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'resa.md': '---\nevery: 1h\nuntil: 2026-08-29\n---\n\nWatch the inbox.\n',
    })
    await writeState(statePath, { lastRun: { resa: 0 } })

    const runTurn = vi.fn(async () => {
      throw new Error('the CLI died')
    })
    const logs: string[] = []
    const clock = new Clock({ dir, statePath, missionLogDir, runTurn, log: (m) => logs.push(m) })
    await clock.tick(after)
    await clock.tick(after + MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(logs.join('\n')).toContain('expiry failed')
  })

  it('leaves a done mission entirely alone', async () => {
    const { dir, statePath, missionLogDir } = await setup({
      'resa.md': '---\nevery: 1h\nuntil: 2026-08-29\ndone: 2026-08-25\n---\n\nWatch the inbox.\n',
    })
    await writeState(statePath, { lastRun: { resa: 0 } })

    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, missionLogDir, runTurn }).tick(after)

    expect(runTurn).not.toHaveBeenCalled()
    expect(await readFile(join(dir, 'resa.md'), 'utf8')).not.toContain('expired:')
  })
})
