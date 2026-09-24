/**
 * The properties form for ONE page, assembled from the three places that know
 * something about it.
 *
 * The core declares the fields it reads, a plugin declares the fields it reads
 * for the types it claims, and the CORPUS supplies the values. That last one
 * is what makes the form guided without making it a cage: `domaine: atelier`
 * is a fact about one workspace, never about Adestia, so the list offers what
 * the workspace already writes and takes a new word without blinking.
 *
 * Nothing here costs a request. The shell already holds every page's
 * frontmatter — it keeps the index live for the reader's own reasons — so the
 * whole vocabulary of an instance is one pass over an array that is already
 * in memory.
 */

import {
  CORE_FIELDS,
  fieldFor,
  type ContributedField,
  type FieldSpec,
  type FieldValue,
  type Indexed,
} from '@antorfr/adestia-content'

/** What a plugin declares, flattened by the page type it belongs to. */
export interface DeclaredFields {
  /** Which plugin said so, for the group's own name on screen. */
  readonly plugin: string
  readonly fields: Readonly<Record<string, ContributedField>>
  /**
   * That plugin's own words, in the reader's language.
   *
   * Applied HERE, as the form is assembled, rather than where it renders —
   * which is what leaves the shell's own table as the fallback it already
   * was. A label the plugin translates arrives in French and passes through
   * `t` untouched; one it does not arrives in English, where the shell may
   * still know it (`Title`, `Tags`). Two tables, one pass, no third rule.
   */
  readonly words?: Readonly<Record<string, string>>
}

/** Page types and their declared fields, by type. */
export type FieldContributions = Readonly<Record<string, DeclaredFields>>

/** Another page, as an option in a reference field. */
export interface PageOption {
  readonly id: string
  readonly title: string
}

export interface FormField {
  readonly spec: FieldSpec
  /**
   * What the list offers: what the field declares, then what the workspace
   * writes, most used first. Never a closed set unless the spec says so.
   */
  readonly options: readonly string[]
  /** `reference` only: the pages that may answer, by id. */
  readonly references?: readonly PageOption[]
}

