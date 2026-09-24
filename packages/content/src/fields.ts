/**
 * What a page may say about itself, declared once.
 *
 * The block vocabulary next door is CLOSED — nobody may write a structure
 * this repository has not coded. Frontmatter is the opposite and deliberately
 * so: two fields are read by the core (`title`, `type`) and everything past
 * them is convention, which is what lets a workspace invent `domaine`,
 * `cat` or `chantier` without asking anyone. That freedom is the reason the
 * agent can file things the way its person thinks.
 *
 * It is also why a person editing the same page had nothing but raw YAML. A
 * guided form needs to know what a field MEANS and what values are plausible,
 * and until now that knowledge lived in three places that could not be read
 * by a screen: this engine's code, a plugin's authoring skill, and the corpus
 * itself.
 *
 * So the knowledge is split three ways, honestly:
 *
 * - **here**, the fields the CORE itself reads — it is the only table that
 *   can claim to be authoritative, and it stays short on purpose;
 * - **in a plugin's manifest** (`fields`), the fields that plugin's own code
 *   reads for the types it claims — a task's `due` belongs to the task app,
 *   not to this file;
 * - **in the corpus**, the VALUES. `domaine: atelier` is not a fact about
 *   Adestia, it is a fact about one workspace, and the index already carries
 *   every page's frontmatter. A screen derives the list from what is written
 *   rather than from a table somebody would have to maintain.
 *
 * Which is the whole point: the form proposes what the workspace already
 * says, and never refuses a word it has not met.
 */

import { SUGGESTED_STATUSES } from './status.js'

/** What kind of control a field wants, and therefore how it is written. */
export type FieldKind =
  /** A line of prose. */
  | 'text'
  /** One value among a list — suggested, not closed, unless `closed`. */
  | 'choice'
  /** A flat list of words. */
  | 'tags'
  /** An ISO date, `YYYY-MM-DD`. */
  | 'date'
  /** A number; lower is usually more urgent. */
  | 'number'
  /** One glyph, drawn beside the page's name. */
  | 'icon'
  /** Another page, named by its `id` — `of` says which type answers. */
  | 'reference'

/** Where a field sits in the form. */
export type FieldGroup =
  /** What the page IS: its name, its subject, its glyph. */
  | 'page'
  /** How it is filed: state, domain, tags. */
  | 'filing'

export interface FieldSpec {
  readonly key: string
  readonly kind: FieldKind
  /** The field's name on screen, in English; the shell translates it. */
  readonly label: string
  /** One sentence: what it does, and when somebody would set it. */
  readonly help?: string
  /**
   * Values the form offers before it has looked at the corpus. A suggestion,
   * unless `closed` — the workspace's own words are added to these, never
   * replaced by them.
   */
  readonly values?: readonly string[]
  /**
   * No value outside `values` is offered. Only for a vocabulary the CODE
   * resolves: a hue the skin must know how to draw is not a free word.
   */
  readonly closed?: boolean
  /** `reference` only: the `type` of the pages that may answer. */
  readonly of?: string
  readonly group: FieldGroup
  /**
   * Drawn even when the page does not carry it.
   *
   * Off for most of them, and that is the difference between a form and a
   * questionnaire: a page with three fields must show three rows plus a way
   * to add a fourth, not ten empty controls implying ten things are missing.
   */
  readonly always?: boolean
}

/**
 * A field a PLUGIN declares, in its manifest.
 *
 * The same spec minus the three things a manifest cannot decide: the key,
 * which is the entry's own name; the group, which is always the plugin; and
 * whether it is drawn on a page that does not carry it — a plugin's field is
 * always drawn for the type it belongs to, because that type IS the reason
 * the page exists.
 */
export type ContributedField = Omit<FieldSpec, 'key' | 'group' | 'always'>

/**
 * The named hues a page may ask for.
 *
 * Closed because the value is resolved by CODE: the shell turns `couleur:
 * turquoise` into `--adestia-hue-turquoise` and the skin says what that means.
 * A page that could name any colour would be a page writing CSS in its
 * frontmatter, which is exactly what the names exist to refuse.
 *
 * ⚠️ The list is the one `tokens.css` defines. Adding a hue is two edits.
 */
export const HUES: readonly string[] = [
  'rouge',
  'orange',
  'ambre',
  'vert',
  'emeraude',
  'turquoise',
  'bleu',
  'indigo',
  'violet',
  'rose',
  'gris',
  'ardoise',
]

/**
 * The fields the core itself reads.
 *
 * In the order a form asks them, which is editorial and therefore lives with
 * the declaration rather than in a component where a second list would have
 * to be kept in step.
 */
export const CORE_FIELDS: readonly FieldSpec[] = [
  {
    key: 'title',
    kind: 'text',
    label: 'Title',
    help: 'What this page is called everywhere it is cited. Without it, the first heading is used, then the file name.',
    group: 'page',
    always: true,
  },
  {
    key: 'type',
    kind: 'choice',
    label: 'Subject',
    help: 'The busiest word in the system: it is what an app filters on, and it can decide which screen the page opens as.',
    group: 'page',
    always: true,
  },
  {
    key: 'ico',
    kind: 'icon',
    label: 'Icon',
    help: 'One glyph, drawn beside the name on tiles and in lists.',
    group: 'page',
  },
  {
    key: 'id',
    kind: 'text',
    label: 'Identifier',
    help: 'How another page links here. Set one and the link survives a move; without it, a link travels by path.',
    group: 'page',
  },
  {
    key: 'couleur',
    kind: 'choice',
    label: 'Colour',
    help: 'The hue of the tile this page dresses, when it is a folder’s index.',
    values: HUES,
    closed: true,
    group: 'page',
  },
  {
    key: 'status',
    kind: 'choice',
    label: 'State',
    help: 'A finished page leaves the live grid for the fold at the bottom — it is never dropped.',
    values: SUGGESTED_STATUSES,
    group: 'filing',
    always: true,
  },
  {
    key: 'domaine',
    kind: 'choice',
    label: 'Domain',
    help: 'The corner of the workspace this belongs to. Searched on, and the usual first grid of a collection.',
    group: 'filing',
  },
  {
    key: 'cat',
    kind: 'choice',
    label: 'Category',
    help: 'A finer filing than the domain — the trade, the course, the person.',
    group: 'filing',
  },
  {
    key: 'tags',
    kind: 'tags',
    label: 'Tags',
    help: 'Words this page can be found by. Searched as written.',
    group: 'filing',
    always: true,
  },
  {
    key: 'date',
    kind: 'date',
    label: 'Date',
    help: 'The day this page is about, when that is not the day it was written.',
    group: 'filing',
  },
]

/** The core's fields by key, for a lookup that does not walk the list. */
export const CORE_FIELD_AT: Readonly<Record<string, FieldSpec>> = Object.fromEntries(
  CORE_FIELDS.map((field) => [field.key, field]),
)

/**
 * A field the core declares, or one invented for a key nobody claims.
 *
 * Never undefined, and that is the point: a page carrying `chantier: cuisine`
 * gets a row with its own name on it rather than disappearing from the form.
 * A field nobody declared is a free choice — the corpus supplies its values,
 * so a second page reuses the first one's word instead of inventing a synonym.
 */
export function fieldFor(
  key: string,
  declared: Readonly<Record<string, FieldSpec>> = {},
): FieldSpec {
  return (
    declared[key] ??
    CORE_FIELD_AT[key] ?? {
      key,
      kind: 'choice',
      label: key,
      group: 'filing',
    }
  )
}
