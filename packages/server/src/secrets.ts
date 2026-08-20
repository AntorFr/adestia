/**
 * Driver credentials — held by the core, never by the driver, never sent out.
 *
 * The split matters. A driver knows how to OBTAIN a secret (drive a login
 * flow, validate a token's shape) and how to HAND IT OVER (which environment
 * variable the CLI reads). It does not decide where it lives or who may see
 * it: that is one policy for every engine, written once, here.
 *
 * The browser is told a state and a date. It is never told the secret, so no
 * amount of XSS in a plugin's view can exfiltrate one.
 */

import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

export interface StoredSecret {
  readonly value: string
  readonly savedAt: string
}

export class SecretStore {
  constructor(private readonly root: string) {}

  #path(driverId: string): string {
    // The driver id comes from configuration, but configuration is a file
    // someone else may write in a container; a path built from it is checked
    // rather than trusted.
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(driverId)) {
      throw new Error(`unsafe driver id: ${driverId}`)
    }
    return join(this.root, 'secrets', `${driverId}.token`)
  }

  async read(driverId: string): Promise<StoredSecret | undefined> {
    const path = this.#path(driverId)
    try {
      const [value, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
      const trimmed = value.trim()
      if (trimmed.length === 0) return undefined
      return { value: trimmed, savedAt: new Date(info.mtimeMs).toISOString() }
    } catch {
      return undefined
    }
  }

  async write(driverId: string, value: string): Promise<StoredSecret> {
    const path = this.#path(driverId)
    await mkdir(dirname(path), { recursive: true })

    // Written to a temporary file with the right mode BEFORE it is moved into
    // place: creating the real file then chmod-ing it leaves a window where a
    // secret is world-readable, and that window is all an attacker needs.
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${value.trim()}\n`, { mode: 0o600 })
      await chmod(temporary, 0o600)
      await rename(temporary, path)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }

    const info = await stat(path)
    return { value: value.trim(), savedAt: new Date(info.mtimeMs).toISOString() }
  }

  async clear(driverId: string): Promise<boolean> {
    try {
      await unlink(this.#path(driverId))
      return true
    } catch {
      return false
    }
  }
}

/**
 * An arming conversation in progress.
 *
 * One at a time per driver, deliberately: two overlapping flows produce two
 * codes, and the user pastes whichever they see last into whichever is still
 * waiting. The predecessor kept a single active session for exactly this
 * reason, and it was right.
 */
export interface ArmingSession {
  readonly id: string
  readonly driverId: string
  readonly startedAt: number
  readonly expiresAt: number
}

export const ARMING_TTL_MS = 10 * 60 * 1000

export class ArmingSessions {
  #active: ArmingSession | undefined

  /** @param now injected so the expiry is testable without waiting ten minutes. */
  start(driverId: string, now: number = Date.now()): ArmingSession {
    const session: ArmingSession = {
      id: randomUUID(),
      driverId,
      startedAt: now,
      expiresAt: now + ARMING_TTL_MS,
    }
    // Replacing rather than refusing: a user who abandoned a flow and started
    // another should not have to wait ten minutes for the first to lapse.
    this.#active = session
    return session
  }

  get(id: string, now: number = Date.now()): ArmingSession | undefined {
    if (!this.#active || this.#active.id !== id) return undefined
    if (this.#active.expiresAt <= now) {
      this.#active = undefined
      return undefined
    }
    return this.#active
  }

  end(id: string): void {
    if (this.#active?.id === id) this.#active = undefined
  }

  get current(): ArmingSession | undefined {
    return this.#active
  }
}
