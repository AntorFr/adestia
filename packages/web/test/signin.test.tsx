// @vitest-environment jsdom
/**
 * The sign-in card's judgement: state-driven, scoped to real conversations,
 * dismissible.
 *
 * The first trigger this shipped with — "a tool of that server failed" —
 * could never fire: a disconnected `signIn` server is OMITTED from the turn,
 * so no tool of it exists to fail. Production found it before this file did;
 * these tests now pin the trigger that can.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  dismissSignIn,
  loadDismissed,
  signInAsks,
  useConnections,
  type McpConnection,
} from '../src/app/signin.js'

const DISCONNECTED: McpConnection[] = [{ name: 'home-assistant', connected: false }]

describe('what raises the card', () => {
  it('a disconnected server, on a thread where the agent has spoken', () => {
    expect(signInAsks(true, DISCONNECTED)).toEqual(['home-assistant'])
  })

  it('nothing on a thread nobody is talking in — a blank tab owes no nag', () => {
    expect(signInAsks(false, DISCONNECTED)).toEqual([])
  })

  it('nothing once connected: the state clears the card everywhere', () => {
    expect(signInAsks(true, [{ name: 'home-assistant', connected: true }])).toEqual([])
  })

  it('nothing when the state is unknown yet', () => {
    expect(signInAsks(true, undefined)).toEqual([])
  })

  it('a dismissal holds until the person connects some other way', () => {
    expect(signInAsks(true, DISCONNECTED, new Set(['home-assistant']))).toEqual([])
    // And only for the dismissed one.
    const two: McpConnection[] = [...DISCONNECTED, { name: 'garage', connected: false }]
    expect(signInAsks(true, two, new Set(['home-assistant']))).toEqual(['garage'])
  })
})

describe('remembering a dismissal', () => {
  const fakeStore = () => {
    const held = new Map<string, string>()
    return {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    }
  }

  it('survives a reload, in this browser', () => {
    const store = fakeStore()
    expect(loadDismissed(store).size).toBe(0)
    dismissSignIn('home-assistant', store)
    expect(loadDismissed(store).has('home-assistant')).toBe(true)
  })

  it('yields the empty truth on garbage, and on no storage at all', () => {
    const store = fakeStore()
    store.setItem('adestia.connect.hidden', '{broken')
    expect(loadDismissed(store).size).toBe(0)
    expect(loadDismissed(undefined).size).toBe(0)
    expect(dismissSignIn('x', undefined).has('x')).toBe(true)
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
