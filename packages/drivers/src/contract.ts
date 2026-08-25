/**
 * The driver contract — what every coding-agent CLI adapter must provide, and
 * what it may optionally declare.
 *
 * The rule that shapes this file: the UI is generated from the capability
 * descriptor, so no driver name ever reaches the front end. A capability that
 * is absent is honestly absent — never a lying zero, never a hidden fallback.
 */

/** Capabilities a driver may declare. The core promises nothing on their behalf. */
export const CAPABILITIES = [
  /** Arm and refresh the CLI's own credentials from the UI. */
  'authManagement',
  /** Report token usage per turn. */
  'usageMetrics',
  /** Report the live context weight of the next message. */
  'contextBreakdown',
  /** Report cost in currency (API billing only — meaningless on a subscription). */
  'cost',
  /** Report subscription quota windows. */
  'subscriptionQuotas',
  /** Emit cumulative usage deltas *while a turn runs* (the climbing counter). */
  'liveTurnUsage',
  /** Enumerate the models the CLI offers. */
  'modelSelection',
  /** Report MCP server health. */
  'mcpStatus',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * Every capability that, when declared, obliges the driver to implement a
 * method of the same-named optional interface. Kept as data so the conformance
 * suite can check drivers mechanically instead of trusting their prose.
 */
export const CAPABILITY_METHODS: Readonly<Record<Capability, readonly string[]>> = {
  authManagement: ['authStatus', 'beginAuth', 'completeAuth', 'cancelAuth'],
  usageMetrics: [],
  contextBreakdown: [],
  cost: [],
  subscriptionQuotas: ['subscriptionQuotas'],
  liveTurnUsage: [],
  modelSelection: ['listModels'],
  mcpStatus: ['mcpStatus'],
}

/** Capabilities that only make sense alongside another one. */
export const CAPABILITY_REQUIRES: Readonly<Partial<Record<Capability, Capability>>> = {
  // All three refine what usage means; none of them stands on its own.
  contextBreakdown: 'usageMetrics',
  cost: 'usageMetrics',
  liveTurnUsage: 'usageMetrics',
}

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value)
}

/** What a driver says about itself at startup. Probed, never assumed. */
export interface DriverDescriptor {
  /** Stable id used in config (`claude-code`, `copilot-cli`). */
  readonly id: string
  /** Human label for the UI. */
  readonly label: string
  /** The CLI version actually detected on this machine — probed, not guessed. */
  readonly cliVersion: string
  readonly capabilities: readonly Capability[]
}

/**
 * The arming state machine, generalized from the predecessor's Claude
 * PKCE flow. One active arming session per driver.
 */
export type AuthState =
  /** No managed credential — legitimate: the CLI may live on its own. */
  | 'absent'
  | 'armed'
  /** Upstream refused it. Reactive detection is the norm; expiry dates are rare. */
  | 'invalid'
  | 'unknown'

export type AuthSource = 'managed' | 'cli-native'

export interface AuthStatus {
  readonly state: AuthState
  readonly source: AuthSource
  /** When the managed secret was stored. Absent when nothing is managed. */
  readonly savedAt?: string
  /** Only when the CLI actually provides one — most do not. */
  readonly expiresAt?: string
  /** Why it is invalid, in words the UI can show. */
  readonly reason?: string
}

/**
 * How the user is asked to arm this driver. The front end renders the flow from
 * `mode` alone: it must never need to know which CLI it is talking to.
 */
export type AuthMode =
  /** Open a URL, paste back a code (Claude's OAuth flow). */
  | 'url+code'
  /** Show a code, user enters it elsewhere (GitHub device flow). */
  | 'device-code'
  /** Paste a token directly. */
  | 'api-key'

export interface AuthPrompt {
  readonly sessionId: string
  readonly mode: AuthMode
  readonly authorizeUrl?: string
  readonly userCode?: string
  readonly inputLabel?: string
  /**
   * A statement the user must accept before the flow may finish, rendered as a
   * required checkbox. Generic on purpose: a driver whose CLI asks a human
   * question mid-login (Copilot asks whether it may store the token
   * unencrypted) needs somewhere to relay that question, and answering it in
   * the driver's name would be deciding for the user. The front end shows the
   * sentence and gates the button; it still never learns which CLI asked.
   */
  readonly consent?: string
  /** Seconds this prompt stays valid. */
  readonly ttl: number
}

