/**
 * The shell: chat rail, resizable gutter, apps canvas.
 *
 * It knows the instance only through `/api/instance` — capabilities, active
 * plugins, the skin — and never which CLI runs behind it. That is what makes a
 * second engine a driver rather than a fork.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import { Chat } from '../chat/Chat.js'
import type { BlockComponents } from '../editor/Reader.js'
import { FatalGate, LoadingGate, RefusedGate, SignInGate } from './Gates.js'
import { ScreenEdges } from './ScreenEdges.js'
import { Canvas } from './Canvas.js'
import { CanvasHeader } from './CanvasHeader.js'
import { composerButtonsOf, useContributions } from './useContributions.js'
import { resolveLocale, translator } from './i18n.js'
import { wordsFor } from '../plugins/words.js'
import { SkinSlot } from './SkinSlot.js'
import { folderRoute, pageRoute } from './owners.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import { Problems } from './Problems.js'
import { screenView, trailOf } from './trail.js'
import { skinUser } from './skin.js'
import { useServerReach } from './serverReach.js'
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

export function App({ fetchImpl: baseFetch = fetch }: { fetchImpl?: typeof fetch }) {
  // The one construction of the layer (AD-22): every child below gets the observed fetch.
  const { fetchImpl, report: reportReach } = useServerReach(baseFetch)
  const onLink = useCallback((up: boolean) => reportReach(up), [reportReach])
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

  const { instance, failures, fatal, offline, needsLogin, pages, stores, skin, skinScheme, loaded, ready, indexed } =
    useInstance({ fetchImpl, onLink, openPage, askRef, composeRef, blocksRef, onTrail })

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
  const { page, pageProblem, loading: pageLoading, retry: retryPage, mount } = usePage({ pagePath, pageStore, fetchImpl })

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

  const { blocks, featureOrder, layouts, fieldContributions } = useContributions(loaded)
  blocksRef.current = blocks

  const composerButtons = composerButtonsOf(loaded, locale, { ask: askRef, compose: composeRef })

  if (needsLogin === 'refused') return <RefusedGate t={t} />
  if (needsLogin === 'signin') return <SignInGate t={t} />
  if (fatal) return <FatalGate t={t} message={fatal} offline={offline} />
  if (!instance) return <LoadingGate t={t} />

  const slotUser = skinUser(instance)

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
        {...(skin.sendIcon ? { sendIcon: skin.sendIcon } : {})}
        {...(skin.busy ? { busySlot: skin.busy } : {})}
        {...(mobile ? { onOpenCanvas: () => setScreen('canvas') } : {})}
        {...(view ? { view } : {})}
        {...(instance.signatures ? { signatures: instance.signatures } : {})}
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
              ...slotUser,
            }}
          />
        )}
        <CanvasHeader
          mobile={mobile}
          onChat={() => setScreen('chat')}
          trail={trail}
          goHome={goHome}
          openSection={openSection}
          instance={instance}
          theme={themePref}
          onTheme={setThemePref}
          fetchImpl={fetchImpl}
          locale={locale}
          t={t}
        />

        <div className="adestia-canvas__body">

        <Problems instance={instance} failures={failures} loaded={loaded} pages={pages} t={t} locale={locale} />

        <Canvas ready={ready} indexed={indexed}
          instance={instance}
          skin={skin}
          loaded={loaded}
          pages={pages}
          stores={stores}
          openApp={openApp}
          settings={settings}
          settingsPage={settingsPage}
          page={page}
          pageProblem={pageProblem}
          pageLoading={pageLoading}
          retryPage={retryPage}
          mount={mount}
          section={section}
          channel={{ ask: askRef, compose: composeRef, attach: attachRef }}
          openPage={openPage}
          openSection={openSection}
          openPlugin={openPlugin}
          closeApp={closeApp}
          blocks={blocks}
          layouts={layouts}
          fieldContributions={fieldContributions}
          featureOrder={featureOrder}
          say={say}
          fetchImpl={fetchImpl}
          locale={locale}
          t={t}
        />
        </div>
      </main>


    </div>

      {mobile && <ScreenEdges screen={screen} onScreen={setScreen} t={t} />}
    </>
  )
}