/**
 * The Copilot device-code login flow.
 *
 * `copilot login --device-code` prints a verification URL and a user code,
 * then — once the user approves in a browser — stores a `gho_` OAuth token.
 * Where there is a system keychain it stores it THERE; where there is none
 * (every container, and WSL) it first asks whether to write the token into a
 * plaintext config file under `$COPILOT_HOME`, and only that second case is
 * one Demeura can harvest from.
 *
 * Harvesting is the whole point. The `gho_` token works as
 * `COPILOT_GITHUB_TOKEN` (verified against 1.0.80), so the core can hold it as
 * the single managed secret every driver arms. "The CLI's own `login` writes
 * into its own store, not where Demeura reads from" was the objection to a
 * relayed device flow; reading the token back out answers it, and the
 * interface reports "armed" right after a login that visibly succeeded.
 *
 * ## The question, and who answers it
 *
 * That plaintext question is a HUMAN one, so this flow never answers it on its
 * own: nothing reaches the child's stdin until `consentToPlaintextStorage()`
 * is called, which the driver does only when the user has accepted the
 * statement the arming panel shows them. Writing someone's OAuth token to an
 * unencrypted file is not a detail to auto-confirm behind their back.
 *
 * ## Why the login runs under a terminal it does not need
 *
 * The question is asked ONLY when both streams are terminals. From 1.0.80's
 * own bundle:
 *
 *     if (!process.stdin.isTTY || !process.stdout.isTTY) return false
 *     rl.question("System keychain unavailable. Store token in plaintext config file? (y/N) ", …)
 *
 * With the piped stdio a server gives a child, that guard returns false before
 * anything is printed, the CLI declines on the user's behalf, and the login
 * ends with "Login succeeded, but the token was not saved." — measured, in a
 * keychain-less container, against a real approval. No amount of writing "y"
 * to a pipe can reach a prompt that was never opened.
 *
 * So the login is spawned under util-linux `script`, which allocates a pty:
 * no native dependency (node cannot make one), and it is already in the
 * `node:22-slim` base Demeura's own image is built from. Everything the flow
 * reads then arrives on that one merged stream, cursor escapes included, which
 * is why the matchers below tolerate them.
 *
 * Strings verified against 1.0.80, in a container: the code as
 * `To authenticate, visit <url> and enter code XXXX-XXXX` on stdout, success
 * as `Signed in successfully as …!`, the storage refusal as `the token was not
 * saved`, and the question exactly as quoted above.
 */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { platform } from 'node:process'

export interface DeviceCodeLogin {
  /** The GitHub device-verification URL to open in a browser. */
  readonly verificationUri: string
  /** The code to enter there. */
  readonly userCode: string
  /**
   * Resolves with the harvested `gho_` token once the user has approved, the
   * CLI has stored it, and the process has exited; rejects on timeout,
   * refusal, or a login that stored nothing readable.
   */
  readonly completed: Promise<string>
  /**
   * The user's answer to the CLI's plaintext-storage question, which is the
   * only thing that unblocks a login on a keychain-less machine. Until it is
   * called nothing is written to the child's stdin. Calling it twice is a
   * no-op.
   */
  consentToPlaintextStorage(): void
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
  /**
   * Budget for the CLI to finish AFTER the user has consented. Short on
   * purpose: past that point the only work left is storing a token, so a child
   * still alive is a stuck one, and saying so beats waiting out `timeoutMs`.
   */
  readonly afterConsentMs?: number
  /** Injection point for the harvest step, for tests. */
  readonly harvestImpl?: (home: string) => Promise<string>
}

/**
 * What the user is asked to accept before this flow will answer the CLI. It
 * lives next to the code it describes so the two cannot drift: say plainly
 * that a token is written unencrypted, where, and for how long — a consent
 * that hides the cost is not one.
 */
export const PLAINTEXT_CONSENT =
  'Signing in writes GitHub’s token unencrypted into a file Demeura owns, because that is the only place Copilot leaves one Demeura can read. Demeura moves it into its own secret store and deletes the file as soon as the login ends.'

