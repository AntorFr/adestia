/**
 * What the three engines say the same way: a trace target cut to size, a
 * server's health in the contract's words, a usage reading without holes, and
 * an authentication failure turned into a sentence.
 *
 * Each engine keeps what is its own — which words its CLI uses, which strings
 * it prints, which counters it reports — and passes them in as parameters.
 */

import type { McpServerHealth, TurnUsage } from './contract.js'

/** The name and a SHORT target — never the whole command. */
const MAX_TARGET = 78

export function truncate(value: string): string {
  // Flattened first: a newline in a trace line would let tool input mimic the
  // interface's own structure.
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length <= MAX_TARGET ? flat : `${flat.slice(0, MAX_TARGET - 1)}…`
}

/**
 * A server's health, the CLI's status word looked up in `words`.
 *
 * A word the table has never met becomes `unknown` rather than `failed`: a
 * state the CLI invents is not evidence a server is down.
 */
export function health(
  name: string,
  status: unknown,
  error: unknown,
  words: ReadonlyMap<string, McpServerHealth['state']>,
): McpServerHealth {
  return { name, state: words.get(String(status ?? '')) ?? 'unknown', ...(error ? { error: String(error) } : {}) }
}

/** A usage reading from the counters an engine has; an absent one is left out, not zeroed. */
export function usageOf(counters: { readonly [K in keyof TurnUsage]: TurnUsage[K] | undefined }): TurnUsage {
  const usage: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(counters)) {
    if (value !== undefined) usage[key] = value
  }
  return usage as TurnUsage
}

/** One way an engine's error text gives away a problem: every `all` fragment present (lowercased). */
export interface AuthErrorRule<P extends string> {
  readonly problem: P
  readonly all: readonly string[]
}

/** The first rule whose fragments are all in the text, compared case-insensitively. */
export function classifyAuthError<P extends string>(text: string, rules: readonly AuthErrorRule<P>[]): P | undefined {
  const lower = text.toLowerCase()
  return rules.find((rule) => rule.all.every((fragment) => lower.includes(fragment)))?.problem
}

/** The sentence for a problem, from the engine's own table. */
export function explainAuthProblem<P extends string>(problem: P, sentences: Readonly<Record<P, string>>): string {
  return sentences[problem]
}
