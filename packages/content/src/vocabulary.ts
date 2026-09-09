/**
 * The closed block vocabulary.
 *
 * This file is the reason visual uniqueness holds: neither the agent nor the
 * user can reach the pixel, because the only structures either of them may
 * write are declared here. Extending the vocabulary is a deliberate act — a
 * coded component plus an entry in this table plus a line in the authoring
 * skill — never something that happens by accident in a document.
 *
 * The same table is read by the parser (what is legal), the renderer (what to
 * draw) and the authoring skill (what to teach). One source, three consumers.
 */

/** How a block carries content. */
export type BlockContent =
  /** Nested markdown inside the block (a callout holds paragraphs, lists…). */
  | 'flow'
  /** No body at all — the block IS its attributes (an embedded app). */
  | 'empty'

export interface AttributeSpec {
  readonly required?: boolean
  /** Closed set of accepted values. Absent means any non-empty string. */
  readonly values?: readonly string[]
  readonly default?: string
}

export interface BlockSpec {
  readonly name: string
  readonly content: BlockContent
  readonly attributes: Readonly<Record<string, AttributeSpec>>
  readonly description: string
}

/**
 * ── Attributes every block carries, without any spec declaring them ─────────
 *
 * The `id` case, generalised. An id is not an attribute OF a block, it is the
 * block's identity; `w` is not one either, it is how much of a line the block
 * takes. Both belong to the DOCUMENT rather than to any one rendering, so
 * declaring them in each spec would be one idea copied as many times as there
 * are renderers — and the ninth copy is the one somebody forgets, after which a
 * legitimate page warns on every load.
 *
 * `null` accepts any value; a list is a closed set validated like any other.
 * `w` is closed because it is a LAYOUT vocabulary and not a free measurement:
 * a page that could say `w=37%` would be a page laying itself out in CSS
 * written by hand in frontmatter, which is what the fractions exist to refuse.
 */
export const RESERVED: Readonly<Record<string, readonly string[] | null>> = {
  id: null,
  w: ['1', '2/3', '1/2', '1/3'],
}

/** How much of a line a `w` value asks for, as a fraction of one. */
export const WIDTHS: Readonly<Record<string, number>> = {
  '1': 1,
  '2/3': 2 / 3,
  '1/2': 1 / 2,
  '1/3': 1 / 3,
}

export const VOCABULARY: Readonly<Record<string, BlockSpec>> = {
  callout: {
    name: 'callout',
    content: 'flow',
    description: 'A highlighted aside: note, tip or warning.',
    attributes: {
      type: { values: ['note', 'tip', 'warning'], default: 'note' },
    },
  },
  /**
   * ⚠️ DECLARED HERE, DRAWN BY NOBODY.
   *
   * The reader has no branch for `app` and no plugin contributes one, so a
   * page writing `:::app{id="…"}` is ACCEPTED by the validator — this table is
   * what `editable` answers from — and then renders the unknown-block
   * diagnostic. Legal and inert, which is the worst pair: an author has no
   * reason to doubt a block the server just took.
   *
   * It survives because the content engine's own tests use it as their
   * `empty`-with-a-required-attribute fixture (`typed-blocks.md`,
   * `roundtrip`, `validate`). Nothing else in the repository writes one.
   *
   * So: draw it, or take it out of the vocabulary and give the tests a
   * fixture that is not also a promise. Do not write one in a page meanwhile.
   */
  app: {
    name: 'app',
    content: 'empty',
    description: 'Embeds a coded app module, addressed by id. NOT DRAWN YET.',
    attributes: {
      id: { required: true },
      project: {},
    },
  },
  gallery: {
    name: 'gallery',
    content: 'flow',
    description: 'A group of images laid out as a gallery.',
    attributes: {},
  },

  /**
   * ── The generic renderings ──────────────────────────────────────────────
   *
   * They are here rather than in a plugin because nothing about them is any
   * one domain's: a purchase wants a decision, a walk wants a table, a project
   * wants both. A block a plugin contributes disappears when that plugin is
   * off, and a page holding one then opens read-only with a diagnostic — the
   * right answer for a map nobody can draw, an absurd one for a title and
   * prose. See DESIGN.md, "The core's vocabulary is the GENERIC one".
   *
   * Nine renderings rather than three is not the closed vocabulary giving way.
   * `content{type=…}` alone replaces the dozen subject-named blocks a plugin
   * design was about to declare — closed over renderings, open over subjects.
   */

  /**
   * A title and prose. The subject rides in `type`, which is why one rendering
   * covers a summary, a scope, a context and a letter to Father Christmas.
   *
   * `type` is REQUIRED for the reason the whole doctrine rests on: a block
   * whose subject went missing must be a visible refusal, not a paragraph that
   * quietly lost what it was about.
   */
  content: {
    name: 'content',
    content: 'flow',
    description: 'A titled passage of prose. Its subject is `type`.',
    attributes: {
      type: { required: true },
      by: {},
      on: {},
    },
  },

  /**
   * Numbers as tiles, read from a markdown list the file keeps readable:
   * `- Avancement: 62 % — 8 lots sur 13`. The label is what precedes the
   * colon, the figure what follows it, and an em dash opens a caption.
   *
   * No attributes, deliberately: everything it needs is in the list, which is
   * also what a person editing the file by hand can still read.
   */
  figures: {
    name: 'figures',
    content: 'flow',
    description: 'Figures drawn as tiles, from a markdown list.',
    attributes: {},
  },

  /**
   * A markdown table, drawn with its first column read as a TONE — `moyen`,
   * `levé`, `en cours` — so a grid of risks or of purchases can be scanned
   * down its left edge.
   *
   * `type` is optional here where `content` requires it, and the difference is
   * not an oversight: a table carries its own meaning in its header row, while
   * a passage of prose carries none without its subject.
   */
  table: {
    name: 'table',
    content: 'flow',
    description: 'A markdown table whose first column is read as a tone.',
    attributes: {
      type: {},
    },
  },

  /**
   * The pages under this one, as rows.
   *
   * `from` is the open slot of this rendering — a plugin that has something to
   * list READ-ONLY widens its accepted values rather than inventing a second
   * list. It is closed to `children` here because that is all the core can
   * answer today, and declaring a value nobody draws is the `app` mistake two
   * blocks above.
   *
   * `pull` names HEADER fields to show on each row, comma-separated. Header
   * fields only: the index publishes `fields` for every page and pays nothing
   * for it, while a block of a child's BODY is not published at all — see the
   * letter's "what pulling blocks really demands".
   */
  list: {
    name: 'list',
    content: 'empty',
    description: 'The pages under this one, as rows.',
    attributes: {
      from: { values: ['children'], default: 'children' },
      depth: { values: ['self', 'children', 'subtree'], default: 'children' },
      pull: {},
      sort: {},
      closed: { values: ['fold', 'hide', 'show'], default: 'fold' },
      view: { values: ['rows', 'cards'], default: 'rows' },
    },
  },
}

