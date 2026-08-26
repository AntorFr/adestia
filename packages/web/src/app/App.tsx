/**
 * The shell: chat rail, resizable gutter, apps canvas.
 *
 * It knows the instance only through `/api/instance` — capabilities, active
 * plugins, the skin — and never which CLI runs behind it. That is what makes a
 * second engine a driver rather than a fork.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Chat } from '../chat/Chat.js'
import type { ScreenView } from '../chat/stream.js'
import { Editor, type PageDocument } from '../editor/Editor.js'
import type { BlockComponents } from '../editor/Reader.js'
import { Preferences, isPrefsPage, prefsTitle, type PrefsPage } from './Preferences.js'
import {
  browserSkinEnvironment,
  loadSkin,
  type Skin,
  type SkinDescriptor,
  type SkinSlots,
} from './skin.js'
import { PluginBoundary } from '../plugins/Boundary.js'
import { routeMatches, type PluginApi } from '../plugins/contract.js'
import { Home } from './Home.js'
import { resolveLocale, translator } from './i18n.js'
import { SkinSlot } from './SkinSlot.js'
import { Section } from './Section.js'
import { holdsPages, sectionAt, type IndexEntry } from './sections.js'
import { addressOf, decodePath, encodePath, folderRoute, ownerOf, routeForPath } from './owners.js'
import { browserEnvironment, loadPlugins, type LoadedPlugin, type PluginDescriptor } from '../plugins/loader.js'
import { makePageEditor } from '../plugins/PageEditor.js'
import { useMobile } from './useMobile.js'
import { useSplit } from './useSplit.js'
import { useSwipe } from './useSwipe.js'

/**
 * A plugin problem, in the reader's language when it has an identity.
 *
 * The server writes English prose where the problem is detected, which is the
 * right thing for a log and the wrong thing under a translated heading. A
 * problem somebody is meant to ACT on carries a code instead, and is said here.
 * Anything else falls back to the prose — visibly untranslated beats
 * mistranslated, and beats a raw code by a mile.
 */
function say(
  t: (key: string) => string,
  problem: { reason: string; code?: string; params?: Record<string, string> },
): string {
  if (problem.code !== 'missing-secret' || !problem.params?.['name']) return problem.reason
  return t('runs without the secret %name, which this instance does not provide').replace(
    '%name',
    problem.params['name'],
  )
}

export interface InstanceInfo {
  readonly driver: { label: string; cliVersion: string; capabilities: readonly string[] }
  readonly auth: { mode: string }
  /** Set only when the operator configured one; the browser decides otherwise. */
  readonly locale?: string
  readonly user: { userId: string; displayName: string } | null
  readonly skin: SkinDescriptor
  readonly plugins: readonly PluginDescriptor[]
  readonly pluginProblems: readonly {
    code?: string
    params?: Record<string, string>
    id: string
    reason: string
    /** Absent means refused — see the server's `DiscoveryProblem`. */
    severity?: 'refused' | 'degraded'
  }[]
  readonly turns: { max: number; running: number }
}

type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
) => () => void

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

