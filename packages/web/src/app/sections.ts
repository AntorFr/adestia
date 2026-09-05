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
 * The sections a body of pages declares.
 *
 * Only the SHALLOWEST index-carrying folders surface: `domaines/diy` is a
 * section, `domaines/diy/machines` is one of its rooms. Flattening both onto
 * the same screen would show the same pages twice under two different names —
 * the reader is meant to descend, not to be handed every level at once.
 */
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

export function sectionsOf(
  entries: readonly IndexEntry[],
  /** Folders an app's tile already stands for — see `absorbs` in a manifest. */
  absorbed: readonly string[] = [],
): readonly SectionTile[] {
  // Every folder that holds a page at all. Grouping folders (`domaines/`)
  // hold none directly and so are not sections; their children are.
  const holders = new Set<string>()
  for (const entry of entries) {
    const folder = folderOf(entry.path)
    if (folder === '' || NOT_A_SECTION.has(folder.split('/').at(-1) ?? '')) continue
    if (isIndexPage(entry.path) && !entries.some((other) => folderOf(other.path) === folder && !isIndexPage(other.path))) {
      // A folder whose ONLY page is its own index still counts: it may hold
      // sub-folders, and an empty-looking room beats a hidden one.
      holders.add(folder)
      continue
    }
    holders.add(folder)
  }

  const shallowest = [...holders].filter((folder) => {
    if (absorbed.some((declared) => absorbs(declared, folder))) return false
    // An ancestor that is itself a section owns this one: the reader
    // descends into it rather than meeting both at once.
    const parts = folder.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) {
      if (holders.has(parts.slice(0, depth).join('/'))) return false
    }
    return true
  })

  return shallowest
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
