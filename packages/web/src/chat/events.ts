/**
 * The turn events, as the browser sees them.
 *
 * Structurally identical to the driver contract's `TurnEvent`, and declared
 * here rather than imported so the web package carries no server dependency:
 * the shell talks HTTP to something that speaks this protocol, and never needs
 * to know what runs behind it. The shared shape is pinned by a test.
 */

export interface TurnUsageView {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly contextTokens?: number
  readonly costUsd?: number | null
  readonly durationMs?: number
}

export type TurnEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'tool-use'; readonly name: string; readonly target?: string }
  | { readonly type: 'tool-result'; readonly name: string; readonly ok: boolean }
  | { readonly type: 'usage-delta'; readonly outputTokens: number }
  | {
      readonly type: 'result'
      readonly sessionId: string
      readonly stopped: boolean
      readonly usage?: TurnUsageView
    }
  | { readonly type: 'error'; readonly message: string; readonly fatal: boolean }
