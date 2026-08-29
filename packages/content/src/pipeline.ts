/**
 * The content pipeline — ONE remark grammar, parsing and serializing.
 *
 * Spike 1's deciding criterion: the editor (Milkdown) runs this same
 * micromark/remark grammar, so a page cannot mean one thing when rendered and
 * another when edited. Everything that reads or writes a Adestia page goes
 * through here — the renderer, the editor, the validator, the agent's skill
 * examples.
 *
 * Serialization settings are the house style, and they are load-bearing: the
 * round-trip conformance suite pins them, so a file written by the agent and a
 * file saved by a human are byte-identical.
 */

import { legacyTags } from './legacy-tags.js'
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
 * Directive syntax with its INLINE construct removed.
 *
 * `micromark-extension-directive` also reads `:name` in the middle of a
 * paragraph, and Adestia's vocabulary has no inline anything: every block in it
 * is a `:::` container. Left enabled, that construct turns ordinary prose into
 * an unknown block — `19:30:59` parses as the text `19:30` followed by a
 * directive named `59`, the validator errors on it, and the page opens
 * read-only because it mentioned a time. Ratios, timestamps and `key:value`
 * notes are what pages actually contain; an inline directive is a syntax that
 * never meant anything here. So the colon goes back to being punctuation.
 *
 * Removed from the GRAMMAR rather than excused in the validator, so the
 * renderer and the editor see the same tree the validator approved — the same
 * reason this whole file exists.
 */
function blockDirectives(): ReturnType<typeof directive> {
  const constructs = directive()
  delete constructs.text
  return constructs
}

/**
 * Directive support is wired by hand rather than through remark-directive so
 * `preferShortcut: false` can reach the serializer — the convenience wrapper
 * gives no way to pass it, and without it `id="x"` silently becomes `#x`.
 *
 * Exported because the EDITOR registers this exact plugin too. That is the
 * one-grammar principle in practice: not "two pipelines configured the same
 * way", which drifts, but literally the same function.
 */
export function directivePlugin(this: Processor): void {
  const data = this.data()
  const micromarkExtensions = (data.micromarkExtensions ??= [])
  const fromMarkdownExtensions = (data.fromMarkdownExtensions ??= [])
  const toMarkdownExtensions = (data.toMarkdownExtensions ??= [])

  micromarkExtensions.push(blockDirectives())
  fromMarkdownExtensions.push(directiveFromMarkdown())
  toMarkdownExtensions.push(directiveToMarkdown({ preferShortcut: STRINGIFY_OPTIONS.preferShortcut }))
}

/**
 * The grammar, as a list.
 *
 * Every consumer registers THIS — the renderer, the server, and the editor
 * (Milkdown wraps each entry as a `$remark`). Adestia's whole editor verdict
 * rests on one grammar, and a list one side can forget an entry from is not
 * one grammar: a wikilink the editor did not know about came back as
 * `\[\[wikilink]]` on the first save, corrupting a page nobody had touched.
 * Anything added here reaches all three at once.
 */
export const GRAMMAR = [
  [remarkGfm, undefined],
  [remarkFrontmatter, ['yaml']],
  [remarkWikiLink, undefined],
  [directivePlugin, undefined],
  // Reads the predecessor's `{% %}` blocks into the same nodes `:::` makes.
  // Last, so it sees a tree the other plugins have already shaped. See
  // legacy-tags.ts for why a shared store is read, never rewritten.
  [legacyTags, undefined],
] as const

export function createProcessor(): Processor<Root, undefined, undefined, Root, string> {
  const processor = unified().use(remarkParse)
  for (const [plugin, options] of GRAMMAR) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor.use(plugin as any, options as any)
  }
  return processor
    .use(remarkStringify, STRINGIFY_OPTIONS)
    .freeze() as Processor<Root, undefined, undefined, Root, string>
}

/** A shared, frozen processor. Parsing is stateless here — unlike the editor. */
const processor = createProcessor()

/**
 * Parse AND transform.
 *
 * `processor.parse()` alone runs the parser and nothing else — micromark
 * extensions apply, remark TRANSFORMERS do not. Every grammar entry was an
 * extension until `legacyTags` arrived, so the difference had never shown;
 * it showed as a plugin that silently did nothing at all.
 *
 * `runSync` is what makes the returned tree the one the grammar describes,
 * which is what every caller already assumed it was getting.
 */
export function parse(markdown: string): Root {
  // The source travels with the tree: `legacyTags` slices it by offset,
  // because GFM has already rewritten some tags into several nodes by then.
  // `runSync` is typed as returning the processor's generic output node; the
  // grammar's transformers only ever reshape children, so it is the same Root
  // that went in.
  return processor.runSync(processor.parse(markdown), markdown) as Root
}

export function serialize(tree: Root): string {
  return processor.stringify(tree)
}
