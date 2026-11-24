/**
 * Sections — the workspace's own shape, as tiles.
 *
 * The landing canvas used to render every page as one flat row. That is
 * defensible at six pages and unusable at two hundred: it buries the apps, it
 * has no hierarchy, and it makes a corpus somebody spent a year building look
 * like a log file.
 *
 * A workspace already knows its own shape — it is the folders. What it does
 * NOT know is what any of them should be called, and the first version of
 * this file answered that by only surfacing folders carrying an `INDEX.md`.
 * Principled, and wrong: it HID TWELVE FOLDERS of a real corpus.
 *
 * Hiding content is a worse failure than labelling it imperfectly. So a
 * folder holding pages IS a section, and its livery comes from its
 * `.folder.md` (`folderSettings` of the index, AD-40), falling back to its
 * own name when it has none. Declared beats guessed; guessed beats gone.
 * No page is special any more: `INDEX.md` is a card, counted like the rest.
 */

import type { FolderSettingsEntry } from '@antorfr/adestia-schemas'

import { folderOf, prettify } from './paths.js'

/** The settings of each folder that has a `.folder.md`, keyed by folder (`folderSettings` of the index). */
export type FolderSettingsMap = Readonly<Record<string, FolderSettingsEntry>>

export interface SectionTile {
  /** Folder path, which is also the route to open it. */
  readonly path: string
  readonly title: string
  readonly icon: string
  /** A hue name the skin resolves, or undefined to fall back to the accent. */
  readonly hue?: string
  /** Pages inside, every one counted. */
  readonly count: number
  /**
   * The single store everything inside comes from, when there is one.
   *
   * A folder is the unit people think in — a trip, a project — while
   * provenance was drawn on CARDS, which is a page. So a trip filed in a
   * shared circle looked exactly like a trip filed in a private one, and the
   * only way to know was to open it.
   *
   * The default store's id is carried like any other and the drawing side
   * decides: its cards wear no mark, and absence IS the mark.
   */
  readonly store?: string
  /**
   * Several stores carry parts of this folder.
   *
   * A fact, not an error — a circle may legitimately hold half of something.
   * But it is the fact that reads WRONG when unsaid: a trip half shared and
   * half private looks entirely shared, since the shared half is what the
   * screen shows first.
   */
  readonly mixed?: boolean
}

export interface IndexEntry {
  readonly path: string
  readonly title: string
  readonly fields: Readonly<Record<string, unknown>>
  /**
   * Which store carries this copy. Absent on an instance with a single one —
   * there is no provenance to draw when everything comes from the same place.
   */
  readonly store?: string
}

/** A store, as the shell draws it: a name to write and a colour to wear. */
export interface StoreInfo {
  readonly id: string
  readonly label: string
  readonly hue?: string
  /** Mine. Its cards carry no mark at all — absence IS the mark. */
  readonly default?: boolean
}

/** Folders that are storage, not content: never a section. */
const NOT_A_SECTION = new Set(['assets'])

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Whether a folder is covered by a plugin's `absorbs` declaration.
 *
 * Two things a plain equality check got wrong on a real corpus, both of which
 * put the same content on screen twice.
 *
 * WHERE. A plugin cannot know how an operator files things: the trips app
 * declares `voyages`, and the folder is `domaines/voyages` here and `voyages`
 * somewhere else. So the declaration matches wherever that run of segments
 * sits in the path — at a SEGMENT boundary, so `voyages` never absorbs
 * `mes-voyages`.
 *
 * HOW DEEP. Absorbing a folder absorbs what is UNDER it. Trips live one folder
 * down (`domaines/voyages/baden-2026`), and each of those held pages, so each
 * became a section of its own beside the app's tile — the exact duplication
 * this field exists to prevent, minus the one folder it was aimed at.
 */
export function absorbs(declared: string, folder: string): boolean {
  const parts = folder.split('/')
  const wanted = declared.split('/')
  for (let start = 0; start + wanted.length <= parts.length; start += 1) {
    if (wanted.every((segment, offset) => parts[start + offset] === segment)) return true
  }
  return false
}

/**
 * The sections a body of pages declares: the store's FIRST LEVEL, whole.
 *
 * A folder is a folder. It surfaces because it exists, not because it happens
 * to hold a page of its own — a folder holding only other folders is not empty,
 * and hiding it was the rule this replaced.
 *
 * That rule tried to be clever about a folder that merely GROUPS: `domaines/`
 * held no page, so its children surfaced instead. It worked, and it papered
 * over a modelling mistake. The corpus it was written for has since dropped
 * that level — a folder that only groups other folders is not content, it is
 * the place content is filed, and that belongs in the STORE's path. Once it is
 * gone, the first level is exactly the list of domains, and the shell has
 * nothing left to guess.
 *
 * The failure that made this concrete: a shared circle carrying
 * `voyages/baden-2026/…` and no page directly in `voyages/`. Under the old
 * rule, `voyages` did not exist and each trip became a top-level tile — three
 * loose cards on the home screen instead of one domain. The instance that also
 * mounted the personal store never saw it, because that store supplied
 * `voyages/INDEX.md` and the union hid the gap.
 *
 * What it costs, stated rather than discovered: an instance that KEEPS a
 * grouping folder now shows that folder, one tile, with everything inside it.
 * That is the honest answer under this rule — and the fix is the corpus, not
 * a cleverness here.
 */
