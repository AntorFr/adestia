/**
 * The frontmatter of a markdown file, read once for every reader in the process.
 */

import { splitFrontmatter as splitContentFrontmatter } from '@antorfr/adestia-content'

/**
 * A page in its two halves: the YAML head, and the text under it.
 *
 * `head` is undefined when the file has no frontmatter, which is not the same
 * as an empty one. Frontmatter must be the very first thing in the file, or
 * it is not frontmatter — and the same rule, written once, is what every
 * reader in this process applies.
 */
export function splitFrontmatter(markdown: string): { head?: string; body: string } {
  return splitContentFrontmatter(markdown)
}

/**
 * The frontmatter of every page, in one request.
 *
 * This is what the design calls the DERIVED regime: a view computed live from
 * attributes, always current, costing no LLM call. A todo list, a project
 * board and a faceted collection are all one query over this index — which is
 * why it belongs to the content engine rather than to whichever plugin asks
 * for it first.
 *
 * Values are parsed shallowly and left as strings, numbers, booleans or flat
 * lists. Nested YAML is deliberately NOT walked: a query language over deep
 * structures is a database, and the moment a page needs one it should be an
 * app with its own store rather than a page pretending.
 */
export function parseFrontmatter(markdown: string): Record<string, unknown> {
  const { head } = splitFrontmatter(markdown)
  if (!head) return {}

  const fields: Record<string, unknown> = {}
  for (const line of head.split(/\r?\n/)) {
    // Only top-level keys: an indented line belongs to a nested structure this
    // index does not model, and guessing at it would produce a field that
    // looks queryable and is not.
    if (/^\s/.test(line)) continue
    const separator = line.indexOf(':')
    if (separator <= 0) continue

    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    if (key === '') continue
    fields[key] = parseScalar(raw)
  }
  return fields
}

function parseScalar(raw: string): unknown {
  if (raw === '') return ''
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item.trim()))
      .filter((item) => item !== '')
  }
  const unquoted = raw.replace(/^["']|["']$/g, '')
  if (unquoted !== raw) return unquoted
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '~') return null
  // Dates stay strings: `2026-08-21` as a number would be nonsense, and as a
  // Date it would serialize differently than it was written.
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

/**
 * One frontmatter field, when it is a usable line of prose.
 *
 * Anything that is not a non-empty string is dropped rather than coerced: a
 * YAML block scalar (`description: >`) parses shallowly to its indicator, and
 * a card captioned `>` is worse than a card with no caption.
 */
export function field(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '>' || trimmed === '|') return undefined
  return trimmed
}
