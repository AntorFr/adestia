/**
 * Path words the pages share (AD-13 a, R-11): how a folder is named, where a
 * page lives, and which pages ARE their folder.
 */

/** `plan-travail-garage` → `Plan travail garage`; declared labels beat this guess. */
export function prettify(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/** `domaines/achats/INDEX.md` → `domaines/achats`. */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

export const INDEX_FILE = /(^|\/)index\.md$/i

/**
 * `dietetique/dietetique.md` — the sibling shell's "space": a folder and a
 * page of the same name. The extension is optional.
 */
function isHomonymous(path: string): boolean {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '')
  return parts.length > 1 && file === parts.at(-2)
}

/**
 * The FILE of an index (sections, routing, owners): `index.md`, or a page
 * named like its folder. A path without the `.md` extension is not an
 * `index` file.
 */
export function isIndexFile(path: string): boolean {
  return INDEX_FILE.test(path) || isHomonymous(path)
}

/**
 * The ADDRESS of an index (the reader's listings): as `isIndexFile`, with the
 * `.md` optional first, so `a/index` and `index` count.
 */
export function isIndexPath(path: string): boolean {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '') ?? ''
  return /^index$/i.test(file) || (parts.length > 1 && file === parts.at(-2))
}