import type { McpOAuth } from './mcp-oauth.js'

/**
 * An outbound MCP server the instance hands its driver.
 *
 * Declared here because it is part of what a driver is GIVEN, not part of how
 * plugins are validated: the server package merges the operator's layer with
 * the plugins' and hands the result over, and every driver materializes it the
 * way its own CLI expects.
 *
 * Either `command` (stdio) or `url` (http), never both — two transports, and
 * a server carrying both leaves the driver guessing.
 */
export interface McpServer {
  readonly name: string
  readonly command?: string | undefined
  readonly args?: readonly string[] | undefined
  readonly url?: string | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
  /** HTTP authorization. The operator's alone — see the extensions layer. */
  readonly headers?: Readonly<Record<string, string>> | undefined
  /**
   * Whose identity this server needs.
   *
   * `machine` (the default) — the instance's own credentials answer for it.
   * `user` — it serves somebody's OWN data (their calendar, their mail) and
   * refuses anything else, so it is reachable only on a turn that has a
   * caller. A scheduled or delegated turn has none, and therefore cannot
   * reach it at all: that is a property worth having, not a limitation to
   * work around — nothing that runs while you sleep should be able to write
   * in your calendar.
   */
  readonly identity?: 'machine' | 'user' | undefined
  /**
   * Credentials for a server that wants a short-lived OAuth token rather than
   * a fixed header.
   *
   * The product mints and refreshes it, and puts it in `Authorization` at the
   * spawn site — once per turn, which is what a token with an hour of life
   * needs and what a config file cannot do. See `McpTokens`.
   */
  readonly auth?: McpOAuth | undefined
}

export interface ModelInfo {
  readonly id: string
  readonly label?: string
}

/** Per-turn usage. Every field optional: drivers report what they actually know. */
export interface TurnUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  /**
   * Weight of the context the NEXT message re-pays — deliberately NOT the sum
   * of the turn. The harness makes one API call per tool step; summing those
   * inflates the number and misleads the user (a lesson the predecessor
   * documented the hard way).
   */
  readonly contextTokens?: number
  readonly durationMs?: number
  /** Only with the `cost` capability, and null-honest under a subscription. */
  readonly costUsd?: number | null
  readonly perModel?: Readonly<Record<string, number>>
}

/** A normalized subscription window (5-hour, weekly, …). */
export interface QuotaWindow {
  readonly id: string
  readonly label: string
  readonly utilizationPct: number
  readonly resetsAt?: string
}

export interface QuotaReport {
  readonly windows: readonly QuotaWindow[]
  /** Upstream is rate-limited: a cached reading is normal and must be labelled. */
  readonly stale: boolean
  readonly fetchedAt: string
}

/** Events a turn emits. The UI is built from these and nothing else. */
export type TurnEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'tool-use'; readonly name: string; readonly target?: string }
  | { readonly type: 'tool-result'; readonly name: string; readonly ok: boolean }
  | {
      readonly type: 'permission-request'
      readonly id: string
      readonly tool: string
      readonly detail?: string
    }
  /** Only with `liveTurnUsage`: feeds the climbing counter on the busy bubble. */
  | { readonly type: 'usage-delta'; readonly outputTokens: number }
  | {
      readonly type: 'result'
      readonly sessionId: string
      readonly stopped: boolean
      readonly usage?: TurnUsage
    }
  | { readonly type: 'error'; readonly message: string; readonly fatal: boolean }

export interface TurnRequest {
  readonly prompt: string
  /**
   * An access token asserting WHO asked for this turn.
   *
   * Handed to MCP servers declared `identity: user`, and to nothing else.
   * Absent on a turn with no caller — the clock, an inbound delegation — and
   * those turns simply do not see user-scoped servers.
   *
   * Carried on the REQUEST rather than held by the driver, deliberately: a
   * driver holds the instance's credentials, never a person's. This one
   * belongs to whoever is at the other end of the conversation, and it lives
   * exactly as long as the turn.
   */
  readonly callerToken?: string | undefined
  /** Resume this CLI session; absent means a fresh one. */
  readonly sessionId?: string
  readonly model?: string
  readonly cwd: string
}

