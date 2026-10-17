/**
 * What fills the canvas, in the one order the address decides it.
 *
 * `docs/ecrans.md`, Navigation gives the order: an open app, then settings,
 * then a page, then a page that would not load, then a section, then the home.
 * It is one function so the order is read in one place rather than inferred
 * from a ternary three screens long.
 */

import type { RefObject } from 'react'

import type { FieldContributions } from '../editor/pageform.js'
import { Editor, type PageDocument } from '../editor/Editor.js'
import type { BlockComponents, LayoutComponents } from '../editor/Reader.js'
import { PluginBoundary } from '../plugins/Boundary.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import type { wordsFor } from '../plugins/words.js'
import { CollectionShell } from './Collection.js'
import { BackButton } from './BackButton.js'
import { EmptyState } from './ui/EmptyState.js'
import { Home } from './Home.js'
import { MissingPage } from './MissingPage.js'
import { Preferences, prefsTitle, type PrefsPage } from './Preferences.js'
import { Section } from './Section.js'
import { SkinSlot } from './SkinSlot.js'
import { encodePath, ownerOf } from './owners.js'
import { sectionAt, type IndexEntry, type StoreInfo } from './sections.js'
import { skinUser, type Skin, type SkinSlots } from './skin.js'
import type { InstanceInfo } from './useInstance.js'
import type { EditorMount } from './usePage.js'

/** The three ways into the chat the shell lends out, behind refs. */
export interface ChatChannel {
  readonly ask: RefObject<((prompt: string) => void) | undefined>
  readonly compose: RefObject<((text: string) => void) | undefined>
  readonly attach: RefObject<((files: readonly File[]) => Promise<void>) | undefined>
}

export interface CanvasProps {
  readonly ready?: boolean
  readonly instance: InstanceInfo
  readonly skin: Skin & SkinSlots
  readonly loaded: readonly LoadedPlugin[]
  readonly pages: readonly IndexEntry[]
  readonly stores: readonly StoreInfo[]
  readonly openApp: string | undefined
  readonly settings: { page: PrefsPage; item?: string } | undefined
  readonly settingsPage: PrefsPage | undefined
  readonly page: PageDocument | undefined
  readonly pageProblem: { path: string; status: number } | undefined
  readonly mount: EditorMount | undefined
  readonly section: string | undefined
  readonly channel: ChatChannel
  readonly openPage: (path: string) => void
  readonly openSection: (path: string) => void
  readonly openPlugin: (plugin: LoadedPlugin) => void
  readonly closeApp: () => void
  readonly blocks: BlockComponents
  readonly layouts: LayoutComponents
  readonly fieldContributions: FieldContributions
  readonly featureOrder: readonly string[]
  readonly say: ReturnType<typeof wordsFor>
  readonly fetchImpl: typeof fetch
  readonly locale: string
  readonly t: (key: string) => string
}

export function Canvas(props: CanvasProps) {
  const { openApp, settingsPage, page, pageProblem, section, t } = props
  const { loaded, pages, stores, channel, openPage, openSection, closeApp } = props

  if (openApp) {
    const plugin = loaded.find((entry) => entry.id === openApp)
    if (!plugin?.view) {
      // A route whose plugin is gone resolves to nothing rather than to
      // a blank canvas: a bookmark outliving a config change must say
      // so instead of looking broken.
      return (
        <EmptyState icon="plug" text={t('That app is not active on this instance.')} action={<BackButton label={t('Home')} onClick={closeApp} />} />
      )
    }
    const View = plugin.view.component
    return (
      <>
        <BackButton label={t('Home')} onClick={closeApp} />
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
  }

  if (settingsPage !== undefined) return <SettingsScreen {...props} settingsPage={settingsPage} />

  if (page) {
    return (
      <CollectionShell.Provider
        value={{ entries: pages, ask: (prompt) => channel.ask.current?.(prompt), t }}
      >
        <Editor
          page={page}
          fetchImpl={props.fetchImpl}
          openPage={openPage}
          locale={props.locale}
          // Dropping a file on a page hands it to the chat and writes the
          // filing request: the agent is still the one who moves it.
          attach={(dropped) => channel.attach.current?.(dropped)}
          compose={(text) => channel.compose.current?.(text)}
          blocks={props.blocks}
          // Who owns this page's domain, and the features on — what the
          // reader's `from=` resolution walks. Owner from the page's FOLDER:
          // ownership is a claim on folders, and the deepest claim wins.
          vocabulary={{
            ...(ownerOf(loaded, page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0)))?.id
              ? { owner: ownerOf(loaded, page.path.slice(0, Math.max(page.path.lastIndexOf('/'), 0)))!.id }
              : {}),
            features: props.featureOrder,
          }}
          layouts={props.layouts}
          fieldContributions={props.fieldContributions}
          say={props.say}
          // The shell already holds the index and keeps it live; the reader
          // needs it to tell a reference that MOVED from one that is gone.
          pages={pages}
          stores={stores}
          t={t}
          {...(props.mount ? { mount: props.mount } : {})}
        />
      </CollectionShell.Provider>
    )
  }

  if (pageProblem) return <MissingPage path={pageProblem.path} status={pageProblem.status} t={t} />

  if (section) {
    return (
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
    )
  }

  return <LandingScreen {...props} />
}

/** Settings: one step up from wherever the reader is, never a jump to the top. */
function SettingsScreen({
  settings,
  settingsPage,
  fetchImpl,
  locale,
  t,
}: CanvasProps & { readonly settingsPage: PrefsPage }) {
  return (
    <>
      {/* ONE step up, never a jump to the top. Two back controls
          appeared on screen the day the pages grew items of their own
          — the shell's, which went to the mosaic, and the screen's,
          which went to its own list — stacked one above the other and
          reading as a bug. This is the survivor, so it has to be right
          at every depth. */}
      <BackButton
        label={settings?.item !== undefined ? prefsTitle(settingsPage, t) : settingsPage === '' ? t('Home') : t('Settings')}
        onClick={() => {
          location.hash =
            settings?.item !== undefined
              ? `/settings/${settingsPage}`
              : settingsPage === ''
                ? ''
                : '/settings'
        }}
      />
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
  )
}

/** The landing canvas, with the livery's head when it draws one. */
function LandingScreen({
  ready,
  instance,
  skin,
  loaded,
  pages,
  stores,
  channel,
  openPage,
  openSection,
  openPlugin,
  fetchImpl,
  locale,
  t,
}: CanvasProps) {
  const slotUser = skinUser(instance)
  return (
    <Home
      {...(ready === undefined ? {} : { ready })}
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
                  ask: (prompt) => channel.ask.current?.(prompt),
                  compose: (text) => channel.compose.current?.(text),
                  focusComposer: () => channel.compose.current?.(''),
                  instance,
                  ...slotUser,
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
      focusComposer={() => channel.compose.current?.('')}
      t={t}
      locale={locale}
      ask={(prompt) => channel.ask.current?.(prompt)}
      fetchImpl={fetchImpl}
    />
  )
}
