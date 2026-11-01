/**
 * The REAL Claude SDK, asked to resume a session that does not exist (AD-23).
 *
 * Skipped without `CLAUDE_CODE_OAUTH_TOKEN`: no fake stands in for it, because
 * the question is what the real SDK does. The outcome is written under AD-23,
 * "Outcome of the real test", in ARCHITECTURE.md; this test prints what it saw.
 */

import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { ClaudeCodeDriver } from '../src/claude-code/driver.js'
import type { QueryFn } from '../src/claude-code/sdk-types.js'
import type { TurnEvent } from '../src/contract.js'

const token = process.env['CLAUDE_CODE_OAUTH_TOKEN']

async function turn(driver: ClaudeCodeDriver, sessionId: string | undefined): Promise<TurnEvent[]> {
  const events: TurnEvent[] = []
  for await (const event of driver.runTurn({
    prompt: 'Reply with the single word: ok',
    cwd: process.cwd(),
    ...(sessionId ? { sessionId } : {}),
  })) {
    events.push(event)
  }
  return events
}

describe.skipIf(!token)('claude resume on a session that is gone (real SDK)', () => {
  it('records which outcome the SDK gives', async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    const driver = new ClaudeCodeDriver({
      query: sdk.query as unknown as QueryFn,
      credentials: { CLAUDE_CODE_OAUTH_TOKEN: token ?? '' },
    })
    const ghost = randomUUID()
    const first = await turn(driver, ghost)
    const result = first.find((e) => e.type === 'result')
    const errors = first.filter((e) => e.type === 'error')
    const text = first.filter((e) => e.type === 'text-delta').length > 0
    const outcome =
      result && result.type === 'result' && result.sessionId !== ghost && !errors.length
        ? 'a: new session silently'
        : errors.length && !text
          ? 'b: refused before any text'
          : 'c: answered without signal'
    // The observation IS the deliverable: it goes to the log, then to AD-23.
    console.log(`[AD-23] ghost=${ghost} outcome=${outcome}\n${JSON.stringify(first, null, 1)}`)
    if (outcome.startsWith('b')) {
      // Does the next turn of the same conversation heal by itself? The server
      // no longer sends the dead session, so it is a fresh turn.
      const next = await turn(driver, undefined)
      console.log(`[AD-23] next turn: ${JSON.stringify(next, null, 1)}`)
      expect(next.some((e) => e.type === 'result')).toBe(true)
    }
    expect(first.length).toBeGreaterThan(0)
  }, 120_000)
})
