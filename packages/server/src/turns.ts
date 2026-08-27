/**
 * The turn desk — the server owns its turns.
 *
 * Before this file, a turn LIVED inside its HTTP request: the driver loop ran
 * in the route handler, so a closed tab, a refresh or a phone putting its
 * browser to sleep tore down the one consumer and with it every message the
 * front end was still holding. The front's queue of messages typed during a
 * turn was RAM in a tab — one reload and they had never existed.
 *
 * Here a turn is a JOB the desk runs detached from any request. An SSE
 * response is merely a SUBSCRIBER: it can drop and come back (`/api/turn/attach`)
 * and the turn neither notices nor cares. The job keeps a replayable event
 * log, so re-attaching rebuilds exactly the state the first subscriber saw —
 * same events, same reducer, no second protocol.
 *
 * Messages posted while a conversation's turn is running are QUEUED here, not
 * in the browser, and each one is persisted to the thread the moment it is
 * accepted. When the running turn settles the queue leaves as ONE merged turn
 * — texts joined as paragraphs — which is the predecessor's contract
 * (agent-gw's `flushQueue`), now owned by the side that survives a reload.
 *
 * What this deliberately does NOT do: re-dispatch a queue across a server
 * restart. The queued texts are already in the thread (nothing is lost, the
 * reader sees them), but firing prompts found on disk at boot would have an
 * instance rebooted a week later executing stale instructions unprompted.
 */

import { randomUUID } from 'node:crypto'
import type { Driver, TurnEvent, TurnRequest } from '@antorfr/golem-drivers'

/** The slice of the app's concurrency limiter the desk needs. */
export interface TurnSlotLimiter {
  tryAcquire(): boolean
  release(): void
}

/** Everything a settled turn learned, for whoever persists it. */
export interface TurnOutcome {
  readonly text: string
  readonly tools: readonly { name: string; target?: string; ok?: boolean }[]
  readonly stopped: boolean
  readonly failure?: string | undefined
  readonly usage?: { contextTokens?: number; outputTokens?: number } | undefined
  readonly sessionId?: string | undefined
}

/**
 * One turn to run: the driver request, and what to do once it is over.
 *
 * `finish` is the ROUTE's closure — the desk runs turns, it does not know
 * about conversation stores. Persistence failing must never kill the chain,
 * so the desk swallows a finish that throws; saying it loudly is the
 * closure's own job.
 */
export interface TurnSpec {
  readonly request: TurnRequest
  readonly finish: (outcome: TurnOutcome) => Promise<void>
}

interface Subscriber {
  event(event: TurnEvent): void
  end(): void
}

/** Thrown by `admit` when the global cap refuses a fresh turn. */
export class TurnCapacityError extends Error {
  constructor() {
    super('too many turns running')
  }
}

/**
 * A running turn, observable and re-observable.
 *
 * The log is COALESCED — consecutive text deltas merge into one event — so a
 * long answer replays as a handful of frames rather than thousands, and the
 * front's reducer rebuilds the identical state either way.
 */
export class TurnJob {
  readonly id = randomUUID()
  readonly #log: TurnEvent[] = []
  readonly #subscribers = new Set<Subscriber>()
  #ended = false
  #settle: () => void = () => {}
  /** Resolves when the job is over — what a response handler awaits. */
  readonly done = new Promise<void>((resolve) => {
    this.#settle = resolve
  })

  get ended(): boolean {
    return this.#ended
  }

  /** The replayable past of this turn. Read it BEFORE subscribing — same tick
      — and nothing can slip between the snapshot and the live tail. */
  get log(): readonly TurnEvent[] {
    return this.#log
  }

  subscribe(subscriber: Subscriber): () => void {
    if (this.#ended) {
      subscriber.end()
      return () => {}
    }
    this.#subscribers.add(subscriber)
    return () => this.#subscribers.delete(subscriber)
  }