export function App({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [instance, setInstance] = useState<InstanceInfo | undefined>()
  const [failures, setFailures] = useState<readonly { id: string; reason: string }[]>([])
  const [fatal, setFatal] = useState<string | undefined>()
  const [needsLogin, setNeedsLogin] = useState<'signin' | 'refused' | undefined>()
  const [screen, setScreen] = useState<'chat' | 'canvas'>('chat')
  const [pages, setPages] = useState<readonly IndexEntry[]>([])
  /** The section being browsed, if any. Home when undefined. */
  const [page, setPage] = useState<PageDocument | undefined>()
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, ''))
  /**
   * The editor is loaded on demand: ProseMirror and Milkdown weigh more than
   * the entire rest of the shell, and someone who only wants to chat should
   * not download an editor to do it. Same discipline the plugin loader
   * applies to a heavy chunk.
   */
  const [mount, setMount] = useState<EditorMount | undefined>()
  const [skin, setSkin] = useState<Skin & SkinSlots>({})

  /**
   * The shell's words. Resolved once the instance answers, because the
   * operator's choice — when there is one — outranks the browser's.
   */
  const locale = useMemo(
    () =>
      resolveLocale(
        instance?.locale,
        typeof navigator === 'undefined' ? undefined : navigator.language,
      ),
    [instance?.locale],
  )
  const t = useMemo(() => translator(locale), [locale])
  const [skinScheme, setSkinScheme] = useState<'light' | 'dark' | undefined>(undefined)
  const [loaded, setLoaded] = useState<readonly LoadedPlugin[]>([])
  /**
   * What the OPEN plugin says about the screen it is showing.
   *
   * Kept by id, and read only for the plugin actually on the canvas: a view
   * that published a trail and was then navigated away from must not keep
   * describing a screen nobody is looking at.
   */
  const [pluginTrail, setPluginTrail] = useState<{
    id: string
    crumbs: readonly { label: string; route?: string }[]
  }>({ id: '', crumbs: [] })
  /** The plugin view currently filling the canvas, by id. */
  /** Queued while the chat mounts, so a plugin can ask before anyone typed. */
  const askRef = useRef<((prompt: string) => void) | undefined>(undefined)
  const composeRef = useRef<((text: string) => void) | undefined>(undefined)
  const attachRef = useRef<((files: readonly File[]) => Promise<void>) | undefined>(undefined)
  // Same reason as `askRef`: the editor lent to plugins is built before any
  // plugin has loaded, so it reads the blocks through a ref rather than
  // closing over the empty set it would see at that moment.
  const blocksRef = useRef<BlockComponents>({})
  const split = useSplit()
  const mobile = useMobile()
  /**
   * The second way between the two screens, alongside the header buttons.
   *
   * Laid out left-to-right the way the desktop lays them out — chat, then
   * canvas — so the gesture agrees with the layout it replaces rather than
   * being a mapping to memorise.
   */
  const swipe = useSwipe({
    enabled: mobile,
    onLeft: () => setScreen('canvas'),
    onRight: () => setScreen('chat'),
  })

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
   *   #/page/<path>.md        one page
   *   #/<plugin route or id>  an app
   */
  useEffect(() => {
    const apply = () => {
      setRoute(location.hash.replace(/^#/, ''))
      // The trail is cleared here rather than by the plugin: a view that says
      // nothing about its new screen must show the app's name alone, not the
      // previous screen's words. Whoever has something to say says it again.
      setPluginTrail({ id: '', crumbs: [] })
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
  const settingsPage = useMemo<PrefsPage | undefined>(() => {
    if (route === '/settings') return ''
    if (!route.startsWith('/settings/')) return undefined
    const wanted = route.slice('/settings/'.length)
    return isPrefsPage(wanted) ? wanted : ''
  }, [route])

  const section = route.startsWith('/section/')
    ? decodePath(route.slice('/section/'.length))
    : undefined
  const pagePath = route.startsWith('/page/') ? decodePath(route.slice('/page/'.length)) : undefined

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
  const trail = useMemo<readonly Crumb[]>(() => {
    // Settings is an app of the shell's own, so it wears an app's trail: its
    // name, then the page open under it, and its name becomes a way back only
    // once there is something below it.
    if (settingsPage !== undefined) {
      return appTrail(
        { label: t('Settings'), root: '/settings' },
        settingsPage === '' ? [] : [{ label: prefsTitle(settingsPage, t) }],
      )
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
    return page ? [...crumbs, { label: page.title }] : crumbs
  }, [openApp, loaded, page, pages, section, pluginTrail, settingsPage, t])

  /**
   * Where the reader is, snapshotted onto each message.
   *
   * On a desktop the canvas sits BESIDE the chat, so « that » in a sentence
   * usually means the page in front of them — which the conversation used to
   * know nothing about. The same trail the header draws, because the note has
   * to name the screen the way the screen names itself.
   */
  const view = useMemo(
    () =>
      screenView({
        route,
        watched: !mobile || screen === 'canvas',
        trail: trail.map((crumb) => crumb.label),
      }),
    [route, mobile, screen, trail],
  )

  /**
   * Opens a page in the editor.
   *
   * The editor module is fetched ALONGSIDE the page rather than at boot: it is
   * the heaviest thing the shell can load, and most sessions never open one.
   */
  const openPage = useCallback((path: string) => {
    location.hash = `/page/${encodePath(path)}`
  }, [])

  /**
   * Opens a folder — wherever it actually lives.
   *
   * Every link to a folder goes through here, and none of them assumes the
   * generic section any more: a folder a plugin ABSORBS opens on that
   * plugin's screen. A trip is not a list of files, and the breadcrumb out of
   * one of its pages used to say it was.
   */
  const openSection = useCallback(
    (path: string) => {
      location.hash = folderRoute(loaded, path)
    },
    [loaded],
  )

  const goHome = useCallback(() => {
    location.hash = ''
  }, [])

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
    const owned = routeForPath(loaded, section)
    if (owned) location.replace(`#${owned}`)
  }, [section, loaded])

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
    // A settings segment naming no page: back to the list rather than a
    // screen with nothing on it.
    else if (route.startsWith('/settings/') && !isPrefsPage(route.slice('/settings/'.length))) {
      location.replace('#/settings')
    }
  }, [route])

  /**
   * Loads whatever page the route names.
   *
   * Driven by the URL rather than by the click, so a bookmark, a shared link
   * and the Back button all land on the same screen as the card that opened
   * it. The editor module is fetched ALONGSIDE the page: it is the heaviest
   * thing the shell can load, and most sessions never open one.
   */
  useEffect(() => {
    if (!pagePath) {
      setPage(undefined)
      return undefined
    }
    let cancelled = false
    void (async () => {
      const [response, editor] = await Promise.all([
        fetchImpl(`/api/pages/${pagePath}`),
        import('../editor/milkdown.js'),
      ])
      if (cancelled || !response.ok) return
      // Stored via a thunk: passing a function to setState directly would
      // have React call it as an updater.
      setMount(() => editor.mountMilkdown)
      setPage((await response.json()) as PageDocument)
    })()
    return () => {
      cancelled = true
    }
  }, [pagePath, fetchImpl])

  /**
   * The viewer's theme choice: '' follows the system (and the skin's own
   * `scheme`), 'light'/'dark' override both. Reapplied when the skin loads,
   * because the skin loader also writes `data-theme` and the LAST writer
   * wins — a person's explicit choice must be that writer.
   */
  const [themePref, setThemePref] = useState<string>(() => {
    try {
      return localStorage.getItem('golem.theme') ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    try {
      if (themePref) localStorage.setItem('golem.theme', themePref)
      else localStorage.removeItem('golem.theme')
    } catch {
      /* a preference that cannot persist still applies to this visit */
    }
    if (themePref) document.documentElement.dataset['theme'] = themePref
    else if (!skinScheme) delete document.documentElement.dataset['theme']
  }, [themePref, skinScheme])

  const cycleTheme = useCallback(() => {
    setThemePref((current) => (current === '' ? 'light' : current === 'light' ? 'dark' : ''))
  }, [])

  const openPlugin = useCallback((plugin: LoadedPlugin) => {
    location.hash = plugin.view?.route ?? `/${plugin.id}`
  }, [])

  const closeApp = goHome

  /**
   * Every block the active plugins draw, flattened once and keyed by name.
   *
   * Flat rather than per plugin because a page names a block, not its owner:
   * `:::parcours` says nothing about which plugin brought it, and it must not
   * have to. The loader already refused a name two plugins both claim.
   */
  const blocks = useMemo(
    () => Object.assign({}, ...loaded.map((plugin) => plugin.blocks?.tags ?? {})) as BlockComponents,
    [loaded],
  )
  blocksRef.current = blocks

  /** Composer buttons every active plugin contributed, flattened once. */
  const composerButtons = loaded.flatMap((plugin) =>
    (plugin.chrome?.composer ?? []).map((entry) => ({
      ...entry,
      // Namespaced: two plugins may both call a button "scan".
      key: `${plugin.id}:${entry.id}`,
      api: {
        id: plugin.id,
        base: plugin.base,
        locale,
        fetch,
        ask: (p: string) => askRef.current?.(p),
        compose: (t: string) => composeRef.current?.(t),
      },
    })),
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetchImpl('/api/instance')
        if (response.status === 401) {
          // Not an error to display: it means "sign in", and showing a status
          // code instead leaves the user reading a number with no way forward.
          if (!cancelled) setNeedsLogin('signin')
          return
        }
        if (response.status === 403) {
          // A different fact entirely: this account will never be let in, and
          // sending them back to the login page would loop them forever.
          if (!cancelled) setNeedsLogin('refused')
          return
        }
        if (!response.ok) throw new Error(`the server answered ${response.status}`)
        const info = (await response.json()) as InstanceInfo
        if (cancelled) return
        setInstance(info)

        const dressed = await loadSkin(info.skin, browserSkinEnvironment())
        if (!cancelled) {
          setSkin(dressed.skin)
          setSkinScheme(
            info.skin.scheme === 'light' || info.skin.scheme === 'dark'
              ? info.skin.scheme
              : undefined,
          )
          if (dressed.skin.title) document.title = dressed.skin.title
          // Off-contract fields are reported where the plugin problems are,
          // because a silently ignored field is an hour spent wondering why
          // nothing happens.
          const skinProblems = [
            ...(dressed.error ? [{ id: `skin:${info.skin.id}`, reason: dressed.error }] : []),
            ...(dressed.rejected.length > 0
              ? [
                  {
                    id: `skin:${info.skin.id}`,
                    reason: `ignored off-contract field(s): ${dressed.rejected.join(', ')}`,
                  },
                ]
              : []),
          ]
          if (skinProblems.length > 0) setFailures((current) => [...current, ...skinProblems])
        }

        // `ask` is handed to plugins through a ref: the chat owns that channel
        // and mounts after this runs, so a plugin holding the function directly
        // would hold one that is not wired yet.
        // The plugins are loaded once the instance has answered, so this is
        // the resolved locale rather than a guess.
        const pluginLocale = resolveLocale(
          info.locale,
          typeof navigator === 'undefined' ? undefined : navigator.language,
        )
        const environment = browserEnvironment(
          (prompt) => askRef.current?.(prompt),
          (text) => composeRef.current?.(text),
          pluginLocale,
          (id, crumbs) => setPluginTrail({ id, crumbs }),
          // The shell's own editor, lent to plugins whose screen is made of
          // pages. Built here because only the shell knows the instance's
          // language and how to open a page a wikilink points at.
          makePageEditor({
            locale: pluginLocale,
            t: translator(pluginLocale),
            fetchImpl,
            openPage,
            blocks: () => blocksRef.current,
          }),
        )
        const result = await loadPlugins(info.plugins, environment)
        if (!cancelled) {
          setLoaded(result.loaded)
          setFailures((current) => [...current, ...result.failures])
        }

        // The INDEX rather than the plain list: sections are dressed by their
        // index page's frontmatter, and only this endpoint carries it.
        const list = await fetchImpl('/api/pages/index')
        if (list.ok && !cancelled) {
          // Checked rather than trusted: this JSON crosses a process boundary,
          // and a shape the shell did not expect used to reach `sectionsOf`
          // and throw mid-render — blanking the whole app over a payload that
          // merely had no pages in it.
          const body = (await list.json()) as { entries?: IndexEntry[] }
          setPages(Array.isArray(body.entries) ? body.entries : [])
        }
      } catch (error) {
        // A shell that renders an empty page when the API is unreachable makes
        // its user reload forever; naming the failure costs one line.
        if (!cancelled) setFatal((error as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchImpl])

  if (needsLogin === 'refused') {
    return (
      <main className="golem-fatal" role="alert">
        <h1>{t('Not allowed')}</h1>
        <p>
          You are signed in, but your account is not in a group this instance admits. Ask whoever
          runs it to add you.
        </p>
        <form method="post" action="/auth/logout">
          <button type="submit" className="golem-switch">
            Sign out
          </button>
        </form>
      </main>
    )
  }

  if (needsLogin === 'signin') {
    return (
      <main className="golem-signin">
        <h1>Golem</h1>
        <p>This instance requires you to sign in.</p>
        <a className="golem-signin__button" href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.hash)}`}>
          Sign in
        </a>
      </main>
    )
  }

  if (fatal) {
    return (
      <main className="golem-fatal" role="alert">
        <h1>{t('Golem could not start')}</h1>
        <p>{fatal}</p>
      </main>
    )
  }

  if (!instance) return <main className="golem-loading">Loading…</main>

  // Every refusal reaches the user: the server's (a malformed manifest) and
  // the browser's (a module that would not import). A plugin silently absent
  // is the failure mode this whole design exists to avoid.
  //
  // A browser-side failure is always a refusal: the facet did not load, so
  // whatever it contributed is gone. Only the server reports the softer kind.
  const problems: readonly {
    id: string
    reason: string
    severity?: 'refused' | 'degraded'
    code?: string
    params?: Record<string, string>
  }[] = [...instance.pluginProblems, ...failures]

  return (
    <div
      className="golem-shell"
      data-skin={instance.skin.id}
      data-mobile={mobile ? 'true' : undefined}
      data-screen={mobile ? screen : undefined}
      // On the shell rather than on each pane: the gesture belongs to the
      // pair, and one listener sees a swipe that starts on either of them.
      {...swipe}
    >
      <Chat
        fetchImpl={fetchImpl}
        t={t}
        onReady={(channel: {
          ask: (prompt: string) => void
          compose: (text: string) => void
          attach: (files: readonly File[]) => Promise<void>
        }) => {
          askRef.current = channel.ask
          composeRef.current = channel.compose
          attachRef.current = channel.attach
        }}
        extraButtons={composerButtons}
        // A path the agent named in its answer opens the page, exactly as the
        // same path written INSIDE a page does. The chat draws the link; only
        // the shell knows where it goes.
        openPage={openPage}
        {...(skin.placeholder ? { placeholder: skin.placeholder } : {})}
        {...(skin.brand ? { brand: skin.brand } : {})}
        {...(skin.crest ? { crest: skin.crest } : {})}
        {...(skin.busy ? { busySlot: skin.busy } : {})}
        {...(mobile ? { onOpenCanvas: () => setScreen('canvas') } : {})}
        {...(view ? { view } : {})}
      />
      <div className="golem-gutter" {...split.gutterProps} />
      <main className="golem-canvas">
        {skin.console && (
          <SkinSlot
            render={skin.console}
            className="golem-console-host"
            context={{
              ask: (prompt) => askRef.current?.(prompt),
              compose: (text) => composeRef.current?.(text),
              focusComposer: () => composeRef.current?.(''),
              instance,
            }}
          />
        )}
        <header className="golem-canvas__header">
          {/* Folded onto one screen, the canvas needs its own way back — the
              CSS alone would hide it with no route to it at all. */}
          {mobile && (
            <button
              type="button"
              className="golem-switch"
              onClick={() => setScreen('chat')}
              aria-label={t('Back to the chat')}
            >
              ‹ Chat
            </button>
          )}
          {/* Where you are, in the apparatus voice. The brand moved to the
              rail: this side of the gutter is about PLACE, not identity. */}
          <nav className="golem-crumbs" aria-label="Breadcrumb">
            <button
              type="button"
              onClick={goHome}
            >
              {t('Home')}
            </button>
            {trail.map((crumb, index) => {
              // The last crumb is where the reader IS: named, never a link to
              // the screen already under their eyes. Every one above it is a
              // way BACK — the trail has to be walkable, not decorative — and
              // it walks to wherever that folder actually opens, which for a
              // folder an app owns is the app.
              const leads = crumb.folder ?? crumb.route
              const walkable = leads !== undefined && index < trail.length - 1
              // A folder is resolved (it may belong to an app); a route the
              // plugin gave is already an address and is taken as written.
              const walk = () =>
                crumb.folder === undefined
                  ? (location.hash = crumb.route as string)
                  : openSection(crumb.folder)
              return (
                <Fragment key={`${leads ?? ''}-${index}`}>
                  <span className="golem-crumbs__sep">/</span>
                  {walkable ? (
                    <button type="button" onClick={walk}>
                      {crumb.label}
                    </button>
                  ) : (
                    <b>{crumb.label}</b>
                  )}
                </Fragment>
              )
            })}
          </nav>
          <span className="golem-canvas__driver">
            {/* The version only becomes knowable once a session has announced
                itself, so before the first turn there is nothing to show.
                "Claude Code unknown" reads as a broken field; the name alone
                reads as a name. */}
            {instance.driver.label}
            {instance.driver.cliVersion && instance.driver.cliVersion !== 'unknown'
              ? ` ${instance.driver.cliVersion}`
              : ''}
          </span>
          <button
            type="button"
            className="golem-ib"
            onClick={cycleTheme}
            aria-label={t('Theme')}
            title={themePref === '' ? 'Theme: system' : `Theme: ${themePref}`}
          >
            ◐
          </button>
          {/* A shortcut to the app, not a menu: the same screen the tile on
              the landing canvas opens, at the same address. It stays in the
              header because arming a credential is what somebody does when
              something has just stopped working, and hunting for a tile is
              not what that moment is for. */}
          <button
            type="button"
            className="golem-ib"
            onClick={() => {
              location.hash = '/settings'
            }}
            aria-label={t('Settings')}
            {...(settingsPage !== undefined ? { 'aria-current': 'page' as const } : {})}
          >
            ⚙
          </button>
          {instance.auth.mode === 'oidc' && (
            <form method="post" action="/auth/logout" className="golem-canvas__signout">
              <button type="submit" className="golem-switch" title={instance.user?.displayName}>
                {t('Sign out')}
              </button>
            </form>
          )}
        </header>

        <div className="golem-canvas__body">

        {/*
          Two different facts, and conflating them sends somebody hunting for a
          plugin that works: REFUSED means the extension is off, DEGRADED means
          it is running with something missing. Both are worth saying out loud;
          only one is a problem to fix before the app can be used.
        */}
        {(['refused', 'degraded'] as const).map((severity) => {
          const listed = problems.filter((problem) => (problem.severity ?? 'refused') === severity)
          if (listed.length === 0) return null
          return (
            <section key={severity} className={`golem-problems golem-problems--${severity}`} role="status">
              <h2>{t(severity === 'refused' ? 'Extensions refused' : 'Running with something missing')}</h2>
              <ul>
                {listed.map((problem) => (
                  <li key={`${problem.id}-${problem.reason.slice(0, 20)}`}>
                    <strong>{problem.id}</strong>: {say(t, problem)}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        {openApp ? (
          (() => {
            const plugin = loaded.find((entry) => entry.id === openApp)
            if (!plugin?.view) {
              // A route whose plugin is gone resolves to nothing rather than to
              // a blank canvas: a bookmark outliving a config change must say
              // so instead of looking broken.
              return (
                <section className="golem-empty">
                  <p>{t('That app is not active on this instance.')}</p>
                  <button type="button" className="golem-switch" onClick={() => closeApp()}>
                    ‹ Back
                  </button>
                </section>
              )
            }
            const View = plugin.view.component
            return (
              <>
                <button type="button" className="golem-switch" onClick={() => closeApp()}>
                  ‹ Back
                </button>
                {/* Rendered inside a boundary: a plugin that throws mid-render
                    takes its own panel down, never the shell around it. */}
                <PluginBoundary id={plugin.id}>
                  <View />
                </PluginBoundary>
              </>
            )
          })()
        ) : settingsPage !== undefined ? (
          <>
            <button
              type="button"
              className="golem-switch"
              onClick={() => {
                location.hash = settingsPage === '' ? '' : '/settings'
              }}
            >
              ‹ {settingsPage === '' ? t('Home') : t('Settings')}
            </button>
            <Preferences
              page={settingsPage}
              onPage={(next) => {
                location.hash = next === '' ? '/settings' : `/settings/${next}`
              }}
              theme={themePref}
              onTheme={setThemePref}
              fetchImpl={fetchImpl}
              t={t}
            />
          </>
        ) : page ? (
          <Editor
            page={page}
            fetchImpl={fetchImpl}
            openPage={openPage}
            locale={locale}
            // Dropping a file on a page hands it to the chat and writes the
            // filing request: the agent is still the one who moves it.
            attach={(dropped) => attachRef.current?.(dropped)}
            compose={(text) => composeRef.current?.(text)}
            blocks={blocks}
            t={t}
            {...(mount ? { mount } : {})}
          />
        ) : section ? (
          <Section
            path={section}
            title={sectionAt(pages, section)?.title ?? section}
            {...(sectionAt(pages, section) ? { tile: sectionAt(pages, section)! } : {})}
            entries={pages}
            openSection={openSection}
            openPage={openPage}
            t={t}
          />
        ) : (
          <Home
            skin={skin}
            {...(skin.hero
              ? {
                  // The livery draws the head of the landing — the greeting,
                  // the mascot, the way in — and the shell keeps the mosaics
                  // under it. Built here rather than in `Home` because the
                  // slot's context is the shell's to hand out, and this is
                  // the same one the console band gets.
                  hero: (
                    <SkinSlot
                      render={skin.hero}
                      className="golem-home-host"
                      context={{
                        ask: (prompt) => askRef.current?.(prompt),
                        compose: (text) => composeRef.current?.(text),
                        focusComposer: () => composeRef.current?.(''),
                        instance,
                      }}
                    />
                  ),
                }
              : {})}
            plugins={loaded}
            entries={pages}
            openPlugin={openPlugin}
            openSection={openSection}
            openPage={openPage}
            focusComposer={() => composeRef.current?.('')}
            t={t}
            locale={locale}
            ask={(prompt) => askRef.current?.(prompt)}
            fetchImpl={fetchImpl}
          />
        )}
        </div>
      </main>
    </div>
  )
}