const CODE_RE = /enter (?:the )?code ([A-Z0-9]{4,}-[A-Z0-9]{4,})/i
const URL_RE = /(https?:\/\/\S*\/login\/device\S*)/i
/**
 * Looser than the string it was read from: any question on one line that talks
 * about plaintext or unencrypted storage. Narrow enough not to answer some
 * unrelated prompt "yes", wide enough to survive a reworded release — and
 * unbothered by the cursor escapes readline emits around a pty prompt.
 */
const KEYCHAIN_RE = /(plain[\s-]?text|unencrypted)[^\n]*\?|\?[^\n]*(plain[\s-]?text|unencrypted)/i
const SUCCESS_RE = /signed in successfully/i
/** The CLI declining storage for us — the exact shape of the original bug. */
const NOT_SAVED_RE = /token was not saved/i
const DEFAULT_URL = 'https://github.com/login/device'
/** Enough of the CLI's own words to diagnose a failure, not its whole log. */
const REPORTED_OUTPUT = 400

/**
 * Never let a credential the CLI happened to echo ride out on an error string:
 * these messages are rendered in the browser, which is never given the secret.
 */
function scrubTokens(text: string): string {
  return text.replace(/gh[a-z]_[A-Za-z0-9_]{10,}/g, 'gh*_***')
}

/**
 * `copilot login`, wrapped in a pty so the CLI will ask its question at all
 * (see the header). The two `script` implementations take their arguments in
 * incompatible orders, and neither accepts the other's: util-linux takes one
 * shell string after `-c`, BSD takes an argv after the typescript file.
 *
 * Only the util-linux branch propagates the child's exit code (`-e`). That
 * costs nothing here: BSD `script` means macOS, macOS has a keychain, and the
 * question never comes up there — the flow ends on a harvest that finds
 * nothing and says why.
 */
