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
import { absorbs } from './sections.js'

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
): LoadedPlugin | undefined {
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
export function routeForPath(
  plugins: readonly LoadedPlugin[],
  path: string,
): string | undefined {
  const owner = ownerOf(plugins, path)
  if (owner) {
    const said = asks(owner, path)
    if (said) return said
    // The absorbed folder ITSELF still has an address even from an owner that
    // answered nothing: a tile that stands for a folder IS its address.
    const route = addressOf(owner)
    if (route && (owner.absorbs ?? []).some((declared) => isRoot(declared, path))) return route
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
export function folderRoute(plugins: readonly LoadedPlugin[], folder: string): string {
  return routeForPath(plugins, folder) ?? sectionRoute(folder)
}
