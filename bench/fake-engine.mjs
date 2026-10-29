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

/**
 * The text the person typed: the prompt as the server hands it over, without
 * the notes the server puts in front of it (the instance's introduction, the
 * open screen, attached files, a delegation's origin) — each a bracketed
 * paragraph ending on a blank line. A script is keyed by what was typed.
 */
const FRAME = /^\[(You are running inside Adestia|Screen open|Files attached|Delegated task)/
const lastMessage = (prompt) => {
  let text = String(prompt ?? '')
  while (FRAME.test(text)) {
    const end = text.indexOf('\n\n')
    if (end === -1) break
    text = text.slice(end + 2)
  }
  return text.trim()
}

/**
 * A script's events that stay open until the turn is stopped
 * (`POST /api/turn/stop`): the "turn in progress" the screens need, and that a
 * check can end. Yield from it inside a script's generator.
 */
export const untilStopped = (signal) =>
  new Promise((done) => {
    if (!signal || signal.aborted) return done()
    signal.addEventListener('abort', () => done(), { once: true })
  })

const CAPABILITIES = [
  'usageMetrics',
  'contextBreakdown',
  'mcpStatus',
  'authManagement',
  'modelSelection',
  'interactivePermissions',
]

const ZONES = [
  { path: 'CLAUDE.md', kind: 'instruction' },
  { path: '.claude/agents', kind: 'agent', entry: '<name>.md' },
  { path: '.claude/skills', kind: 'skill', entry: '<name>/SKILL.md' },
]

/**
 * What the engine says about the rest of the product it is plugged into —
 * everything a seed may choose, and nothing the product has a key for.
 *
 *   mcp           health of the outbound servers, `[{ name, state, error? }]`
 *   auth          the credential as the engine sees it: `armed`, `absent`
 *                 or `invalid` (refused upstream). The stored file itself is
 *                 the seed's to write (`secrets/claude-code.token`).
 *   models        what the model picker lists
 */
export function createFakeEngine({
  scripts = [],
  mcp = [],
  auth = 'absent',
  models = [
    { id: 'bench-sonnet', label: 'Sonnet (scripted)' },
    { id: 'bench-opus', label: 'Opus (scripted)' },
  ],
} = {}) {
  const ordered = [...scripts, ...DEFAULT_SCRIPTS]
  // The credential the core hands back after loading the stored file; `refused`
  // is the upstream's verdict on it, fixed by the seed.
  let held
  let savedAt
  const refused = auth === 'invalid'
  return {
    async describe() {
      // The id of the real engine: the shell is built from the descriptor and
      // must draw what it draws for it. Not a new driver id in the product.
      return { id: 'claude-code', label: 'Claude Code (scripted)', cliVersion: 'bench', capabilities: CAPABILITIES }
    },
    async env() {
      return {}
    },
    skillsPath: () => '.claude/skills',
    agentsPath: () => '.claude/agents',
    acceptsRoots: () => true,
    instructionPaths: () => ZONES,
    listModels: async () => models,
    mcpStatus: async () => mcp,
    credentialVar: 'CLAUDE_CODE_OAUTH_TOKEN',
    setCredentials(credentials, when) {
      held = credentials.CLAUDE_CODE_OAUTH_TOKEN
      savedAt = when
    },
    async authStatus() {
      if (!held) return { state: 'absent', source: 'managed' }
      if (refused) return { state: 'invalid', source: 'managed', ...(savedAt ? { savedAt } : {}), reason: 'refused upstream: the token is no longer valid' }
      return { state: 'armed', source: 'managed', ...(savedAt ? { savedAt } : {}) }
    },
    async beginAuth() {
      return { sessionId: 'bench-arming', mode: 'api-key', inputLabel: 'Token', ttl: 600 }
    },
    async completeAuth(_sessionId, input) {
      return { secret: input.trim() }
    },
    async cancelAuth() {},
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
          stopped: Boolean(request.signal?.aborted),
          usage: { inputTokens: 100, outputTokens: 20, contextTokens: 1000 },
        }
      }
    },
  }
}
