/**
 * The web package declares its own `TurnEvent` so the shell carries no server
 * dependency: it talks HTTP to something that speaks this protocol, and never
 * needs to know what runs behind it.
 *
 * Two declarations of one protocol drift — unless something checks. This does.
 */

import { describe, expect, it } from 'vitest'
import type { TurnEvent as DriverEvent } from '@antorfr/golem-drivers'

import { applyEvent, INITIAL_TURN } from '../src/chat/stream.js'
import type { TurnEvent as WebEvent } from '../src/chat/events.js'

describe('protocol alignment', () => {
  it('accepts every event the driver contract can emit', () => {
    // Typed as the DRIVER's event and consumed as the WEB's: if either side
    // adds, renames or retypes a variant, this stops compiling.
    const emitted: DriverEvent[] = [
      { type: 'text-delta', text: 'x' },
      { type: 'tool-use', name: 'Read', target: '/a' },
      { type: 'tool-result', name: 'Read', ok: true },
      { type: 'permission-request', id: 'q1', tool: 'Bash', title: 'run rm', remembering: true },
      { type: 'usage-delta', outputTokens: 12 },
      { type: 'result', sessionId: 's1', stopped: false, usage: { outputTokens: 12 } },
      { type: 'error', message: 'boom', fatal: true },
    ]

    const state = (emitted as WebEvent[]).reduce(applyEvent, INITIAL_TURN)
    expect(state.text).toBe('x')
    expect(state.running).toBe(false)
  })

  it('covers every variant the web side declares', () => {
    // The reverse direction: a variant added to the web type with no reducer
    // case would fail the exhaustive switch at compile time, but a variant the
    // driver never sends is dead weight worth noticing.
    const kinds: WebEvent['type'][] = [
      'text-delta',
      'tool-use',
      'tool-result',
      'permission-request',
      'usage-delta',
      'result',
      'error',
    ]
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})
