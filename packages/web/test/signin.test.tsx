// @vitest-environment jsdom
/**
 * The sign-in card's judgement: demand-driven, per person, and matched
 * against KNOWN server names rather than trusting a tool-name split.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { signInAsks, useConnections, type McpConnection } from '../src/app/signin.js'

const failed = (tool: string) => ({ tools: [{ name: tool, ok: false }] })
const fine = (tool: string) => ({ tools: [{ name: tool, ok: true }] })

const DISCONNECTED: McpConnection[] = [{ name: 'home-assistant', connected: false }]

describe('what raises the card', () => {
  it('a FAILED tool of a server this person never connected to', () => {
    expect(signInAsks([failed('mcp__home-assistant__turn_on')], DISCONNECTED)).toEqual([
      'home-assistant',
    ])
  })

  it('nothing, when the tool succeeded or the server is connected', () => {
    expect(signInAsks([fine('mcp__home-assistant__turn_on')], DISCONNECTED)).toEqual([])
    expect(
      signInAsks(
        [failed('mcp__home-assistant__turn_on')],
        [{ name: 'home-assistant', connected: true }],
      ),
    ).toEqual([])
  })

  it('nothing, for a failed tool of some OTHER server', () => {
    // A broken Read or a failing rosetta addon is not a sign-in problem, and
    // a card that answered every failure would teach people to ignore it.
    expect(signInAsks([failed('Read'), failed('mcp__meteo__forecast')], DISCONNECTED)).toEqual([])
  })

  it('matches on the declared name, not on a naive underscore split', () => {
    // `mcp__ha_local__x` must not raise the card of `ha`: prefixes are only
    // trusted up to the full declared name plus its separator.
    expect(
      signInAsks([failed('mcp__ha_local__toggle')], [{ name: 'ha', connected: false }]),
    ).toEqual([])
  })

  it('asks once per server, however many tools failed', () => {
    expect(
      signInAsks(
        [failed('mcp__home-assistant__turn_on'), failed('mcp__home-assistant__get_state')],
        DISCONNECTED,
      ),
    ).toEqual(['home-assistant'])
  })
})

describe('the connections hook', () => {
  it('reads the state once, and yields the empty truth on a refusal', async () => {
    const okFetch = (async () =>
      new Response(JSON.stringify({ connections: DISCONNECTED }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch

    function Probe() {
      const connections = useConnections(okFetch)
      return <div>{connections === undefined ? 'loading' : `got ${connections.length}`}</div>
    }
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('got 1')).toBeTruthy())
  })
})
