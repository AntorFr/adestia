/**
 * The ask desk — questions the ENGINE raised, waiting on a person.
 *
 * What is deliberately untested here, because it does not exist: any policy.
 * There is no list to match, no rule to evaluate, no zone to guard. The desk
 * holds a question and carries an answer, and that is the whole of it.
 */

import { describe, expect, it, vi } from 'vitest'

import { AskDesk } from '../src/asks.js'

const QUESTION = { tool: 'WebFetch', title: 'Claude wants to fetch example.com', remembering: true }

describe('the ask desk', () => {
  it('carries an answer back to the waiting turn', async () => {
    const desk = new AskDesk()
    const published: { id: string }[] = []
    const answer = desk.ask(QUESTION, (pending) => {
      published.push(pending)
      return true
    })

    expect(desk.answer(published[0]!.id, 'session')).toBe(true)
    expect(await answer).toBe('session')
  })

  it('refuses at once when nobody is watching', async () => {
    // A scheduled note, a delegation: holding a turn slot for five minutes on
    // a question no screen will show is worse than a refusal it can report.
    const desk = new AskDesk()
    expect(await desk.ask(QUESTION, () => false)).toBe('deny')
  })

  it('refuses a question nobody answered in time', async () => {
    vi.useFakeTimers()
    try {
      const desk = new AskDesk(1000)
      const answer = desk.ask(QUESTION, () => true)
      vi.advanceTimersByTime(1001)
      expect(await answer).toBe('deny')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an id that is no longer waiting', () => {
    // The UI answers by id after a timeout or a double click; saying "no" lets
    // it tell the person the question is gone instead of pretending it landed.
    const desk = new AskDesk()
    expect(desk.answer('never-existed', 'once')).toBe(false)
  })

  it('refuses everything still waiting when the turn ends', async () => {
    const desk = new AskDesk()
    const answer = desk.ask(QUESTION, () => true)
    desk.releaseAll()
    expect(await answer).toBe('deny')
  })
})
