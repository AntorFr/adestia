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
 * Principled, and wrong: measured against a real corpus it HID TWELVE
 * FOLDERS — seven written in the sibling shell's "space" convention (a
 * folder beside a page of the same name) and five plain folders of pages.
 *
 * Hiding content is a worse failure than labelling it imperfectly. So a
 * folder holding pages IS a section, and its livery comes from whichever
 * index page it has — `INDEX.md`, or the homonymous page — falling back to
 * its own name when it has none. Declared beats guessed; guessed beats gone.
 */

export interface SectionTile {
  /** Folder path, which is also the route to open it. */
  readonly path: string
  readonly title: string
  readonly icon: string
  /** A hue name the skin resolves, or undefined to fall back to the accent. */
  readonly hue?: string
  /** Pages inside, the index page itself excluded. */
  readonly count: number
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

const INDEX_FILE = /(^|\/)index\.md$/i

/** Folders that are storage, not content: never a section. */
const NOT_A_SECTION = new Set(['assets'])

/**
 * `dietetique/dietetique.md` — the sibling shell's "space": a folder and a
 * page of the same name, the page being the folder's own overview. Seven of
 * them in the corpus this was measured against.
 */
function isHomonymous(path: string): boolean {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '')
  return parts.length > 1 && file === parts.at(-2)
}

/** The index page of a folder, either spelling. */
function indexOf(entries: readonly IndexEntry[], folder: string): IndexEntry | undefined {
  return entries.find(
    (entry) =>
      folderOf(entry.path) === folder &&
      (INDEX_FILE.test(entry.path) || isHomonymous(entry.path)),
  )
}

/** True for a page that IS its folder's index rather than one of its contents. */
function isIndexPage(path: string): boolean {
  return INDEX_FILE.test(path) || isHomonymous(path)
}

/** `plan-travail-garage` → `Plan travail garage`. */
function prettify(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/** `domaines/achats/INDEX.md` → `domaines/achats`. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

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
): readonly SectionTile[] {
  const top = new Set<string>()
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
    .map((folder) => tileFor(entries, folder, indexOf(entries, folder)))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** One tile, dressed by a folder's index page when it has one. */
function tileFor(
  entries: readonly IndexEntry[],
  folder: string,
  index: IndexEntry | undefined,
): SectionTile {
  const fields = index?.fields ?? {}
  return {
    path: folder,
    // The declaration wins FIELD BY FIELD: a page that only gives an icon
    // keeps the title it would have had. An all-or-nothing rule would punish a
    // half-filled frontmatter by discarding the half that was there.
    title: text(fields['title']) ?? index?.title ?? prettify(folder.split('/').at(-1) ?? folder),
    icon: text(fields['ico']) ?? '◆',
    ...(text(fields['couleur']) ? { hue: text(fields['couleur'])! } : {}),
    count: entries.filter(
      (entry) => entry.path.startsWith(`${folder}/`) && !isIndexPage(entry.path),
    ).length,
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
): SectionTile | undefined {
  const holds = entries.some((entry) => entry.path.startsWith(`${folder}/`))
  return holds ? tileFor(entries, folder, indexOf(entries, folder)) : undefined
}

/**
 * Whether a folder is a PLACE — somewhere with pages of its own.
 *
 * What separates `domaines/voyages` from `domaines`: the first holds pages,
 * the second only holds folders. A grouping folder is a filing detail, and a
 * breadcrumb that stopped at one would offer a crumb leading to an empty
 * screen. Its own index page counts: a folder with nothing but an overview is
 * still a place, and its overview is what the crumb would open.
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
      !isIndexPage(entry.path) &&
      !entry.path.slice(prefix.length).includes('/'),
  )
}

/** Sub-sections of a section, so a room can lead to its own rooms. */
export function subsectionsOf(
  entries: readonly IndexEntry[],
  folder: string,
): readonly SectionTile[] {
  const prefix = `${folder}/`
  const inside = entries
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }))
    // The section's OWN index page has to go, or the rule re-elects the
    // section as a room of itself — it is the shallowest index in its own
    // subtree, by construction.
    .filter((entry) => entry.path.includes('/'))

  // Re-run the same rule one level down, on the subtree alone.
  return sectionsOf(inside).map((section) => ({
    ...section,
    path: `${folder}/${section.path}`,
  }))
}
