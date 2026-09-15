/**
 * Where the reader is: the breadcrumb every screen wears, and the snapshot
 * of it a message carries to the agent.
 */

import type { ScreenView } from '../chat/stream.js'
import type { PageDocument } from '../editor/Editor.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import { addressOf, ownerOf, routeForPath } from './owners.js'
import { prefsTitle, type PrefsPage } from './Preferences.js'
import { holdsPages, sectionAt, type IndexEntry, type StoreInfo } from './sections.js'

/**
 * The screen the chat reports as open next to it.
 *
 * Route and breadcrumb only — never what the page renders, which is content
 * the agent did not write (see the server's `screen.ts`). Two cases report
 * nothing at all, and they are the point: the landing canvas, where there is
 * no page to name, and a shell folded onto one screen showing the chat, where
 * the canvas is behind it. Narrating a screen nobody is looking at is worse
 * than saying nothing — it invents a subject.
 */
export function screenView(where: {
  readonly route: string
  readonly watched: boolean
  /** Breadcrumb labels below Home, in order. */
  readonly trail: readonly string[]
}): ScreenView | undefined {
  if (!where.route || !where.watched) return undefined
  const title = where.trail.filter((label) => label !== '').join(' › ')
  return { route: where.route, ...(title ? { title } : {}) }
}

/** One step of the header's trail. Either a folder, a route, or a dead end. */
export interface Crumb {
  readonly label: string
  readonly folder?: string
  readonly route?: string
}

/**
 * The trail over an open app: its own name, then whatever its view says.
 *
 * The shell can name the APP and no more — `#/voyages/baden-2026` is a trip
 * whose title lives in a file it does not read — so the header stopped at
 * "Home / Voyages" whatever screen was under it. What the view publishes
 * (`api.trail`) finishes the sentence.
 *
 * Two rules, both about not saying the same thing twice. A crumb repeating
 * Home or the app's own root is DROPPED: a ported view says the whole trail
 * from the top, and this header already drew that half. And the app's name
 * becomes a way back only when something sits below it — a link to the screen
 * you are already looking at is furniture.
 */
export function appTrail(
  app: { readonly label: string; readonly root?: string },
  said: readonly { readonly label: string; readonly route?: string }[],
): readonly Crumb[] {
  const below = said.filter(
    (crumb) =>
      crumb.route === undefined ||
      (crumb.route !== '' && crumb.route !== '/' && crumb.route !== app.root),
  )
  return [
    { label: app.label, ...(below.length > 0 && app.root ? { route: app.root } : {}) },
    ...below.map((crumb) => ({ label: crumb.label, ...(crumb.route ? { route: crumb.route } : {}) })),
  ]
}

/**
 * The breadcrumb: every crumb, and the folder it leads back to.
 *
 * Derived ONCE and read twice — the header draws it, and every message
 * carries it to the agent as the name of the screen. Two derivations of
 * "where the reader is" drift, and the one nobody looks at is the one that
 * drifts first.
 *
 * A page names the folders it sits IN, not merely the nearest one: stopping
 * one level short hid the app a trip belongs to — `Brocéliande 2026` with
 * no `Voyages` above it, from inside the trips app. Only PLACES earn a
 * crumb: a grouping folder like `domaines/` holds no page of its own and
 * its crumb would open an empty screen, while a folder a plugin OWNS is a
 * place by virtue of the screen behind it.
 */
export function trailOf({
  settings,
  openApp,
  loaded,
  pluginTrail,
  page,
  section,
  pages,
  stores,
  t,
}: {
  readonly settings: { page: PrefsPage; item?: string } | undefined
  readonly openApp: string | undefined
  readonly loaded: readonly LoadedPlugin[]
  readonly pluginTrail: { id: string; crumbs: readonly { label: string; route?: string }[] }
  readonly page: PageDocument | undefined
  readonly section: string | undefined
  readonly pages: readonly IndexEntry[]
  readonly stores: readonly StoreInfo[]
  readonly t: (key: string) => string
}): readonly Crumb[] {
  // Settings is an app of the shell's own, so it wears an app's trail: its
  // name, then the page open under it, and its name becomes a way back only
  // once there is something below it.
  if (settings !== undefined) {
    return appTrail({ label: t('Settings'), root: '/settings' }, [
      ...(settings.page === ''
        ? []
        : [
            {
              label: prefsTitle(settings.page, t),
              route: `/settings/${settings.page}`,
            },
          ]),
      // The thing being read, named. A trail that stopped at "Instructions"
      // while a file fills the screen is a trail that cannot say where the
      // reader is — which is the one job it has. A delegation's address ends
      // in a conversation UUID, which names nothing to a person: its caller — the
      // FIRST segment — is the half of the address that does.
      ...(settings.item
        ? [
            {
              label:
                settings.page === 'delegations'
                  ? (settings.item.split('/')[0] as string)
                  : (settings.item.split('/').at(-1) as string),
            },
          ]
        : []),
    ])
  }
  if (openApp) {
    const plugin = loaded.find((entry) => entry.id === openApp)
    const root = plugin ? addressOf(plugin) : undefined
    return appTrail(
      { label: plugin?.tile?.label ?? openApp, ...(root ? { root } : {}) },
      // Read only for the plugin actually on the canvas: a view that
      // published a trail and was navigated away from must not keep
      // describing a screen nobody is looking at.
      pluginTrail.id === openApp ? pluginTrail.crumbs : [],
    )
  }
  const deepest = page ? page.path.slice(0, page.path.lastIndexOf('/')) : section
  if (deepest === undefined || deepest === '') return page ? [{ label: page.title }] : []

  const parts = deepest.split('/').filter(Boolean)
  const crumbs = parts
    .map((_, depth) => parts.slice(0, depth + 1).join('/'))
    .filter(
      (folder) =>
        // The screen the reader is ON is always named, whatever its shape:
        // a crumb trail that cannot say where you are is worse than a long one.
        folder === section ||
        holdsPages(pages, folder) ||
        routeForPath(loaded, folder) !== undefined,
    )
    .map((folder) => ({
      folder,
      // The workspace's own word for the folder first — an index page's
      // title is what the reader sees everywhere else. The owning app's
      // tile is the fallback for a folder that carries no page at all.
      label:
        sectionAt(pages, folder)?.title ??
        ownerOf(loaded, folder)?.tile?.label ??
        (folder.split('/').at(-1) as string),
    }))
  /**
   * The open page says which circle it came from — but only when another
   * one carries the same name.
   *
   * The reader clicked a card that said "(Famille)"; landing on a screen
   * that says nothing loses exactly what they used to choose it, and two
   * copies of a name are indistinguishable the moment the folder is behind
   * them. Same grammar as the card, for the same reason: silent everywhere
   * a name is unambiguous.
   */
  if (!page) return crumbs
  const from = stores.find((store) => store.id === page.store)
  const twin =
    from !== undefined &&
    from.default !== true &&
    pages.filter((entry) => entry.path === page.path).length > 1
  return [...crumbs, { label: twin ? `${page.title} (${from.label})` : page.title }]
}
