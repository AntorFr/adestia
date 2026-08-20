import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Clock, readState, writeState } from '../src/clock.js'
import {
  GRACE_MINUTES,
  MIN_PERIOD_MINUTES,
  frameScheduledPrompt,
  isDue,
  isMissed,
  parseEvery,
  parseNote,
  readSchedule,
  type ScheduledNote,
} from '../src/schedule.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-sched-'))
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
    return { dir, statePath: join(root, 'data', 'schedule-state.json') }
  }

  it('dates a new note instead of running it', async () => {
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, runTurn }).tick(1000)

    expect(runTurn).not.toHaveBeenCalled()
    expect((await readState(statePath)).lastRun['a']).toBe(1000)
  })

  it('runs a due note through the given turn function', async () => {
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nDo the thing.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const prompts: string[] = []
    const runTurn = vi.fn(async (prompt: string) => {
      prompts.push(prompt)
    })
    await new Clock({ dir, statePath, runTurn }).tick(61 * MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(prompts[0]).toContain('Do the thing.')
  })

  it('runs one at a time — they share one subscription', async () => {
    const { dir, statePath } = await setup({
      'a.md': '---\nevery: 1h\n---\n\nA.\n',
      'b.md': '---\nevery: 1h\n---\n\nB.\n',
    })
    await writeState(statePath, { lastRun: { a: 0, b: 0 } })

    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, runTurn }).tick(61 * MINUTE)
    expect(runTurn).toHaveBeenCalledOnce()
  })

  it('does not retry a failing note every tick', async () => {
    // A retry loop against a subscription is expensive and silent; a failed
    // note waits for its next occurrence like any other.
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const runTurn = vi.fn(async () => {
      throw new Error('the CLI died')
    })
    const logs: string[] = []
    const clock = new Clock({ dir, statePath, runTurn, log: (m) => logs.push(m) })

    await clock.tick(61 * MINUTE)
    await clock.tick(62 * MINUTE)

    expect(runTurn).toHaveBeenCalledOnce()
    expect(logs.join('\n')).toContain('failed')
  })

  it('says out loud when an occurrence was missed', async () => {
    // A silently skipped occurrence is indistinguishable from a clock that is
    // not running at all.
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })

    const logs: string[] = []
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, runTurn, log: (m) => logs.push(m) }).tick(48 * 60 * MINUTE)

    expect(runTurn).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('missed its window')
  })

  it('never runs a note it cannot read', async () => {
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 3s\n---\n\nToo often.\n' })
    await writeState(statePath, { lastRun: { a: 0 } })
    const runTurn = vi.fn(async () => undefined)
    await new Clock({ dir, statePath, runTurn }).tick(10 * 60 * MINUTE)
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('survives a corrupted journal rather than refusing to tick', async () => {
    const { dir, statePath } = await setup({ 'a.md': '---\nevery: 1h\n---\n\nA.\n' })
    await mkdir(join(root, 'data'), { recursive: true })
    await writeFile(statePath, '{ half-written')
    const runTurn = vi.fn(async () => undefined)
    await expect(new Clock({ dir, statePath, runTurn }).tick(1000)).resolves.toBeUndefined()
  })
})
