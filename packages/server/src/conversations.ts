/**
 * Conversation storage — a transcript rich enough to replay faithfully.
 *
 * The predecessor stored role and text, so a reload lost the tool trace, the
 * attachment thumbnails and every interruption marker: a truncated answer came
 * back looking complete. What is written here is what the UI drew.
 *
 * One JSONL file per conversation, appended: a crash costs the last line, not
 * the thread, and the agent can read it with `cat` if it ever needs to.
 * Conversations belong to a USER, because multi-user means per-user threads —
 * the workspace is shared, the conversations are not.
 */

import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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
}

export interface Conversation extends ConversationMeta {
  readonly messages: readonly StoredMessage[]
}

/**
 * A user id becomes a directory name, so it is hashed rather than sanitized:
 * OIDC subjects contain slashes and colons, and a "sanitize" that maps two
 * different users onto one directory is a data leak, not a formatting choice.
 */
export function userDirectory(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

/** Conversation ids come from us, but a stored id is still user-influenced. */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

export class ConversationStore {
  constructor(private readonly root: string) {}

  #dir(userId: string): string {
    return join(this.root, 'conversations', userDirectory(userId))
  }

  #file(userId: string, id: string): string {
    return join(this.#dir(userId), `${id}.jsonl`)
  }

  async create(userId: string, title = 'New conversation'): Promise<ConversationMeta> {
    const id = randomUUID()
    const meta: ConversationMeta = { id, title, updatedAt: new Date().toISOString() }
    await mkdir(this.#dir(userId), { recursive: true })
    await appendFile(this.#file(userId, id), `${JSON.stringify({ type: 'meta', ...meta })}\n`)
    return meta
  }

  async append(userId: string, id: string, message: StoredMessage): Promise<void> {
    if (!isSafeId(id)) throw new Error(`unsafe conversation id: ${id}`)
    await mkdir(this.#dir(userId), { recursive: true })
    await appendFile(this.#file(userId, id), `${JSON.stringify({ type: 'message', ...message })}\n`)
  }

  /** Records which CLI session this thread resumes, so a reload can continue it. */
  async setSession(userId: string, id: string, sessionId: string): Promise<void> {
    if (!isSafeId(id)) throw new Error(`unsafe conversation id: ${id}`)
    await appendFile(
      this.#file(userId, id),
      `${JSON.stringify({ type: 'session', sessionId, at: new Date().toISOString() })}\n`,
    )
  }

  async read(userId: string, id: string): Promise<Conversation | undefined> {
    if (!isSafeId(id)) return undefined
    let raw: string
    try {
      raw = await readFile(this.#file(userId, id), 'utf8')
    } catch {
      return undefined
    }

    let meta: ConversationMeta = { id, title: 'Conversation', updatedAt: '' }
    const messages: StoredMessage[] = []
    let sessionId: string | undefined

    for (const line of raw.split('\n')) {
      if (line.trim() === '') continue
      let entry: Record<string, unknown>
      try {
        entry = JSON.parse(line) as Record<string, unknown>
      } catch {
        // A half-written last line is what a crash mid-append looks like.
        // Losing it beats refusing to open the whole thread.
        continue
      }
      if (entry['type'] === 'meta') meta = { ...meta, ...(entry as unknown as ConversationMeta) }
      else if (entry['type'] === 'session') sessionId = entry['sessionId'] as string
      else if (entry['type'] === 'message') messages.push(entry as unknown as StoredMessage)
    }

    const last = messages.at(-1)
    return {
      ...meta,
      id,
      ...(sessionId ? { sessionId } : {}),
      updatedAt: last?.at ?? meta.updatedAt,
      messages,
    }
  }

  async list(userId: string): Promise<readonly ConversationMeta[]> {
    let files: string[]
    try {
      files = (await readdir(this.#dir(userId))).filter((name) => name.endsWith('.jsonl'))
    } catch {
      return []
    }

    const metas: ConversationMeta[] = []
    for (const file of files) {
      const conversation = await this.read(userId, file.replace(/\.jsonl$/, ''))
      if (conversation) {
        const { messages: _messages, ...meta } = conversation
        metas.push(meta)
      }
    }
    // Most recent first: a thread list ordered by id is a list nobody scans.
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async rename(userId: string, id: string, title: string): Promise<void> {
    if (!isSafeId(id)) throw new Error(`unsafe conversation id: ${id}`)
    await appendFile(
      this.#file(userId, id),
      `${JSON.stringify({ type: 'meta', id, title, updatedAt: new Date().toISOString() })}\n`,
    )
  }

  async remove(userId: string, id: string): Promise<boolean> {
    if (!isSafeId(id)) return false
    try {
      await unlink(this.#file(userId, id))
      return true
    } catch {
      return false
    }
  }

  /**
   * Rewrites the file with only its current state. Append-only logs grow
   * without bound, and a thread someone has renamed six times replays six
   * meta lines on every open.
   */
  async compact(userId: string, id: string): Promise<void> {
    const conversation = await this.read(userId, id)
    if (!conversation) return

    const { messages, ...meta } = conversation
    const lines = [
      JSON.stringify({ type: 'meta', ...meta }),
      ...(conversation.sessionId
        ? [JSON.stringify({ type: 'session', sessionId: conversation.sessionId })]
        : []),
      ...messages.map((message) => JSON.stringify({ type: 'message', ...message })),
    ]

    const path = this.#file(userId, id)
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, `${lines.join('\n')}\n`)
    await rename(temporary, path)
  }

  async size(userId: string, id: string): Promise<number> {
    try {
      return (await stat(this.#file(userId, id))).size
    } catch {
      return 0
    }
  }
}
