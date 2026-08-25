/**
 * Arming a Claude subscription token, from the interface.
 *
 * `claude setup-token` is a TUI: it prints an authorization URL, waits for the
 * user to paste back a code, and exchanges it. Driving it means scripting a
 * terminal — screen-scraping regexes, a wide pty so the URL is not wrapped, no
 * browser to open. All of that is irreducibly Claude-specific, which is why it
 * stops here: the contract above only ever sees a state and a prompt.
 *
 * The quirks below are not guesses. They are what the predecessor learned
 * driving this exact flow in production, kept because the CLI has not changed:
 * a wide terminal, a disabled browser, and the two separate writes for the
 * code and its Enter.
 *
 * What DID change is the rendering. Claude Code 2.1.237 draws this flow with
 * Ink, which paints FRAMES: it positions each word with a cursor escape and
 * re-sends only the cells that changed. Stripping the escapes off that stream
 * does not give the text — it gives the text with holes in it, since anything
 * already on screen is never sent again. So every matcher here reads a
 * REPLAYED screen (`screen.ts`), not the stream. The one exception is the
 * link, taken from its OSC 8 hyperlink target, the only copy that no terminal
 * width can wrap.
 *
 * All of it checked against real runs of the binary the SDK ships.
 */

import { renderScreen } from './screen.js'

export const URL_PATTERN = /https:\/\/\S*(?:oauth|authorize)\S*/i
export const CODE_PROMPT_PATTERN = /paste code here|enter the code/i
/** OSC 8 hyperlink: ESC ] 8 ; params ; TARGET BEL. The target is the URL. */
// eslint-disable-next-line no-control-regex
export const OSC8_PATTERN = /\u001b\]8;[^;]*;([^\u0007\u001b]+)/g
export const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]{20,}/
/**
 * The CLI's own verdict on a code it would not exchange. Its wording is
 * `OAuth error: Invalid code. Please make sure the full code was copied`,
 * word-positioned like everything else Ink draws — only the first two words
 * survive intact, and they are enough.
 */
export const REFUSAL_PATTERN = /oauth error/i

/**
 * Escapes removed, cursor moves and all. Enough for a stream that only ever
 * appends; `renderScreen` is what to use on one that redraws.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;?]*[A-Za-z]/g, '').replace(/\][^]*/g, '')
}

/**
 * The authorization link.
 *
 * The hyperlink target first, because it is the only copy that is never
 * wrapped: the CLI also prints the URL as visible text, and a terminal
 * narrower than the URL cuts that copy into pieces which still match a URL
 * pattern — a link that looks right in the interface and 404s when clicked.
 */
export function findAuthorizeUrl(screen: string): string | undefined {
  for (const [, target] of screen.matchAll(OSC8_PATTERN)) {
    if (target !== undefined && URL_PATTERN.test(target)) return target
  }
  return URL_PATTERN.exec(renderScreen(screen))?.[0]
}

/**
 * The token, off the rendered screen.
 *
 * Never off the stream: a token is one long unbroken word, and the frame it
 * lands in re-sends only the cells that differ from the frame before it. Read
 * from the stream it comes back with holes — matching nothing, which is how a
 * SUCCESSFUL authorization still ended in "the CLI did not return a token".
 */
export function findToken(screen: string): string | undefined {
  return TOKEN_PATTERN.exec(renderScreen(screen))?.[0]
}

/** Whether the CLI has already said no to the code it was given. */
export function refusedCode(screen: string): boolean {
  return REFUSAL_PATTERN.test(renderScreen(screen))
}

export function awaitsCode(screen: string): boolean {
  return CODE_PROMPT_PATTERN.test(renderScreen(screen))
}

/**
 * The environment `setup-token` must run under.
 *
 * `BROWSER=/bin/false` is the load-bearing one: with a browser available the
 * CLI opens the URL and never prints it, and there is no browser on the far
 * side of a web interface anyway. `COLUMNS` is wide so the URL is printed on
 * one line — wrapped, it does not match, and the flow appears to hang.
 *
 * COLUMNS alone stopped being enough once the CLI got a real terminal: Ink
 * takes its width from the pty, not from the environment, which is why the
 * flow resizes the pty itself (see `setup-token.ts`). The variable stays for a
 * CLI that reads it.
 */
export function armingEnv(
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return {
    ...base,
    BROWSER: '/bin/false',
    TERM: 'xterm-256color',
    COLUMNS: '500',
    LINES: '40',
    NO_COLOR: '1',
  }
}

/** The last lines the CLI is actually SHOWING — what to put in an error. */
export function visibleTail(screen: string, lines = 4): string {
  return renderScreen(screen)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-lines)
    .join(' | ')
}

/**
 * What a stored subscription token looks like.
 *
 * Checked before it is saved because the alternative is a token that fails at
 * the first turn with an error about the CLI, sending its owner to debug the
 * wrong thing entirely.
 */
export function looksLikeToken(value: string): boolean {
  return TOKEN_PATTERN.test(value.trim())
}

/** Which variable hands the token to the CLI. */
export const TOKEN_ENV_VAR = 'CLAUDE_CODE_OAUTH_TOKEN'
