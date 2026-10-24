/** A stored message, as a conversation renders it. */

import type { Message } from './Bubble.js'
import type { StoredMessage } from './conversations.js'

export interface ToMessageOptions {
  /** Keep the signature cards. The chat does; a delegated conversation does not (AD-7). */
  readonly signatures?: boolean
}

export function toMessage(stored: StoredMessage, { signatures = true }: ToMessageOptions = {}): Message {
  return {
    id: stored.id,
    role: stored.role,
    text: stored.text,
    ...(stored.tools ? { tools: stored.tools } : {}),
    ...(signatures && stored.signatures ? { signatures: stored.signatures } : {}),
    ...(stored.stopped ? { stopped: stored.stopped } : {}),
    ...(stored.error ? { error: stored.error } : {}),
  }
}
