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
  #queue: Promise<unknown> = Promise.resolve()

  constructor(dataDir: string) {
    this.#path = join(dataDir, 'secrets', 'mcp-refresh.json')
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
    this.#queue = this.#queue.then(async () => {
      const map = await this.#read()
      if (map[key] === refreshToken) return
      map[key] = refreshToken
      await mkdir(dirname(this.#path), { recursive: true })
      const temporary = `${this.#path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 })
        await chmod(temporary, 0o600)
        await rename(temporary, this.#path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
    })
    return this.#queue as Promise<void>
  }
}
