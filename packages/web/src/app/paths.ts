/**
 * Path words the pages share (AD-13 a, R-11): how a folder is named and where
 * a page lives. No page IS its folder any more (AD-40): `INDEX.md` and `x/x.md`
 * are pages like the others, a folder's settings live in its `.folder.md`.
 */

/** `plan-travail-garage` → `Plan travail garage`; declared labels beat this guess. */
export function prettify(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/** `domaines/achats/plan.md` → `domaines/achats`. */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}
