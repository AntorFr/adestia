/**
 * Who owns a folder — and therefore where a link to it must go.
 *
 * `absorbs` already said a plugin's tile stands for a folder, and the launcher
 * was the only screen that listened. Everywhere else the workspace's own shape
 * won: a page inside a trip crumbed back to `#/section/…/broceliande-2026`,
 * the generic list of files, from a screen that exists precisely because a
 * trip is not one. The plugin could not fix it either — the shell reserves
 * `/section/` and `/page/` for itself, and by then the plugin's view is
 * unmounted.
 *
 * So ownership stops being a launcher detail and becomes a routing rule, in
 * ONE place: the shell knows WHICH plugin owns a folder (`absorbs`), the
 * plugin knows WHERE it keeps it (`routeFor`), and every link to a folder
 * asks this module rather than assuming the generic route.
 *
 * What it deliberately does NOT do: guess. A plugin that answers nothing gets
 * the generic section back, which is what the reader had all along.
 */

import { routeMatches } from '../plugins/contract.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import { absorbs, indexOf, isIndexPage, type IndexEntry } from './sections.js'

/**
 * How a workspace path is written into a route: segments escaped, slashes
 * left alone.
 *
 * Encoding the whole path is what produced `#/page/domaines%2Fvoyages%2F…` —
 * it escapes the one character a fragment always allowed (RFC 3986), and the
 * only one worth keeping readable. Reading is the mirror, and reads BOTH: a
 * link written the old way stays a link.
 */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** The path a route carries — either spelling. */
export function decodePath(rest: string): string {
  return rest
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        // A stray `%` in a hash somebody typed: read it as itself rather than
        // throwing out of the router.
        return segment
      }
    })
    .join('/')
}

/**
 * A page's address — its name, without the extension.
 *
 * `.md` is a fact about a FILE. It belongs on the disk, and in a document
 * where a link's extension is what tells a page from an attachment; it has no
 * business in the address bar, where it is a detail of storage leaking into
 * something a person reads and shares.
 *
 * The store, when given, rides as a QUALIFIER rather than a segment. A name
 * that contained its store would break every link the day a page moves from
 * one circle to another — which is the one thing this whole composition is
 * built to avoid. So the bare address stays canonical and resolves by
 * precedence, and this qualifier is produced in exactly one place: a folder
 * linking the copy the bare address does not designate.
 */
export function pageRoute(path: string, store?: string): string {
  const bare = path.replace(/\.md$/i, '')
  return `/page/${encodePath(bare)}${store ? `?store=${encodeURIComponent(store)}` : ''}`
}

/**
 * The reverse: what a `/page/…` route names.
 *
 * Reads BOTH spellings — a link written before the extension was dropped
 * still opens, the same courtesy `decodePath` already extends to the old
 * escaped-slash form. An address is a promise, and promises are not withdrawn
 * because the product got tidier.
 */
export function pageAddress(
  rest: string,
  pages: readonly IndexEntry[] = [],
): { path: string; store?: string } {
  const cut = rest.indexOf('?')
  const raw = cut === -1 ? rest : rest.slice(0, cut)
  const asked = cut === -1 ? null : new URLSearchParams(rest.slice(cut + 1)).get('store')
  const decoded = decodePath(raw)
  // An address that names a FOLDER opens that folder's index page. `INDEX` is
  // the same leak `.md` was: a fact about where the text is stored, surfacing
  // in something a person reads, shares and bookmarks. The address of a
  // worksite is its FOLDER — the index is merely how the folder speaks.
  const folded = indexOf(pages, decoded)
  if (folded) return { path: folded.path, ...(asked ? { store: asked } : {}) }
  return {
    path: /\.md$/i.test(decoded) ? decoded : `${decoded}.md`,
    ...(asked ? { store: asked } : {}),
  }
}

/** `#/section/<folder>` — the shell's own screen for a folder it owns. */
export function sectionRoute(folder: string): string {
  return `/section/${encodePath(folder)}`
}

/**
 * Whether a folder IS the absorbed folder itself, rather than one beneath it.
 *
 * The distinction the fallback rests on: a plugin's tile stands for its root,
 * so the root has a known address even from a plugin that says nothing —
 * its own route. What lives deeper does not, and nothing here will invent one.
 */
function isRoot(declared: string, folder: string): boolean {
  const parts = folder.split('/')
  const wanted = declared.split('/')
  return (
    parts.length >= wanted.length &&
    wanted.every((segment, offset) => parts[parts.length - wanted.length + offset] === segment)
  )
}

/**
 * The route a plugin answers on, declared or implied.
 *
 * A tiled plugin that declares no route still answers on `/<id>`: a tile
 * nothing can link to would be unreachable from a custom home. One rule, used
 * both to RESOLVE a route and to BUILD one — two copies of it would drift into
 * a link the shell refuses to open.
 */
