/**
 * The app-server's notifications, translated into Adestia's turn events.
 *
 * Every shape here was captured in spike 5 — against a local mock provider for
 * the stream, and against a real ChatGPT account to confirm the two are
 * identical. The protocol has a generated schema, which makes it far better
 * documented than Copilot's JSONL, but it is still marked `[experimental]`, so
 * the same rule holds: an unknown notification is ignored rather than fatal.
 */

import type { McpServerHealth, TurnEvent, TurnUsage } from '../contract.js'

export interface Notification {
  readonly method?: string
  readonly params?: Record<string, unknown>
}

/** The name and a SHORT target — never the whole command. */
const MAX_TARGET = 78

function truncate(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= MAX_TARGET ? flat : `${flat.slice(0, MAX_TARGET - 1)}…`
}

/**
 * What a trace row says this item did.
 *
 * Codex offers the model ONE tool that touches files — a PTY shell — so where
 * Claude shows `Read`/`Edit`/`Grep` and Copilot shows `view`/`create`/`grep`,
 * this engine shows shell lines. The contract allows it (`name` and `target`
 * are free strings) and nothing else would be truthful: naming a row "Edit"
 * because the command happened to contain `apply_patch` would be the driver
 * inventing structure the engine does not have.
 */
export function describeItem(item: Record<string, unknown>): { name: string; target?: string } {
  const type = String(item['type'] ?? 'item')
  switch (type) {
    case 'commandExecution': {
      const command = item['command']
      return { name: 'shell', ...(typeof command === 'string' ? { target: truncate(stripShellWrapper(command)) } : {}) }
    }
    case 'fileChange': {
      const path = item['path'] ?? item['file'] ?? item['cwd']
      return { name: 'edit', ...(typeof path === 'string' ? { target: truncate(path) } : {}) }
    }
    case 'mcpToolCall': {
      const server = item['server'] ?? item['serverName']
      const tool = item['tool'] ?? item['toolName']
      const name = typeof tool === 'string' ? tool : 'mcp'
      return { name, ...(typeof server === 'string' ? { target: truncate(server) } : {}) }
    }
    case 'webSearch': {
      const query = item['query']
      return { name: 'search', ...(typeof query === 'string' ? { target: truncate(query) } : {}) }
    }
    default:
      return { name: type }
  }
}

/**
 * `/bin/zsh -lc 'git status'` reads as noise; `git status` reads as the thing
 * that happened. The wrapper is the CLI's, not the model's — it is the same on
 * every row, so keeping it would cost width on every line and say nothing.
 */
