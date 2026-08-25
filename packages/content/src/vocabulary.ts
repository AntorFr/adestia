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

export const VOCABULARY: Readonly<Record<string, BlockSpec>> = {
  callout: {
    name: 'callout',
    content: 'flow',
    description: 'A highlighted aside: note, tip or warning.',
    attributes: {
      type: { values: ['note', 'tip', 'warning'], default: 'note' },
    },
  },
  app: {
    name: 'app',
    content: 'empty',
    description: 'Embeds a coded app module, addressed by id.',
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