/** The mandatory core every driver implements. */
export interface Driver {
  describe(): Promise<DriverDescriptor>
  /**
   * Where this CLI reads agent contracts, relative to the workspace.
   *
   * The driver names the location because only it knows its harness; the CORE
   * does the writing, so a driver is never handed a filesystem writer it could
   * point anywhere. A driver whose CLI has no such concept returns undefined,
   * and its contracts are delivered as instruction text instead.
   */
  skillsPath?(): string | undefined
  /**
   * Workspace paths where a file decides what the agent is ALLOWED to do —
   * permissions, hooks, sandbox settings, MCP wiring.
   *
   * Declared by the driver for the same reason as `skillsPath`: only it knows
   * its harness. The two CLIs have the same natures under different names, and
   * their zones even overlap without being identical, so a product that
   * hardcoded either one would be wrong about the other.
   *
   * What the core does with them is refuse to let a turn change them without a
   * person saying so — see `authorityEditRule`. Prefixes, relative to the
   * workspace root; a returned path covers everything beneath it.
   *
   * ⚠️ This guards FILE EDITS. A shell command that rewrites the same file is
   * not a file edit the driver can normalize, so it follows the name-based
   * policy alone: auto-allowing `Bash` reopens what this closes. Stated here
   * because the person most likely to widen that list is reading a contract,
   * not a changelog.
   */
  authorityPaths?(): readonly string[]
  /**
   * Workspace paths holding the PROSE this CLI reads as instructions.
   *
   * Declared for the same reason as the two above, and kept apart from them on
   * purpose: these are documents. Getting one wrong produces bad work, not a
   * wider blast radius, so they are the zone a person may edit from the
   * interface — the whole point being that people ask the agent to write their
   * instructions and then want to read and correct them.
   *
   * Files the CORE delivers live in here too and are excluded by their marker
   * rather than by their path: a plugin's data-format contract is a technical
   * spec nobody asked to read, and it is rewritten at every start, so offering
   * to edit it would offer an edit that silently disappears.
   */
  instructionPaths?(): readonly string[]
  /**
   * Environment merged UNDER the turn's own env at the single spawn site.
   * The core owns the secrets; the driver only says how to hand them over.
   */
  env(): Promise<Readonly<Record<string, string>>>
  runTurn(request: TurnRequest): AsyncIterable<TurnEvent>
  interrupt(sessionId: string): Promise<void>
}

export interface AuthManagement {
  authStatus(): Promise<AuthStatus>
  beginAuth(): Promise<AuthPrompt>
  /** Returns the captured secret for the CORE to persist — never the driver. */
  completeAuth(sessionId: string, input: string): Promise<{ secret: string }>
  cancelAuth(sessionId: string): Promise<void>
}

export interface ModelSelection {
  listModels(): Promise<readonly ModelInfo[]>
}

export interface SubscriptionQuotas {
  subscriptionQuotas(): Promise<QuotaReport>
}

/**
 * What one outbound MCP server is doing.
 *
 * A boolean was the first shape and it lied about the state that matters most:
 * `needs-auth` is not a failure, it is a job for a person, and rendering it as
 * "down" sends somebody debugging a network while a server waits to be logged
 * into. Five real states plus one honest absence.
 *
 * `unknown` is the state before anything has been observed. Both CLIs report
 * their servers when a SESSION starts, so an instance that has run no turn
 * genuinely does not know — and saying so beats an empty list, which reads as
 * "you have no servers" to somebody who just configured three.
 */
export interface McpServerHealth {
  readonly name: string
  readonly state: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled' | 'unknown'
  /** Why, when the CLI said. Never invented. */
  readonly error?: string
}

export interface McpStatus {
  mcpStatus(): Promise<readonly McpServerHealth[]>
}