/**
 * ── Blocks a PLUGIN adds to the vocabulary ──────────────────────────────────
 *
 * The table above is the closed core, and closed it stays: nothing here lets a
 * page invent a block. What it lets an INSTANCE do is decide that a mounted,
 * activated plugin extends the vocabulary — which is a deliberate act by an
 * operator, exactly the bar `VOCABULARY`'s own comment sets.
 *
 * A registry rather than a bigger table, because the same names have to be
 * known in two processes that cannot share a module instance: the server (to
 * validate a page and answer `editable`) and the browser (to draw it). Both
 * read the spec from the plugin MANIFEST — declared data, not code — so the
 * server never has to execute a line of a browser module to know what is legal.
 */

const contributed = new Map<string, BlockSpec>()

/** A block spec as a MANIFEST spells it — same shape, attributes optional. */
export type ContributedBlock = Omit<BlockSpec, 'name' | 'attributes'> & {
  readonly attributes?: Readonly<Record<string, AttributeSpec>>
}

/**
 * Adds a plugin's blocks, and names the ones it could not have.
 *
 * The core WINS a name collision, the loser is reported, and the caller says
 * so at startup — the same rule the instance's MCP servers follow. The other
 * direction was tempting (the plugin knows its own block best) and is wrong
 * here: `callout` quietly meaning something else on one instance is precisely
 * the failure the closed vocabulary exists to make impossible.
 *
 * @returns the names refused because the core already owns them.
 */
export function registerBlocks(
  specs: Readonly<Record<string, ContributedBlock>>,
): readonly string[] {
  const refused: string[] = []
  for (const [name, spec] of Object.entries(specs)) {
    if (Object.hasOwn(VOCABULARY, name)) {
      refused.push(name)
      continue
    }
    // A block with no attributes writes no `attributes` key: the manifest is
    // hand-written data, and `"attributes": {}` is ceremony, not information.
    contributed.set(name, { attributes: {}, ...spec, name })
  }
  return refused
}

/** Drops every contribution. For a plugin set being reloaded, and for tests. */
export function forgetContributedBlocks(): void {
  contributed.clear()
}

/** What plugins have added — what the editor needs a node for, and the skill a line. */
export function contributedBlocks(): readonly BlockSpec[] {
  return [...contributed.values()]
}

export function isKnownBlock(name: string): boolean {
  return Object.hasOwn(VOCABULARY, name) || contributed.has(name)
}

export function blockSpec(name: string): BlockSpec | undefined {
  return VOCABULARY[name] ?? contributed.get(name)
}