export function addressOf(plugin: {
  readonly id: string
  readonly view?: { readonly route?: string }
  readonly tile?: unknown
}): string | undefined {
  return plugin.view?.route ?? (plugin.tile ? `/${plugin.id}` : undefined)
}

/**
 * The plugin a folder DECLARES, read from its own index page.
 *
 * `absorbs` matches a NAME wherever that run of segments sits, which works for
 * a plugin that owns a word — `todo`, `voyages` — and cannot work for one
 * whose root the USER names: a project tracker's folder is `chantiers` here
 * and `projets` next door, and no manifest can know that. So the folder says
 * it, in the one place that travels with it across a `mv`.
 *
 * TOP LEVEL ONLY, and hereditary: the declaration is read from the first
 * segment's index and covers everything beneath it. Written deeper it is NOT
 * silently ignored — `strayApp` reports it — because an `app:` that does
 * nothing is an hour spent wondering why.
 *
 * A declaration BEATS a name match, and that is the point: it cannot
 * over-claim. Name matching once handed a period of meals filed under
 * `sante/dietetique/journal` to the journal, and `holds` exists only to undo
 * that — a declared folder needs no such rescue.
 */
export function declaredApp(
  plugins: readonly LoadedPlugin[],
  pages: readonly IndexEntry[],
  folder: string,
): LoadedPlugin | undefined {
  const root = folder.split('/')[0]
  if (!root) return undefined
  const asked = indexOf(pages, root)?.fields['app']
  if (typeof asked !== 'string' || asked === '') return undefined
  return plugins.find((plugin) => plugin.id === asked)
}

/**
 * An `app:` written where it will never be read — deeper than the top level,
 * or naming a plugin this instance does not run. Reported, never obeyed.
 */
export function strayApp(
  plugins: readonly LoadedPlugin[],
  pages: readonly IndexEntry[],
): readonly { readonly path: string; readonly reason: string }[] {
  const out: { path: string; reason: string }[] = []
  for (const page of pages) {
    const asked = page.fields['app']
    if (typeof asked !== 'string' || asked === '') continue
    const folder = page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0))
    if (folder.includes('/')) {
      out.push({ path: page.path, reason: `"app" is only read on a top-level folder` })
    } else if (!plugins.some((plugin) => plugin.id === asked)) {
      out.push({ path: page.path, reason: `no active plugin is called "${asked}"` })
    }
  }
  return out
}

/**
 * The single page a folder is ABOUT, when it has exactly one.
 *
 * The owner's rule, and it needs no declaration on the folder at all: count
 * the pages filed directly here whose `type:` the owning plugin claims. One,
 * and the folder IS that thing — it opens on its page. None, or several, and
 * it is a shelf: several worksites in a folder make a folder OF worksites,
 * not a worksite, and that distinction falls out of the count rather than
 * being written down.
 *
 * Scoped to the OWNER's types on purpose. A general "one typed page wins"
 * would open a folder holding a single task on that task, which is not what a
 * task list is for.
 */
export function faceOf(
  owner: LoadedPlugin,
  pages: readonly IndexEntry[],
  folder: string,
): string | undefined {
  const kinds = owner.types ?? []
  if (kinds.length === 0) return undefined
  const held = pages.filter(
    (page) =>
      page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0)) === folder &&
      kinds.includes(String(page.fields['type'] ?? '')),
  )
  return held.length === 1 ? held[0]?.path : undefined
}

/** How specifically a plugin claims this folder — 0 when it does not. */
function claim(plugin: LoadedPlugin, folder: string): number {
  return (plugin.absorbs ?? [])
    .filter((declared) => absorbs(declared, folder))
    .reduce((deepest, declared) => Math.max(deepest, declared.split('/').length), 0)
}

/** The active plugin whose tile stands for this folder, if any. */
export function ownerOf(
  plugins: readonly LoadedPlugin[],
  folder: string,
  pages: readonly IndexEntry[] = [],
): LoadedPlugin | undefined {
  // A DECLARATION beats a name: the folder said so itself, and nothing the
  // shell guesses should outrank that.
  const declared = declaredApp(plugins, pages, folder)
  if (declared) return declared
  // The most specific claim wins, mirroring route resolution: a plugin
  // declaring `voyages/archives` takes that folder from one declaring
  // `voyages`, rather than the answer depending on load order.
  return plugins
    .filter((plugin) => claim(plugin, folder) > 0)
    .sort((a, b) => claim(b, folder) - claim(a, folder))[0]
}

