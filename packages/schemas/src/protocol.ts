/**
 * The protocol between the server and the browser — the shapes that cross
 * the wire, declared once.
 *
 * Each of these used to be written twice, on either side, so that the web
 * package carried no server code; a test pinned the two copies together.
 * Declared here they are imported as TYPES only, which the compiler erases:
 * the shell's bundle still holds nothing of the server, and there is nothing
 * left to drift. The turn events are not here on purpose: the browser reads
 * the very events the engine emitted, relayed frame by frame, so their one
 * declaration is the driver contract's.
 */

export interface StoredMessage {
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly text: string
  readonly at: string
  readonly tools?: readonly { name: string; target?: string; ok?: boolean }[]
  readonly stopped?: boolean
  readonly error?: string
  readonly usage?: { contextTokens?: number; outputTokens?: number }
}

export interface ConversationMeta {
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  /** The CLI session this thread resumes; absent once it has expired. */
  readonly sessionId?: string
  /**
   * Put away rather than deleted.
   *
   * A thread nobody needs today is not a thread nobody will want next month,
   * and the only tool for that was a delete that took the whole record with
   * it. Archiving hides it from the list and keeps every word.
   */
  readonly archived?: boolean
  /**
   * What the desk is doing for this thread right now, when anything.
   *
   * Computed by the server per request, never stored: 'running' feeds the
   * working dot, 'waiting' the one that says the engine is blocked on a
   * person. Absent means at rest — the honest default for a listing that
   * mostly shows finished conversations.
   */
  readonly turn?: 'running' | 'waiting'
}

export interface Conversation extends ConversationMeta {
  readonly messages: readonly StoredMessage[]
}

/** Where an outbound MCP server was declared. Only `ui` is the shell's to change. */
export type McpSource = 'config' | 'plugin' | 'ui'

/** One outbound MCP server, as the browser may see it. */
export interface McpServerView {
  readonly name: string
  readonly source: McpSource
  /** The plugin that brought it, when one did. */
  readonly owner?: string
  readonly editable: boolean
  readonly transport: 'stdio' | 'http'
  /** The declaration itself, secrets masked. What the detail screen draws. */
  readonly config: Readonly<Record<string, unknown>>
  /**
   * A `ui` server whose name the config or a plugin has since taken.
   *
   * The write path refuses a collision, so this only happens when a file was
   * edited behind us — and a server silently doing nothing is exactly the
   * failure the layered merge exists to make visible.
   */
  readonly shadowed?: boolean
}