export function ptyLogin(command: string, os: string = platform): { file: string; args: string[] } {
  if (os === 'darwin') return { file: 'script', args: ['-q', '/dev/null', command, 'login', '--device-code'] }
  const quoted = `'${command.replace(/'/g, `'\\''`)}'`
  return { file: 'script', args: ['-qec', `${quoted} login --device-code`, '/dev/null'] }
}

/**
 * Start the flow. The returned promise settles once the CLI has PRINTED the
 * code — so the interface can show it — while the `completed` promise it
 * carries settles later, when the user has approved, consented to plaintext
 * storage, and the token has been harvested.
 */
export function startDeviceCodeLogin(options: StartLoginOptions): Promise<DeviceCodeLogin> {
  const spawnImpl = options.spawnImpl ?? spawn
  const harvest = options.harvestImpl ?? harvestToken
  const timeoutMs = options.timeoutMs ?? 15 * 60_000
  const afterConsentMs = options.afterConsentMs ?? 2 * 60_000

  return new Promise<DeviceCodeLogin>((announce, failToStart) => {
    const { file, args } = ptyLogin(options.command)
    const child = spawnImpl(file, args, {
      env: {
        ...options.baseEnv,
        COPILOT_HOME: options.home,
        // The binary self-updates by default (spike 3): without this, a login
        // can swap out the version the rest of the driver is pinned to.
        COPILOT_AUTO_UPDATE: 'false',
        NO_COLOR: '1',
        // `CI` is deliberately NOT set here, unlike in `copilotEnv`: it is
        // exactly the flag a CLI reads to skip an interactive question, and
        // this flow needs that question asked so the user can answer it.
      } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    let announced = false
    let questionSeen = false
    let answered = false
    let consented = false
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

    const timers = new Set<NodeJS.Timeout>()
    const clearTimers = (): void => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
    const after = (ms: number, run: () => void): void => {
      timers.add(setTimeout(run, ms))
    }
    const fail = (error: Error): void => {
      clearTimers()
      if (!announced) failToStart(error)
      rejectCompleted(error)
    }

    after(timeoutMs, () => {
      child.kill('SIGTERM')
      fail(new Error('the device-code flow expired before it was approved'))
    })

    // Sent exactly once, whichever comes last: the CLI asking, or the user
    // consenting. When consent comes first the "y" is written blind — it waits
    // in the pipe for a question that has not printed yet, or for one whose
    // wording KEYCHAIN_RE no longer recognises. That blind write is why the
    // deadline below exists: if it lands nowhere, the flow says so.
    const sendConsent = (): void => {
      if (answered || !consented) return
      answered = true
      child.stdin?.write('y\n')
    }

    const stuckReason = (): string => {
      if (questionSeen) {
        return 'the CLI never finished after its plaintext-storage question was answered'
      }
      if (signedIn) {
        return 'the sign-in succeeded but the CLI is waiting on a question Demeura did not recognise — most likely where to store the token; it will not be answered blindly'
      }
      return 'the sign-in was not approved in time — approve it in the browser first, then finish here'
    }

    const onChunk = (raw: Buffer): void => {
      buffer += raw.toString('utf8')

      if (!questionSeen && KEYCHAIN_RE.test(buffer)) {
        questionSeen = true
        sendConsent()
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
            consentToPlaintextStorage: () => {
              if (consented) return
              consented = true
              sendConsent()
              after(afterConsentMs, () => {
                child.kill('SIGTERM')
                fail(new Error(stuckReason()))
              })
            },
            cancel: () => {
              clearTimers()
              // No "n" first: the answer would race the signal, and a killed
              // login stores nothing either way.
              child.kill('SIGTERM')
            },
          })
        }
      }

      if (SUCCESS_RE.test(buffer)) signedIn = true
    }

    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    child.on('error', (error: Error & { code?: string }) => {
      // The only thing spawned here is `script`; a missing `copilot` exits
      // through it with a status instead. So ENOENT names the pty tool.
      fail(
        error.code === 'ENOENT'
          ? new Error('this login needs util-linux `script` to give the CLI a terminal, and it is not installed')
          : error,
      )
    })

    child.on('close', (code: number | null) => {
      clearTimers()
      // The CLI declining storage on the user's behalf. It reports this as a
      // SUCCESS ("Login succeeded, but…"), so it has to be caught before the
      // harvest, which would otherwise blame the keychain for a token that
      // never reached one.
      if (NOT_SAVED_RE.test(buffer)) {
        fail(
          new Error(
            questionSeen
              ? 'the CLI refused to store the token even after the plaintext question was answered'
              : 'the CLI never asked whether it could store the token, so it declined for you — it only asks over a terminal, and this login did not get one',
          ),
        )
        return
      }
      // Harvest only once the process has exited: the token file is flushed by
      // then, where reading it on the "signed in" line could race the write.
      if (code === 0 || signedIn) {
        harvest(options.home).then(resolveCompleted, (error: Error) => {
          // A login that succeeded but left nothing readable is the keychain
          // case: the token went into the system credential store, which is
          // not a file Demeura can read. Name that, rather than "stored no
          // token", which reads like the login failed.
          rejectCompleted(
            questionSeen
              ? error
              : new Error(
                  'the login stored its token where Demeura cannot read it — probably a system credential store rather than the plaintext config file it falls back to. Set COPILOT_GITHUB_TOKEN by hand on this machine.',
                ),
          )
        })
        return
      }
      const said = scrubTokens(buffer.trim()).slice(-REPORTED_OUTPUT)
      fail(new Error(said || `the login exited with code ${String(code)}`))
    })
  })
}

/**
 * Read the `gho_` OAuth token the login wrote into `$COPILOT_HOME/config.json`.
 * The file opens with `//` comment lines before its JSON body, so the parse
 * starts at the first brace. Shape captured from a real login against 1.0.80:
 *
 *     { "copilotTokens": { "https://github.com:<login>": "gho_… (40 chars)" }, … }
 *
 * Keyed by host and account, so there can be more than one; the first is taken
 * because the login that just ran wrote into a directory this driver made for
 * that login alone.
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
  const parsed = JSON.parse(raw.slice(brace)) as {
    copilotTokens?: Record<string, string>
  }
  const token = parsed.copilotTokens ? Object.values(parsed.copilotTokens)[0] : undefined
  if (!token) throw new Error('the login completed but stored no token')
  return token
}