/**
 * What one plugin says about one path, and nothing it is not entitled to say.
 *
 * A plugin's answer is trusted only inside its OWN route: owning a path is not
 * owning the shell's navigation, and a plugin returning `/settings` would be
 * redirecting screens it was never given.
 */
function asks(plugin: LoadedPlugin, path: string): string | undefined {
  const route = addressOf(plugin)
  if (!route || !plugin.view?.routeFor) return undefined
  let said: string | undefined
  try {
    said = plugin.view.routeFor(path)
  } catch (error) {
    // A throwing `routeFor` costs the link, never the screen drawing it: this
    // runs mid-render, in a breadcrumb.
    console.error(`plugin "${plugin.id}" failed to route ${path}:`, error)
    return undefined
  }
  return typeof said === 'string' && routeMatches(route, said) ? said : undefined
}

/**
 * The route a workspace path opens at — a folder, or a file inside one.
 *
 * Two ways a plugin comes to own a path, and they answer different questions.
 *
 * DECLARED, by `absorbs`: the trips app says it stands for `voyages/`, so
 * everything under that folder is its business and its tile leaves the home.
 * That claim is a NAME, which is exactly what a workbench cannot use — the
 * atelier's benches sit in whatever project folders exist, and it can no more
 * absorb `projets` (a name half the workspace uses) than `diy` (a domain full
 * of notes it does not draw).
 *
 * So a plugin may also simply KNOW: asked about a path, it answers from its
 * own listing. A folder of notes is not a workbench because it sits under
 * `diy`; it is one because a workbook is filed in it, and only the plugin
 * holding the listing can say so.
 *
 * Declared beats known — an explicit claim is not overridden by a plugin
 * volunteering — and two plugins claiming one path is a configuration mistake
 * of the same family as two plugins claiming one route.
 *
 * `undefined` means "nobody has a screen for this", not "error": the caller
 * falls back to the shell's own section.
 */
/**
 * Whether a plugin stands by a folder its NAME matched.
 *
 * Silence is consent here, deliberately: `holds` is optional, and a plugin
 * that never implements it must keep the behaviour it shipped with. A plugin
 * that throws is believed too — a broken answer costs the link, never the
 * screen drawing it.
 */
function holdsFolder(plugin: LoadedPlugin, folder: string): boolean {
  const asked = plugin.view?.holds
  if (!asked) return true
  try {
    return asked(folder) !== false
  } catch {
    return true
  }
}

export function routeForPath(
  plugins: readonly LoadedPlugin[],
  path: string,
  pages: readonly IndexEntry[] = [],
): string | undefined {
  const owner = ownerOf(plugins, path, pages)
  if (owner) {
    const said = asks(owner, path)
    if (said) return said
    // The absorbed folder ITSELF still has an address even from an owner that
    // answered nothing: a tile that stands for a folder IS its address.
    //
    // But only when the owner actually HOLDS it. `absorbs` matches a name
    // wherever that run of segments sits, so a folder merely sharing the word
    // is claimed just as hard — and the reader is handed to an app that has
    // never heard of it. A period of meals filed in `sante/dietetique/journal`
    // was reachable by its direct link and by nothing else: the section tile
    // was gone and every link into the folder led to the journal's shelf.
    //
    // The shell cannot tell the two apart; the plugin can, from its own
    // listing. So it is asked, and only a plugin that says no gives the folder
    // back — one that does not implement `holds` is believed on its name, as
    // before.
    const route = addressOf(owner)
    const named = (owner.absorbs ?? []).some((declared) => isRoot(declared, path))
    if (route && named && holdsFolder(owner, path)) return route
    return undefined
  }
  for (const plugin of plugins) {
    const said = asks(plugin, path)
    if (said) return said
  }
  return undefined
}

/**
 * Where a folder opens, always answerable.
 *
 * The one call a link should make: whoever owns it, the shell's own section
 * otherwise.
 */
export function folderRoute(
  plugins: readonly LoadedPlugin[],
  folder: string,
  pages: readonly IndexEntry[] = [],
): string {
  // The ladder, in one place. A plugin's own SCREEN wins — it exists because
  // the folder is not a list of files. Failing that, a folder holding exactly
  // one page of its owner's kind IS that thing, and opens on its page.
  // Failing both, the shelf, which is what the reader always had.
  const owned = routeForPath(plugins, folder, pages)
  if (owned) return owned
  const owner = ownerOf(plugins, folder, pages)
  const face = owner ? faceOf(owner, pages, folder) : undefined
  if (!face) return sectionRoute(folder)
  // The FOLDER's own address when its face is its index — `INDEX` never
  // belongs in a link. Any other page keeps its own name.
  return pageRoute(isIndexPage(face) ? folder : face)
}
