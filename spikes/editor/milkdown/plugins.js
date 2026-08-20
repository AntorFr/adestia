// Custom Milkdown plugins for the Golem round-trip spike:
//  - YAML frontmatter as a dedicated block node (byte-perfect payload)
//  - `:::name{attrs}` container directives as FIRST-CLASS nodes
//    (closed vocabulary: `callout` with rich content, `app` as leaf)
//  - `[[wikilink]]` as a first-class inline node
import { $nodeSchema, $remark } from '@milkdown/kit/utils'
import { directive } from 'micromark-extension-directive'
import {
  directiveFromMarkdown,
  directiveToMarkdown,
} from 'mdast-util-directive'
import { findAndReplace } from 'mdast-util-find-and-replace'
import remarkFrontmatter from 'remark-frontmatter'

/* ------------------------------------------------------------------ *
 * 1. Frontmatter                                                     *
 * ------------------------------------------------------------------ */

// remark-frontmatter registers the micromark + mdast extensions; the
// mdast `yaml` node carries the RAW yaml text (without the `---`
// fences) in `node.value`, which we stash untouched in a node attr.
export const remarkFrontmatterPlugin = $remark(
  'remarkFrontmatter',
  () => remarkFrontmatter,
  'yaml' // explicit preset: $remark defaults options to `{}`, which
  //        remark-frontmatter would reject as a matter definition
)

export const frontmatterSchema = $nodeSchema('frontmatter', () => ({
  group: 'block',
  atom: true,
  selectable: false,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'pre[data-type="frontmatter"]',
      getAttrs: (dom) => ({ value: dom.textContent ?? '' }),
    },
  ],
  toDOM: (node) => [
    'pre',
    { 'data-type': 'frontmatter' },
    node.attrs.value,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.attrs.value)
    },
  },
}))

/* ------------------------------------------------------------------ *
 * 2. Container directives (typed blocks, closed vocabulary)          *
 * ------------------------------------------------------------------ */

// Same registration remark-directive@4 performs, except we pass
// serializer options: `preferShortcut: false` keeps `id="workbench"`
// from being rewritten to `#workbench`.
function directivePlugin() {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push(directive())
  ;(data.fromMarkdownExtensions ??= []).push(directiveFromMarkdown())
  ;(data.toMarkdownExtensions ??= []).push(
    directiveToMarkdown({ preferShortcut: false })
  )
}

export const remarkDirectivePlugin = $remark(
  'remarkDirective',
  () => directivePlugin
)

// `callout` — a typed block with editable rich-markdown content.
export const calloutSchema = $nodeSchema('callout', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: { attributes: { default: {} } },
  parseDOM: [{ tag: 'div[data-type="callout"]' }],
  toDOM: (node) => [
    'div',
    { 'data-type': 'callout', 'data-callout-type': node.attrs.attributes?.type ?? '' },
    0,
  ],
  parseMarkdown: {
    match: (node) =>
      node.type === 'containerDirective' && node.name === 'callout',
    runner: (state, node, type) => {
      state.openNode(type, { attributes: node.attributes ?? {} })
      state.next(node.children)
      state.closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, {
        name: 'callout',
        attributes: node.attrs.attributes,
      })
      state.next(node.content)
      state.closeNode()
    },
  },
}))

// `app` — a typed block with no content: an atom leaf in the model.
export const appSchema = $nodeSchema('app', () => ({
  group: 'block',
  atom: true,
  attrs: { attributes: { default: {} } },
  parseDOM: [{ tag: 'div[data-type="app"]' }],
  toDOM: (node) => [
    'div',
    { 'data-type': 'app', 'data-app-id': node.attrs.attributes?.id ?? '' },
  ],
  parseMarkdown: {
    match: (node) =>
      node.type === 'containerDirective' && node.name === 'app',
    runner: (state, node, type) => {
      // Schema-validation hook: an `app` block is a leaf. Refuse to
      // load (rather than silently drop) any body content.
      if (node.children?.length > 0)
        throw new Error(
          ':::app directive must be empty — refusing to drop its content'
        )
      state.addNode(type, { attributes: node.attributes ?? {} })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'app',
    runner: (state, node) => {
      state.addNode('containerDirective', [], undefined, {
        name: 'app',
        attributes: node.attrs.attributes,
      })
    },
  },
}))

/* ------------------------------------------------------------------ *
 * 3. Wikilinks                                                       *
 * ------------------------------------------------------------------ */

const WIKILINK_RE = /\[\[([^[\]]+)\]\]/g

// Parse: split text nodes on [[...]] into `wikiLink` mdast nodes
// (transform phase — no micromark tokenizer needed, so no version
// coupling). Serialize: emit the raw `[[...]]` text back.
function wikiLinkPlugin() {
  const data = this.data()
  ;(data.toMarkdownExtensions ??= []).push({
    handlers: {
      wikiLink: wikiLinkToMarkdown,
    },
  })
  return (tree) => {
    findAndReplace(tree, [
      WIKILINK_RE,
      (_match, value) => ({ type: 'wikiLink', value }),
    ])
  }
}

function wikiLinkToMarkdown(node) {
  return `[[${node.value}]]`
}
wikiLinkToMarkdown.peek = () => '['

export const remarkWikiLinkPlugin = $remark('remarkWikiLink', () => wikiLinkPlugin)

export const wikiLinkSchema = $nodeSchema('wiki_link', () => ({
  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-type="wiki-link"]',
      getAttrs: (dom) => ({ value: dom.dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => [
    'span',
    { 'data-type': 'wiki-link', 'data-value': node.attrs.value },
    `[[${node.attrs.value}]]`,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'wikiLink',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wiki_link',
    runner: (state, node) => {
      state.addNode('wikiLink', undefined, node.attrs.value)
    },
  },
}))

export const golemPlugins = [
  remarkFrontmatterPlugin,
  frontmatterSchema,
  remarkDirectivePlugin,
  calloutSchema,
  appSchema,
  remarkWikiLinkPlugin,
  wikiLinkSchema,
].flat()