export interface FormGroup {
  readonly id: string
  /**
   * Already in the reader's language where a plugin translated it, English
   * otherwise — the shell's own table is applied on top, at the render.
   * A plugin's group wears its own id unless its table gives that id a name.
   */
  readonly label: string
  readonly fields: readonly FormField[]
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

/**
 * Every value the corpus writes for a key, most used first.
 *
 * Frequency rather than the alphabet, and it is the difference between a
 * useful list and a long one: on a real workspace `domaine` has four values
 * that cover nine pages in ten and a tail of one-offs, and the four must be
 * where the thumb lands. Ties fall back to the alphabet so the order is
 * stable between two renders of the same index.
 */
export function valuesInUse(pages: readonly Indexed[], key: string, locale = 'en'): string[] {
  const counts = new Map<string, number>()
  for (const page of pages) {
    const raw = page.fields[key]
    const values = Array.isArray(raw) ? raw : [raw]
    for (const one of values) {
      const value = text(one)
      if (value === undefined) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale))
    .map(([value]) => value)
}

/**
 * The pages a reference field may point at — those carrying `of` as their type.
 *
 * Only the ones with an `id`: a reference is written as an id, so a page
 * without one cannot be named. Offering it would produce a menu entry that
 * writes nothing, which is worse than a menu that is honestly shorter.
 */
export function pagesOfType(
  pages: readonly Indexed[],
  of: string,
  locale = 'en',
): PageOption[] {
  return pages
    .filter((page) => text(page.fields['type']) === of)
    .flatMap((page) => {
      const id = text(page.fields['id'])
      if (id === undefined) return []
      return [{ id, title: text(page.fields['title']) ?? id }]
    })
    .sort((a, b) => a.title.localeCompare(b.title, locale))
}

function optionsFor(
  spec: FieldSpec,
  pages: readonly Indexed[],
  locale: string,
): readonly string[] {
  const declared = spec.values ?? []
  if (spec.closed) return declared
  const seen = new Set(declared)
  const found = valuesInUse(pages, spec.key, locale).filter((value) => !seen.has(value))
  return [...declared, ...found]
}

/**
 * The form for a page, group by group.
 *
 * A field is drawn when the page carries it, when its spec asks to be there
 * anyway, or when the page's type claims it. Everything else waits behind
 * "add a field" — a page with three properties shows three rows, not ten
 * empty controls implying ten things are missing.
 */
export function formFor(options: {
  /** What the page's frontmatter says today. */
  readonly present: Readonly<Record<string, FieldValue>>
  /** The instance's pages, for the values and the references. */
  readonly pages: readonly Indexed[]
  /** What the active plugins declare, by type. */
  readonly contributions?: FieldContributions
  readonly locale?: string
  /**
   * Keys the form must NOT offer, because something else on screen already
   * owns them — the title, when the caller draws its own field for it.
   */
  readonly without?: readonly string[]
}): { groups: readonly FormGroup[]; unknown: readonly string[] } {
  const { present, pages, contributions = {}, locale = 'en', without = [] } = options
  const hidden = new Set(without)
  const type = text(present['type'])
  const claimed = type ? contributions[type] : undefined

  const build = (spec: FieldSpec): FormField => ({
    spec,
    options: optionsFor(spec, pages, locale),
    ...(spec.kind === 'reference' && spec.of
      ? { references: pagesOfType(pages, spec.of, locale) }
      : {}),
  })

  const core = CORE_FIELDS.filter(
    (spec) => !hidden.has(spec.key) && (spec.always === true || spec.key in present),
  )
  const groups: FormGroup[] = [
    { id: 'page', label: 'This page', fields: core.filter((spec) => spec.group === 'page').map(build) },
    { id: 'filing', label: 'Filing', fields: core.filter((spec) => spec.group === 'filing').map(build) },
  ]

  if (claimed) {
    // The plugin's own words, for the words the plugin declared. A manifest
    // is read before any of its code runs, so these labels cannot be written
    // in the reader's language — they are written in English and translated
    // here, by the table the plugin handed over when it loaded.
    const said = (key: string): string =>
      claimed.words !== undefined && Object.hasOwn(claimed.words, key) ? claimed.words[key]! : key
    const fields = Object.entries(claimed.fields)
      .filter(([key]) => !hidden.has(key))
      .map(([key, spec]) =>
        build({
          ...spec,
          key,
          group: 'filing',
          label: said(spec.label),
          ...(spec.help === undefined ? {} : { help: said(spec.help) }),
        }),
      )
    if (fields.length > 0) {
      groups.push({ id: claimed.plugin, label: said(claimed.plugin), fields })
    }
  }

  /*
   * Written on the page and claimed by nobody — kept VISIBLE rather than
   * silently carried. It is the same rule a block's settings follow: a stale
   * attribute somebody can see is a stale attribute somebody can remove, and
   * one the form hides is one that outlives every person who knew about it.
   */
  const declaredKeys = new Set(groups.flatMap((group) => group.fields.map((one) => one.spec.key)))
  const unknown = Object.keys(present).filter((key) => !declaredKeys.has(key) && !hidden.has(key))

  return { groups: groups.filter((group) => group.fields.length > 0), unknown }
}

/**
 * The fields a page could gain — declared, not yet written.
 *
 * What "+ add a field" offers. A plugin's fields are absent from it: they are
 * already drawn in full for the type that claims them, and offering them on a
 * page of another type would be offering somebody else's vocabulary.
 */
export function addableFields(
  present: Readonly<Record<string, FieldValue>>,
  without: readonly string[] = [],
): readonly FieldSpec[] {
  const hidden = new Set(without)
  return CORE_FIELDS.filter(
    (spec) =>
      !hidden.has(spec.key) &&
      !(spec.key in present) &&
      // A field already on screen is not a field to add. Offering `Tags`
      // under "add a field" while its own row sits three lines above is a
      // menu entry that does nothing, and the kind of small lie that makes a
      // form feel untrustworthy.
      spec.always !== true,
  )
}

/** A field spec for a key written on the page that nothing declares. */
export const strayField = (key: string): FieldSpec => fieldFor(key)
