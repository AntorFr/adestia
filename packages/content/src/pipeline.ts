/**
 * The content pipeline — ONE remark grammar, parsing and serializing.
 *
 * Spike 1's deciding criterion: the editor (Milkdown) runs this same
 * micromark/remark grammar, so a page cannot mean one thing when rendered and
 * another when edited. Everything that reads or writes a Golem page goes
 * through here — the renderer, the editor, the validator, the agent's skill
 * examples.
 *
 * Serialization settings are the house style, and they are load-bearing: the
 * round-trip conformance suite pins them, so a file written by the agent and a
 * file saved by a human are byte-identical.
 */

import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkWikiLink from 'remark-wiki-link'
import { directiveFromMarkdown, directiveToMarkdown } from 'mdast-util-directive'
import { directive } from 'micromark-extension-directive'
import { unified, type Processor } from 'unified'
import type { Root, Text } from 'mdast'
import type { Handle, State } from 'mdast-util-to-markdown'

/**
 * remark-stringify escapes every `_` in phrasing content, so `session_store`
 * comes back as `session\_store`. That is over-cautious: CommonMark does not
 * start emphasis on an intraword underscore (verified — `session_store`
 * parses as one literal text node), and agents write snake_case constantly, so
 * the default would churn a diff line on the first save of almost every page.
 *
 * The unescape is deliberately narrow: only a `_` with a word character on
 * BOTH sides, which is exactly the case CommonMark defines as literal.
 */
const textHandler: Handle = (node, parent, state, info) => {
  const value = state.safe((node as Text).value, { ...info })
  return value.replace(/(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu, '_')
}

/** House style. Changing any of these rewrites every file on its next save. */
const STRINGIFY_OPTIONS = {
  bullet: '-',
  rule: '-',
  emphasis: '*',
  strong: '*',
  fences: true,
  /**
   * Attributes stay in `key="value"` form. The shortcut syntax (`#id`, `.class`)
   * is HTML thinking leaking into a vocabulary that has none — and it makes a
   * block's attributes unreadable to anyone who has not memorised the sugar.
   */
  preferShortcut: false,
  handlers: { text: textHandler },
} as const

/**
 * Directive support is wired by hand rather than through remark-directive so
 * `preferShortcut: false` can reach the serializer — the convenience wrapper
 * gives no way to pass it, and without it `id="x"` silently becomes `#x`.
 */
function directivePlugin(this: Processor): void {
  const data = this.data()
  const micromarkExtensions = (data.micromarkExtensions ??= [])
  const fromMarkdownExtensions = (data.fromMarkdownExtensions ??= [])
  const toMarkdownExtensions = (data.toMarkdownExtensions ??= [])

  micromarkExtensions.push(directive())
  fromMarkdownExtensions.push(directiveFromMarkdown())
  toMarkdownExtensions.push(directiveToMarkdown({ preferShortcut: STRINGIFY_OPTIONS.preferShortcut }))
}

export function createProcessor(): Processor<Root, undefined, undefined, Root, string> {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkWikiLink)
    .use(directivePlugin)
    .use(remarkStringify, STRINGIFY_OPTIONS)
    .freeze() as Processor<Root, undefined, undefined, Root, string>
}

/** A shared, frozen processor. Parsing is stateless here — unlike the editor. */
const processor = createProcessor()

export function parse(markdown: string): Root {
  return processor.parse(markdown)
}

export function serialize(tree: Root): string {
  return processor.stringify(tree)
}
