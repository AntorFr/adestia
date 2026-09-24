/**
 * A page's frontmatter, read and written WITHOUT disturbing what it does not
 * model.
 *
 * The editor used to change one field with a regular expression, and that was
 * right for one field: a page's frontmatter carries conventions no screen
 * models, and re-serialising the block would reformat keys it was only asked
 * to leave alone. A FORM is a different problem — several fields at once, a
 * list among them, and a value that may contain a colon — and the regex
 * answer stops being safe there: `title: Servante: le retour` is not YAML,
 * and nothing in the pipeline would have said so.
 *
 * So the same tool the configuration editor already proved is used here.
 * `yaml`'s document API parses to a tree that REMEMBERS its comments and its
 * layout and re-prints everything it was not asked to change; the settings
 * file measured that before this file existed. What a form touches is
 * rewritten correctly quoted; what it does not touch comes back byte for
 * byte, comments and all.
 *
 * Two rules the functions below exist to enforce:
 *
 * - a frontmatter this module cannot PARSE is never written. A broken block
 *   is somebody's half-typed YAML or an agent's bad write, and a form that
 *   "fixes" it by re-printing what it managed to read deletes the rest.
 * - a value this module cannot model — a nested map, a list of maps — is
 *   reported rather than edited. The form shows it and keeps its hands off,
 *   which is the only honest posture: the alternative is a field that looks
 *   editable and silently flattens what it saves.
 */

import { parseDocument, isMap, isSeq, isScalar, type Document } from 'yaml'

/** Frontmatter must be the FIRST thing in the file, or it is not frontmatter. */
const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(\r?\n|$)/

/** A value a form can put in a field: a scalar, or a flat list of scalars. */
export type FieldValue = string | number | boolean | readonly (string | number)[]

export interface FrontmatterRead {
  /** Whether the file carries a frontmatter block at all. */
  readonly present: boolean
  /**
   * The block is there and does not parse. Nothing is written to a page in
   * this state — see the module note.
   */
  readonly broken: boolean
  /** Top-level keys, in the order the file writes them. */
  readonly keys: readonly string[]
  /** What a form may edit: scalars and flat lists, by key. */
  readonly fields: Readonly<Record<string, FieldValue>>
  /**
   * Keys whose value is a structure this module does not model, with the
   * lines that carry them — for a screen that must SAY what it is keeping
   * rather than leave somebody wondering where their two lines went.
   */
  readonly opaque: readonly { readonly key: string; readonly text: string }[]
}

/** The frontmatter block and the body under it. */
export function splitFrontmatter(markdown: string): { head?: string; body: string } {
  const match = BLOCK.exec(markdown)
  if (!match) return { body: markdown }
  return { head: match[1] ?? '', body: markdown.slice(match[0].length) }
}

function flatten(node: unknown): FieldValue | undefined {
  if (isScalar(node)) {
    const value = node.value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }
    // `null`, a date, anything the schema resolved to an object: not a field.
    return undefined
  }
  if (isSeq(node)) {
    const items: (string | number)[] = []
    for (const item of node.items) {
      if (!isScalar(item)) return undefined
      const value = item.value
      if (typeof value !== 'string' && typeof value !== 'number') return undefined
      items.push(value)
    }
    return items
  }
  return undefined
}

/**
 * What the frontmatter says, and what of it a form may touch.
 *
 * Never throws: a page is opened to be read long before anybody edits it, and
 * a reader that dies on a malformed block is worse than one that says the
 * block is malformed.
 */
export function readFrontmatter(markdown: string): FrontmatterRead {
  const { head } = splitFrontmatter(markdown)
  if (head === undefined) {
    return { present: false, broken: false, keys: [], fields: {}, opaque: [] }
  }

  const doc = parseDocument(head, { keepSourceTokens: true })
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    return { present: true, broken: true, keys: [], fields: {}, opaque: [] }
  }

  const keys: string[] = []
  const fields: Record<string, FieldValue> = {}
  const opaque: { key: string; text: string }[] = []
  const lines = head.split(/\r?\n/)

  for (const pair of isMap(doc.contents) ? doc.contents.items : []) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string') continue
    const key = pair.key.value
    keys.push(key)
    const value = flatten(pair.value)
    if (value !== undefined) {
      fields[key] = value
      continue
    }
    /*
     * The RAW lines, not a re-print of the tree. What this section exists to
     * show is exactly what sits in the file — a re-print would already be the
     * reformatting the whole module refuses.
     */
    const range = (pair.key as { range?: [number, number, number] }).range
    const end = (pair.value as { range?: [number, number, number] } | null)?.range
    const from = range ? head.slice(0, range[0]).split(/\r?\n/).length - 1 : 0
    const to = end ? head.slice(0, end[2]).split(/\r?\n/).length - 1 : from
    opaque.push({ key, text: lines.slice(from, to + 1).join('\n').replace(/\s+$/, '') })
  }

  return { present: true, broken: false, keys, fields, opaque }
}

