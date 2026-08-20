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

export function isKnownBlock(name: string): boolean {
  return Object.hasOwn(VOCABULARY, name)
}

export function blockSpec(name: string): BlockSpec | undefined {
  return VOCABULARY[name]
}
