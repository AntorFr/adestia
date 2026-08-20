/**
 * The Copilot CLI's JSONL, translated into Golem's turn events.
 *
 * Every shape here was captured from the real binary (1.0.80) during spike 3 —
 * see `spikes/copilot-cli/REPORT.md` — but the schema is UNDOCUMENTED, so this
 * parser is deliberately tolerant: an unknown event type is ignored rather
 * than fatal, and a malformed line costs itself and nothing else. A CLI that
 * adds an event must not take the product down.
 */

import type { TurnEvent, TurnUsage } from '../contract.js'

/** The envelope every line shares. */
export interface CopilotEvent {
  readonly type: string
  readonly data?: Record<string, unknown>
  readonly ephemeral?: boolean
}

export function parseLine(line: string): CopilotEvent | undefined {
  const trimmed = line.trim()
  if (trimmed === '') return undefined
  try {
    const parsed = JSON.parse(trimmed) as CopilotEvent
    return typeof parsed?.type === 'string' ? parsed : undefined
  } catch {
    // Not fatal: the CLI writes progress to the same stream, and one
    // unparseable line must not end a turn that is otherwise fine.
    return undefined
  }
}

/**
 * The name and a SHORT target — never the arguments.
 *
 * Same privacy rule as the Claude driver: a tool's input routinely carries a
 * file's contents or an entire command, and a trace is a witness, not an
 * archive.
 */
const MAX_TARGET = 78

export function toolTargetOf(data: Record<string, unknown> | undefined): string | undefined {
  const args = data?.['arguments']
  if (typeof args === 'string') return truncate(args)
  if (typeof args !== 'object' || args === null) return undefined

  const record = args as Record<string, unknown>
  for (const field of ['command', 'path', 'file_path', 'pattern', 'url', 'query']) {
    const value = record[field]
    if (typeof value === 'string' && value.length > 0) return truncate(value)
  }
  return undefined
}

function truncate(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= MAX_TARGET ? flat : `${flat.slice(0, MAX_TARGET - 1)}…`
}

export function usageOf(data: Record<string, unknown> | undefined): TurnUsage | undefined {
  const usage = data?.['usage']
  if (typeof usage !== 'object' || usage === null) return undefined
  const record = usage as Record<string, unknown>

  const durationMs = record['sessionDurationMs']
  return {
    // No token counts on this line: `premiumRequests` is a request count, and
    // reporting it as tokens would put a number in the context pill that means
    // something entirely different. The per-call token data lives in the
    // session store, which is a separate capability.
    ...(typeof durationMs === 'number' ? { durationMs } : {}),
    costUsd: null,
  }
}

export interface TranslationState {
  /** Tool calls awaiting their result, by call id. */
  readonly pending: Map<string, string>
  sessionId: string
  stopped: boolean
}

export function newTranslationState(sessionId = ''): TranslationState {
  return { pending: new Map(), sessionId, stopped: false }
}

/**
 * One JSONL event in, zero or more turn events out.
 *
 * Streaming deltas come from `assistant.message_delta`; the non-ephemeral
 * `assistant.message` that follows carries the same text in full, so it is
 * deliberately NOT emitted — doing both would print every answer twice.
 */
export function translate(event: CopilotEvent, state: TranslationState): readonly TurnEvent[] {
  const data = event.data ?? {}

  switch (event.type) {
    case 'assistant.message_delta': {
      const delta = data['deltaContent']
      return typeof delta === 'string' && delta !== ''
        ? [{ type: 'text-delta', text: delta }]
        : []
    }

    case 'tool.execution_start': {
      const id = String(data['toolCallId'] ?? '')
      const name = String(data['toolName'] ?? 'tool')
      if (id) state.pending.set(id, name)
      const target = toolTargetOf(data)
      return [{ type: 'tool-use', name, ...(target === undefined ? {} : { target }) }]
    }

    case 'tool.execution_complete': {
      const id = String(data['toolCallId'] ?? '')
      const name = state.pending.get(id) ?? String(data['toolName'] ?? 'tool')
      state.pending.delete(id)
      return [{ type: 'tool-result', name, ok: data['success'] !== false }]
    }

    case 'session.mcp_server_status_changed': {
      // Surfaced as a non-fatal error: an MCP server that failed to start is
      // why a tool the user expects is missing, and silence there sends them
      // looking at the agent instead of at their config.
      if (data['status'] !== 'failed') return []
      const server = String(data['serverName'] ?? 'an MCP server')
      const detail = data['error'] ? `: ${String(data['error'])}` : ''
      return [{ type: 'error', message: `MCP server "${server}" failed to start${detail}`, fatal: false }]
    }

    case 'result': {
      const sessionId = String(data['sessionId'] ?? state.sessionId)
      state.sessionId = sessionId
      const exitCode = data['exitCode']
      const usage = usageOf(data)
      return [
        {
          type: 'result',
          sessionId,
          stopped: state.stopped || (typeof exitCode === 'number' && exitCode !== 0),
          ...(usage ? { usage } : {}),
        },
      ]
    }

    default:
      // Unknown types are ignored, on purpose: the CLI emits far more than
      // this driver consumes, and it gains new ones between releases.
      return []
  }
}