/**
 * A value that means "this field is not set", and therefore "remove the line".
 *
 * Emptied means ABSENT rather than `title: ""`: a page whose title is the
 * empty string prints as a blank heading everywhere something draws it, which
 * is worse than a page that has no title and says so. The same holds for a
 * tag list emptied down to nothing.
 */
function clears(value: FieldValue | undefined): boolean {
  if (value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function tidy(value: FieldValue): FieldValue {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== '')
  }
  return value
}

/**
 * The same markdown with the patch applied — keys set, keys removed, and
 * everything else left exactly as it was written.
 *
 * A page with no frontmatter GAINS one, which is the case a new document
 * hits: refusing it would mean the form silently does nothing on exactly the
 * page somebody is most likely to be filling in. A page with no frontmatter
 * and a patch that only CLEARS things is left alone — there is nothing to
 * remove and an empty block is not an improvement.
 *
 * A broken block is returned untouched. See the module note.
 */
export function writeFrontmatter(
  markdown: string,
  patch: Readonly<Record<string, FieldValue | undefined>>,
): string {
  const entries = Object.entries(patch)
  if (entries.length === 0) return markdown

  const { head } = splitFrontmatter(markdown)
  const doc: Document = parseDocument(head ?? '', { keepSourceTokens: true })
  if (doc.errors.length > 0) return markdown
  if (doc.contents !== null && !isMap(doc.contents)) return markdown

  let touched = false
  for (const [key, raw] of entries) {
    const has = doc.has(key)
    if (clears(raw)) {
      if (!has) continue
      doc.delete(key)
      touched = true
      continue
    }
    const value = tidy(raw as FieldValue)
    /*
     * Whether the key is THERE is asked of the document, never inferred from
     * the text changing. Renaming a page to the name it already has rewrites
     * the line to the identical string, and reading that as "no match" is
     * what made the editor append a SECOND `title:` on every save of an
     * unchanged title. The scar is the regex version's; the rule outlives it.
     */
    if (has && JSON.stringify(doc.get(key, false)) === JSON.stringify(value)) continue
    doc.set(key, value)
    touched = true
  }
  if (!touched) return markdown

  /*
   * Everything was removed. The block goes with it rather than leaving an
   * empty pair of fences at the top of the file — and the emptiness is asked
   * of the TREE: an empty document prints as `{}`, which is a two-character
   * way of saying nothing that would sit at the top of the page forever.
   */
  if (!isMap(doc.contents) || doc.contents.items.length === 0) {
    return head === undefined ? markdown : splitFrontmatter(markdown).body
  }

  /*
   * `flowCollectionPadding: false` because the default is `[ a, b ]` and a
   * corpus writes `[a, b]`. Measured on the bench: changing `status` on a
   * page came back with its UNTOUCHED `tags` line respaced — one line of diff
   * on a page nobody edited, which is precisely the churn this module exists
   * to avoid. `toString` ends with a newline; the block's own `---` supplies
   * it.
   */
  const next = doc.toString({ flowCollectionPadding: false }).replace(/\n$/, '')
  if (head === undefined) {
    return `---\n${next}\n---\n\n${markdown.replace(/^\n+/, '')}`
  }
  /*
   * Spliced by POSITION rather than by `String.replace`: the frontmatter is
   * arbitrary text and must not be read as a pattern, nor matched somewhere
   * else in a document that happens to repeat it.
   */
  const at = (BLOCK.exec(markdown)?.index ?? 0) + 4
  return markdown.slice(0, at) + next + markdown.slice(at + head.length)
}
