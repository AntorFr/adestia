/**
 * The URL as the navigation state — all of it — and what each address names.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { routeMatches } from '../plugins/contract.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import { addressOf, decodePath, folderRoute, pageAddress, sectionRoute } from './owners.js'
import { isPrefsPage, type PrefsPage } from './Preferences.js'
import type { IndexEntry } from './sections.js'

export function useRoute({
  loaded,
  pages,
  onChange,
}: {
  readonly loaded: readonly LoadedPlugin[]
  readonly pages: readonly IndexEntry[]
  /** Called on every navigation, before the new screen renders. */
  readonly onChange: () => void
}) {
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, ''))
  // Read through a ref by the one-time listener below, so the latest
  // callback is called without re-subscribing on every render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Hash routing, deliberately minimal: a plugin declares `#/its-route` and the
  // shell opens it, keeping it open for anything BELOW that route — what the
  // plugin does with the rest is its own business. A bookmarked route must
  // resurrect the same screen, and a route whose plugin is no longer active
  // must resolve to nothing rather than to a blank canvas.
  /**
   * The URL is the navigation state — all of it.
   *
   * Sections and pages used to live in React state alone, which meant no
   * address to bookmark, no address to SHARE, and a Back button that walked
   * out of the app instead of one screen up. A product whose whole premise is
   * that a page is a file has to be able to say where that page is.
   *
   *   #/                      the landing canvas
   *   #/section/<folder>      a section
   *   #/page/<path>           one page — no extension: that is a fact about
   *                            a file, not about an address. `?store=` names
   *                            a copy when two circles carry the same name.
   *   #/<plugin route or id>  an app
   */
  useEffect(() => {
    const apply = () => {
      setRoute(location.hash.replace(/^#/, ''))
      // The trail is cleared here rather than by the plugin: a view that says
      // nothing about its new screen must show the app's name alone, not the
      // previous screen's words. Whoever has something to say says it again.
      onChangeRef.current()
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  /** Which app the current route opens, if any. */
  const openApp = useMemo(() => {
    // Longest route first, so a plugin at `/a/b` wins over one at `/a`. A
    // tiled plugin that declares no route still answers on `/<id>`: a custom
    // home navigates by plain hash links, and a tile nothing can link to
    // would be unreachable from one.
    if (
      route.startsWith('/section/') ||
      route.startsWith('/page/') ||
      route === '/instructions' ||
      route === '/settings' ||
      route.startsWith('/settings/')
    ) {
      return undefined
    }
    return [...loaded]
      .sort((a, b) => (b.view?.route?.length ?? 0) - (a.view?.route?.length ?? 0))
      .find((plugin) => routeMatches(addressOf(plugin), route))?.id
  }, [route, loaded])

  /**
   * Which settings page the route names, `''` being the list. Undefined when
   * settings is not the open screen at all.
   *
   * Derived from the URL like every other screen: settings is an app of this
   * instance, so it is addressable, bookmarkable, and Back walks out of it one
   * page at a time. A segment naming no page reads as the list here and is
   * sent back to `#/settings` below — a title over an empty screen would be a
   * frame lying about what it holds.
   */
  const settings = useMemo<{ page: PrefsPage; item?: string } | undefined>(() => {
    if (route === '/settings') return { page: '' }
    if (!route.startsWith('/settings/')) return undefined
    const rest = route.slice('/settings/'.length)
    const cut = rest.indexOf('/')
    const wanted = cut === -1 ? rest : rest.slice(0, cut)
    if (!isPrefsPage(wanted)) return { page: '' }
    // What is open INSIDE the page — a server's name, an instruction's path,
    // which is why the tail is taken whole and only then decoded. A path has
    // slashes in it, and cutting on the first one would open `plugins` for
    // `plugins/todo/SKILL.md`.
    const item = cut === -1 ? undefined : decodePath(rest.slice(cut + 1))
    return { page: wanted, ...(item ? { item } : {}) }
  }, [route])
  const settingsPage = settings?.page

  const section = route.startsWith('/section/')
    ? decodePath(route.slice('/section/'.length))
    : undefined
  /**
   * The page the address names, and the copy it asks for.
   *
   * The store is a qualifier, never part of the name: without it the server
   * resolves by precedence, which is what keeps a link alive when a page moves
   * from one circle to another.
   */
  const address = route.startsWith('/page/')
    ? pageAddress(route.slice('/page/'.length), pages)
    : undefined
  const pagePath = address?.path
  const pageStore = address?.store

  /**
   * A section route into an absorbed folder hands over to its owner.
   *
   * Resolving ownership where links are DRAWN covers the links this shell
   * draws, and nothing else — a bookmark from before the plugin existed, a
   * brief whose `cible` the agent wrote by path, a URL somebody typed. They
   * all deserve the same screen the breadcrumb now leads to, so the rule
   * lives on the route as well.
   *
   * `replace`, not a new entry: the generic section the reader never saw has
   * no business sitting in their history for Back to walk into.
   */
  useEffect(() => {
    if (section === undefined) return
    // The SAME resolution a CLICK makes. This asked `routeForPath` alone,
    // which knows a plugin's own screen and nothing else — not the folder's
    // own `app:` declaration, and not the worksite it holds. So a link led to
    // the worksite page while the identical address typed, bookmarked, or
    // written by the agent stopped at the shelf: one folder, two answers,
    // decided by how the reader arrived. `folderRoute` is the whole ladder,
    // and it is what `openSection` calls.
    //
    // Compared against the plain section route rather than tested for truth:
    // `folderRoute` always answers, so redirecting on any answer would
    // replace the address with itself on every folder that has no owner.
    const where = folderRoute(loaded, section, pages)
    if (where !== sectionRoute(section)) location.replace(`#${where}`)
  }, [section, loaded, pages])

  /**
   * The addresses settings used to have, handed over rather than kept.
   *
   * `#/instructions` was the instruction zone's own route back when settings
   * were a dialog and prose could not be edited inside one. It is a page of
   * the settings app now, and a bookmark does not stop being one because we
   * moved a screen — so the old address opens the new one instead of becoming
   * a second name for it. Same `replace` as above: a redirect nobody saw has
   * no business in the history Back walks through.
   */
  useEffect(() => {
    if (route === '/instructions') location.replace('#/settings/instructions')
    // A settings segment naming no page: back to the mosaic rather than a
    // screen with nothing on it. This also catches `credential` and
    // `appearance`, which were pages of this app until the session-sized
    // switches moved behind the cog — a bookmark to one lands on the mosaic
    // rather than on a blank frame.
    else if (
      route.startsWith('/settings/') &&
      !isPrefsPage(route.slice('/settings/'.length).split('/')[0] ?? '')
    ) {
      location.replace('#/settings')
    }
  }, [route])

  return { route, openApp, settings, settingsPage, section, pagePath, pageStore }
}
