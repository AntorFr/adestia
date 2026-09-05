/**
 * A reference to a page, or to a block inside one.
 *
 * `[[fiche#01M1RXBT…:la boucle]]` — the wikilink already existed and already
 * round-trips byte-identical, so a reference is not a new construct: it is a
 * WAY OF WRITING the target the grammar hands over. This module owns that
 * spelling and nothing else; resolving what it names is the index's business.
 *
 * The shape is `<type>#<id>` and it carries no slug, decided 2026-09-05 after
 * the form had carried one for a week (see the decision log). What settled it:
 * the label makes the file readable, the already-written references are PATHS
 * with their own rung, and a slug goes stale on the first rename — which turns
 * `grep` into a liar about which links exist. An identifier that lies is worse
 * than one that cannot be read.
 *
 * Measured against the real pipeline before choosing the separators, because
 * these fail in ways that reading them does not reveal:
 *
 *   [fiche:01M1…]     parses as NOTHING — no link at all
 *   [[fiche:01M1…]]   resolves to a page named `fiche`, id as its LABEL,
 *                     silently: `aliasDivider` is `:` and this repo passes
 *                     no options
 *   [[fiche#01M1…]]   carries the whole target, round-trips byte-identical
 *
 * Hence `#`, and hence one `#` per level down.
 */

/** What a target string names, once read. */
export interface Reference {
  /**
   * The page's type, absent when the reference names an id alone.
   *
   * Absent is legitimate rather than degraded: an id is unique within its
   * type, and a ULID is unique outright, so `#<id>` is the short form the
   * second resolution rung serves — resolve across types when unique, and SAY
   * so, which is what stops a changed `type:` from breaking every pointer at
   * once.
   */
  readonly type?: string
  /** The page's id. Absent only when the reference names a block alone. */
  readonly id?: string
  /** A block inside the page, when the reference reaches that far. */
  readonly block?: string
}

/**
 * Characters an id may not carry.
 *
 * The three separators plus whitespace: an id containing one of them would
 * make a reference read as something else, and it would do so silently, which
 * is the failure this whole scheme exists to prevent.
 */
const FORBIDDEN = /[/#:\s]/

/**
 * Reads a wikilink's TARGET — what the grammar puts in `value`, the label
 * having already been split off at the `:`.
 *
 * `undefined` for anything that is not a reference, and a PATH is the case
 * that matters: `taches/poncer-porte` is what references were written as
 * before ids existed, and they must keep working through their own rung
 * rather than be mangled here. The presence of a `#` is what makes a target a
 * reference; without one this module has nothing to say.
 */
export function parseReference(target: string): Reference | undefined {
  const raw = target.trim()
  if (!raw.includes('#')) return undefined

  const parts = raw.split('#')
  if (parts.length > 3) return undefined // deeper than a block: nothing means that

  const [head, id, block] = parts as [string, string | undefined, string | undefined]

  // A trailing or doubled `#` leaves an empty segment. Refused rather than
  // trimmed: `fiche#` is a reference somebody meant to finish, and guessing
  // which page they meant is exactly what a lost reference exists to avoid.
  if (id !== undefined && (id === '' || FORBIDDEN.test(id))) return undefined
  if (block !== undefined && (block === '' || FORBIDDEN.test(block))) return undefined
  if (head !== '' && FORBIDDEN.test(head)) return undefined

  // `#<id>` — the short form. The head is empty, so what follows is an id
  // whose type is not stated; whether it names a page or a block is the
  // resolver's question, not this one's.
  if (head === '') {
    return id === undefined ? undefined : { id, ...(block !== undefined ? { block } : {}) }
  }

  if (id === undefined) return undefined
  return { type: head, id, ...(block !== undefined ? { block } : {}) }
}

/**
 * Writes the canonical target. The inverse of `parseReference`, and pinned as
 * such by the tests: a reference that does not survive the round trip is one
 * the next edit rewrites.
 */
export function formatReference(reference: Reference): string {
  const head = reference.type ?? ''
  const rest = [reference.id, reference.block].filter((part) => part !== undefined)
  return [head, ...rest].join('#')
}

/**
 * Whether a string may serve as an id.
 *
 * Exported because the MINTING side needs it too: an instance may declare its
 * own scheme instead of the ULID — a project in a company already has an id in
 * some referential — and what it declares still has to be writable in a
 * reference.
 */
export function isValidId(candidate: string): boolean {
  return candidate !== '' && !FORBIDDEN.test(candidate)
}
