/**
 * The relayed device-code flow, for the engines that have one.
 *
 * `begin` starts the CLI's login in a throwaway home and hands back the code
 * to show; the child is HELD until `finish`, because it is the process that
 * polls for the token — killing it would make the user's approval land
 * nowhere, with no error on either side. Both ending paths remove the home.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { AuthPrompt } from './contract.js'

/** What a started login must offer, whichever CLI it wraps. */
interface DeviceLogin {
  readonly verificationUri: string
  readonly userCode: string
  cancel(): void
}

interface DeviceCodeFlowOptions<L extends DeviceLogin> {
  /** The driver's home; the login runs in its `arming` subdirectory. */
  readonly home: string
  /** The prompt's `sessionId`. */
  readonly sessionId: string
  readonly start: (home: string) => Promise<L>
  /** Fields only this engine's prompt carries (Copilot's consent). */
  readonly extraPrompt?: Partial<AuthPrompt>
}

export class DeviceCodeFlow<L extends DeviceLogin> {
  readonly #options: DeviceCodeFlowOptions<L>
  #pending: { login: L; home: string } | undefined

  constructor(options: DeviceCodeFlowOptions<L>) {
    this.#options = options
  }

  /** Whether a login is waiting to be finished. */
  get active(): boolean {
    return this.#pending !== undefined
  }

  async begin(): Promise<AuthPrompt> {
    this.#pending?.login.cancel()

    const home = join(this.#options.home, 'arming')
    await rm(home, { recursive: true, force: true })
    await mkdir(home, { recursive: true })

    const login = await this.#options.start(home)
    this.#pending = { login, home }

    return {
      sessionId: this.#options.sessionId,
      mode: 'device-code',
      authorizeUrl: login.verificationUri,
      userCode: login.userCode,
      inputLabel: 'Approve in your browser, then finish here',
      ...this.#options.extraPrompt,
      ttl: 900,
    }
  }

  /** Settles the waiting login with `settle`, then cleans up whatever it returns or throws. */
  async finish<T>(settle: (login: L) => Promise<T>): Promise<T> {
    const pending = this.#pending
    if (!pending) throw new Error('no device-code login is in progress; start again')
    try {
      return await settle(pending.login)
    } finally {
      await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
      this.#pending = undefined
    }
  }

  async cancel(): Promise<void> {
    const pending = this.#pending
    if (!pending) return
    pending.login.cancel()
    await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
    this.#pending = undefined
  }
}
