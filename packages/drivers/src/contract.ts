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
  /**
   * Route the engine's own permission questions to a person, and carry an
   * answer back into the running turn.
   *
   * Declared, never assumed, because one engine on two cannot: Claude's SDK
   * has a callback the turn waits on; Copilot in programmatic mode has no
   * return channel at all and auto-denies what it would have asked. An
   * instance configured to ask on an engine that cannot is refused at boot
   * rather than silently turning every question into a refusal.
   */
  'interactivePermissions',
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
  // No method: this one is honoured in the turn's EVENT STREAM (a
  // `permission-request` the UI answers), not through an interface the
  // conformance suite could call.
  interactivePermissions: [],
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

/**
 * One parameter of a shell tool. Strings only, deliberately: the first tools
 * need nothing else, and a widening here must be argued, not defaulted into.
 */
export interface ShellToolParam {
  readonly name: string
  readonly description: string
  /** Absent means required — the common case reads shortest. */
  readonly optional?: boolean
}

export interface ShellToolSpec {
  readonly name: string
  readonly description: string
  readonly params: readonly ShellToolParam[]
}

export type ShellToolOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string }

/**
 * The instance's OWN tools — the agent acting on the product that runs it
 * (rename this conversation, mint an id) — handed to the driver for one turn.
 *
 * The shape is the whole doctrine. The agent never names its target: the
 * handle was minted for one turn of one conversation, and the server resolves
 * user and thread on its own side (`call` closes over them; the socket path
 * resolves the token to the same context). Ids stay plumbing between server
 * and driver; the model only ever handles meaning.
 *
 * Two ways in, one dispatch. A driver that can host tools in-process calls
 * `call` directly; a driver whose engine is a separate binary points a stdio
 * MCP server at `bridgePath` — a dumb pipe to `socketPath`, announcing
 * `token` — and the server ends up in the same dispatch. Measured before
 * committed (spikes/shell-tools-transport): the stdio server respawns on
 * every turn, so a per-turn token in its env is fresh by construction.
 */
export interface ShellToolsHandle {
  readonly socketPath: string
  /** Valid for this turn only; revoked when the turn settles. */
  readonly token: string
  /** The generic stdio↔socket bridge, written by the server. Secret-free. */
  readonly bridgePath: string
  readonly tools: readonly ShellToolSpec[]
  call(name: string, args: Readonly<Record<string, unknown>>): Promise<ShellToolOutcome>
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
  /**
   * `id` pairs a result with its call. Names cannot: an agent calls `Read`
   * five times in one breath, and two calls of the same name overlap often
   * enough that "the most recent unresolved one" marks the wrong row. A
   * driver that has no such id omits it and the consumer falls back to the
   * name — correct for a driver whose calls never overlap.
   */
  | {
      readonly type: 'tool-use'
      readonly name: string
      readonly target?: string
      readonly id?: string
    }
  | { readonly type: 'tool-result'; readonly name: string; readonly ok: boolean; readonly id?: string }
  /**
   * Only with `interactivePermissions`, and only when the instance is in
   * `ask` posture: the ENGINE decided this call needs a person.
   *
   * Adestia does not judge — no lists, no rules, no content gates. The CLI's own
   * first line already let the harmless through (a `Read`, an `echo` never
   * reach here); what surfaces is its residue, worded by the engine itself.
   */
  | {
      readonly type: 'permission-request'
      readonly id: string
      readonly tool: string
      /** The engine's own sentence — never reconstructed, never truncated. */
      readonly title: string
      /** Why it asked, when the engine says. */
      readonly reason?: string
      /**
       * Whether "for this conversation" can be offered.
       *
       * True when the engine handed suggestions to remember the answer. False
       * means the option is HIDDEN rather than shown and quietly ineffective —
       * a button that promises silence and does not deliver it is worse than
       * one more question.
       */
      readonly remembering: boolean
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
  /**
   * Nobody is watching this turn — a scheduled note, an inbound delegation.
   *
   * In `ask` posture it makes every question the engine raises resolve at
   * once as a refusal, instead of holding one of the instance's turn slots
   * for five minutes waiting on a person who was never there. Carried on the
   * REQUEST because only the product knows who is at the other end.
   */
  readonly unattended?: boolean
  /** Resume this CLI session; absent means a fresh one. */
  readonly sessionId?: string
  readonly model?: string
  readonly cwd: string
  /**
   * Directories the agent may work in BESIDES `cwd`.
   *
   * Memory can be composed of several stores, and a shared circle lives on its
   * own mount — outside the workspace, by design, since a circle a peer writes
   * has no business inside this instance's home. The agent still edits pages
   * with its own file tools, so those directories have to be declared to the
   * CLI or its permission layer refuses them: it would ASK on every read of a
   * store the operator deliberately mounted.
   *
   * Declared rather than obtained by relocating the stores under `cwd`, which
   * would hand the physical layout back to the operator we just relieved of
   * it; and rather than by serving the agent a filesystem API of our own,
   * which would cost it `Grep` — searching its own memory by content — and
   * `Edit`, whose exact-match rewrite is where silent corruption is born when
   * reimplemented. A driver whose CLI has no such notion simply ignores this,
   * and the boot log says so.
   */
  readonly roots?: readonly string[] | undefined
  /**
   * The instance's own tools for this turn. Absent on a turn with no
   * conversation — a scheduled note, an inbound delegation — which therefore
   * has nothing to rename and no reason to hold a turn token.
   */
  readonly tools?: ShellToolsHandle | undefined
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
   * Whether this CLI can be told to work in directories besides `cwd`.
   *
   * Asked at BOOT rather than discovered in a turn: on a driver that cannot,
   * a store mounted outside the workspace is refused read by read, and the
   * failure reads as an agent that has gone stupid. The operator is told the
   * fallback — put the stores under the workspace — before anybody meets it.
   */
  acceptsRoots?(): boolean
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
