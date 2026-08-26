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

  async #read(): Promise<Record<string, string>> {
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8')) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
    } catch {
      return {}
    }
  }

  async load(key: string): Promise<string | undefined> {
    return (await this.#read())[key]
  }

  save(key: string, refreshToken: string): Promise<void> {
    // Chained so concurrent saves for different keys do not clobber the file.
    const done = this.#queue.then(async () => {
      const map = await this.#read()
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
