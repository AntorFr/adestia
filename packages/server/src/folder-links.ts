/**
 * Rewriting the path links of a page when a folder is renamed (AD-39).
 *
 * The page is read with the content package's own parser, so code, fenced
 * code and the frontmatter are never candidates; each match is then replaced
 * AT ITS SOURCE POSITION in the original text, so nothing else moves by a byte.
 */

import { parse } from '@antorfr/adestia-content'

interface Node {
  readonly type: string
  readonly children?: readonly Node[]
  readonly position?: { readonly start: { readonly offset?: number }; readonly end: { readonly offset?: number } }
}

interface Edit {
  readonly from: number
  readonly to: number
  readonly text: string
}

/** What the rename is, as the rewriting needs it. */
interface Renaming {
  /** The old logical path of the folder, e.g. `a/old`. */
  readonly from: string
  /** The new last segment. */
  readonly name: string
  /** The page's logical folder BEFORE the rename (relative links were written for it). */
  readonly pageDir: string
}

const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/** `a/b#frag?x` → `a/b` and `#frag?x`; the query may come before the fragment. */
function split(dest: string): [string, string] {
  const cut = dest.search(/[#?]/)
  return cut === -1 ? [dest, ''] : [dest.slice(0, cut), dest.slice(cut)]
}

const segmentsOf = (path: string): string[] => path.split('/').filter((part) => part !== '')

/**
 * A destination moved to the new name, or undefined when it does not lead into
 * the old folder. `exact` lets the folder's own path match (a markdown link to
 * the folder); a wikilink needs something under it, as `type#id` carries a bare
 * word that must stay a reference.
 */
function moveDestination(dest: string, renaming: Renaming, exact: boolean, wiki = false): string | undefined {
  const [path, suffix] = split(dest)
  if (path === '' || SCHEME.test(path)) return undefined
  const old = segmentsOf(renaming.from)
  const last = old.length - 1
  const parts = path.split('/')
  const absolute = wiki || path.startsWith('/')

  // The logical segments the destination names, remembering which written
  // part carried each one: only the old folder's own segment is replaced.
  let stack: string[]
  const carried: (number | undefined)[] = []
  if (absolute) {
    stack = []
  } else {
    stack = segmentsOf(renaming.pageDir)
  }
  parts.forEach((part, index) => {
    if (part === '' || part === '.') return
    if (part === '..') {
      stack.pop()
      carried.length = Math.min(carried.length, stack.length)
      return
    }
    stack.push(part)
    carried[stack.length - 1] = index
  })
  if (stack.length < old.length || !old.every((segment, at) => stack[at] === segment)) return undefined
  if (!exact && stack.length === old.length) return undefined
  const at = carried[last]
  if (at === undefined) return undefined
  const moved = [...parts]
  moved[at] = renaming.name
  return `${moved.join('/')}${suffix}`
}

/** The inner of `[[…]]`, its target and the rest (`:label`) apart. */
function moveWiki(source: string, renaming: Renaming): string | undefined {
  if (!source.startsWith('[[') || !source.endsWith(']]')) return undefined
  const inner = source.slice(2, -2)
  const cut = inner.indexOf(':')
  const target = cut === -1 ? inner : inner.slice(0, cut)
  const rest = cut === -1 ? '' : inner.slice(cut)
  const moved = moveDestination(target, renaming, false, true)
  return moved === undefined ? undefined : `[[${moved}${rest}]]`
}

/** The destination of an inline link, definition or image, located in its source. */
function destinationIn(source: string, type: string): { start: number; end: number } | undefined {
  let at: number
  if (type === 'definition') {
    const open = /^\[(?:\\.|[^\]\\])*\]:\s*/.exec(source)
    if (!open) return undefined
    at = open[0].length
  } else {
    // `[text](dest "title")`: the destination follows the `](` that closes the
    // text, found by walking the brackets (they nest, and may be escaped).
    let depth = 0
    let close = -1
    for (let i = type === 'image' ? 1 : 0; i < source.length; i += 1) {
      const c = source[i]
      if (c === '\\') i += 1
      else if (c === '[') depth += 1
      else if (c === ']') {
        depth -= 1
        if (depth === 0) {
          close = i
          break
        }
      }
    }
    if (close === -1 || source[close + 1] !== '(') return undefined
    at = close + 2
    while (/\s/.test(source[at] ?? '')) at += 1
  }
  if (source[at] === '<') {
    const end = source.indexOf('>', at)
    return end === -1 ? undefined : { start: at + 1, end }
  }
  let end = at
  let depth = 0
  while (end < source.length) {
    const c = source[end] ?? ''
    if (c === '\\') end += 2
    else if (/\s/.test(c)) break
    else if (c === '(') {
      depth += 1
      end += 1
    } else if (c === ')') {
      if (depth === 0) break
      depth -= 1
      end += 1
    } else end += 1
  }
  return end > at ? { start: at, end: Math.min(end, source.length) } : undefined
}

/**
 * The page's text with every link into the old folder moved to the new name,
 * or undefined when it holds none.
 */
export function rewriteLinks(text: string, renaming: Renaming): string | undefined {
  const edits: Edit[] = []
  const visit = (node: Node): void => {
    const from = node.position?.start.offset
    const to = node.position?.end.offset
    if (from !== undefined && to !== undefined) {
      const source = text.slice(from, to)
      if (node.type === 'wikiLink') {
        const moved = moveWiki(source, renaming)
        if (moved !== undefined) edits.push({ from, to, text: moved })
      } else if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
        const where = destinationIn(source, node.type)
        if (where) {
          const moved = moveDestination(source.slice(where.start, where.end), renaming, true)
          if (moved !== undefined) edits.push({ from: from + where.start, to: from + where.end, text: moved })
        }
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(parse(text) as unknown as Node)
  if (edits.length === 0) return undefined
  let out = text
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.text + out.slice(edit.to)
  }
  return out
}
