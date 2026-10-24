/** What the configuration screen holds between renders, and the words it keeps for them. */

export type Value = boolean | number | string

/** A key path as one string, for React keys and lookups. */
export const keyOf = (path: readonly string[]): string => path.join('.')

export interface SaveState {
  readonly kind: 'idle' | 'saving' | 'saved' | 'failed'
  readonly message?: string
}

/**
 * The restart, as the screen lives it.
 *
 * `waiting` is the half a naive implementation forgets: the server answers
 * 202 and only THEN closes, so the moment after the click is a gap where
 * nothing is listening. Polling health until it answers is what turns that
 * gap into a state the screen can draw, instead of a spinner that ends on a
 * failed fetch nobody can interpret.
 */
export type RestartState =
  | { readonly kind: 'none' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'blocked'; readonly running: number }
  | { readonly kind: 'failed'; readonly message: string }
