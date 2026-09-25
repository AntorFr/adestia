/**
 * The shell: chat rail, resizable gutter, apps canvas.
 *
 * It knows the instance only through `/api/instance` — capabilities, active
 * plugins, the skin — and never which CLI runs behind it. That is what makes a
 * second engine a driver rather than a fork.
 */

import { Fragment, useCallback, useMemo, useRef, useState } from 'react'

import { Chat } from '../chat/Chat.js'
import { Editor } from '../editor/Editor.js'
import type { BlockComponents, LayoutComponents } from '../editor/Reader.js'
import type { FieldContributions } from '../editor/pageform.js'
import { Preferences, prefsTitle } from './Preferences.js'
import { SettingsMenu } from './SettingsMenu.js'
import { PluginBoundary } from '../plugins/Boundary.js'
import { FatalGate, LoadingGate, RefusedGate, SignInGate } from './Gates.js'
import { Home } from './Home.js'
import { CollectionLayout, CollectionShell } from './Collection.js'
import { resolveLocale, translator } from './i18n.js'
import { wordsFor } from '../plugins/words.js'
import { SkinSlot } from './SkinSlot.js'
import { Section } from './Section.js'
import { sectionAt } from './sections.js'
import { encodePath, folderRoute, ownerOf, pageRoute } from './owners.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import { MissingPage } from './MissingPage.js'
import { Problems } from './Problems.js'
import { screenView, trailOf } from './trail.js'
import { useInstance } from './useInstance.js'
import { useMobile } from './useMobile.js'
import { usePage } from './usePage.js'
import { useRoute } from './useRoute.js'
import { useSplit } from './useSplit.js'
import { useSwipe } from './useSwipe.js'
import { useTheme } from './useTheme.js'

// Two helpers the tests reach through this module, where they always lived.
export { appTrail, screenView } from './trail.js'
export type { InstanceInfo } from './useInstance.js'

