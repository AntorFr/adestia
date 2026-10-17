/**
 * Copilot's authentication states, recognised from what the CLI actually
 * prints.
 *
 * All three were captured from binary 1.0.80 (spike 3): exit code 1, empty
 * stdout even in JSON mode, and prose on stderr. That means the driver's
 * "invalid" detection has to read stderr — a JSONL parser will never see
 * these — and that the strings below are pinned to a binary version, not to
 * a documented API.
 */

import {
  classifyAuthError as classify,
  explainAuthProblem as explain,
  type AuthErrorRule,
} from '../engine-aids.js'

type CopilotAuthProblem = 'absent' | 'classic-pat' | 'unvalidated' | 'unknown'

const AUTH_RULES: readonly AuthErrorRule<CopilotAuthProblem>[] = [
  { problem: 'absent', all: ['no authentication information found'] },
  { problem: 'classic-pat', all: ['classic personal access tokens'] },
  { problem: 'unvalidated', all: ['authentication token found but could not be validated'] },
  { problem: 'unknown', all: ['error:', 'authenticat'] },
]

const AUTH_SENTENCES: Readonly<Record<CopilotAuthProblem, string>> = {
  absent: 'No GitHub credential: arm a fine-grained token, or set COPILOT_GITHUB_TOKEN.',
  'classic-pat':
    'That is a classic PAT (ghp_), which Copilot does not accept. Use a fine-grained token with the "Copilot Requests" permission.',
  // The CLI itself hedges here ("your token may still be valid, check your
  // network"), so the driver must not claim revocation it cannot know.
  unvalidated: 'GitHub would not validate the token. It may be expired or revoked — or the network may simply be down.',
  unknown: 'The CLI refused to authenticate; see the server logs for its exact message.',
}

export const classifyAuthError = (stderr: string): CopilotAuthProblem | undefined => classify(stderr, AUTH_RULES)

export const explainAuthProblem = (problem: CopilotAuthProblem): string => explain(problem, AUTH_SENTENCES)

/**
 * Fine-grained tokens and OAuth tokens are accepted; classic `ghp_` ones are
 * rejected by the CLI itself. Checked before storing so the refusal names the
 * token rather than surfacing later as a failed turn.
 */
export function looksLikeToken(value: string): boolean {
  const trimmed = value.trim()
  if (/^ghp_/.test(trimmed)) return false
  return /^(github_pat_|gho_|ghu_|ghs_)[A-Za-z0-9_]{10,}$/.test(trimmed)
}

export const TOKEN_ENV_VAR = 'COPILOT_GITHUB_TOKEN'

/**
 * The environment a Copilot run needs.
 *
 * `COPILOT_HOME` is the isolation the driver owns — config, MCP servers,
 * session state and the SQLite store all land under it. `COPILOT_AUTO_UPDATE`
 * matters more than it looks: the binary self-updates by default, so a pinned
 * version silently replaces itself unless told not to (spike 3).
 */
export function copilotEnv(
  base: Readonly<Record<string, string | undefined>>,
  home: string,
): Record<string, string | undefined> {
  return {
    ...base,
    COPILOT_HOME: home,
    COPILOT_AUTO_UPDATE: 'false',
    NO_COLOR: '1',
    CI: '1',
  }
}
