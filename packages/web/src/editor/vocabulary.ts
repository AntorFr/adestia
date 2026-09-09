/**
 * Editor nodes for the closed vocabulary.
 *
 * This is where spike 1's verdict pays off: Milkdown parses with the same
 * remark/micromark grammar the renderer and the server use, so the nodes
 * declared here are the same structures `@antorfr/adestia-content` validates.
 * A block is a first-class node in the document model — never text that
 * happens to look like a directive — which is what makes the vocabulary
 * genuinely closed rather than merely discouraged.
 */

import { contributedBlocks, GRAMMAR, shapesOf, toneOf, VOCABULARY } from '@antorfr/adestia-content'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { $node, $remark } from '@milkdown/kit/utils'

/** What `$remark` expects: a unified plugin factory. */
type RemarkFactory = Parameters<typeof $remark>[1]

/**
 * The grammar, wrapped for Milkdown — read from the SAME list the renderer
 * and the server register, never restated here.
 *
 * The reason is a bug this exact drift caused: the editor was missing the
 * wikilink plugin, so `[[wikilink]]` was literal text to it, and the first
 * save wrote back `\[\[wikilink]]` — a page corrupted in a paragraph nobody
 * had edited. A list that can be forgotten from is not one grammar.
 *
 * The casts cross two structurally identical `unified` type instances; the
 * shape is proven by the round-trip conformance suite, not by an assertion.
 */
export const grammarRemarks: MilkdownPlugin[] = GRAMMAR.flatMap(([plugin, options], index) =>
  $remark(
    `adestia-grammar-${index}`,
    (() => plugin) as unknown as RemarkFactory,
    options as never,
  ) as unknown as MilkdownPlugin[],
)

/**
 * The frontmatter's chips — the same ones a section card wears.
 *
 * Fields whose job is LIVERY (`ico`, `couleur`) or navigation (`title`,
 * `domaine`) are not shown: the title is already the page's heading and the
 * icon already dressed the tile you arrived by. What is left is what the
 * page says about itself.
 */
function frontmatterChips(yaml: string): unknown[] {
  const fields = new Map<string, string>()
  for (const line of yaml.split('\n')) {
    const cut = line.indexOf(':')
    if (cut < 1 || /^\s/.test(line)) continue
    fields.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim().replace(/^["']|["']$/g, ''))
  }

  const chips: unknown[] = []
  const status = fields.get('status') ?? fields.get('statut')
  if (status) {
    chips.push(['span', { class: `adestia-stat adestia-stat--${toneOf(status)}` }, status])
  }
  for (const key of ['type', 'cat', 'role']) {
    const value = fields.get(key)
    if (value) chips.push(['span', { class: 'adestia-tag' }, value])
  }
  const tags = (fields.get('tags') ?? '').replace(/^\[|\]$/g, '')
  for (const tag of tags.split(',').map((t) => t.trim()).filter(Boolean)) {
    chips.push(['span', { class: 'adestia-tag' }, `#${tag}`])
  }
  return chips
}

/**
 * Frontmatter as an atom node holding its raw YAML.
 *
 * The VALUE is kept verbatim — it carries conventions this editor does not
 * model, and re-serializing YAML would reformat keys it does not understand,
 * churning a diff on every save of a file it was only asked to read.
 *
 * What is DRAWN is another matter. Dumping the raw block put five lines of
 * grey `key: value` above every page, which is apparatus, not content. The
 * same chips the section cards wear say the same thing in one line, and the
 * source of truth underneath does not move.
 */
export const frontmatterNode = $node('frontmatter', () => ({
  content: '',
  group: 'block',
  atom: true,
  isolating: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'div[data-frontmatter]',
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset['frontmatter'] ?? '' }),
    },
  ],
  toDOM: (node) => {
    const value = node.attrs['value'] as string
    const chips = frontmatterChips(value)
    return [
      'div',
      // The raw YAML rides along in the dataset: it is what `parseDOM` reads
      // back, so the round trip stays byte-exact whatever is drawn.
      { 'data-frontmatter': value, class: 'adestia-editor__meta' },
      ...(chips.length > 0 ? chips : [['span', { class: 'adestia-editor__meta-empty' }, '']]),
    ] as never
  },
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'frontmatter',
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.attrs['value'] as string)
    },
  },
}))

