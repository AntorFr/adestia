/**
 * Non-directive custom extensions: frontmatter, wikilink, and two
 * fidelity-preserving overrides of built-ins (mixed task lists, table
 * block spacing).
 */
import { Node, getExtensionField } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { BulletList, TaskItem } from '@tiptap/extension-list'
import { Table } from '@tiptap/extension-table'

/**
 * YAML frontmatter as a dedicated atom node pinned to the document start.
 * The raw YAML text (between the `---` fences) is stored verbatim in the
 * `content` attribute — the editor never interprets it, so it survives
 * byte-perfect. The tokenizer only fires when no token has been produced
 * yet, i.e. at byte 0 of the document.
 */
export const Frontmatter = Node.create({
  name: 'frontmatter',
  atom: true,
  selectable: false,

  addAttributes() {
    return { content: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'pre[data-frontmatter]' }]
  },
  renderHTML() {
    return ['pre', { 'data-frontmatter': '' }]
  },

  markdownTokenName: 'frontmatter',
  markdownTokenizer: {
    name: 'frontmatter',
    level: 'block',
    start: src => (src.startsWith('---\n') ? 0 : -1),
    tokenize(src, tokens) {
      if (tokens.length > 0) return undefined
      const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(src)
      if (!m) return undefined
      return { type: 'frontmatter', raw: m[0], text: m[1] }
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('frontmatter', { content: token.text })
  },
  renderMarkdown(node) {
    return `---\n${node.attrs.content}\n---`
  },
})

/** Document that allows (and pins) an optional frontmatter as first child. */
export const DocumentWithFrontmatter = Document.extend({
  content: 'frontmatter? block+',
})

/** `[[target]]` / `[[target|alias]]` as an inline atom node. */
export const Wikilink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { target: { default: '' }, alias: { default: null } }
  },

  parseHTML() {
    return [{ tag: 'a[data-wikilink]' }]
  },
  renderHTML({ node }) {
    return ['a', { 'data-wikilink': node.attrs.target }, node.attrs.alias || node.attrs.target]
  },

  markdownTokenName: 'wikilink',
  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline',
    start: src => src.indexOf('[['),
    tokenize(src) {
      const m = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src)
      if (!m) return undefined
      return { type: 'wikilink', raw: m[0], target: m[1], alias: m[2] ?? null }
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('wikilink', { target: token.target, alias: token.alias })
  },
  renderMarkdown(node) {
    const { target, alias } = node.attrs
    return alias ? `[[${target}|${alias}]]` : `[[${target}]]`
  },
})

/**
 * Bullet list that accepts task items among plain items, so a single
 * markdown list mixing `- item` and `- [x] item` stays ONE list node and
 * round-trips without being split in two.
 *
 * Parsing reuses the registered list_item handler, then re-types task
 * items to `taskItem` with the `checked` attribute.
 */
export const MixedBulletList = BulletList.extend({
  content: '(listItem | taskItem)+',

  parseMarkdown(token, helpers) {
    if (token.type !== 'list' || token.ordered) return []
    const content = (token.items || []).flatMap(item => {
      // marked v17 injects a `checkbox` token as first child of task items;
      // strip it so the stock list_item handler wraps content in a paragraph.
      const childTokens = (item.tokens || []).filter(t => t.type !== 'checkbox')
      const parsed = helpers.parseChildren([{ ...item, type: 'list_item', tokens: childTokens }])
      if (!item.task) return parsed
      return parsed.map(li => ({
        type: 'taskItem',
        attrs: { checked: !!item.checked },
        content: li.content,
      }))
    })
    return { type: 'bulletList', content }
  },
})

/** Task item usable directly inside a bullet list (no separate taskList). */
export const BulletTaskItem = TaskItem.extend({
  name: 'taskItem',
})

/**
 * The stock table renderer pads cells to column width (good) but wraps its
 * output in leading/trailing newlines, which doubles the blank lines around
 * tables at document level. This override trims them; document-level '\n\n'
 * joining then produces exactly one blank line.
 */
const tableRenderMarkdown = getExtensionField(Table, 'renderMarkdown')
export const TightTable = Table.extend({
  renderMarkdown(node, helpers, ctx) {
    return tableRenderMarkdown(node, helpers, ctx).replace(/^\n+/, '').replace(/\n+$/, '')
  },
})
