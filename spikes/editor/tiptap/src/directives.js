/**
 * Container directives (:::name{attrs}) as first-class Tiptap nodes.
 *
 * Closed vocabulary: every allowed directive is an explicit Node extension
 * built by `createDirectiveNode`. Anything else that looks like a directive
 * is intercepted by `UnknownDirectiveGuard`, which makes the parse THROW
 * instead of silently degrading to paragraph text.
 */
import { Node, Extension, mergeAttributes } from '@tiptap/core'

/** The closed vocabulary. Extend this list to allow a new typed block. */
export const DIRECTIVE_VOCABULARY = ['callout', 'app']

/** Parse `key="value"` pairs from a `{...}` attribute string. */
export function parseDirectiveAttrs(braced) {
  const attrs = {}
  if (!braced) return attrs
  const inner = braced.replace(/^\{/, '').replace(/\}$/, '')
  const re = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(inner)) !== null) attrs[m[1]] = m[2]
  return attrs
}

/** Serialize attrs back to `{key="value" ...}` in schema-declared order. */
export function serializeDirectiveAttrs(attrs, order) {
  const parts = order
    .filter(key => attrs?.[key] !== null && attrs?.[key] !== undefined)
    .map(key => `${key}="${attrs[key]}"`)
  return parts.length > 0 ? `{${parts.join(' ')}}` : ''
}

/**
 * Build a block-level marked tokenizer for one directive name.
 * `leaf: true` only matches an empty body (open line + close line).
 */
function directiveTokenizer(name, { leaf }) {
  const bodyPattern = leaf ? '' : '([\\s\\S]*?)\\n'
  const re = new RegExp(`^:::${name}(\\{[^}\\n]*\\})?[ \\t]*\\n${bodyPattern}:::[ \\t]*(?:\\n|$)`)
  return {
    name,
    level: 'block',
    start: src => src.indexOf(`:::${name}`),
    tokenize(src, _tokens, helpers) {
      const m = re.exec(src)
      if (!m) return undefined
      const token = {
        type: name,
        raw: m[0],
        directiveAttrs: parseDirectiveAttrs(m[1]),
      }
      if (!leaf) token.tokens = helpers.blockTokens(m[2] ?? '')
      return token
    },
  }
}

/**
 * Factory for one directive of the closed vocabulary.
 *
 * options:
 * - name: directive name (`:::name`)
 * - attributes: Tiptap attribute config, e.g. { type: { default: null } }.
 *   Attribute order here is the serialization order.
 * - leaf: true -> atom node without content (`:::name{...}` + `:::`)
 */
export function createDirectiveNode({ name, attributes, leaf = false }) {
  const attrOrder = Object.keys(attributes)
  return Node.create({
    name,
    group: 'block',
    content: leaf ? undefined : 'block+',
    atom: leaf,
    defining: !leaf,

    addAttributes() {
      return attributes
    },

    // DOM representation (used when the editor is mounted in a browser).
    parseHTML() {
      return [{ tag: `div[data-directive="${name}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      const domAttrs = mergeAttributes(HTMLAttributes, { 'data-directive': name })
      return leaf ? ['div', domAttrs] : ['div', domAttrs, 0]
    },

    markdownTokenName: name,
    markdownTokenizer: directiveTokenizer(name, { leaf }),

    parseMarkdown(token, helpers) {
      const content = leaf ? undefined : helpers.parseChildren(token.tokens || [])
      return helpers.createNode(name, token.directiveAttrs, content)
    },

    renderMarkdown(node, helpers) {
      const attrString = serializeDirectiveAttrs(node.attrs, attrOrder)
      const open = `:::${name}${attrString}`
      if (leaf) return `${open}\n:::`
      const body = helpers.renderChildren(node.content || [], '\n\n')
      return `${open}\n${body}\n:::`
    },
  })
}

/** `:::callout{type="..."}` — rich block content. */
export const Callout = createDirectiveNode({
  name: 'callout',
  attributes: { type: { default: null, validate: 'string|null' } },
})

/** `:::app{id="..." project="..."}` — leaf/atom block, no content. */
export const AppBlock = createDirectiveNode({
  name: 'app',
  attributes: {
    id: { default: null, validate: 'string|null' },
    project: { default: null, validate: 'string|null' },
  },
  leaf: true,
})

/**
 * Closed-vocabulary enforcement: any `:::name` block whose name is NOT in
 * DIRECTIVE_VOCABULARY aborts the parse with an explicit error.
 */
export const UnknownDirectiveGuard = Extension.create({
  name: 'unknownDirectiveGuard',

  markdownTokenizer: {
    name: 'unknownDirective',
    level: 'block',
    start: src => src.indexOf(':::'),
    tokenize(src) {
      const m = /^:::([A-Za-z][\w-]*)/.exec(src)
      if (!m) return undefined
      if (DIRECTIVE_VOCABULARY.includes(m[1])) return undefined
      throw new Error(
        `Unknown directive ":::${m[1]}" — not part of the closed vocabulary [${DIRECTIVE_VOCABULARY.join(', ')}]`,
      )
    },
  },
})
