/**
 * What a Claude subscription credential is, once armed.
 *
 * The flow that obtains one lives in `oauth.ts`; this file is only the two
 * facts the rest of the driver needs about the result — which variable carries
 * it to the CLI, and what a plausible one looks like.
 */

/** Which variable hands the token to the CLI. */
export const TOKEN_ENV_VAR = 'CLAUDE_CODE_OAUTH_TOKEN'

/**
 * The shape a subscription token has had so far. `oat01` is a version, not a
 * law: the string is minted by the service, and nothing promises its prefix
 * survives the next change.
 */
export const TOKEN_PATTERN = /^sk-ant-oat\d*-[A-Za-z0-9_-]{20,}$/
/** A credential, as opposed to a sentence: one long unbroken word. */
export const OPAQUE_SECRET_PATTERN = /^[A-Za-z0-9._~+/=-]{24,}$/

/**
 * What a stored subscription token looks like.
 *
 * Checked before it is saved because the alternative is a token that fails at
 * the first turn with an error about the CLI, sending its owner to debug the
 * wrong thing entirely. Loose enough to accept a format that changes, tight
 * enough to reject an error page or a stray sentence.
 */
export function looksLikeToken(value: string): boolean {
  const candidate = value.trim()
  return TOKEN_PATTERN.test(candidate) || OPAQUE_SECRET_PATTERN.test(candidate)
}