export function sectionsOf(
  entries: readonly IndexEntry[],
  /** Folders an app's tile already stands for — see `absorbs` in a manifest. */
  absorbed: readonly string[] = [],
  /** Every folder the stores hold, empty ones included (AD-38): a folder with no page is still a tile. */
  folders: readonly string[] = [],
  settings: FolderSettingsMap = {},
): readonly SectionTile[] {
  const top = new Set<string>()
  for (const folder of folders) {
    const first = folder.split('/')[0]!
    if (first !== '' && !NOT_A_SECTION.has(first)) top.add(first)
  }
  for (const entry of entries) {
    const folder = folderOf(entry.path)
    if (folder === '') continue
    // Derived from the pages, since a folder holding none is only knowable
    // through the path of a page deeper down.
    const first = folder.split('/')[0]!
    if (NOT_A_SECTION.has(first)) continue
    top.add(first)
  }

  return [...top]
    .filter((folder) => {
      if (absorbed.some((declared) => absorbs(declared, folder))) return false
      // …or everything it holds is absorbed. A plugin cannot know how an
      // operator files things: the trips app declares `voyages`, and the folder
      // may sit one level down. Without this, its tile would stand beside a
      // section holding exactly the same pages — the duplication `absorbs`
      // exists to prevent, reappearing now that the first level is the section.
      const held = entries.filter((entry) => entry.path.startsWith(`${folder}/`))
      return !(
        held.length > 0 &&
        held.every((entry) =>
          absorbed.some((declared) => absorbs(declared, folderOf(entry.path))),
        )
      )
    })
    .map((folder) => tileFor(entries, folder, settings[folder]))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** One tile, dressed by the folder's `.folder.md` when it has one. */
function tileFor(
  entries: readonly IndexEntry[],
  folder: string,
  declared: FolderSettingsEntry | undefined,
): SectionTile {
  const held = entries.filter((entry) => entry.path.startsWith(`${folder}/`))
  // An instance with one store marks nothing, so an entry without a store is
  // not a store of its own — it is an instance with no provenance to draw.
  const from = new Set(held.map((entry) => entry.store).filter((id) => id !== undefined))
  const only = from.size === 1 ? [...from][0] : undefined
  return {
    path: folder,
    // The declaration wins FIELD BY FIELD: a file that only gives an icon
    // keeps the title it would have had.
    title: text(declared?.title) ?? prettify(folder.split('/').at(-1) ?? folder),
    icon: text(declared?.ico) ?? '',
    ...(text(declared?.couleur) ? { hue: text(declared?.couleur)! } : {}),
    count: held.length,
    ...(only !== undefined ? { store: only } : {}),
    ...(from.size > 1 ? { mixed: true } : {}),
  }
}

/**
 * The section at an exact path, however deep.
 *
 * `sectionsOf` answers "what are the ways in", which is a question about the
 * TOP level only. Asking it to name a section three folders down returned
 * nothing, and the screen fell back to printing the raw path at the reader —
 * `domaines/diy/projets` where the page plainly says "Projets".
 */
export function sectionAt(
  entries: readonly IndexEntry[],
  folder: string,
  folders: readonly string[] = [],
  settings: FolderSettingsMap = {},
): SectionTile | undefined {
  const holds =
    entries.some((entry) => entry.path.startsWith(`${folder}/`)) ||
    folders.some((one) => one === folder || one.startsWith(`${folder}/`))
  return holds ? tileFor(entries, folder, settings[folder]) : undefined
}

/**
 * Whether a folder is a PLACE — somewhere with pages of its own.
 *
 * What separates `domaines/voyages` from `domaines`: the first holds pages,
 * the second only holds folders. A grouping folder is a filing detail, and a
 * breadcrumb that stopped at one would offer a crumb leading to an empty
 * screen. `INDEX.md` is a page like another: a folder holding only that is a place.
 */
export function holdsPages(entries: readonly IndexEntry[], folder: string): boolean {
  if (folder === '' || NOT_A_SECTION.has(folder.split('/').at(-1) ?? '')) return false
  return entries.some((entry) => folderOf(entry.path) === folder)
}

/**
 * The pages a section holds directly, for the screen it opens.
 *
 * Sub-folders are not expanded: descending one level at a time is the whole
 * point of having sections at all.
 */
export function pagesIn(
  entries: readonly IndexEntry[],
  folder: string,
): readonly IndexEntry[] {
  const prefix = `${folder}/`
  return entries.filter(
    (entry) =>
      entry.path.startsWith(prefix) &&
      !entry.path.slice(prefix.length).includes('/'),
  )
}

/** Sub-sections of a section, so a room can lead to its own rooms. */
export function subsectionsOf(
  entries: readonly IndexEntry[],
  folder: string,
  folders: readonly string[] = [],
  settings: FolderSettingsMap = {},
): readonly SectionTile[] {
  const prefix = `${folder}/`
  const innerFolders = folders.filter((one) => one.startsWith(prefix)).map((one) => one.slice(prefix.length))
  const inside = entries
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }))

  // Re-run the same rule one level down, on the subtree alone.
  const innerSettings = Object.fromEntries(
    Object.entries(settings)
      .filter(([folder]) => folder.startsWith(prefix))
      .map(([folder, entry]) => [folder.slice(prefix.length), entry]),
  )
  return sectionsOf(inside, [], innerFolders, innerSettings).map((section) => ({
    ...section,
    path: `${folder}/${section.path}`,
  }))
}
