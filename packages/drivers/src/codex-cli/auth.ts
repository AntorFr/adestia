/**
 * Codex's credential, which is a FILE — the one place this engine departs from
 * the other two.
 *
 * Claude and Copilot each take their secret from an environment variable, so
 * their drivers hand the core's credential straight to `env()`. Codex does
 * not: `OPENAI_API_KEY` in the environment is **ignored** for the built-in
 * provider (measured in spike 5 — a turn with it set fails with "Missing
 * bearer or basic authentication in header"), and the CLI reads
 * `$CODEX_HOME/auth.json` and nothing else.
 *
 * So the managed secret is the DOCUMENT, and `materialize()` writes it 0600
 * into the driver-owned home at the spawn site. The store of record is still
 * the core's `SecretStore`: the driver holds it in memory for the life of the
 * process, exactly as the other two hold their token.
 *
 * Two shapes, both captured from 0.154.0:
 *
 *     { "auth_mode": "apikey",  "OPENAI_API_KEY": "sk-…" }
 *     { "auth_mode": "chatgpt", "OPENAI_API_KEY": null,
 *       "tokens": { "id_token": "…", "access_token": "…",
 *                   "refresh_token": "…", "account_id": "…" },
 *       "last_refresh": "2026-09-10T09:39:52.840239Z" }
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The key under which the core stores this driver's secret.
 *
 * Named like an environment variable because that is what `credentialVar()`
 * validates, and it is genuinely the key of the credentials record the core
 * hands back — but this driver never exports it. What reaches the CLI's
 * environment is `CODEX_HOME`; the secret reaches it as a file.
 */
export const CREDENTIAL_KEY = 'CODEX_AUTH_JSON'

export const AUTH_FILE = 'auth.json'

export type CodexAuthMode = 'apikey' | 'chatgpt'

export interface CodexAuthDocument {
  readonly auth_mode?: string
  readonly OPENAI_API_KEY?: string | null
  readonly tokens?: {
    readonly id_token?: string
    readonly access_token?: string
    readonly refresh_token?: string
    readonly account_id?: string
  }
  readonly last_refresh?: string
}

/**
 * Is this a credential the CLI will accept at all?
 *
 * Deliberately structural, not semantic: the CLI itself does NOT validate a
 * pasted key — `login --with-api-key` answers "Successfully logged in" to a
 * key made of nonsense, and the truth only arrives ~35 s into the first turn,
 * after ten network retries. Shape-checking here turns the most common
 * mistake (pasting the wrong thing) into an immediate refusal instead of a
 * turn that dies much later for reasons nobody can read.
 */
export function looksLikeAuthDocument(value: string): boolean {
  const doc = parseAuthDocument(value)
  if (!doc) return false
  if (doc.auth_mode === 'apikey') return typeof doc.OPENAI_API_KEY === 'string' && doc.OPENAI_API_KEY.length > 8
  if (doc.auth_mode === 'chatgpt') return typeof doc.tokens?.access_token === 'string' && doc.tokens.access_token.length > 8
  return false
}

export function parseAuthDocument(value: string): CodexAuthDocument | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as CodexAuthDocument
  } catch {
    return undefined
  }
}

/** A bare API key, wrapped into the document the CLI expects. */
export function apiKeyDocument(key: string): string {
  return `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: key.trim() }, null, 2)}\n`
}

/**
 * Accepts either the whole document or a bare `sk-…` key.
 *
 * The arming panel has one text field, and somebody pasting a key should not
 * have to know it belongs inside a JSON envelope.
 */
export function normalizeCredential(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  if (trimmed.startsWith('{')) return looksLikeAuthDocument(trimmed) ? trimmed : undefined
  if (/^sk-[A-Za-z0-9_-]{8,}$/.test(trimmed)) return apiKeyDocument(trimmed)
  return undefined
}

/** Writes the credential where the CLI reads it. 0600, like the core's own store. */
export async function materialize(home: string, document: string | undefined): Promise<void> {
  await mkdir(home, { recursive: true })
  if (document === undefined) return
  const path = join(home, AUTH_FILE)
  await writeFile(path, document.endsWith('\n') ? document : `${document}\n`, { mode: 0o600 })
  // `writeFile`'s mode only applies when it CREATES the file; an existing one
  // keeps whatever it had, which after a CLI rewrite is not guaranteed.
  await chmod(path, 0o600)
}

/**
 * Reads back what the CLI has on disk.
 *
 * Why a driver reads its own credential file: a ChatGPT login carries a
 * refresh token and a `last_refresh` clock, so the CLI may rotate the document
 * behind us. If it does and the core keeps the old one, the next restart
 * writes a stale credential back over a fresh one and the instance silently
 * loses its login. The driver compares after each turn and hands any change
 * back to the core (see `driver.ts`).
 */
export async function readMaterialized(home: string): Promise<string | undefined> {
  try {
    return await readFile(join(home, AUTH_FILE), 'utf8')
  } catch {
    return undefined
  }
}

export function authModeOf(document: string | undefined): CodexAuthMode | undefined {
  if (document === undefined) return undefined
  const mode = parseAuthDocument(document)?.auth_mode
  return mode === 'apikey' || mode === 'chatgpt' ? mode : undefined
}

/**
 * The environment a codex run needs.
 *
 * `CODEX_HOME` is the isolation the driver owns, and it is honoured
 * completely: after a dozen runs in spike 5 the surrounding `$HOME` was still
 * empty — no cache directory, nothing. `check_for_update_on_startup` is turned
 * off from the config rather than here, at the spawn site.
 */
export function codexEnv(
  base: Readonly<Record<string, string | undefined>>,
  home: string,
): Record<string, string | undefined> {
  return {
    ...base,
    CODEX_HOME: home,
    NO_COLOR: '1',
    CI: '1',
  }
}

/**
 * Why a turn failed, in words a person can act on.
 *
 * Codex does not fail fast on a bad credential: it retries five times over
 * websockets, falls back to HTTPS, retries five more, and only then reports
 * failure — about 35 seconds. The message carries a machine-usable marker,
 * which is what this reads; the prose around it is pinned to a binary version,
 * not to a documented API.
 */
export type CodexAuthProblem = 'absent' | 'invalid' | 'unknown'

export function classifyAuthError(message: string): CodexAuthProblem | undefined {
  const text = message.toLowerCase()
  if (text.includes('invalid_api_key') || text.includes('incorrect api key')) return 'invalid'
  if (text.includes('missing bearer or basic authentication')) return 'absent'
  if (text.includes('401 unauthorized')) return 'unknown'
  return undefined
}

export function explainAuthProblem(problem: CodexAuthProblem): string {
  switch (problem) {
    case 'absent':
      return 'No credential reached the CLI: arm an API key, or sign in with ChatGPT.'
    case 'invalid':
      return 'OpenAI refused the key. It may be revoked, or belong to another account.'
    case 'unknown':
      return 'OpenAI refused the request as unauthorized; see the server logs for its exact message.'
  }
}
