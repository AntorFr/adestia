/**
 * Where a rotated MCP refresh token lives between restarts.
 *
 * A refresh token minted through an interactive login is the only way back in
 * without asking the person again, and OAuth 2.1 servers rotate it on every
 * use — so the latest must outlive the process. Kept beside the driver
 * credential, at 0600, keyed by `tokenUrl|clientId`.
 *
 * Writes are serialized through one promise chain: two turns rotating two
 * different identities at once would otherwise read-modify-write the same file
 * and lose one of the two.
 */

import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import type { RefreshStore } from '@antorfr/golem-drivers'

/** What the file turned out to be, when somebody went to read it. */
type Held =
  | { readonly kind: 'map'; readonly map: Record<string, string> }
  | { readonly kind: 'unreadable'; readonly why: string }
  | { readonly kind: 'corrupt' }

export class FileRefreshStore implements RefreshStore {
  readonly #path: string
  readonly #report: (message: string) => void
  #queue: Promise<unknown> = Promise.resolve()

  /**
   * @param report says a failed write out loud. A turn survives on the token
   *   held in memory, so nothing looks wrong until a restart asks for a login
   *   nobody expected — an operator gets to see the cause at the moment it
   *   happens rather than a week later.
   */
  constructor(dataDir: string, report: (message: string) => void = () => {}) {
    this.#path = join(dataDir, 'secrets', 'mcp-refresh.json')
    this.#report = report
  }

  /**
   * What the file holds, as one of three ANSWERS rather than a best effort.
   *
   * The distinction is the whole point, because a caller about to REWRITE this
   * file has to tell the three apart, and a tolerant "just give me an empty
   * map" collapses them into the one that destroys data:
   *
   * - **absent** — the first rotation creates it. An empty map is the truth.
   * - **unreadable** (a permission, an I/O error, a path that is not a file) —
   *   the tokens are still in there, unseen. Starting from `{}` and saving
   *   would write a file holding ONE key, wiping every other identity's way
   *   back in over a condition that may well be temporary.
   * - **corrupt** — it parsed to something that is not a map of tokens, so
   *   nothing in it can be used. Recoverable, unlike the one above.
   */
  async #read(): Promise<Held> {
    let raw: string
    try {
      raw = await readFile(this.#path, 'utf8')
    } catch (error) {
      const problem = error as NodeJS.ErrnoException
      // Absent, in both spellings the filesystem uses for "there is no file
      // here": missing, or sitting under something that is not a directory.
      if (problem.code === 'ENOENT' || problem.code === 'ENOTDIR') {
        return { kind: 'map', map: {} }
      }
      return { kind: 'unreadable', why: problem.message }
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { kind: 'map', map: parsed as Record<string, string> }
      }
    } catch {
      // Falls through: unparseable and parsed-to-the-wrong-shape are the same
      // problem to whoever has to read a token out of it.
    }
    return { kind: 'corrupt' }
  }

  /**
   * Reading is allowed to come back empty-handed.
   *
   * The caller falls back to the token it holds in memory, or to the one the
   * config carried. Nothing is lost by answering "I do not know" here — where
   * answering it during a WRITE would be.
   */
  async load(key: string): Promise<string | undefined> {
    const held = await this.#read()
    return held.kind === 'map' ? held.map[key] : undefined
  }

  /**
   * Moves a corrupt file aside and starts a new one.
   *
   * Set aside rather than flattened: whatever is in there is somebody's to
   * explain, and a file that gets silently overwritten never gets explained.
   * Only ever called for content that PARSED and held nothing usable — a file
   * that could not be read at all takes the other branch, because `rename`
   * answers to the DIRECTORY's permissions and would happily move a file whose
   * contents are merely unreadable.
   */
  async #setAside(): Promise<Record<string, string>> {
    const aside = `${this.#path}.broken`
    await rename(this.#path, aside)
    this.#report(`MCP refresh token file held no usable tokens — moved to ${aside}, starting anew`)
    return {}
  }

  save(key: string, refreshToken: string): Promise<void> {
    // Chained so concurrent saves for different keys do not clobber the file.
    const done = this.#queue.then(async () => {
      const held = await this.#read()
      if (held.kind === 'unreadable') {
        // The one case where NOT writing is the careful answer: this file may
        // hold every other identity's token, and a write built on a blind read
        // would replace them all with this single key.
        const refusal =
          `MCP refresh token not persisted — ${this.#path} cannot be read (${held.why}), ` +
          `refusing to overwrite tokens it may still hold`
        // Said, not just thrown: the caller swallows this to keep the turn
        // alive, so the refusal would otherwise be perfectly silent — and a
        // silent refusal is indistinguishable from a store that works.
        this.#report(refusal)
        throw new Error(refusal)
      }
      const map = held.kind === 'corrupt' ? await this.#setAside() : held.map
      if (map[key] === refreshToken) return
      map[key] = refreshToken
      const temporary = `${this.#path}.${randomUUID()}.tmp`
      try {
        // Inside the guard, not before it: a `secrets` path that is not a
        // directory fails HERE, and that failure has to be reported like any
        // other rather than escaping unannounced.
        await mkdir(dirname(this.#path), { recursive: true })
        await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 })
        await chmod(temporary, 0o600)
        await rename(temporary, this.#path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        this.#report(
          `MCP refresh token not persisted (${(error as Error).message}) — a restart will present a spent one`,
        )
        throw error
      }
    })
    // The CHAIN has to survive a failed write. Assigning the rejected promise
    // back to `#queue` would make every LATER save reject with that same old
    // error, without running: one transient EACCES and the token silently
    // stops being persisted for the life of the process, which surfaces days
    // later as a login nobody can explain. What this caller is told does not
    // change — `done` still rejects.
    this.#queue = done.catch(() => undefined)
    return done
  }
}