/** A container directive with editable content — `:::callout`, `:::gallery`. */
/**
 * The ProseMirror id for a directive's node — the directive's own name,
 * except where the editor's grammar already OWNS that word. Milkdown's GFM
 * preset defines a node named `table`, and registering a second one does not
 * fail loudly: the schema silently misbuilds and the editor never mounts, a
 * blank surface with a 15-second wait in front of it. The directive keeps its
 * name everywhere a person sees one — the file, the DOM's `data-block` — and
 * only the schema id steps aside.
 */
const PM_ID: Readonly<Record<string, string>> = { table: 'directive_table' }
const pmId = (name: string) => PM_ID[name] ?? name

function containerNode(name: string) {
  return $node(pmId(name), () => ({
    // `block*`, not `block+`: a body-less occurrence must survive the editor.
    // A name whose definitions DISAGREE on shape gets a container node (see
    // below), so an empty `:::list` opened for editing is a legal, empty
    // container — not a parse failure on a page the reader renders fine.
    content: 'block*',
    group: 'block',
    defining: true,
    attrs: { attributes: { default: {} as Record<string, string> } },
    parseDOM: [
      {
        tag: `div[data-block="${name}"]`,
        getAttrs: (dom) => ({
          attributes: JSON.parse((dom as HTMLElement).dataset['attributes'] ?? '{}') as Record<
            string,
            string
          >,
        }),
      },
    ],
    toDOM: (node) => [
      'div',
      {
        'data-block': name,
        'data-attributes': JSON.stringify(node.attrs['attributes']),
        class: `adestia-block adestia-block--${name}`,
      },
      0,
    ],
    parseMarkdown: {
      match: (node) => node.type === 'containerDirective' && node.name === name,
      runner: (state, node, type) => {
        state.openNode(type, { attributes: (node.attributes ?? {}) as Record<string, string> })
        state.next(node.children)
        state.closeNode()
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === pmId(name),
      runner: (state, node) => {
        state.openNode('containerDirective', undefined, {
          name,
          attributes: node.attrs['attributes'] as Record<string, string>,
        })
        state.next(node.content)
        state.closeNode()
      },
    },
  }))
}

/** A container directive that takes no content — `:::app`. */
function atomNode(name: string) {
  return $node(pmId(name), () => ({
    content: '',
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { attributes: { default: {} as Record<string, string> } },
    parseDOM: [
      {
        tag: `div[data-block="${name}"]`,
        getAttrs: (dom) => ({
          attributes: JSON.parse((dom as HTMLElement).dataset['attributes'] ?? '{}') as Record<
            string,
            string
          >,
        }),
      },
    ],
    toDOM: (node) => {
      const attributes = node.attrs['attributes'] as Record<string, string>
      return [
        'div',
        {
          'data-block': name,
          'data-attributes': JSON.stringify(attributes),
          class: `adestia-block adestia-block--${name}`,
        },
        // Whatever the block is addressed BY — `id` for an app, `source` for
        // a file-backed one. A bare name would make three blocks of the same
        // kind indistinguishable in a document being edited.
        `${name}: ${attributes['id'] ?? Object.values(attributes)[0] ?? ''}`,
      ]
    },
    parseMarkdown: {
      match: (node) => node.type === 'containerDirective' && node.name === name,
      runner: (state, node, type) => {
        state.addNode(type, { attributes: (node.attributes ?? {}) as Record<string, string> })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === pmId(name),
      runner: (state, node) => {
        state.openNode('containerDirective', undefined, {
          name,
          attributes: node.attrs['attributes'] as Record<string, string>,
        })
        // Closed immediately: the block's attributes ARE its whole meaning,
        // and the server refuses a body on it anyway.
        state.closeNode()
      },
    },
  }))
}

/**
 * Wikilinks, as an inline atom.
 *
 * Every grammar entry that can produce a NODE needs a matching editor node:
 * without one Milkdown throws "cannot match target parser" on a document the
 * renderer handles perfectly. That is the right failure — loud, naming the
 * node — but it means sharing the grammar is only half the contract; this is
 * the other half.
 */
export const wikiLinkNode = $node('wikiLink', () => ({
  content: '',
  group: 'inline',
  inline: true,
  atom: true,
  // The alias is kept even though it is usually the target repeated: a link
  // written `[[target:label]]` must come back written that way, and only the
  // node knows which of the two forms the file used.
  attrs: { value: { default: '' }, alias: { default: '' } },
  parseDOM: [
    {
      tag: 'a[data-wikilink]',
      getAttrs: (dom) => ({
        value: (dom as HTMLElement).dataset['wikilink'] ?? '',
        alias: (dom as HTMLElement).dataset['alias'] ?? '',
      }),
    },
  ],
  toDOM: (node) => {
    const value = node.attrs['value'] as string
    const alias = (node.attrs['alias'] as string) || value
    return [
      'a',
      {
        'data-wikilink': value,
        'data-alias': alias,
        class: 'adestia-wikilink',
        href: `#/pages/${value}`,
      },
      `[[${alias}]]`,
    ]
  },
  parseMarkdown: {
    match: ({ type }) => type === 'wikiLink',
    runner: (state, node, type) => {
      const data = (node.data ?? {}) as { alias?: string }
      state.addNode(type, {
        value: (node.value ?? '') as string,
        alias: data.alias ?? (node.value as string) ?? '',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wikiLink',
    runner: (state, node) => {
      const value = node.attrs['value'] as string
      // The serializer reads `value` AND `data.alias`; handing it a bare value
      // makes it throw on a property it assumes always exists.
      state.addNode('wikiLink', undefined, undefined, {
        value,
        data: { alias: (node.attrs['alias'] as string) || value },
      })
    },
  },
}))

export const calloutNode = containerNode('callout')
export const galleryNode = containerNode('gallery')
export const appNode = atomNode('app')

/**
 * Everything the editor adds on top of the commonmark preset.
 *
 * A FUNCTION, not a constant, and the reason is the ordering: the blocks a
 * plugin contributes are registered when the shell loads its plugins, while
 * this module is imported later still — the editor is downloaded on demand.
 * Reading the registry at call time is what makes that ordering irrelevant
 * instead of load-bearing.
 *
 * Every block needs a node here or Milkdown throws "cannot match target
 * parser" on a document the reader renders perfectly. That is the right
 * failure — loud, and naming the node — but it means a contributed block that
 * only had a component would break the editor on the first page holding one.
 */
export function adestiaVocabulary(): MilkdownPlugin[] {
  // ONE node per name, custom nodes first. Two ways a duplicate would arise,
  // and Milkdown throws on both: a core block that also needs a generic node
  // (`content`, `figures`, `table`, `list` — none has a hand-written one), and
  // a claim on a name already covered — a plugin overriding `table`, or two
  // features declaring the same block. The node is per NAME, deliberately:
  // attributes are kept verbatim and the body is always carried, so the node
  // does not depend on which claim wins on a given page.
  const seen = new Set(['callout', 'gallery', 'app'])
  const generic = [...Object.values(VOCABULARY), ...contributedBlocks()]
    .filter((spec) => (seen.has(spec.name) ? false : (seen.add(spec.name), true)))
    // A container as soon as ANY definition of the name takes a body. The
    // node is per name while definitions are per plugin, and an atom EATS a
    // body it cannot hold — the "silently eaten text" the design warns
    // relaxing the validator would cause. A body-less block in a container
    // is merely empty; a body in an atom is gone.
    .map((spec) =>
      shapesOf(spec.name).has('flow') ? containerNode(spec.name) : atomNode(spec.name),
    )
  return [
    grammarRemarks,
    frontmatterNode,
    wikiLinkNode,
    calloutNode,
    galleryNode,
    appNode,
    ...generic,
  ].flat()
}
