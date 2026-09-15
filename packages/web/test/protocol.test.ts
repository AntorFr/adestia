/**
 * The browser's reducer against the driver contract's own events.
 *
 * There used to be two declarations of the turn events, and this test pinned
 * them together. There is one now, the driver contract's, and what remains
 * worth asking is that the reducer accepts every variant it can emit — a
 * variant added to the contract with no reducer case fails to compile here.
 */

import { describe, expect, it } from 'vitest'
import type { TurnEvent } from '@antorfr/adestia-drivers'

import { applyEvent, INITIAL_TURN } from '../src/chat/stream.js'

describe('protocol', () => {
  it('reduces every event the driver contract can emit', () => {
    const emitted: TurnEvent[] = [
      { type: 'text-delta', text: 'x' },
      { type: 'tool-use', name: 'Read', target: '/a' },
      { type: 'tool-result', name: 'Read', ok: true },
      { type: 'permission-request', id: 'q1', tool: 'Bash', title: 'run rm', remembering: true },
      { type: 'usage-delta', outputTokens: 12 },
      { type: 'result', sessionId: 's1', stopped: false, usage: { outputTokens: 12 } },
      { type: 'error', message: 'boom', fatal: true },
    ]

    const state = emitted.reduce(applyEvent, INITIAL_TURN)
    expect(state.parts.map((part) => part.text).join('')).toBe('x')
    expect(state.running).toBe(false)
  })
})
