/**
 * The clock that runs scheduled turns.
 *
 * Deliberately dull: it ticks, asks what is due, and runs one at a time
 * through the SAME spawn path as the chat. A second way to start a turn is a
 * second place for the concurrency cap, the transcript and the driver's env
 * contract to be forgotten — which is exactly what went wrong in the
 * predecessor.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import {
  dayOf,
  frameExpiredPrompt,
  frameScheduledPrompt,
  isDue,
  isExpiryDue,
  isMissed,
  readSchedule,
  stampField,
  type MissionPaths,
  type ScheduleState,
  type ScheduledNote,
} from './schedule.js'

export interface ClockOptions {
  /** Absolute path of the notes directory. */
  readonly dir: string
  /** Where the run journal lives. */
  readonly statePath: string
  /**
   * Absolute directory of mission run logs — one markdown file per mission,
   * written by the AGENT (its only memory between runs), pointed at by the
   * frame. Lives in the memory zone, never in planif: the log is content,
   * the note is an instruction, and only one of them is write-gated.
   */
  readonly missionLogDir: string
  readonly tickMs?: number
  readonly log?: (message: string) => void
  /** Runs one turn. The SAME function the chat route uses. */
  runTurn(prompt: string, note: ScheduledNote): Promise<void>
}

const DEFAULT_TICK_MS = 30_000

export async function readState(path: string): Promise<ScheduleState> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ScheduleState
  } catch {
    return { lastRun: {} }
  }
}

export async function writeState(path: string, state: ScheduleState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // Atomic: a half-written journal read at the next boot would look like a
  // note that never ran, and run it again.
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(state, null, 2))
  await rename(temporary, path)
}

export class Clock {
  #timer: ReturnType<typeof setInterval> | undefined
  /** One scheduled turn at a time: they share one subscription. */
  #busy = false

  constructor(private readonly options: ClockOptions) {}

  async tick(now = Date.now()): Promise<void> {
    if (this.#busy) return
    const log = this.options.log ?? (() => undefined)

    const notes = await readSchedule(this.options.dir)
    const state = await readState(this.options.statePath)
    const lastRun = { ...state.lastRun }
    let changed = false

    for (const note of notes) {
      const paths: MissionPaths = {
        notePath: join(this.options.dir, `${note.id}.md`),
        logPath: join(this.options.missionLogDir, `${note.id}.md`),
      }

      if (isExpiryDue(note, now)) {
        this.#busy = true
        try {
          // Stamped BEFORE the turn runs — recorded-then-run, exactly like
          // `lastRun`: a final turn that fails must not retry against a
          // subscription every tick. The stamp is the product's own write;
          // the model's pen never reaches `expired`.
          await writeFile(
            paths.notePath,
            stampField(await readFile(paths.notePath, 'utf8'), 'expired', dayOf(now)),
          )
          await this.options.runTurn(frameExpiredPrompt(note, paths), note)
          log(`mission "${note.title}" expired — its final turn ran`)
        } catch (error) {
          log(`mission "${note.title}" expiry failed: ${(error as Error).message}`)
        } finally {
          this.#busy = false
        }
        break
      }

      // A note seen for the first time is dated, not run: adding one would
      // otherwise fire the moment it is saved, which "every day" rarely means.
      // A closed mission is left undated: it has no next occurrence to count to.
      if (
        lastRun[note.id] === undefined &&
        note.enabled &&
        !note.problem &&
        !note.done &&
        !note.expired
      ) {
        lastRun[note.id] = now
        changed = true
        continue
      }

      if (isMissed(note, { lastRun }, now)) {
        // Said out loud, because a silently skipped occurrence is
        // indistinguishable from a clock that is not running at all.
        log(`scheduled "${note.title}" missed its window and was skipped`)
        lastRun[note.id] = now
        changed = true
        continue
      }

      if (!isDue(note, { lastRun }, now)) continue

      this.#busy = true
      lastRun[note.id] = now
      changed = true
      try {
        await this.options.runTurn(
          frameScheduledPrompt(note, note.until ? paths : undefined),
          note,
        )
        log(`scheduled "${note.title}" ran`)
      } catch (error) {
        // The date is already recorded, so a failing note does not retry every
        // tick until it succeeds — it waits for its next occurrence like any
        // other. A retry loop against a subscription is expensive and silent.
        log(`scheduled "${note.title}" failed: ${(error as Error).message}`)
      } finally {
        this.#busy = false
      }
      break
    }

    if (changed) await writeState(this.options.statePath, { lastRun })
  }

  start(): void {
    if (this.#timer) return
    this.#timer = setInterval(() => {
      void this.tick()
    }, this.options.tickMs ?? DEFAULT_TICK_MS)
    // Never holds a shutdown open: a scheduled turn is not worth delaying a
    // deploy for.
    this.#timer.unref?.()
  }

  stop(): void {
    if (!this.#timer) return
    clearInterval(this.#timer)
    this.#timer = undefined
  }
}

export function scheduleStatePath(dataDir: string): string {
  return join(dataDir, 'schedule-state.json')
}