function stripShellWrapper(command: string): string {
  const trimmed = command.trim()
  // Quoted is the common form; UNQUOTED is what a one-word command produces
  // (`/bin/zsh -lc ls`), and the first version of this matched only the quoted
  // one — so the shortest commands, the rows with the most room to show
  // something useful, were the ones that showed the wrapper instead. Found by
  // looking at a real turn, not by a test.
  const quoted = /^\S*(?:sh|bash|zsh)\s+-[a-z]*c\s+(['"])([\s\S]*)\1\s*$/.exec(trimmed)
  if (quoted?.[2] !== undefined) return quoted[2]
  const bare = /^\S*(?:sh|bash|zsh)\s+-[a-z]*c\s+([\s\S]+)$/.exec(trimmed)
  return bare?.[1] ?? trimmed
}

/** Items that are conversation, not action — they must never become trace rows. */
const NOT_TOOLS = new Set(['agentMessage', 'userMessage', 'reasoning', 'error', 'todoList', 'plan'])

export function usageOf(total: Record<string, unknown> | undefined): TurnUsage | undefined {
  if (!total) return undefined
  const number = (key: string): number | undefined => {
    const value = total[key]
    return typeof value === 'number' ? value : undefined
  }
  const inputTokens = number('inputTokens')
  const outputTokens = number('outputTokens')
  const cacheReadTokens = number('cachedInputTokens')
  const cacheWriteTokens = number('cacheWriteInputTokens')
  if (inputTokens === undefined && outputTokens === undefined) return undefined
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
  }
}

export interface TranslationState {
  threadId: string
  stopped: boolean
  /** Last cumulative output-token reading, so deltas are deltas. */
  lastOutputTokens: number
  usage: TurnUsage | undefined
  /** What the servers of THIS thread are doing, by name. */
  readonly mcp: Map<string, McpServerHealth>
  finished: boolean
}

export function newTranslationState(threadId = ''): TranslationState {
  return { threadId, stopped: false, lastOutputTokens: 0, usage: undefined, mcp: new Map(), finished: false }
}

/**
 * The CLI's startup words, in the contract's.
 *
 * `starting` is `pending`, `ready` is `connected`, `failed` is `failed`. A word
 * this table has never met becomes `unknown` rather than `failed`: a state the
 * CLI invents is not evidence a server is down.
 */
function health(name: string, status: unknown, error: unknown): McpServerHealth {
  const raw = String(status ?? '')
  const state: McpServerHealth['state'] =
    raw === 'ready' ? 'connected' : raw === 'starting' ? 'pending' : raw === 'failed' ? 'failed' : 'unknown'
  return { name, state, ...(error ? { error: String(error) } : {}) }
}

/** One notification in, zero or more turn events out. */
export function translate(notification: Notification, state: TranslationState): readonly TurnEvent[] {
  const params = notification.params ?? {}

  switch (notification.method) {
    case 'thread/started': {
      const thread = params['thread']
      const id = typeof thread === 'object' && thread !== null ? (thread as Record<string, unknown>)['id'] : undefined
      if (typeof id === 'string' && id !== '') state.threadId = id
      return []
    }

    case 'item/agentMessage/delta': {
      const delta = params['delta']
      return typeof delta === 'string' && delta !== '' ? [{ type: 'text-delta', text: delta }] : []
    }

    case 'item/started': {
      const item = params['item']
      if (typeof item !== 'object' || item === null) return []
      const record = item as Record<string, unknown>
      const type = String(record['type'] ?? '')
      // The completed agentMessage repeats in full what the deltas carried;
      // neither end of it is a trace row.
      if (NOT_TOOLS.has(type)) return []
      const id = typeof record['id'] === 'string' ? record['id'] : undefined
      const { name, target } = describeItem(record)
      return [{ type: 'tool-use', name, ...(target === undefined ? {} : { target }), ...(id ? { id } : {}) }]
    }

    case 'item/completed': {
      const item = params['item']
      if (typeof item !== 'object' || item === null) return []
      const record = item as Record<string, unknown>
      const type = String(record['type'] ?? '')
      if (type === 'error') {
        const message = record['message']
        return typeof message === 'string' ? [{ type: 'error', message, fatal: false }] : []
      }
      if (NOT_TOOLS.has(type)) return []
      const id = typeof record['id'] === 'string' ? record['id'] : undefined
      const { name } = describeItem(record)
      const status = String(record['status'] ?? '')
      const exitCode = record['exit_code'] ?? record['exitCode']
      const ok =
        status === 'failed' || status === 'declined'
          ? false
          : typeof exitCode === 'number'
            ? exitCode === 0
            : true
      return [{ type: 'tool-result', name, ok, ...(id ? { id } : {}) }]
    }

    case 'thread/tokenUsage/updated': {
      const usage = params['tokenUsage']
      if (typeof usage !== 'object' || usage === null) return []
      const total = (usage as Record<string, unknown>)['total']
      const totals = typeof total === 'object' && total !== null ? (total as Record<string, unknown>) : undefined
      state.usage = usageOf(totals) ?? state.usage
      const output = totals?.['outputTokens']
      if (typeof output !== 'number') return []
      // Cumulative on the wire, a delta in the contract: the climbing counter
      // on the busy bubble adds what it is given.
      const delta = output - state.lastOutputTokens
      state.lastOutputTokens = output
      return delta > 0 ? [{ type: 'usage-delta', outputTokens: delta }] : []
    }

    case 'mcpServer/startupStatus/updated': {
      const name = String(params['name'] ?? '')
      if (name === '') return []
      const status = params['status']
      const error = params['error'] ?? params['failureReason']
      state.mcp.set(name, health(name, status, error))
      if (status !== 'failed') return []
      const detail = error ? `: ${String(error)}` : ''
      return [{ type: 'error', message: `MCP server "${name}" failed to start${detail}`, fatal: false }]
    }

    case 'error':
    case 'warning': {
      const message = params['message']
      if (typeof message !== 'string' || message === '') return []
      return [{ type: 'error', message, fatal: false }]
    }

    case 'turn/completed': {
      state.finished = true
      const turn = params['turn']
      const status =
        typeof turn === 'object' && turn !== null ? String((turn as Record<string, unknown>)['status'] ?? '') : ''
      return [
        {
          type: 'result',
          sessionId: state.threadId,
          stopped: state.stopped || (status !== '' && status !== 'completed'),
          ...(state.usage ? { usage: state.usage } : {}),
        },
      ]
    }

    case 'turn/failed': {
      state.finished = true
      const error = params['error']
      const message =
        typeof error === 'object' && error !== null
          ? String((error as Record<string, unknown>)['message'] ?? 'the turn failed')
          : 'the turn failed'
      return [
        { type: 'error', message, fatal: true },
        { type: 'result', sessionId: state.threadId, stopped: true, ...(state.usage ? { usage: state.usage } : {}) },
      ]
    }

    default:
      // The protocol has 81 notification kinds and this driver consumes a
      // dozen. Ignoring the rest is the point, not an omission.
      return []
  }
}