  emit(event: TurnEvent): void {
    const last = this.#log.at(-1)
    if (event.type === 'text-delta' && last?.type === 'text-delta') {
      this.#log[this.#log.length - 1] = { type: 'text-delta', text: last.text + event.text }
    } else {
      this.#log.push(event)
    }
    for (const subscriber of [...this.#subscribers]) subscriber.event(event)
  }

  /**
   * Removes an answered question from the replay.
   *
   * The answer travels through the ask desk, never through the event stream,
   * so without this a re-attach would replay a question that nothing can
   * resolve any more and strand the composer behind it.
   */
  scrubAsk(id: string): boolean {
    const index = this.#log.findIndex(
      (event) => event.type === 'permission-request' && event.id === id,
    )
    if (index === -1) return false
    this.#log.splice(index, 1)
    return true
  }

  end(): void {
    if (this.#ended) return
    this.#ended = true
    for (const subscriber of [...this.#subscribers]) subscriber.end()
    this.#subscribers.clear()
    this.#settle()
  }
}

/** A running conversation chain: its current job, and what waits behind it. */
interface Chain {
  job: TurnJob
  readonly queue: TurnSpec[]
}

export type Admission =
  | {
      readonly mode: 'run'
      start(spec: TurnSpec): TurnJob
      /** Gives the reserved slot back — for a caller whose own step failed. */
      abort(): void
    }
  | { readonly mode: 'queued'; enqueue(spec: TurnSpec): void }

export class TurnDesk {
  readonly #chains = new Map<string, Chain>()
  readonly #loose = new Set<TurnJob>()

  constructor(
    private readonly driver: Pick<Driver, 'runTurn'>,
    private readonly limiter: TurnSlotLimiter,
  ) {}

  /** The running turn for a key, when there is one to re-attach to. */
  activeFor(key: string): TurnJob | undefined {
    return this.#chains.get(key)?.job
  }

  /**
   * Decides what a new turn becomes, and reserves what that costs.
   *
   * A key with a running chain queues — no slot needed, the chain already
   * holds one and will spend it on the merged dispatch. Anything else takes a
   * slot now or is refused now: the global cap keeps its meaning, a refusal
   * stays information, and only a conversation's OWN backlog ever waits.
   *
   * The chain is registered HERE, synchronously — not at `start`. The route
   * awaits a store write between the two, and a message POSTed inside that
   * window must find the chain and queue, not race the turn it is meant to
   * follow. A spec queued before `start` is simply the first backlog the
   * chain drains.
   */
  admit(key?: string): Admission {
    if (key) {
      const chain = this.#chains.get(key)
      if (chain) {
        return { mode: 'queued', enqueue: (spec) => chain.queue.push(spec) }
      }
    }
    if (!this.limiter.tryAcquire()) throw new TurnCapacityError()

    const job = new TurnJob()
    if (key) this.#chains.set(key, { job, queue: [] })
    else this.#loose.add(job)

    return {
      mode: 'run',
      abort: () => {
        const chain = key ? this.#chains.get(key) : undefined
        if (chain && chain.queue.length > 0) {
          // The aborted turn dies; its backlog does not. Whoever queued in
          // the admission window was answered "held" and is owed a run — the
          // reserved slot carries over to it (#drive releases it at the end).
          const batch = chain.queue.splice(0)
          const next = new TurnJob()
          chain.job = next
          job.end()
          void this.#drive(key, next, mergeSpecs(batch, undefined))
          return
        }
        this.limiter.release()
        if (key) this.#chains.delete(key)
        else this.#loose.delete(job)
        job.end()
      },
      start: (spec) => {
        void this.#drive(key, job, spec)
        return job
      },
    }
  }

  /** Scrubs an answered question from whatever job still replays it. */
  scrubAsk(id: string): void {
    for (const chain of this.#chains.values()) chain.job.scrubAsk(id)
    for (const job of this.#loose) job.scrubAsk(id)
  }

  /**
   * Runs the chain to exhaustion under its ONE slot.
   *
   * The order inside the loop is the adoption guarantee: the next job is
   * installed as the chain's active one BEFORE the previous announces its
   * end, so a subscriber that hears "over" and asks `activeFor` right away
   * finds the follow-up rather than a gap.
   */
  async #drive(key: string | undefined, job: TurnJob, spec: TurnSpec): Promise<void> {
    let current: { job: TurnJob; spec: TurnSpec } | undefined = { job, spec }
    try {
      while (current) {
        const outcome = await this.#turn(current.job, current.spec)
        // Persistence must not kill the chain; the closure reports its own
        // failures. The turn's events already reached every subscriber.
        await current.spec.finish(outcome).catch(() => undefined)

        const chain = key ? this.#chains.get(key) : undefined
        let next: { job: TurnJob; spec: TurnSpec } | undefined
        if (chain && chain.queue.length > 0) {
          const batch = chain.queue.splice(0)
          next = {
            job: new TurnJob(),
            spec: mergeSpecs(batch, outcome.sessionId ?? current.spec.request.sessionId),
          }
          chain.job = next.job
        } else if (key) {
          this.#chains.delete(key)
        } else {
          this.#loose.delete(current.job)
        }

        current.job.end()
        current = next
      }
    } finally {
      this.limiter.release()
    }
  }

  /** One driver turn, accumulated the way the route used to accumulate it. */
  async #turn(job: TurnJob, spec: TurnSpec): Promise<TurnOutcome> {
    const tools: { name: string; target?: string; ok?: boolean }[] = []
    let text = ''
    let stopped = false
    let failure: string | undefined
    let usage: TurnOutcome['usage']
    let sessionId: string | undefined

    try {
      for await (const event of this.driver.runTurn(spec.request)) {
        job.emit(event)
        if (event.type === 'text-delta') text += event.text
        else if (event.type === 'tool-use') {
          tools.push({ name: event.name, ...(event.target ? { target: event.target } : {}) })
        } else if (event.type === 'tool-result') {
          const pending = tools.findLast((tool) => tool.name === event.name && tool.ok === undefined)
          if (pending) pending.ok = event.ok
        } else if (event.type === 'error') failure = event.message
        else if (event.type === 'result') {
          stopped = event.stopped
          sessionId = event.sessionId
          usage = {
            ...(event.usage?.contextTokens !== undefined
              ? { contextTokens: event.usage.contextTokens }
              : {}),
            ...(event.usage?.outputTokens !== undefined
              ? { outputTokens: event.usage.outputTokens }
              : {}),
          }
        }
      }
    } catch (error) {
      failure = (error as Error).message
      job.emit({ type: 'error', message: failure, fatal: true })
    }

    return {
      text,
      tools,
      stopped,
      ...(failure !== undefined ? { failure } : {}),
      ...(usage !== undefined ? { usage } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
    }
  }
}

/**
 * The combinatorial flush, exactly the predecessor's: texts join as
 * paragraphs into ONE turn rather than replaying one CLI round-trip per
 * message. The session chains from the turn that just settled — the queued
 * requests were posted before that session id existed.
 */
function mergeSpecs(batch: readonly TurnSpec[], sessionId: string | undefined): TurnSpec {
  const last = batch.at(-1)!
  if (batch.length === 1) {
    return {
      ...last,
      request: { ...last.request, ...(sessionId ? { sessionId } : {}) },
    }
  }
  return {
    request: {
      ...last.request,
      prompt: batch
        .map((spec) => spec.request.prompt)
        .filter((prompt) => prompt !== '')
        .join('\n\n'),
      ...(sessionId ? { sessionId } : {}),
    },
    finish: last.finish,
  }
}
