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
  /**
   * A body when the body IS the data, none when the block queries for it.
   *
   * Not indecision: it is one rendering with two PROVENANCES, which is what
   * a written planning and a consolidated one are — the same bars, read from
   * the block or from the pages below. Declaring `flow` would lock the page
   * that queries (a body it does not have), `empty` the page that writes
   * (a body it must have), so the shape a name takes is decided by the
   * occurrence's attributes, and the validator judges neither.
   *
   * The bar for using it: BOTH provenances draw the same thing. A name whose
   * two forms draw differently is two renderings wearing one word.
   */
  | 'optional'

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
  /**
   * Which plugin draws this block — a plugin id, or `core` for the plain
   * rendering. Open-valued here because the legal set is the INSTANCE's
   * plugin list, which this closed table cannot know; a name nothing carries
   * is a visible notice at render time, not a validation error.
   */
  from: null,
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
      /**
       * Display, on the same ladder the tiles taught: the occurrence beats a
       * configured label, which beats the prettified `type`. Neither replaces
       * `type` — the SUBJECT is what queries, pulls and configs address, and
       * it stays required with or without these two.
       */
      title: {},
      ico: {},
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
   * A markdown table, given a name so it can be styled and overridden.
   *
   * What the CORE does with it is deliberately small: it scrolls in its own
   * box, so a wide grid never makes the page move sideways, and its first
   * column is emphasised as the key of its row. Nothing else — no tone, no
   * scale, no vocabulary of severities.
   *
   * It carried a `type` for one commit, described as colouring the first
   * column by a risk's gravity. That was a project tracker's idea of a table
   * living in everyone's vocabulary: `moyen` and `levé` mean something on a
   * risk register and nothing on a price list, and `toneOf` — the core's own —
   * knows neither. A domain that wants a scale OVERRIDES this block and brings
   * its own; that is what overriding is for.
   *
   * No attributes at all, therefore. An attribute nothing reads is the `app`
   * mistake above in miniature, and it was shipped here once already.
   */
  table: {
    name: 'table',
    content: 'flow',
    description: 'A markdown table, scrolling, with its first column emphasised.',
    attributes: {},
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
    // TWO provenances, one drawing. Written — the body's lines ARE the rows,
    // `Rôle: Personne`, the same first-colon cut `figures` and `timeline`
    // make — or queried, from `source=`. A declaration of who does what on a
    // project cannot be derived from anything: somebody decides it. That is
    // still a list, not free prose, and calling it `content` would have made
    // the name mean "text" on one page and "rows" on another.
    content: 'optional',
    description: 'Rows: the pages under this one, or the lines written in the block.',
    attributes: {
      // The slot a plugin widens. Closed to one value, so it cannot promise
      // a source nobody answers: `source=children` gets exactly what it says.
      // Named `source` and not `from`, because `from=` is the RESERVED word
      // for "which plugin draws this block" — one word cannot carry both.
      source: { values: ['children'], default: 'children' },
      depth: { values: ['self', 'children', 'subtree'], default: 'children' },
      pull: {},
      sort: {},
      closed: { values: ['fold', 'hide', 'show'], default: 'fold' },
      // Every value here is DRAWN. `grid` is absent on purpose: it belongs to
      // `source=files`, which nothing answers yet, and an attribute value
      // that draws nothing is the documented lie this table paid for once.
      view: { values: ['rows', 'cards', 'chips'], default: 'rows' },
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

/**
 * A plugin's claim on a block name — the spec, and WHO makes it.
 *
 * The flat `Map<name, spec>` this replaces could not say who contributed a
 * block or what kind of plugin they were, so no ranking was computable and
 * `registerBlocks` had to refuse core collisions outright. Provenance is what
 * turns "the core wins" into "the core is the default".
 */
export interface BlockClaim {
  readonly spec: BlockSpec
  readonly plugin: string
  readonly kind: 'app' | 'feature'
}

/** Every claim, per name, in registration order. */
const claims = new Map<string, BlockClaim[]>()

/** A block spec as a MANIFEST spells it — same shape, attributes optional. */
export type ContributedBlock = Omit<BlockSpec, 'name' | 'attributes'> & {
  readonly attributes?: Readonly<Record<string, AttributeSpec>>
}

/**
 * Records a plugin's claims on block names — ALL of them, core names included.
 *
 * This function refused core collisions for as long as resolution was global,
 * and the comment defending that said `callout` quietly meaning something else
 * on one instance is the failure a closed vocabulary exists to prevent. It
 * still is — and it is prevented one level up now: resolution is contextual
 * (see `resolveBlock`), so a redefinition of a core name only ever applies
 * inside the claiming app's own domain. Refusing here would make overriding
 * impossible, which for five days it did while the design said otherwise.
 *
 * @param source who is claiming — absent in old callers and tests, read as an
 *   anonymous app, which keeps the historic behaviour for a custom name.
 */
export function registerBlocks(
  specs: Readonly<Record<string, ContributedBlock>>,
  source?: { readonly plugin: string; readonly kind?: 'app' | 'feature' },
): readonly string[] {
  for (const [name, spec] of Object.entries(specs)) {
    const row = claims.get(name) ?? []
    row.push({
      // A block with no attributes writes no `attributes` key: the manifest is
      // hand-written data, and `"attributes": {}` is ceremony, not information.
      spec: { attributes: {}, ...spec, name },
      plugin: source?.plugin ?? 'plugin',
      kind: source?.kind ?? 'app',
    })
    claims.set(name, row)
  }
  // Nothing is refused any more; the empty array keeps old callers compiling
  // while their refusal-reporting loops report nothing.
  return []
}

/** Drops every contribution. For a plugin set being reloaded, and for tests. */
export function forgetContributedBlocks(): void {
  claims.clear()
}

/**
 * One spec per contributed NAME — what the editor needs a node for, and the
 * skill a line. When several plugins claim a name, the first claim stands in:
 * the editor keeps attributes verbatim and always carries a body, so the node
 * does not depend on which claim wins on a given page.
 */
export function contributedBlocks(): readonly BlockSpec[] {
  return [...claims.values()].map((row) => row[0]!.spec)
}

/**
 * ── Resolution: which definition applies HERE ──────────────────────────────
 *
 * `from=` on the block answers outright — a plugin id, or `core` for the plain
 * rendering. Absent, the walk runs over the plugins that define this name,
 * nearest first: the app owning this page's domain, then features in the
 * instance's declared order, then the core, then a foreign app.
 *
 * Two lines carry the doctrine. A FEATURE is skipped when the core defines the
 * name: an app owns a domain so the page's location carries the choice, a
 * feature is everywhere so nothing does, and a feature specialising a core
 * block must be asked for by name. And the foreign app comes LAST but comes:
 * an app's own block works on every page of the instance, while its
 * redefinition of a core name stays inside its domain — a redefinition is
 * bounded, a definition never is, because bounding a name nobody else claims
 * would protect nothing and break the block everywhere else.
 */
export interface BlockContext {
  /** The plugin id owning this page's domain, when an app does. */
  readonly owner?: string | undefined
  /** Feature plugin ids, in the instance's declared order. */
  readonly features?: readonly string[] | undefined
  /** The block's own `from=`, when written. */
  readonly from?: string | undefined
}

export interface ResolvedBlock {
  readonly spec: BlockSpec
  /** Who draws it: a plugin id, or `core`. */
  readonly plugin: string
}

export function resolveBlock(name: string, ctx?: BlockContext): ResolvedBlock | undefined {
  const core = VOCABULARY[name]
  const row = claims.get(name) ?? []

  if (ctx?.from !== undefined) {
    if (ctx.from === 'core') return core ? { spec: core, plugin: 'core' } : undefined
    const named = row.find((claim) => claim.plugin === ctx.from)
    return named ? { spec: named.spec, plugin: named.plugin } : undefined
  }

  if (ctx?.owner !== undefined) {
    const own = row.find((claim) => claim.plugin === ctx.owner)
    if (own) return { spec: own.spec, plugin: own.plugin }
  }

  if (core === undefined) {
    for (const id of ctx?.features ?? []) {
      const feat = row.find((claim) => claim.plugin === id && claim.kind === 'feature')
      if (feat) return { spec: feat.spec, plugin: feat.plugin }
    }
  }

  if (core) return { spec: core, plugin: 'core' }

  // The furthest definers, registration order. Reached only when nobody
  // nearer defines the name — the sole-definer case, and the ordinary way an
  // app's own block reaches every page of the instance.
  const any = row[0]
  return any ? { spec: any.spec, plugin: any.plugin } : undefined
}

/**
 * Every shape this name is defined with, across the core and all claims.
 *
 * Definitions need not agree — that is the contract — so a shape check cannot
 * judge a page against ONE spec: a body legal under the app's definition must
 * not be an error under the core's. The validator errors only when every
 * definition agrees the shape is wrong; a disagreement is a warning, and the
 * winning renderer says the rest on screen.
 */
export function shapesOf(name: string): ReadonlySet<BlockContent> {
  const shapes = new Set<BlockContent>()
  const core = VOCABULARY[name]
  if (core) shapes.add(core.content)
  for (const claim of claims.get(name) ?? []) shapes.add(claim.spec.content)
  return shapes
}

export function isKnownBlock(name: string): boolean {
  return Object.hasOwn(VOCABULARY, name) || claims.has(name)
}

export function blockSpec(name: string): BlockSpec | undefined {
  return resolveBlock(name)?.spec
}
