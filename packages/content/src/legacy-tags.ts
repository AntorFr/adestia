/**
 * Reading `{% tag %}` — the predecessor's block syntax.
 *
 * Demeura writes `:::callout{type=warning}`. A body of pages written by the
 * shell it shares its store with writes `{% callout type="attention" %}`, and
 * 27% of the real corpus carries one: 111 callouts, 25 enriched links. Read
 * as text, they land on screen as literal braces in the middle of a sentence.
 *
 * So Demeura LEARNS TO READ them. Not a migration — the other shell still reads
 * its own syntax, and a store two products share cannot have its content
 * rewritten under one of them. Same doctrine as the frontmatter bridge: the
 * reader absorbs, the writing contract moves forward.
 *
 * The translation happens at PARSE time and produces the very nodes a `:::`
 * block would have produced, so everything downstream — validation, the
 * renderer, the editor, the round-trip suite — works unchanged and knows
 * nothing of this. One vocabulary in the tree, two spellings on disk.
 *
 * What is translated is driven by the VOCABULARY, not by a list kept here:
 * `callout` needs a special case only because its type names differ, and a
 * block a plugin contributed becomes readable in this spelling the moment the
 * instance activates that plugin — with no second table to remember to edit.
 * A tag the vocabulary has never heard of is still left exactly as written.
 */

import type { Root, Paragraph, PhrasingContent, RootContent } from 'mdast'
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive'

import { blockSpec } from './vocabulary.js'

/**
 * `{% name attr="value" … %}`, `{% name … /%}`, or `{% /name %}`.
 *
 * The attribute run may not CROSS a `%}`. Written `[\s\S]*?` at first, which
 * silently could: an opener and its closer three paragraphs apart were then
 * read as one enormous tag, and the container never found its end. The
 * lookahead is the whole difference.
 */
const TAG = /^\{%\s*(\/?)([a-zA-Z][\w-]*)((?:(?!%\}).)*)%\}$/s

/**
 * The predecessor's callout types, in Demeura's closed vocabulary.
 *
 * Measured on the corpus rather than guessed: `attention` (68 uses) is the
 * one that matters and it means WARNING, not "note". `astuce` is French for
 * tip. A type this table has never met falls to `note`, which is the block's
 * own default — the safe direction, since the text still reads.
 */
