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
 */

export const URL_PATTERN = /https:\/\/\S*(?:oauth|authorize)\S*/i
export const CODE_PROMPT_PATTERN = /paste code here|enter the code/i
export const TOKEN_PATTERN = /sk-ant-oat01-[A-Za-z0-9_-]{20,}/

/** ANSI escapes make every regex on this output wrong. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;?]*[A-Za-z]/g, '').replace(/\][^]*/g, '')
}

export function findAuthorizeUrl(screen: string): string | undefined {
  return URL_PATTERN.exec(stripAnsi(screen))?.[0]
}

export function findToken(screen: string): string | undefined {
  return TOKEN_PATTERN.exec(stripAnsi(screen))?.[0]
}

export function awaitsCode(screen: string): boolean {
  return CODE_PROMPT_PATTERN.test(stripAnsi(screen))
}

/**
 * The environment `setup-token` must run under.
 *
 * `BROWSER=/bin/false` is the load-bearing one: with a browser available the
 * CLI opens the URL and never prints it, and there is no browser on the far
 * side of a web interface anyway. `COLUMNS` is wide so the URL is printed on
 * one line — wrapped, it does not match, and the flow appears to hang.
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
