/**
 * Finding what a reference names — and saying why, when it finds nothing.
 *
 * The bug this exists to end is one line in `todo`:
 *
 *     list.refs.map((ref) => tasks[ref]).filter(Boolean)
 *
 * A curated list resolves its members, loses one because its file moved, and
 * THE ROW SILENTLY DISAPPEARS. No error, no gap — the list is merely shorter,
 * and nobody notices for weeks. `.filter(Boolean)` is how a reference fails
 * today, and every layer above inherits it.
 *
 * So this module never answers "nothing". It answers WHICH page, or WHY not —
 * and the caller can draw a hole instead of hiding one. A visible gap gets
 * repaired; an invisible one does not.
 *
 * Deliberately pure: entries in, an answer out. No disk, no server, no index of
 * its own. The composer that will union several stores changes what the entries
 * ARE, never what resolving them means, so this stays put underneath it.
 */

import { parseReference, type Reference } from './reference.js'

/** What resolution needs of a page. A subset of the index's own entry. */
export interface Indexed {
  readonly path: string
  readonly fields: Readonly<Record<string, unknown>>
  /**
   * Which store carries it, when more than one does. Absent on a
   * single-store instance, exactly as the index omits it there — a field that
   * appears only when it means something.
   */
  readonly store?: string
}

export type Resolution =
  /** Found. `byIdAlone` when the type was not stated and one page answered. */
  | { readonly kind: 'found'; readonly page: Indexed; readonly byIdAlone: boolean }
  /**
   * Several pages answer. NEVER settled here by taking the first: a page one
   * believes one is correcting while reading another is a failure that only
   * shows up later. The candidates travel with the answer so a person can pick.
   */
  | { readonly kind: 'ambiguous'; readonly candidates: readonly Indexed[] }
  /** Nobody answers. The case that used to be an erased row. */
  | { readonly kind: 'lost' }
  /** Not a reference at all — a path, which has its own resolution. */
  | { readonly kind: 'not-a-reference' }

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/**
 * Resolves a reference against the index, in rungs, none of them silent.
 *
 * 1. `type` and `id` both stated — the exact answer.
 * 2. `id` alone — searched across types, resolved when exactly ONE page
 *    answers, and the answer SAYS it came that way (`byIdAlone`). That rung is
 *    what stops a changed `type:` from breaking every pointer at once: the
 *    page is still found, and the caller can tell the reader the type drifted.
 * 3. Nothing — lost, and said.
 *
 * There is no rung for a slug: the form carries none since 2026-09-05, and the
 * path-shaped references written before ids exist are handled by their own
 * resolution rather than mangled here.
 */
export function resolveReference(
  entries: readonly Indexed[],
  target: string | Reference,
): Resolution {
  const reference = typeof target === 'string' ? parseReference(target) : target
  if (!reference) return { kind: 'not-a-reference' }

  const { type, id } = reference
  // A block-only reference names no page; whoever asked for the block knows
  // where it lives, or asked by id alone above.
  if (id === undefined) return { kind: 'not-a-reference' }

  const carrying = entries.filter((entry) => text(entry.fields['id']) === id)
  if (carrying.length === 0) return { kind: 'lost' }

  if (type === undefined) {
    // Rung 2. Two pages of DIFFERENT types may legitimately share an id — it
    // is unique within its type — so this is not a corrupt corpus, it is a
    // reference that did not say enough.
    return carrying.length === 1
      ? { kind: 'found', page: carrying[0]!, byIdAlone: true }
      : { kind: 'ambiguous', candidates: carrying }
  }

  const typed = carrying.filter((entry) => text(entry.fields['type']) === type)
  if (typed.length === 1) return { kind: 'found', page: typed[0]!, byIdAlone: false }

  // Same `type/id` twice. Within one store that is a corpus to repair, named
  // at boot; across stores it is what a shared circle makes possible, and the
  // rule is the same in both directions — never settle it in silence.
  if (typed.length > 1) return { kind: 'ambiguous', candidates: typed }

  // The id exists but under another type: the `type:` drifted, or the
  // reference did. Rung 2's answer, with its flag, beats calling this lost —
  // the page IS there.
  return carrying.length === 1
    ? { kind: 'found', page: carrying[0]!, byIdAlone: true }
    : { kind: 'ambiguous', candidates: carrying }
}
