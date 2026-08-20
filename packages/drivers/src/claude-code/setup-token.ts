/**
 * Driving `claude setup-token` for real.
 *
 * The CLI is interactive by design: it prints a URL, waits for a pasted code,
 * and exchanges it. Node has no pty in its standard library, so this uses a
 * plain pipe — which works because the flow only needs stdout scraped and one
 * line written, and it avoids making a native module a hard dependency of the
 * whole product for a flow used a handful of times a year.
 *
 * If a future CLI version requires a real terminal, this file is where that
 * changes; nothing above it moves.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { armingEnv, awaitsCode, findAuthorizeUrl, findToken } from './arming.js'
import type { ArmingFlow } from './driver.js'

const URL_TIMEOUT_MS = 30_000
const EXCHANGE_TIMEOUT_MS = 60_000
/**
 * The CLI's paste guard swallows an Enter arriving in the same burst as the
 * text, so the code and its newline are written separately. Learned the hard
 * way by the predecessor; it costs half a second and saves a hang nobody can
 * diagnose from the outside.
 */
const ENTER_DELAY_MS = 500

export interface SetupTokenOptions {
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly spawnImpl?: typeof spawn
  /**
   * Overridable so a test can exercise the timeout path without spending
   * thirty seconds doing it. A suite slow enough to skip is a suite that gets
   * skipped, and then the timeout path is the one nobody checks.
   */
  readonly timeouts?: { readonly url?: number; readonly exchange?: number; readonly enter?: number }
}

export function createSetupTokenFlow(options: SetupTokenOptions = {}): ArmingFlow {
  const urlTimeout = options.timeouts?.url ?? URL_TIMEOUT_MS
  const exchangeTimeout = options.timeouts?.exchange ?? EXCHANGE_TIMEOUT_MS
  const enterDelay = options.timeouts?.enter ?? ENTER_DELAY_MS

  let child: ChildProcessWithoutNullStreams | undefined
  let screen = ''

  const kill = () => {
    child?.kill('SIGTERM')
    child = undefined
    screen = ''
  }

  const waitFor = (predicate: () => boolean, timeoutMs: number, what: string) =>
    new Promise<void>((resolve, reject) => {
      if (predicate()) return resolve()
      const timer = setTimeout(() => {
        clearInterval(poll)
        // The screen goes in the error: without it, "timed out" is all anyone
        // ever learns about a flow that failed on a message the CLI printed.
        reject(new Error(`${what} (last output: ${screen.trim().slice(-200) || 'nothing'})`))
      }, timeoutMs)
      const poll = setInterval(() => {
        if (!predicate()) return
        clearInterval(poll)
        clearTimeout(timer)
        resolve()
      }, 100)
    })

  return {
    async start() {
      kill()
      const spawnFn = options.spawnImpl ?? spawn
      child = spawnFn(options.command ?? 'claude', [...(options.args ?? ['setup-token'])], {
        env: armingEnv(options.env ?? process.env) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams

      child.stdout.on('data', (chunk: Buffer) => {
        screen += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        screen += chunk.toString('utf8')
      })
      child.on('error', (error) => {
        screen += `\n${error.message}`
      })

      await waitFor(
        () => findAuthorizeUrl(screen) !== undefined,
        urlTimeout,
        'the CLI printed no authorization link',
      )
      return { authorizeUrl: findAuthorizeUrl(screen)! }
    },

    async submit(code: string) {
      if (!child) throw new Error('no arming flow is running')

      // Waiting for the prompt rather than typing immediately: a code written
      // before the CLI is listening is a code that vanishes.
      await waitFor(
        () => awaitsCode(screen) || findToken(screen) !== undefined,
        exchangeTimeout,
        'the CLI never asked for a code',
      )

      child.stdin.write(code.trim())
      await new Promise((resolve) => setTimeout(resolve, enterDelay))
      child.stdin.write('\n')

      await waitFor(
        () => findToken(screen) !== undefined,
        exchangeTimeout,
        'the CLI did not return a token — the code may be wrong or expired',
      )
      const token = findToken(screen)!
      kill()
      return { token }
    },

    cancel() {
      kill()
      return Promise.resolve()
    },
  }
}