const CALLOUT_TYPES: Readonly<Record<string, string>> = {
  attention: 'warning',
  warning: 'warning',
  note: 'note',
  info: 'note',
  astuce: 'tip',
  tip: 'tip',
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of raw.matchAll(/([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g)) {
    attributes[match[1]!] = match[2]!
  }
  return attributes
}

/**
 * The whole paragraph is one tag and nothing else.
 *
 * Read from the SOURCE by offset rather than from the paragraph's children:
 * GFM autolinks a bare URL, so `{% web url="https://…" /%}` arrives as text,
 * link, text — three nodes for one tag. Slicing what was actually written
 * sidesteps every such rewrite instead of trying to undo them one by one.
 */
function tagOf(
  node: RootContent,
  source: string,
): { close: boolean; name: string; self: boolean; attributes: Record<string, string> } | undefined {
  if (node.type !== 'paragraph') return undefined
  const start = node.position?.start.offset
  const end = node.position?.end.offset

  // A synthetic node peeled out of a glued paragraph has no position; its
  // own single text child IS the tag.
  if (start === undefined || end === undefined) {
    const children = (node as Paragraph).children
    if (children.length !== 1 || children[0]?.type !== 'text') return undefined
    return parseTag(children[0].value)
  }

  return parseTag(source.slice(start, end))
}

/**
 * An enriched link — `{% web url="…" titre="…" /%}`.
 *
 * Rendered as an ordinary link rather than invented as a new block: the
 * predecessor draws a card with the site's favicon, which Demeura has no
 * mechanism for, and a link that WORKS beats a placeholder promising a card.
 * The title falls back to the URL, because a link with no text is a link
 * nobody can click on purpose.
 */
function webLink(attributes: Record<string, string>): Paragraph | undefined {
  const url = attributes['url']
  if (!url) return undefined
  const label = attributes['titre'] ?? attributes['title'] ?? url
  return {
    type: 'paragraph',
    children: [
      { type: 'link', url, children: [{ type: 'text', value: label }] } as PhrasingContent,
    ],
  }
}

/** A complete tag at the very start of a text run, up to its line break. */
const LEADING = /^\s*(\{%[^%]*%\})[ \t]*\n/
/** …and one at the very end. */
const TRAILING = /\n[ \t]*(\{%[^%]*%\})\s*$/

/**
 * Splits a paragraph that BEGINS or ENDS with a tag line.
 *
 * The corpus writes the opener on its own line but with no blank line after,
 * so markdown glues it to the sentence below and the tag stops being a
 * paragraph of its own. Handled here, on the tree, rather than by massaging
 * the text before the parser: the EDITOR never calls `parse()` — it registers
 * the grammar and reads markdown itself — so a fix that lived in `parse()`
 * would have worked in the renderer and silently not in the editor.
 */
function peel(node: RootContent): {
  open?: string | undefined
  close?: string | undefined
  rest: RootContent
} {
  if (node.type !== 'paragraph') return { rest: node }
  const children = [...(node as Paragraph).children]
  let open: string | undefined
  let close: string | undefined

  const first = children[0]
  if (first?.type === 'text') {
    const match = LEADING.exec(first.value)
    if (match) {
      open = match[1]
      children[0] = { ...first, value: first.value.slice(match[0].length) }
    }
  }

  const last = children.at(-1)
  if (last?.type === 'text') {
    const match = TRAILING.exec(last.value)
    if (match) {
      close = match[1]
      children[children.length - 1] = { ...last, value: last.value.slice(0, match.index) }
    }
  }

  if (!open && !close) return { rest: node }
  return { open, close, rest: { ...(node as Paragraph), children } as RootContent }
}

/** Reads a tag out of its raw text — the same shapes `tagOf` accepts. */
function parseTag(raw: string) {
  const match = TAG.exec(raw.trim())
  if (!match) return undefined
  const rest = match[3] ?? ''
  return {
    close: match[1] === '/',
    name: match[2]!,
    // The closing slash now lives at the end of the attribute run, since the
    // pattern reads everything up to `%}` in one group.
    self: /\/\s*$/.test(rest),
    attributes: parseAttributes(rest),
  }
}

/**
 * Flattens paragraphs that carry a tag at either end into separate nodes, so
 * the container walk below sees tags and content as siblings — whether the
 * page separated them with a blank line or not.
 */
function loosen(children: RootContent[], source: string): RootContent[] {
  const out: RootContent[] = []
  for (const node of children) {
    if (tagOf(node, source)) {
      out.push(node)
      continue
    }
    const { open, close, rest } = peel(node)
    if (!open && !close) {
      out.push(node)
      continue
    }
    if (open) out.push({ type: 'paragraph', children: [{ type: 'text', value: open }] } as RootContent)
    // A paragraph left with nothing but whitespace was only ever a wrapper
    // for its tags; keeping it would put a blank line in the callout.
    const body = rest as Paragraph
    if (body.children.some((child) => child.type !== 'text' || child.value.trim() !== '')) {
      out.push(rest)
    }
    if (close) out.push({ type: 'paragraph', children: [{ type: 'text', value: close }] } as RootContent)
  }
  return out
}

/**
 * Rewrites a tree in place, one nesting level of container tags.
 *
 * A tag whose closer never comes is LEFT AS IT WAS rather than swallowing the
 * rest of the document: the page then shows one stray line instead of losing
 * everything below it, and whoever wrote it can see what to fix.
 */
function convert(input: RootContent[], source: string): RootContent[] {
  const children = loosen(input, source)
  const out: RootContent[] = []

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index]!
    const tag = tagOf(node, source)

    if (!tag || tag.close) {
      out.push(node)
      continue
    }

    if (tag.self) {
      if (tag.name === 'web') {
        const link = webLink(tag.attributes)
        out.push(link ?? node)
      } else if (blockSpec(tag.name)?.content === 'empty') {
        // A block the vocabulary knows — the core's own, or one a plugin
        // contributed. `{% parcours source="…" /%}` and `:::parcours{…}` are
        // two spellings of one node, so the renderer draws them identically
        // and neither shell has to rewrite the other's files.
        //
        // A CONTAINER with no children, not a leaf directive: that is how the
        // house spells a block whose attributes are its whole meaning (`app`),
        // it is what the editor's atom node parses, and it is what the skill
        // teaches. Two spellings for one concept would be one too many.
        out.push({
          type: 'containerDirective',
          name: tag.name,
          attributes: tag.attributes,
          children: [],
        } as ContainerDirective)
      } else {
        // A self-closing tag with no equivalent: kept verbatim, so a page
        // shows what it actually contains rather than losing a line.
        out.push(node)
      }
      continue
    }

    // A container: find its closer at this level.
    let depth = 1
    let end = -1
    for (let scan = index + 1; scan < children.length; scan += 1) {
      const inner = tagOf(children[scan]!, source)
      if (!inner || inner.self || inner.name !== tag.name) continue
      depth += inner.close ? -1 : 1
      if (depth === 0) {
        end = scan
        break
      }
    }
    if (end === -1) {
      out.push(node)
      continue
    }

    const body = convert(children.slice(index + 1, end), source)
    if (tag.name === 'callout') {
      const declared = (tag.attributes['type'] ?? '').toLowerCase()
      out.push({
        type: 'containerDirective',
        name: 'callout',
        attributes: { type: CALLOUT_TYPES[declared] ?? 'note' },
        children: body,
      } as ContainerDirective)
    } else if (blockSpec(tag.name)?.content === 'flow') {
      // Same bridge as above, for a block that HOLDS something.
      out.push({
        type: 'containerDirective',
        name: tag.name,
        attributes: tag.attributes,
        children: body,
      } as ContainerDirective)
    } else {
      // An unknown container still gives up its CONTENT: the words a person
      // wrote matter more than the wrapper the other shell drew around them.
      out.push(...body)
    }
    index = end
  }

  return out
}

/**
 * The remark plugin. Registered in the shared GRAMMAR, so the renderer, the
 * server and the editor all read these the same way.
 *
 * ⚠️ Read-only by nature: the tree it produces serializes as `:::callout`,
 * never back to `{% %}`. That is deliberate but it has a consequence worth
 * knowing — saving such a page in the editor rewrites its blocks into Demeura's
 * syntax, which the other shell would then no longer render. Editing a shared
 * page converts it; reading one never does.
 */
export function legacyTags() {
  return (tree: Root, file: { toString(): string }): void => {
    const source = String(file)
    // No source, no offsets to slice: leave the tree exactly as it came
    // rather than half-converting it from node text.
    if (source === '') return
    tree.children = convert(tree.children, source) as Root['children']
  }
}

export type { LeafDirective }