export function App({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [screen, setScreen] = useState<'chat' | 'canvas'>('chat')

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

  /**
   * Opens a page in the editor.
   *
   * The editor module is fetched ALONGSIDE the page rather than at boot: it is
   * the heaviest thing the shell can load, and most sessions never open one.
   */
  const openPage = useCallback((path: string, store?: string) => {
    location.hash = pageRoute(path, store)
  }, [])

  /** What the open plugin says about its screen, kept by id (see the state above). */
  const onTrail = useCallback(
    (id: string, crumbs: readonly { label: string; route?: string }[]) => setPluginTrail({ id, crumbs }),
    [],
  )

  const { instance, failures, fatal, needsLogin, pages, stores, skin, skinScheme, loaded } =
    useInstance({ fetchImpl, openPage, askRef, composeRef, blocksRef, onTrail })

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
  /**
   * A word a PLUGIN declared — a tile's name, a field's label, a block's
   * description. Its own table first, the shell's second, English last.
   */
  const say = useMemo(() => wordsFor(loaded, t), [loaded, t])
  const split = useSplit()
  const mobile = useMobile()
  /**
   * The second way between the two screens, alongside the header buttons.
   *
   * The shell is a track two screens wide, laid out left-to-right the way the
   * desktop lays them out — chat, then canvas — so the gesture agrees with the
   * layout it replaces rather than being a mapping to memorise. The hook drags
   * that track under the finger and hands back the screen it settled on.
   */
  const swipe = useSwipe({ screen, onScreen: setScreen, enabled: mobile })

  const { route, openApp, settings, settingsPage, section, pagePath, pageStore } = useRoute({
    loaded,
    pages,
    // The trail is cleared on navigation rather than by the plugin: a view
    // that says nothing about its new screen must show the app's name alone.
    onChange: () => setPluginTrail({ id: '', crumbs: [] }),
  })
  const { page, pageProblem, mount } = usePage({ pagePath, pageStore, fetchImpl })

  /** The breadcrumb — derived once, drawn by the header and carried by every message. */
  const trail = useMemo(
    () =>
      trailOf({ settings, openApp, loaded, pluginTrail, page, section, pages, stores, t, say }),
    [openApp, loaded, page, pages, section, pluginTrail, say, settings, stores, t],
  )

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
   * Opens a folder — wherever it actually lives.
   *
   * Every link to a folder goes through here, and none of them assumes the
   * generic section any more: a folder a plugin ABSORBS opens on that
   * plugin's screen. A trip is not a list of files, and the breadcrumb out of
   * one of its pages used to say it was.
   */
  const openSection = useCallback(
    (path: string) => {
      location.hash = folderRoute(loaded, path, pages)
    },
    [loaded, pages],
  )

  const goHome = useCallback(() => {
    location.hash = ''
  }, [])

  const [themePref, setThemePref] = useTheme(skinScheme)

  const openPlugin = useCallback((plugin: LoadedPlugin) => {
    location.hash = plugin.view?.route ?? `/${plugin.id}`
  }, [])

  const closeApp = goHome

  /**
   * Every block the active plugins draw, flattened once and keyed by name.
   *
   * Keyed by PLUGIN then by name, because two plugins may now draw the same
   * name on purpose — that is what overriding is. The flat merge this
   * replaces silently kept whichever plugin loaded last; resolution names the
   * winner per page, and the component is looked up under it.
   */
  const blocks = useMemo(
    () =>
      Object.fromEntries(
        loaded.map((plugin) => [plugin.id, plugin.blocks?.tags ?? {}]),
      ) as BlockComponents,
    [loaded],
  )
  blocksRef.current = blocks

  /**
   * What `from=` resolution walks: features in their declared order, and per
   * page the app owning its domain. Features here follow the loader's order,
   * which follows the instance's `features:` list — the one tiebreak left for
   * a custom name two features both define.
   */
  const featureOrder = useMemo(
    () => loaded.filter((plugin) => plugin.kind === 'feature').map((plugin) => plugin.id),
    [loaded],
  )

  /**
   * Whole-page layouts, flattened by the frontmatter type they draw.
   *
   * Same shape as the blocks above and the same reason: a page says `type:
   * meals` and must not have to say which plugin draws it. The loader already
   * refused a type two active plugins both claim.
   */
  const layouts = useMemo(
    () =>
      Object.assign(
        // The core's own first, so a plugin claiming the same type wins —
        // a plugin exists when it brings a display the core does not have.
        { collection: CollectionLayout },
        ...loaded.map((plugin) => plugin.layouts?.types ?? {}),
      ) as LayoutComponents,
    [loaded],
  )

  /**
   * The frontmatter fields the active plugins declare, flattened by the type
   * they belong to.
   *
   * Same shape as the layouts above and the same reason: a page says
   * `type: tache` and must not have to say which plugin knows what a task
   * carries. The manifest already refused a plugin describing a type it does
   * not claim, so the flattening cannot silently pick a winner.
   */
  const fieldContributions = useMemo(
    () =>
      Object.fromEntries(
        loaded.flatMap((plugin) =>
          Object.entries(plugin.fields ?? {}).map(([type, fields]) => [
            type,
            // The plugin's own words travel with its fields: the labels are
            // declared in a manifest, which is read before the plugin's code
            // runs and therefore cannot be written in the reader's language.
            { plugin: plugin.id, fields, ...(plugin.words ? { words: plugin.words } : {}) },
          ]),
        ),
      ) as FieldContributions,
    [loaded],
  )

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

  if (needsLogin === 'refused') return <RefusedGate t={t} />
  if (needsLogin === 'signin') return <SignInGate />
  if (fatal) return <FatalGate t={t} message={fatal} />
  if (!instance) return <LoadingGate />

  return (
    <>
    <div
      className="adestia-shell"
      ref={swipe}
      data-skin={instance.skin.id}
      data-mobile={mobile ? 'true' : undefined}
      data-screen={mobile ? screen : undefined}
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
      <div className="adestia-gutter" {...split.gutterProps} />
      <main className="adestia-canvas">
        {skin.console && (
          <SkinSlot
            render={skin.console}
            className="adestia-console-host"
            context={{
              ask: (prompt) => askRef.current?.(prompt),
              compose: (text) => composeRef.current?.(text),
              focusComposer: () => composeRef.current?.(''),
              instance,
            }}
          />
        )}
        <header className="adestia-canvas__header">
          {/* Folded onto one screen, the canvas needs its own way back — the
              CSS alone would hide it with no route to it at all. */}
          {mobile && (
            <button
              type="button"
              className="adestia-switch"
              onClick={() => setScreen('chat')}
              aria-label={t('Back to the chat')}
            >
              ‹ Chat
            </button>
          )}
          {/* Where you are, in the apparatus voice. The brand moved to the
              rail: this side of the gutter is about PLACE, not identity. */}
          <nav className="adestia-crumbs" aria-label="Breadcrumb">
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
                  <span className="adestia-crumbs__sep">/</span>
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
          <span className="adestia-canvas__driver">
            {/* The version only becomes knowable once a session has announced
                itself, so before the first turn there is nothing to show.
                "Claude Code unknown" reads as a broken field; the name alone
                reads as a name. */}
            {instance.driver.label}
            {instance.driver.cliVersion && instance.driver.cliVersion !== 'unknown'
              ? ` ${instance.driver.cliVersion}`
              : ''}
          </span>
          {/* A MENU, not a shortcut into a screen. What sits behind it is the
              three things somebody settles without leaving the page they are
              on: is the agent's token still good, is this light or dark, and
              am I signing out. The cycling ◐ that used to stand beside it
              went inside as three named choices — a glyph that changes
              nothing visible until you press it can only be inferred.

              What is NOT here is content: the servers and the instructions
              are an app on the canvas, reached from its tile. */}
          <SettingsMenu
            theme={themePref}
            onTheme={setThemePref}
            {...(instance.auth.mode === 'oidc'
              ? { signedIn: instance.user?.displayName ?? '' }
              : {})}
            {...(instance.version ? { version: instance.version } : {})}
            fetchImpl={fetchImpl}
            t={t}
          />
        </header>

        <div className="adestia-canvas__body">

        <Problems instance={instance} failures={failures} loaded={loaded} pages={pages} t={t} />

        {openApp ? (
          (() => {
            const plugin = loaded.find((entry) => entry.id === openApp)
            if (!plugin?.view) {
              // A route whose plugin is gone resolves to nothing rather than to
              // a blank canvas: a bookmark outliving a config change must say
              // so instead of looking broken.
              return (
                <section className="adestia-empty">
                  <p>{t('That app is not active on this instance.')}</p>
                  <button type="button" className="adestia-switch" onClick={() => closeApp()}>
                    ‹ Back
                  </button>
                </section>
              )
            }
            const View = plugin.view.component
            return (
              <>
                <button type="button" className="adestia-switch" onClick={() => closeApp()}>
                  ‹ Back
                </button>
                {/* Rendered inside a boundary: a plugin that throws mid-render
                    takes its own panel down, never the shell around it. */}
                <PluginBoundary id={plugin.id}>
                  {/* The index the shell already holds and keeps live. An app
                      that fetched it itself paid a round trip and a
                      server-side re-read of every file before its first
                      line — and then held a snapshot nobody refreshed. */}
                  <View pages={pages} stores={stores} />
                </PluginBoundary>
              </>
            )
          })()
        ) : settingsPage !== undefined ? (
          <>
            {/* ONE step up, never a jump to the top. Two back controls
                appeared on screen the day the pages grew items of their own
                — the shell's, which went to the mosaic, and the screen's,
                which went to its own list — stacked one above the other and
                reading as a bug. This is the survivor, so it has to be right
                at every depth. */}
            <button
              type="button"
              className="adestia-switch"
              onClick={() => {
                location.hash =
                  settings?.item !== undefined
                    ? `/settings/${settingsPage}`
                    : settingsPage === ''
                      ? ''
                      : '/settings'
              }}
            >
              ‹{' '}
              {settings?.item !== undefined
                ? prefsTitle(settingsPage, t)
                : settingsPage === ''
                  ? t('Home')
                  : t('Settings')}
            </button>
            <Preferences
              page={settingsPage}
              onPage={(next) => {
                location.hash = next === '' ? '/settings' : `/settings/${next}`
              }}
              {...(settings?.item !== undefined ? { item: settings.item } : {})}
              onItem={(next) => {
                location.hash =
                  next === undefined
                    ? `/settings/${settingsPage}`
                    : `/settings/${settingsPage}/${encodePath(next)}`
              }}
              fetchImpl={fetchImpl}
              t={t}
              {...(locale ? { locale } : {})}
            />
          </>
        ) : page ? (
          <CollectionShell.Provider
            value={{ entries: pages, ask: (prompt) => askRef.current?.(prompt), t }}
          >
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
              // Who owns this page's domain, and the features on — what the
              // reader's `from=` resolution walks. Owner from the page's FOLDER:
              // ownership is a claim on folders, and the deepest claim wins.
              vocabulary={{
                ...(ownerOf(loaded, page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0)))?.id
                  ? { owner: ownerOf(loaded, page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0)))!.id }
                  : {}),
                features: featureOrder,
              }}
              layouts={layouts}
              fieldContributions={fieldContributions}
              say={say}
              // The shell already holds the index and keeps it live; the reader
              // needs it to tell a reference that MOVED from one that is gone.
              pages={pages}
              stores={stores}
              t={t}
              {...(mount ? { mount } : {})}
            />
          </CollectionShell.Provider>
        ) : pageProblem ? (
          <MissingPage path={pageProblem.path} status={pageProblem.status} t={t} />
        ) : section ? (
          <Section
            path={section}
            title={sectionAt(pages, section)?.title ?? section}
            {...(sectionAt(pages, section) ? { tile: sectionAt(pages, section)! } : {})}
            entries={pages}
            stores={stores}
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
                      className="adestia-home-host"
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
            stores={stores}
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

      {/* The gesture, given something to look at — and kept OUT of the track.

          A transformed element is the containing block for its `fixed`
          descendants, so a handle left inside the shell would ride the drag
          and leave the screen with it. Out here it stays against the glass,
          which is also what a handle is for.

          A swipe nobody suspects is a swipe nobody makes. Folded, the two
          panes stack perfectly: nothing on screen says a second one is
          waiting, and the header buttons are the only admission that it
          exists. These handles are the seam — the sliver of the pane you
          cannot see, poking in from the side it sits on.

          Their destinations are CONSTANT, and that is load-bearing rather
          than tidy. A swipe that starts on a handle may be followed by the
          click the browser synthesises for the same finger; a toggle would
          then undo the swipe it had just made, and the screen would sit
          exactly where it started. Two handles that each name one screen
          make that second event a no-op instead of a bug. */}
      {mobile && (
        <div className="adestia-edges" data-screen={screen}>
          <button
            type="button"
            className="adestia-edge"
            data-side="right"
            onClick={() => setScreen('canvas')}
            aria-label={t('Open apps')}
          />
          <button
            type="button"
            className="adestia-edge"
            data-side="left"
            onClick={() => setScreen('chat')}
            aria-label={t('Back to the chat')}
          />
        </div>
      )}
    </>
  )
}
