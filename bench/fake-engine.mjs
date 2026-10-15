/**
 * The scripted engine of the host bench — a `Driver` (packages/drivers/src/contract.ts)
 * handed to `start({ driverFactory })`, never a mode of the product (AD-2).
 *
 * `runTurn` answers by script: the LAST user message is matched against an
 * ordered list of `{ when, events }`, the first match wins, and no match echoes
 * the message. Deterministic on purpose: no clock, no random id, no delay —
 * the same message gives the same events, every time, so a capture can be
 * compared with the one before it.
 *
 *   when    a string (the whole message, ignoring case and surrounding space),
 *           a RegExp, or a function (prompt) => boolean
 *   events  TurnEvent[] — or (prompt) => TurnEvent[] / AsyncIterable<TurnEvent>
 *           for a script that must hold a turn open
 *
 * The `result` event is appended when the script does not end with one.
 */

/** The scripts every run has. Seeds add their own, in front of these. */
export const DEFAULT_SCRIPTS = [
  {
    when: /^ping$/i,
    events: [{ type: 'text-delta', text: 'pong' }],
  },
]

const matches = (when, prompt) => {
  if (typeof when === 'function') return when(prompt)
  if (when instanceof RegExp) return when.test(prompt)
  return prompt.trim().toLowerCase() === String(when).trim().toLowerCase()
}

/** The text the person typed last: the prompt as the server hands it over. */
const lastMessage = (prompt) => String(prompt ?? '').trim()

export function createFakeEngine({ scripts = [], capabilities = ['usageMetrics', 'contextBreakdown'] } = {}) {
  const ordered = [...scripts, ...DEFAULT_SCRIPTS]
  return {
    async describe() {
      // The id of the real engine: the shell is built from the descriptor and
      // must draw what it draws for it. Not a new driver id in the product.
      return { id: 'claude-code', label: 'Claude Code (scripted)', cliVersion: 'bench', capabilities }
    },
    async env() {
      return {}
    },
    async *runTurn(request) {
      const prompt = lastMessage(request.prompt)
      const script = ordered.find((entry) => matches(entry.when, prompt))
      const events = script
        ? typeof script.events === 'function'
          ? script.events(prompt, request)
          : script.events
        : [{ type: 'text-delta', text: prompt }]
      let ended = false
      for await (const event of events) {
        if (request.signal?.aborted) {
          yield { type: 'result', sessionId: request.sessionId ?? 'fake-session', stopped: true }
          return
        }
        if (event.type === 'result') ended = true
        yield event
      }
      if (!ended) {
        yield {
          type: 'result',
          sessionId: request.sessionId ?? 'fake-session',
          stopped: false,
          usage: { inputTokens: 100, outputTokens: 20, contextTokens: 1000 },
        }
      }
    },
  }
}
