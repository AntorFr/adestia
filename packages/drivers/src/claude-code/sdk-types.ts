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

/**
 * What `options.mcpServers` accepts, verified against sdk.d.ts: a record of
 * name → config, discriminated by `type`.
 */
export type McpServerConfig =
  | {
      readonly type: 'stdio'
      readonly command: string
      readonly args?: readonly string[]
      readonly env?: Readonly<Record<string, string>>
    }
  | {
      readonly type: 'http'
      readonly url: string
      readonly headers?: Readonly<Record<string, string>>
    }

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
      /**
       * Session metadata, emitted ahead of everything else in a turn. Consumed
       * for exactly one field: what the MCP servers are doing. The CLI reports
       * them when a SESSION starts, so this is the only moment their state is
       * knowable without opening a session just to ask.
       */
      readonly type: 'system'
      readonly subtype?: string
      readonly session_id?: string
      readonly mcpServers?: readonly {
        readonly name: string
        readonly status?: string
        readonly error?: string
      }[]
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

const KNOWN_TYPES = new Set(['stream_event', 'assistant', 'user', 'result', 'system'])

/** The SDK has forty-odd message types and gains more; we consume five. */
export function isKnownMessage(message: RawMessage): message is SdkMessage {
  return KNOWN_TYPES.has(message.type)
}

export interface QueryParams {
  readonly prompt: string
  readonly options?: Record<string, unknown>
}

export type QueryHandle = AsyncIterable<RawMessage> & { interrupt(): Promise<unknown> }

export type QueryFn = (params: QueryParams) => QueryHandle
