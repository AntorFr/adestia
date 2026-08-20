import { describe, expect, it, vi } from 'vitest'

import { PermissionBroker, type PermissionRequest } from '../src/permissions.js'

/** An emit that reports there IS an interface watching. */
const watched = (sink: PermissionRequest[]) => (request: PermissionRequest) => {
  sink.push(request)
  return true
}
/** An emit that reports nobody is watching — a scheduled or delegated turn. */
const unwatched = () => false

describe('policy without asking', () => {
  it('allows a tool on the allow list', async () => {
    const broker = new PermissionBroker({ autoAllow: ['Read'] })
    expect(await broker.ask('Read', '/a.md', unwatched)).toBe('allow')
  })

  it('denies a tool on the deny list, and deny wins', async () => {
    const broker = new PermissionBroker({ autoAllow: ['Bash'], autoDeny: ['Bash'] })
    expect(await broker.ask('Bash', 'rm -rf /', unwatched)).toBe('deny')
  })

  it('matches exactly, never by prefix', async () => {
    // A prefix rule allowing "Read" would also allow a "ReadSecrets" tool that
    // arrives in a future CLI version.
    const broker = new PermissionBroker({ autoAllow: ['Read'] })
    const asked: PermissionRequest[] = []
    const decision = broker.ask('ReadSecrets', undefined, watched(asked))
    expect(asked).toHaveLength(1)
    broker.answer(asked[0]!.id, 'deny')
    expect(await decision).toBe('deny')
  })
})

describe('asking a human', () => {
  it('resolves with the answer', async () => {
    const broker = new PermissionBroker()
    const asked: PermissionRequest[] = []
    const decision = broker.ask('Bash', 'npm test', watched(asked))

    expect(asked[0]).toMatchObject({ tool: 'Bash', detail: 'npm test' })
    expect(broker.answer(asked[0]!.id, 'allow')).toBe(true)
    expect(await decision).toBe('allow')
  })

  it('reports an answer to a request that is no longer waiting', async () => {
    const broker = new PermissionBroker()
    expect(broker.answer('never-existed', 'allow')).toBe(false)
  })

  it('ignores a second answer to the same request', async () => {
    const broker = new PermissionBroker()
    const asked: PermissionRequest[] = []
    const decision = broker.ask('Bash', undefined, watched(asked))
    broker.answer(asked[0]!.id, 'allow')
    expect(broker.answer(asked[0]!.id, 'deny')).toBe(false)
    expect(await decision).toBe('allow')
  })

  it('lists what is still waiting, so a reconnecting UI can re-ask', () => {
    const broker = new PermissionBroker()
    const asked: PermissionRequest[] = []
    void broker.ask('Bash', 'ls', watched(asked))
    expect(broker.outstanding().map((r) => r.tool)).toEqual(['Bash'])
  })
})

describe('when nobody is there', () => {
  it('decides immediately rather than waiting for a person who never was', async () => {
    // A scheduled turn or an MCP delegation has no interface at all; waiting
    // five minutes would hold a subscription slot for nothing.
    const broker = new PermissionBroker()
    expect(await broker.ask('Bash', 'rm -rf /', unwatched)).toBe('deny')
  })

  it('defaults to deny, not allow', async () => {
    // An agent that proceeds because nobody answered did something nobody
    // approved, and unlike a stalled turn that is not recoverable.
    expect(await new PermissionBroker().ask('Bash', undefined, unwatched)).toBe('deny')
  })

  it('honours an operator who chose otherwise', async () => {
    const broker = new PermissionBroker({ whenUnattended: 'allow' })
    expect(await broker.ask('Bash', undefined, unwatched)).toBe('allow')
  })

  it('applies the same policy on timeout', async () => {
    vi.useFakeTimers()
    const broker = new PermissionBroker({ timeoutMs: 1000 })
    const decision = broker.ask('Bash', undefined, watched([]))
    await vi.advanceTimersByTimeAsync(1001)
    expect(await decision).toBe('deny')
    expect(broker.outstanding()).toEqual([])
    vi.useRealTimers()
  })
})

describe('end of turn', () => {
  it('releases everything still waiting', async () => {
    // A request whose turn is over can never be answered usefully, and leaving
    // it pending strands the composer behind a prompt nothing resolves.
    const broker = new PermissionBroker()
    const asked: PermissionRequest[] = []
    const decision = broker.ask('Bash', undefined, watched(asked))
    broker.releaseAll()
    expect(await decision).toBe('deny')
    expect(broker.outstanding()).toEqual([])
  })
})
