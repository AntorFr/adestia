/**
 * Driving `claude setup-token` for real.
 *
 * The CLI is interactive by design: it prints a URL, waits for a pasted code,
 * and exchanges it. The predecessor drove it over a plain pipe, on the reading
 * that the flow only needs stdout scraped and one line written.
 *
 * That reading has expired. Claude Code 2.1.237 draws this flow with Ink,
 * which renders to a terminal or not at all: over a pipe the process prints
 * ZERO bytes and sits there until the timeout — measured against the shipped
 * binary, and exactly what "the CLI printed no authorization link (last
 * output: nothing)" was reporting.
 *
 * So the child is spawned under a pty tool: util-linux `script` on Linux —
 * where this ships, and the same tool the Copilot login already leans on —
 * and `expect` on macOS, where BSD `script` refuses to run at all unless its
 * own stdin is a terminal or a character device, and a server has neither to
 * give it (`tcgetattr/ioctl: Operation not supported on socket`). Both are
 * stock: no native module, nothing to add to the image. Both verified by
 * running them, on their own platform.
 *
 * The pty is widened before the CLI starts, because Ink takes its width from
 * the terminal rather than from COLUMNS, and an 80-column one cuts both the
 * URL and the token into pieces that still match their patterns — a truncated
 * link in the interface, or a stored token that fails at the first turn.
 *
 * Everything above this file still sees a URL, a code, and a token.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { platform } from 'node:process'

import {
  armingEnv,
  awaitsCode,
  findAuthorizeUrl,
  findToken,
  refusedCode,
  visibleTail,
} from './arming.js'
import { resolveClaudeCli } from './cli-path.js'
import type { ArmingFlow } from './driver.js'

const URL_TIMEOUT_MS = 30_000
const EXCHANGE_TIMEOUT_MS = 60_000
/**
 * The CLI's paste guard swallows an Enter arriving in the same burst as the
 * text, so the code and its Enter are written separately. Learned the hard
 * way by the predecessor; it costs half a second and saves a hang nobody can
 * diagnose from the outside.
 */
const ENTER_DELAY_MS = 500
/**
 * Enter, as a terminal sends it: carriage return.
 *
 * NOT `\n`. A pty in raw mode hands the key through untouched, and the CLI
 * reads `\r` — its termios translates an incoming CR to NL, never the other
 * way round. Measured against the real binary: with `\n` the code sits in the
 * field and NOTHING happens, right up to the timeout; with `\r` the same code
 * comes straight back as `OAuth error: Invalid code`. Over the pipe this flow
 * used to run on, the difference was invisible because nothing worked at all.
 */
const ENTER_KEY = '\r'
/**
 * Wider than any URL or token the flow has to read back in one piece. The
 * height only has to keep the CLI from scrolling its own prompt away before it
 * is matched.
 */
const PTY_COLUMNS = 400
const PTY_LINES = 40

/** Single-quote something for the shell the pty tool runs it through. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Tcl's brace quoting: literal, as long as its braces stay balanced. */
function tclBrace(value: string): string {
  return `{${value.replace(/[{}\\]/g, (character) => `\\${character}`)}}`
}

/**
 * The command, wrapped in a pty (see the header).
 *
 * The `stty` in front is what makes the terminal wide: neither tool offers it
 * as an option, and both run their command through a shell that does.
 */
export function ptySetupToken(
  command: string,
  args: readonly string[],
  os: string = platform,
): { file: string; args: string[] } {
  const run = [command, ...args].map(shellQuote).join(' ')
  const inner = `stty cols ${PTY_COLUMNS} rows ${PTY_LINES}; exec ${run}`
  if (os === 'darwin') {
    // `interact` is what connects our pipes to the pty it opened; without it
    // expect owns the conversation and the code we write goes nowhere.
    return {
      file: 'expect',
      args: ['-c', `set timeout -1; spawn -noecho /bin/sh -c ${tclBrace(inner)}; interact`],
    }
  }
  return { file: 'script', args: ['-qec', inner, '/dev/null'] }
}

export interface SetupTokenOptions {
  /** Defaults to the CLI the SDK ships; see `cli-path.ts`. */
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
  /**
   * A process that never started cannot print anything, so waiting the whole
   * timeout out only buries the one message its reader needs.
   */
  let spawnError: Error | undefined
  /** Named in the error when it is the thing that is missing. */
  let ptyTool = 'script'

  const kill = () => {
    child?.kill('SIGTERM')
    child = undefined
    screen = ''
    spawnError = undefined
  }

  const waitFor = (predicate: () => boolean, timeoutMs: number, what: string) =>
    new Promise<void>((resolve, reject) => {
      if (predicate()) return resolve()
      const fail = (error: Error) => {
        clearInterval(poll)
        clearTimeout(timer)
        reject(error)
      }
      const timer = setTimeout(() => {
        clearInterval(poll)
        // The screen goes in the error: without it, "timed out" is all anyone
        // ever learns about a flow that failed on a message the CLI printed.
        // What it SHOWS, not what it sent — a tail of raw frame diffs is a
        // wall of cursor escapes nobody can read.
        reject(new Error(`${what} (on screen: ${visibleTail(screen) || 'nothing'})`))
      }, timeoutMs)
      const poll: ReturnType<typeof setInterval> = setInterval(() => {
        if (spawnError) return fail(spawnError)
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
      const pty = ptySetupToken(
        options.command ?? resolveClaudeCli(),
        options.args ?? ['setup-token'],
      )
      ptyTool = pty.file
      child = spawnFn(pty.file, pty.args, {
        env: armingEnv(options.env ?? process.env) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams

      child.stdout.on('data', (chunk: Buffer) => {
        screen += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        screen += chunk.toString('utf8')
      })
      child.on('error', (error: Error & { code?: string }) => {
        screen += `\n${error.message}`
        // What is spawned here is the pty tool, never the CLI itself — a
        // missing `claude` exits through it with a status instead. So ENOENT
        // names the wrapper, and blaming the CLI would send its reader to the
        // wrong machine entirely.
        spawnError =
          error.code === 'ENOENT'
            ? new Error(
                `arming needs \`${ptyTool}\` to give the CLI a terminal, and it is not installed`,
              )
            : new Error(`the Claude CLI could not be started: ${error.message}`)
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
      child.stdin.write(ENTER_KEY)

      // Kept the moment it is seen, not read back at the end: the token is
      // shown on a frame the CLI is free to clear on its way out, and a value
      // that exists for one repaint is a value a poll can miss.
      let seen: string | undefined
      // A refusal is an ANSWER, and a fast one: waiting the exchange out to
      // report "may be wrong or expired" hides the CLI's own verdict behind a
      // minute of silence.
      await waitFor(
        () => (seen ??= findToken(screen)) !== undefined || refusedCode(screen),
        exchangeTimeout,
        'the CLI did not return a token — the code may be wrong or expired',
      )
      if (seen === undefined) {
        throw new Error(
          'the CLI refused the code — copy the WHOLE code from the page, it expires quickly',
        )
      }
      kill()
      return { token: seen }
    },

    cancel() {
      kill()
      return Promise.resolve()
    },
  }
}
