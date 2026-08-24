/**
 * The Copilot device-code login flow.
 *
 * `copilot login --device-code` prints a verification URL and a user code,
 * then — once the user approves in a browser — writes a `gho_` OAuth token into
 * `$COPILOT_HOME/config.json`. On a machine with no system keychain (every
 * container, and WSL), it first asks whether to store that token in a plaintext
 * config file; this flow answers yes, because that file is exactly where the
 * token is then harvested from.
 *
 * Harvesting is the whole point. The `gho_` token works as
 * `COPILOT_GITHUB_TOKEN` (verified against 1.0.80), so the core can hold it as
 * the single managed secret every driver arms. "The CLI's own `login` writes
 * into its own store, not where Golem reads from" was the objection to a
 * relayed device flow; reading the token back out answers it, and the
 * interface reports "armed" right after a login that visibly succeeded.
 *
 * Strings captured from binary 1.0.80: the code as `enter code XXXX-XXXX` on
 * stdout, the keychain question as `Store token in plaintext config file?`, and
 * success as `Signed in successfully`.
 */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface DeviceCodeLogin {
  /** The GitHub device-verification URL to open in a browser. */
  readonly verificationUri: string
  /** The code to enter there. */
  readonly userCode: string
  /**
   * Resolves with the harvested `gho_` token once the user has approved and the
   * CLI has stored it; rejects on timeout, refusal, or a login that stored
   * nothing.
   */
  readonly completed: Promise<string>
  /** Abandon the flow and kill the child. Safe to call more than once. */
  cancel(): void
}

export interface StartLoginOptions {
  readonly command: string
  /** Driver-owned dir the login writes its config (and token) into. */
  readonly home: string
  readonly baseEnv: Readonly<Record<string, string | undefined>>
  readonly spawnImpl?: typeof spawn
  /** Whole-flow budget. Device codes expire (~15 min); the default matches. */
  readonly timeoutMs?: number
  /** Injection point for the harvest step, for tests. */
  readonly harvestImpl?: (home: string) => Promise<string>
}

const CODE_RE = /enter (?:the )?code ([A-Z0-9]{4,}-[A-Z0-9]{4,})/i
const URL_RE = /(https?:\/\/\S*\/login\/device\S*)/i
const KEYCHAIN_RE = /store token in plaintext config file/i
const SUCCESS_RE = /signed in successfully/i
const DEFAULT_URL = 'https://github.com/login/device'

/**
 * Start the flow. The returned promise settles once the CLI has PRINTED the
 * code — so the interface can show it — while the `completed` promise it
 * carries settles later, when the user has actually approved and the token has
 * been harvested.
 */
export function startDeviceCodeLogin(options: StartLoginOptions): Promise<DeviceCodeLogin> {
  const spawnImpl = options.spawnImpl ?? spawn
  const harvest = options.harvestImpl ?? harvestToken
  const timeoutMs = options.timeoutMs ?? 15 * 60_000

  return new Promise<DeviceCodeLogin>((announce, failToStart) => {
    const child = spawnImpl(options.command, ['login', '--device-code'], {
      env: { ...options.baseEnv, COPILOT_HOME: options.home, NO_COLOR: '1' } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    let announced = false
    let keychainAnswered = false
    let signedIn = false
    let resolveCompleted!: (token: string) => void
    let rejectCompleted!: (error: Error) => void
    const completed = new Promise<string>((resolve, reject) => {
      resolveCompleted = resolve
      rejectCompleted = reject
    })
    // completeAuth always awaits this, but a failure can land before it does;
    // mark it handled so an early rejection is never an unhandled one.
    completed.catch(() => undefined)

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      const error = new Error('the device-code flow expired before it was approved')
      if (!announced) failToStart(error)
      rejectCompleted(error)
    }, timeoutMs)

    const onChunk = (raw: Buffer): void => {
      buffer += raw.toString('utf8')

      // Answer the keychain question with "y": plaintext is what makes the
      // token harvestable. It appears only after approval, and only where
      // there is no system keychain — which is every deployment target.
      if (!keychainAnswered && KEYCHAIN_RE.test(buffer)) {
        keychainAnswered = true
        child.stdin?.write('y\n')
      }

      if (!announced) {
        const code = CODE_RE.exec(buffer)?.[1]
        if (code) {
          announced = true
          const url = URL_RE.exec(buffer)?.[1]
          announce({
            verificationUri: url ?? DEFAULT_URL,
            userCode: code,
            completed,
            cancel: () => {
              clearTimeout(timer)
              child.kill('SIGTERM')
            },
          })
        }
      }

      if (SUCCESS_RE.test(buffer)) signedIn = true
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    child.on('error', (error: Error) => {
      clearTimeout(timer)
      if (!announced) failToStart(error)
      rejectCompleted(error)
    })

    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      // Harvest only once the process has exited: the token file is flushed by
      // then, where reading it on the "signed in" line could race the write.
      if (code === 0 || signedIn) {
        harvest(options.home).then(resolveCompleted, rejectCompleted)
        return
      }
      const error = new Error(buffer.trim() || `the login exited with code ${String(code)}`)
      if (!announced) failToStart(error)
      rejectCompleted(error)
    })
  })
}

/**
 * Read the `gho_` OAuth token the login wrote into `$COPILOT_HOME/config.json`.
 * The file opens with `//` comment lines before its JSON body, so the parse
 * starts at the first brace.
 */
export async function harvestToken(home: string): Promise<string> {
  let raw: string
  try {
    raw = await readFile(join(home, 'config.json'), 'utf8')
  } catch {
    // Exit 0 with no config written: the login did not actually store anything.
    throw new Error('the login completed but stored no token')
  }
  const brace = raw.indexOf('{')
  if (brace < 0) throw new Error('the login wrote no credential')
  const parsed = JSON.parse(raw.slice(brace)) as { copilotTokens?: Record<string, string> }
  const token = parsed.copilotTokens ? Object.values(parsed.copilotTokens)[0] : undefined
  if (!token) throw new Error('the login completed but stored no token')
  return token
}
