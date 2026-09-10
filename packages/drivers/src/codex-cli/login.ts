/**
 * The Codex device-code login, relayed.
 *
 * `codex login --device-auth` prints a verification URL and a one-time code,
 * waits for the approval, and writes `$CODEX_HOME/auth.json`. Everything about
 * it is easier than Copilot's equivalent, and the difference is worth stating
 * because it removes machinery, not just a step:
 *
 * - **No pty.** Copilot only asks whether it may store the token when both
 *   streams are terminals, so its login runs under util-linux `script`. Codex
 *   stores credentials in a file by default (`cli_auth_credentials_store =
 *   "file"`), asks nothing, and prints its code straight down a pipe.
 * - **No consent question to relay.** Nothing is asked of the user beyond
 *   approving in their browser.
 *
 * One trap, and it is the one that matters: **the process that prints the code
 * is the process that polls for the token**. Kill it and the user's approval
 * lands nowhere — no error on either side, just a login that never completes.
 * So the child is held for the life of the arming session.
 *
 * Strings verified against 0.154.0, with a real approval:
 * `https://auth.openai.com/codex/device` and `XXXX-XXXXX` on stdout (carrying
 * ANSI escapes even under `TERM=dumb` and `NO_COLOR=1`), success as
 * `Successfully logged in`.
 */

import { spawn } from 'node:child_process'

import { AUTH_FILE, looksLikeAuthDocument } from './auth.js'
import { readMaterialized } from './auth.js'

export interface DeviceAuthLogin {
  /** Where the user goes to approve. */
  readonly verificationUri: string
  /** The one-time code to type there. */
  readonly userCode: string
  /** Resolves with the credential document once the CLI has written it. */
  readonly completed: Promise<string>
  cancel(): void
}

export interface StartLoginOptions {
  readonly command: string
  /** A throwaway home: the login writes `auth.json` into it and nothing else. */
  readonly home: string
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
  readonly spawnImpl?: typeof spawn
  /** How long to wait for the code to appear before giving up. */
  readonly codeTimeoutMs?: number
}

/** Escapes survive `NO_COLOR=1`, so nothing here may match on raw bytes. */
export function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\[[0-9;?]*[ -/]*[@-~]/g, '')
}

const URL_PATTERN = /(https:\/\/\S*auth\.openai\.com\/\S*)/
const CODE_PATTERN = /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/

export function readPrompt(buffer: string): { verificationUri: string; userCode: string } | undefined {
  const text = stripAnsi(buffer)
  const url = URL_PATTERN.exec(text)?.[1]
  const code = CODE_PATTERN.exec(text)?.[1]
  return url && code ? { verificationUri: url.replace(/[.,)]+$/, ''), userCode: code } : undefined
}

export function saidSuccess(buffer: string): boolean {
  return /successfully logged in/i.test(stripAnsi(buffer))
}

export async function startDeviceAuthLogin(options: StartLoginOptions): Promise<DeviceAuthLogin> {
  const spawnImpl = options.spawnImpl ?? spawn
  const child = spawnImpl(options.command, ['login', '--device-auth'], {
    cwd: options.home,
    env: {
      ...options.baseEnv,
      CODEX_HOME: options.home,
      NO_COLOR: '1',
      CI: '1',
      TERM: 'dumb',
    } as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let buffer = ''
  let settled = false
  let resolvePrompt: (value: { verificationUri: string; userCode: string }) => void
  let rejectPrompt: (error: Error) => void
  const prompt = new Promise<{ verificationUri: string; userCode: string }>((resolve, reject) => {
    resolvePrompt = resolve
    rejectPrompt = reject
  })

  let resolveDone: (value: string) => void
  let rejectDone: (error: Error) => void
  const completed = new Promise<string>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  // Nobody may await `completed` before the caller does; without this an
  // approval that fails before anyone listens becomes an unhandled rejection
  // and takes the server down with it.
  completed.catch(() => undefined)

  const absorb = (chunk: string | Buffer): void => {
    buffer += chunk.toString()
    if (!settled) {
      const found = readPrompt(buffer)
      if (found) {
        settled = true
        resolvePrompt(found)
      }
    }
  }
  child.stdout?.on('data', absorb)
  child.stderr?.on('data', absorb)

  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    child.kill('SIGTERM')
    rejectPrompt(new Error('the CLI printed no device code'))
  }, options.codeTimeoutMs ?? 30_000)
  timer.unref?.()

  child.on('exit', () => {
    clearTimeout(timer)
    if (!settled) {
      settled = true
      rejectPrompt(new Error(`the login ended before printing a code: ${stripAnsi(buffer).trim().split('\n').pop() ?? ''}`))
    }
    void (async () => {
      const document = await readMaterialized(options.home)
      if (document && looksLikeAuthDocument(document)) resolveDone(document)
      else {
        const said = stripAnsi(buffer).trim().split('\n').filter(Boolean).pop() ?? 'no reason given'
        rejectDone(
          new Error(
            saidSuccess(buffer)
              ? `the login reported success but wrote no usable ${AUTH_FILE}`
              : `the login did not complete: ${said}`,
          ),
        )
      }
    })()
  })

  const found = await prompt
  return {
    verificationUri: found.verificationUri,
    userCode: found.userCode,
    completed,
    cancel: () => {
      clearTimeout(timer)
      child.kill('SIGTERM')
    },
  }
}
