/**
 * Collections — entering a body of pages by a facet, not by folders.
 *
 * The principle: you enter through a grid of cards, then descend, never a
 * long list. Projects by trade, gifts by person, recipes by course — one
 * mechanic, declared IN A PAGE rather than in code:
 *
 * ```markdown
 * ---
 * type: collection
 * title: Projets
 * of: projet          # collects the pages whose `type` is this
 * groupBy: cat        # the facet that becomes the first grid
 * into: diy/projets   # where a new member is filed
 * ---
 * ```
 *
 * A collection is a QUERY over the index: a page appears in every collection
 * whose `of` matches its `type`, and there is only ever one page. Drawn by
 * the core since 2026-09-16 — it used to be a plugin, and the design's own
 * criterion (a plugin exists when it brings a display the core does not have)
 * found that a grid of grouped cards folding finished things away is exactly
 * what a section already draws. Two implementations of one idea drifted; this
 * is the one.
 */

import { isFinished } from '@antorfr/adestia-content'

import type { IndexEntry } from './sections.js'

/** A page the collection gathers, with the verdict on its life. */
export interface Member {
  readonly path: string
  readonly title: string
  readonly fields: Readonly<Record<string, unknown>>
  readonly store?: string | undefined
  readonly finished: boolean
}

export interface Collection {
  /** The `type` it collects. Absent, it collects nothing — and says so. */
  readonly of: string | undefined
  /** The frontmatter field that becomes the first grid; absent lists flat. */
  readonly groupBy: string | undefined
  /** The folder a new member is asked into. */
  readonly into: string | undefined
  /** `value=Label` pairs, so a raw value reads properly without code knowing the vocabulary. */
  readonly labels: Readonly<Record<string, string>>
  readonly members: readonly Member[]
  /**
   * The living and the settled, split once here.
   *
   * A collection of projects fills up with finished ones within a year, and a
   * grid where nine cards out of ten are done is a grid nobody scans. So the
   * finished leave for a fold at the bottom — never dropped: what was done is
   * exactly what somebody comes looking for when they want to know how it
   * went last time.
   */
  readonly live: readonly Member[]
  readonly archived: readonly Member[]
}

/** One value of the facet, as a card. */
export interface Facet {
  readonly value: string
  readonly label: string
  readonly live: readonly Member[]
  readonly archived: readonly Member[]
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Reads the declaration and the pages it collects.
 *
 * The verdict on a page's life comes from the content engine's own table,
 * the one the server publishes and the section screens read — so a
 * collection, a section and the editor agree without anyone keeping a second
 * list of which words close a page.
 */
export function collectionOf(
  fields: Readonly<Record<string, unknown>>,
  entries: readonly IndexEntry[],
): Collection {
  const of = text(fields['of'])
  // A declaration with no `of` collects nothing and says so, rather than
  // collecting everything — a collection that silently matched every page
  // would look like a bug in the pages, not in the declaration.
  const members: readonly Member[] = of
    ? entries
        .filter((entry) => entry.fields['type'] === of)
        .map((entry) => ({
          path: entry.path,
          title: entry.title,
          fields: entry.fields,
          ...(entry.store ? { store: entry.store } : {}),
          finished: isFinished(entry.fields),
        }))
    : []
  return {
    of,
    groupBy: text(fields['groupBy']),
    into: text(fields['into']),
    labels: parseLabels(fields['labels']),
    members,
    live: members.filter((member) => !member.finished),
    archived: members.filter((member) => member.finished),
  }
}

/** `labels: menuiserie=Menuiserie, dev=Développement` — flat, and readable. */
export function parseLabels(raw: unknown): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {}
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  for (const item of items) {
    const [key, ...rest] = String(item).split('=')
    if (key !== undefined && rest.length > 0) labels[key.trim()] = rest.join('=').trim()
  }
  return labels
}

/**
 * The facets of a collection, as cards — or nothing, when it groups by nothing.
 *
 * Sorted by what is live, then by name: the biggest group is where someone is
 * most likely heading, and alphabetical order alone buries it under whatever
 * starts with A. A page missing the facet is not dropped: it lands in
 * "Uncategorised", last, where somebody can see it and fix it — hiding it
 * would make the collection lie about its own size.
 */
export function facetsOf(
  collection: Collection,
  t: (key: string) => string = (key) => key,
): readonly Facet[] | undefined {
  const key = collection.groupBy
  if (!key) return undefined

  const groups = new Map<string, { live: Member[]; archived: Member[] }>()
  for (const member of collection.members) {
    const raw = member.fields[key]
    const values = Array.isArray(raw) ? raw.map(String) : [raw == null ? '' : String(raw)]
    for (const value of values) {
      const group = groups.get(value) ?? { live: [], archived: [] }
      group[member.finished ? 'archived' : 'live'].push(member)
      groups.set(value, group)
    }
  }

  return [...groups.entries()]
    .map(([value, group]) => ({
      value,
      label: value === '' ? t('Uncategorised') : (collection.labels[value] ?? prettify(value)),
      live: group.live,
      archived: group.archived,
    }))
    .sort((a, b) => {
      if (a.value === '') return 1
      if (b.value === '') return -1
      if (b.live.length !== a.live.length) return b.live.length - a.live.length
      return a.label.localeCompare(b.label)
    })
}

/** `rangement-garage` → `Rangement garage`. */
export function prettify(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value
}

/**
 * A member's status, when it declares one — read, never interpreted. The
 * vocabulary belongs to whoever writes the pages, and a collection that only
 * understood four statuses would silently ignore the fifth.
 */
export function statusOf(fields: Readonly<Record<string, unknown>>): string | undefined {
  return text(fields['status']) ?? text(fields['statut'])
}
