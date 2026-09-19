/**
 * The parsed page as the reader walks it, and the plain text under a node.
 */

export type Node = {
  type: string
  value?: string
  url?: string
  alt?: string
  lang?: string
  depth?: number
  ordered?: boolean
  checked?: boolean | null
  name?: string
  attributes?: Record<string, string> | null
  data?: { alias?: string }
  children?: Node[]
}

/** The text a node carries, however deep — labels, cells, titles. */
export function plain(node: Node): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(plain).join('')
}

/**
 * A flow block's list items as plain text, one string per item.
 *
 * A contributed block receives its body as rendered React children — right
 * for prose, opaque for a block that treats its body as DATA (a timeline
 * reading phase lines). This is the same reading `figures` does for itself
 * above: every list item, its text however deep. The body still travels as
 * children too; a block that consumes items simply does not draw them.
 */
export function listItems(node: Node): readonly string[] {
  const out: string[] = []
  const walk = (kids: readonly Node[] | undefined) => {
    for (const kid of kids ?? []) {
      if (kid.type === 'listItem') {
        out.push(plain(kid))
        continue
      }
      walk(kid.children)
    }
  }
  walk(node.children)
  return out
}

/**
 * `plan-travail-garage` → `Plan travail garage`. The fallback when nothing
 * declares a label for a subject — declared beats guessed, guessed beats gone.
 */
export function prettify(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/**
 * A `<br />` standing alone — what the editor used to save an empty paragraph
 * as. The reader draws nothing for one, and the editor drops it on parse.
 */
export function isBlankBreak(node: { readonly type: string; readonly value?: unknown }): boolean {
  return node.type === 'html' && typeof node.value === 'string' && /^<br\s*\/?>$/i.test(node.value.trim())
}
