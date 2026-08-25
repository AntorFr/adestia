/**
 * The shell: chat rail, resizable gutter, apps canvas.
 *
 * It knows the instance only through `/api/instance` — capabilities, active
 * plugins, the skin — and never which CLI runs behind it. That is what makes a
 * second engine a driver rather than a fork.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { Chat } from '../chat/Chat.js'
import { Editor, type PageDocument } from '../editor/Editor.js'
import { Modal } from './Modal.js'
import { Settings } from './Settings.js'
import {
  browserSkinEnvironment,
  loadSkin,
  type Skin,
  type SkinDescriptor,
  type SkinSlots,
} from './skin.js'
import { routeMatches, type PluginApi } from '../plugins/contract.js'
import { Home } from './Home.js'
import { resolveLocale, translator } from './i18n.js'
import { SkinSlot } from './SkinSlot.js'
import { Section } from './Section.js'
import { sectionAt, type IndexEntry } from './sections.js'
import { browserEnvironment, loadPlugins, type LoadedPlugin, type PluginDescriptor } from '../plugins/loader.js'
import { useMobile } from './useMobile.js'
import { useSplit } from './useSplit.js'

export interface InstanceInfo {
  readonly driver: { label: string; cliVersion: string; capabilities: readonly string[] }
  readonly auth: { mode: string }
  /** Set only when the operator configured one; the browser decides otherwise. */
  readonly locale?: string
  readonly user: { userId: string; displayName: string } | null
  readonly skin: SkinDescriptor
  readonly plugins: readonly PluginDescriptor[]
  readonly pluginProblems: readonly { id: string; reason: string }[]
  readonly turns: { max: number; running: number }
}

/**
 * Keeps a plugin's render failure to itself.
 *
 * React unmounts the whole tree on an uncaught render error, so without this a
 * plugin with a typo takes down the chat beside it. The boundary is the render
 * equivalent of the try/catch the loader already puts around a factory.
 */
class PluginBoundary extends Component<
  { id: string; children: ReactNode },
  { error?: Error }
> {
  override state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <section className="golem-problems" role="status">
          <h2>The “{this.props.id}” app stopped</h2>
          <p>{this.state.error.message}</p>
        </section>
      )
    }
    return this.props.children
  }
}

type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
) => () => void

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
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  /** The plugin view currently filling the canvas, by id. */
  /** Queued while the chat mounts, so a plugin can ask before anyone typed. */
  const askRef = useRef<((prompt: string) => void) | undefined>(undefined)
  const composeRef = useRef<((text: string) => void) | undefined>(undefined)
  const split = useSplit()
  const mobile = useMobile()

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
    const apply = () => setRoute(location.hash.replace(/^#/, ''))
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
    if (route.startsWith('/section/') || route.startsWith('/page/')) return undefined
    return [...loaded]
      .sort((a, b) => (b.view?.route?.length ?? 0) - (a.view?.route?.length ?? 0))
      .find((plugin) =>
        routeMatches(plugin.view?.route ?? (plugin.tile ? `/${plugin.id}` : undefined), route),
      )?.id
  }, [route, loaded])

  const section = route.startsWith('/section/')
    ? decodeURIComponent(route.slice('/section/'.length))
    : undefined
  const pagePath = route.startsWith('/page/')
    ? decodeURIComponent(route.slice('/page/'.length))
    : undefined

  /**
   * Opens a page in the editor.
   *
   * The editor module is fetched ALONGSIDE the page rather than at boot: it is
   * the heaviest thing the shell can load, and most sessions never open one.
   */
  const openPage = useCallback((path: string) => {
    location.hash = `/page/${encodeURIComponent(path)}`
  }, [])

  const openSection = useCallback((path: string) => {
    location.hash = `/section/${encodeURIComponent(path)}`
  }, [])

  const goHome = useCallback(() => {
    location.hash = ''
  }, [])

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
        const environment = browserEnvironment(
          (prompt) => askRef.current?.(prompt),
          (text) => composeRef.current?.(text),
          // The plugins are loaded once the instance has answered, so this is
          // the resolved locale rather than a guess.
          resolveLocale(info.locale, typeof navigator === 'undefined' ? undefined : navigator.language),
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
  const problems = [...instance.pluginProblems, ...failures]

  return (
    <div
      className="golem-shell"
      data-skin={instance.skin.id}
      data-mobile={mobile ? 'true' : undefined}
      data-screen={mobile ? screen : undefined}
    >
      <Chat
        fetchImpl={fetchImpl}
        onReady={(channel: {
          ask: (prompt: string) => void
          compose: (text: string) => void
        }) => {
          askRef.current = channel.ask
          composeRef.current = channel.compose
        }}
        extraButtons={composerButtons}
        {...(skin.placeholder ? { placeholder: skin.placeholder } : {})}
        {...(skin.brand ? { brand: skin.brand } : {})}
        {...(skin.crest ? { crest: skin.crest } : {})}
        {...(skin.busy ? { busySlot: skin.busy } : {})}
        {...(mobile ? { onOpenCanvas: () => setScreen('canvas') } : {})}
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
            {(() => {
              if (openApp) {
                const label = loaded.find((entry) => entry.id === openApp)?.tile?.label ?? openApp
                return (
                  <>
                    <span className="golem-crumbs__sep">/</span>
                    <b>{label}</b>
                  </>
                )
              }
              // PAGE before SECTION, matching what the body renders: opening
              // a page from a section leaves `section` set, and checking it
              // first left the trail stopping one step short of where the
              // reader actually was.
              if (!page) {
                if (!section) return undefined
                return (
                  <>
                    <span className="golem-crumbs__sep">/</span>
                    <b>{sectionAt(pages, section)?.title ?? section}</b>
                  </>
                )
              }
              // A page names the section it sits in, and that crumb is a way
              // BACK into it — the trail has to be walkable, not decorative.
              const holder = sectionAt(pages, page.path.slice(0, page.path.lastIndexOf('/')))
              return (
                <>
                  {holder && (
                    <>
                      <span className="golem-crumbs__sep">/</span>
                      <button type="button" onClick={() => openSection(holder.path)}>
                        {holder.title}
                      </button>
                    </>
                  )}
                  <span className="golem-crumbs__sep">/</span>
                  <b>{page.title}</b>
                </>
              )
            })()}
          </nav>
          <span className="golem-canvas__driver">
            {instance.driver.label} {instance.driver.cliVersion}
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
          <button
            type="button"
            className="golem-ib"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label={t('Settings')}
            aria-expanded={settingsOpen}
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

        {problems.length > 0 && (
          <section className="golem-problems" role="status">
            <h2>{t('Extensions refused')}</h2>
            <ul>
              {problems.map((problem) => (
                <li key={`${problem.id}-${problem.reason.slice(0, 20)}`}>
                  <strong>{problem.id}</strong>: {problem.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

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
        ) : page ? (
          <Editor
            page={page}
            fetchImpl={fetchImpl}
            openPage={openPage}
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
        ) : skin.home ? (
          <SkinSlot
            render={skin.home}
            className="golem-home-host"
            context={{
              ask: (prompt) => askRef.current?.(prompt),
              compose: (text) => composeRef.current?.(text),
              focusComposer: () => composeRef.current?.(''),
            }}
          />
        ) : (
          <Home
            skin={skin}
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

      {settingsOpen && (
        <Modal title={t('Settings')} closeLabel={t('Close')} onClose={() => setSettingsOpen(false)}>
          <Settings fetchImpl={fetchImpl} />
        </Modal>
      )}
    </div>
  )
}
