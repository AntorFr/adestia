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

/** `#/section/<folder>` — the shell's own screen for a folder it owns. */
export function sectionRoute(folder: string): string {
  return `/section/${encodeURIComponent(folder)}`
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
 * The route a folder opens at — the owning plugin's screen, or nothing.
 *
 * `undefined` means "no plugin has a screen for this", NOT "error": the
 * caller falls back to `sectionRoute`. Three ways to arrive there, all
 * legitimate — no plugin absorbs the folder, the owner's view has no route to
 * link to (a view reached only from its tile has no address), or the owner
 * was asked and had nothing for that particular folder.
 */
export function routeForFolder(
  plugins: readonly LoadedPlugin[],
  folder: string,
): string | undefined {
  const owner = ownerOf(plugins, folder)
  if (!owner) return undefined
  const route = addressOf(owner)
  if (!route) return undefined

  // A plugin's answer is trusted only inside its OWN route. Owning a folder
  // is not owning the shell's navigation, and a plugin that returned
  // `/settings` would be redirecting screens it was never given.
  let said: string | undefined
  try {
    said = owner.view?.routeFor?.(folder)
  } catch (error) {
    // A throwing `routeFor` costs the link, never the screen drawing it: this
    // runs mid-render, in a breadcrumb.
    console.error(`plugin "${owner.id}" failed to route ${folder}:`, error)
    said = undefined
  }
  if (typeof said === 'string' && routeMatches(route, said)) return said

  return (owner.absorbs ?? []).some((declared) => isRoot(declared, folder)) ? route : undefined
}

/**
 * Where a folder opens, always answerable.
 *
 * The one call a link should make: ownership when a plugin has it, the
 * shell's own section otherwise.
 */
export function folderRoute(plugins: readonly LoadedPlugin[], folder: string): string {
  return routeForFolder(plugins, folder) ?? sectionRoute(folder)
}
