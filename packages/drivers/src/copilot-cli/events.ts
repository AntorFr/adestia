/**
 * The Copilot CLI's JSONL, translated into Adestia's turn events.
 *
 * Every shape here was captured from the real binary (1.0.80) during spike 3 —
 * see `spikes/copilot-cli/REPORT.md` — but the schema is UNDOCUMENTED, so this
 * parser is deliberately tolerant: an unknown event type is ignored rather
 * than fatal, and a malformed line costs itself and nothing else. A CLI that
 * adds an event must not take the product down.
 */

import type { McpServerHealth, TurnEvent, TurnUsage } from '../contract.js'

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
  /**
   * What the session said about its MCP servers, by name.
   *
   * Accumulated rather than replaced: the CLI announces the whole set once
   * (`mcp_servers_loaded`) and then amends one server at a time
   * (`mcp_server_status_changed`), so replacing on the second kind would leave
   * the panel reporting one server and forgetting the rest.
   */
  readonly mcp: Map<string, McpServerHealth>
}

export function newTranslationState(sessionId = ''): TranslationState {
  return { pending: new Map(), sessionId, stopped: false, mcp: new Map() }
}

/**
 * The CLI's status words, in the contract's.
 *
 * A word this table has never met becomes `unknown` rather than `failed`: a
 * state the CLI invents is not evidence that a server is down, and saying
 * "down" about a working server is the more expensive mistake.
 */
const HEALTH_STATES = new Set(['connected', 'failed', 'needs-auth', 'pending', 'disabled'])

function health(name: string, status: unknown, error: unknown): McpServerHealth {
  return {
    name,
    state: (HEALTH_STATES.has(String(status ?? ''))
      ? String(status)
      : 'unknown') as McpServerHealth['state'],
    ...(error ? { error: String(error) } : {}),
  }
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
      return [
        { type: 'tool-use', name, ...(target === undefined ? {} : { target }), ...(id ? { id } : {}) },
      ]
    }

    case 'tool.execution_complete': {
      const id = String(data['toolCallId'] ?? '')
      const name = state.pending.get(id) ?? String(data['toolName'] ?? 'tool')
      state.pending.delete(id)
      return [{ type: 'tool-result', name, ok: data['success'] !== false, ...(id ? { id } : {}) }]
    }

    case 'session.mcp_servers_loaded': {
      // The whole set, once, when the session opens. Recorded rather than
      // announced: it is the state of the plumbing, not an event of the
      // conversation.
      const servers = data['servers'] ?? data['mcpServers']
      if (Array.isArray(servers)) {
        for (const entry of servers as Record<string, unknown>[]) {
          const name = String(entry['name'] ?? entry['serverName'] ?? '')
          if (name) state.mcp.set(name, health(name, entry['status'], entry['error']))
        }
      }
      return []
    }

    case 'session.mcp_server_status_changed': {
      const name = String(data['serverName'] ?? '')
      if (name) state.mcp.set(name, health(name, data['status'], data['error']))
      // Surfaced as a non-fatal error: an MCP server that failed to start is
      // why a tool the user expects is missing, and silence there sends them
      // looking at the agent instead of at their config.
      if (data['status'] !== 'failed') return []
      const server = String(data['serverName'] ?? 'an MCP server')
      const detail = data['error'] ? `: ${String(data['error'])}` : ''
      return [{ type: 'error', message: `MCP server "${server}" failed to start${detail}`, fatal: false }]
    }

    case 'result': {
      // `result` is the ONE event this CLI does not wrap in `data`. Every
      // capture in `spikes/copilot-cli/raw` shows `sessionId`, `exitCode` and
      // `usage` as siblings of `type`, with no `data` key at all, while every
      // other event type has one — which is why reading `data` uniformly was
      // right everywhere above and wrong here.
      //
      // What it cost: the id stored was the empty string, so `--resume` was
      // never passed and every message opened a fresh CLI session. A thread
      // that forgets itself between turns, with nothing in any log to say so.
      //
      // Both shapes are read, the flat one FIRST because it is the one the
      // shipped CLI emits; `data` stays as the fallback rather than being
      // dropped, since no capture proves the other shape never existed.
      const top = event as unknown as Record<string, unknown>
      // Blank counts as absent, not as an answer. `??` alone would not do it:
      // an empty string is neither null nor undefined, so a CLI that sent the
      // key empty would overwrite a known id with nothing and bring this exact
      // bug back — silently, since the symptom is only a thread with no past.
      const stated = [top['sessionId'], data['sessionId']]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .find((value) => value !== '')
      const sessionId = stated ?? state.sessionId
      state.sessionId = sessionId
      const exitCode = top['exitCode'] ?? data['exitCode']
      const usage = usageOf('usage' in top ? top : data)
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
