/**
 * Signature requests read out of a tool result.
 *
 * The hub's façade (Tessera) answers a call it holds with a sentence for the
 * agent, and that sentence carries a ceremony link — the notification floor of
 * its protocol. Left to the agent, the link reaches the person only if the
 * model thinks to repeat it; read here, the shell can put a card in the thread
 * whatever the model says.
 *
 * Two shapes, both Tessera's own words:
 *
 * - `CONSENT PENDING` — an immediate consent. The call is held, the signature
 *   is valid for minutes, and the agent must call again once it is given.
 * - `REQUEST OPENED` — a grant asked for ahead of time (what a scheduled task
 *   needs, since nobody is there to sign at 06:30). Nothing waits on it; the
 *   covered call simply stops suspending once it is signed.
 *
 * A driver reads, it does not trust: any origin is reported here, and the
 * server keeps only the ones its configuration names. A link in a web page the
 * agent fetched is not a ceremony because it has the right words around it.
 */

import type { TurnEvent } from './contract.js'

export type SignatureRequest = Extract<TurnEvent, { type: 'signature-request' }>

const CEREMONY = /https?:\/\/[^\s"'<>()]+?\/consent\/([A-Za-z0-9_-]+)/
const CONSENT_EXPIRES = /\(expires ([0-9T:.+-]+Z?)\)/
const GRANT_LAPSES = /lapses at ([0-9T:.+-]+Z?)/

/** The signature request one piece of tool output announces, if any. */
export function signatureRequest(text: string): SignatureRequest | undefined {
  const kind = text.includes('REQUEST OPENED')
    ? 'grant'
    : text.includes('CONSENT PENDING')
      ? 'consent'
      : undefined
  if (kind === undefined) return undefined
  const link = CEREMONY.exec(text)
  if (!link) return undefined
  const expires = (kind === 'grant' ? GRANT_LAPSES : CONSENT_EXPIRES).exec(text)?.[1]
  return {
    type: 'signature-request',
    id: link[1]!,
    kind,
    url: link[0],
    ...(expires === undefined ? {} : { expiresAt: expires }),
  }
}

/**
 * Every string inside a tool result, whatever the engine wrapped it in.
 *
 * Three engines, three envelopes: a bare string or a list of text blocks
 * (claude-code), an MCP `content` array under `result` (codex), a `result`
 * record (copilot). Walking the value spares each driver from knowing the
 * others' — and from breaking the day an engine nests it one level deeper.
 * Bounded, because a tool result can be a whole file.
 */
export function textsOf(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || out.length > 64) return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) textsOf(item, depth + 1, out)
  else if (typeof value === 'object' && value !== null)
    for (const item of Object.values(value)) textsOf(item, depth + 1, out)
  return out
}

/** The signature requests a tool result announces, one per ceremony. */
export function signatureRequests(result: unknown): SignatureRequest[] {
  const found = new Map<string, SignatureRequest>()
  for (const text of textsOf(result)) {
    const request = signatureRequest(text)
    if (request && !found.has(request.id)) found.set(request.id, request)
  }
  return [...found.values()]
}
