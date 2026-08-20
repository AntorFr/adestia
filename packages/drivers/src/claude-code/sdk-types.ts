/**
 * The narrow slice of the Agent SDK this driver actually consumes.
 *
 * Structural rather than imported wholesale, for one reason worth stating: it
 * makes the fake-SDK test suite possible. A test can hand the driver a plain
 * async generator instead of dragging a real CLI, an account and a network
 * into every run — which is what makes driver conformance testable at all.
 *
 * Shapes verified against @anthropic-ai/claude-agent-sdk 0.3.237 (sdk.d.ts).
 */

export interface ContentBlock {
  readonly type: string
  readonly name?: string
  readonly input?: unknown
  readonly is_error?: boolean
}

export interface ModelUsageEntry {
  readonly inputTokens?: number
  readonly outputTokens?: number
}

export type SdkMessage =
  | {
      readonly type: 'stream_event'
      readonly session_id?: string
      readonly event: {
        readonly type: string
        readonly delta?: { readonly type?: string; readonly text?: string }
        readonly usage?: { readonly output_tokens?: number }
      }
    }
  | {
      readonly type: 'assistant'
      readonly session_id?: string
      readonly message?: { readonly content?: readonly ContentBlock[] }
    }
  | {
      readonly type: 'user'
      readonly session_id?: string
      readonly message?: { readonly content?: readonly ContentBlock[] }
    }
  | {
      readonly type: 'result'
      readonly subtype?: string
      readonly session_id?: string
      readonly duration_ms?: number
      readonly total_cost_usd?: number
      readonly usage?: {
        readonly input_tokens?: number
        readonly output_tokens?: number
        readonly cache_read_input_tokens?: number
        readonly cache_creation_input_tokens?: number
      }
      readonly modelUsage?: Readonly<Record<string, ModelUsageEntry>>
    }

/**
 * Anything the SDK yields. Deliberately NOT a member of `SdkMessage`: a
 * catch-all with `type: string` overlaps every literal and silently destroys
 * discrimination, so the union stays closed and unknown messages are filtered
 * out by `isKnownMessage` before the switch.
 */
export interface RawMessage {
  readonly type: string
  readonly session_id?: string
}

const KNOWN_TYPES = new Set(['stream_event', 'assistant', 'user', 'result'])

/** The SDK has forty-odd message types and gains more; we consume four. */
export function isKnownMessage(message: RawMessage): message is SdkMessage {
  return KNOWN_TYPES.has(message.type)
}

export interface QueryParams {
  readonly prompt: string
  readonly options?: Record<string, unknown>
}

export type QueryHandle = AsyncIterable<RawMessage> & { interrupt(): Promise<unknown> }

export type QueryFn = (params: QueryParams) => QueryHandle
