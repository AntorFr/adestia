/**
 * The landing canvas.
 *
 * What it replaced: every page in the workspace as one flat row, with the app
 * tiles underneath. Fine at six pages, unusable at two hundred — the apps sat
 * below the fold and a year of somebody's writing read like a log file.
 *
 * What it is now: a greeting, one line of live context, a way in, and two
 * labelled mosaics — what this instance can DO, and what it HOLDS. Both are
 * declared rather than guessed: apps come from active plugins, sections from
 * folders whose index page dresses them.
 */


import { useEffect, type ReactNode } from 'react'

import type { LoadedPlugin } from '../plugins/loader.js'
import type { Skin } from './skin.js'
import type { IndexEntry, StoreInfo } from './sections.js'
import { Icon } from './Icon.js'
import { Brief } from './Brief.js'
import { Domains, plural } from './Domains.js'

export interface HomeProps {
  readonly ready?: boolean
  readonly skin: Skin
  /**
   * The livery's own head — greeting, mascot, way in — in place of the
   * shell's three lines. Everything BELOW it is the shell's whatever the
   * livery is: the brief, the mosaics, their counts and their arranging.
   *
   * The slot it replaced handed over the whole canvas, and the two bodies
   * that used it rebuilt a tile mosaic from `/api/instance` — plugins only.
   * A livery is a look, not a navigation.
   */
  readonly hero?: ReactNode
  readonly plugins: readonly LoadedPlugin[]
  readonly entries: readonly IndexEntry[]
  /** The stores this instance composes. Empty or absent when there is only one. */
  readonly stores?: readonly StoreInfo[]
  readonly openPlugin: (plugin: LoadedPlugin) => void
  readonly openSection: (path: string) => void
  readonly openPage: (path: string) => void
  /** Puts the cursor in the composer — what the search affordance actually does. */
  readonly focusComposer: () => void
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
  /** BCP-47 tag for dates and numbers — the instance's, not the browser's. */
  readonly locale?: string
  /** Sends a prompt to the agent — the brief's refresh button uses it. */
  readonly ask?: (prompt: string) => void
  readonly fetchImpl?: typeof fetch
  /** Injectable so the greeting can be tested at a fixed hour. */
  readonly now?: Date
}

/** After this hour the greeting turns to the evening form. */
const EVENING_FROM = 18

export function Home({
  ready = true,
  skin,
  hero,
  plugins,
  entries,
  stores = [],
  openPlugin,
  openSection,
  openPage,
  focusComposer,
  ask,
  fetchImpl,
  now,
  t = (key) => key,
  locale = 'en',
}: HomeProps) {
  const clock = now ?? new Date()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        focusComposer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusComposer])

  const greeting =
    (clock.getHours() >= EVENING_FROM ? skin.greetingEvening : skin.greetingDay) ??
    (clock.getHours() >= EVENING_FROM ? t('Good evening.') : t('Good morning.'))

  // Written by the shell because the shell is what knows the corpus: the
  // number is the reason the line exists, and a date with nothing after it is
  // decoration.
  const pages = entries.filter((entry) => !/(^|\/)index\.md$/i.test(entry.path)).length
  const context = `${clock.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })} — ${plural(pages, t('page'), t('pages'))}.`

  return (
    <div className="adestia-home">
      {hero ?? (
        <>
          <h1 className="adestia-home__greeting">
            {greeting}
            {skin.greetingAside && (
              <span className="adestia-home__aside"> {skin.greetingAside}</span>
            )}
          </h1>
          <p className="adestia-home__context">
            {context.charAt(0).toUpperCase() + context.slice(1)}
          </p>

          {/* Not a search box: it puts the cursor in the composer. The chat IS
              the way in, and a second input that only looked like one would
              split the user's attention between two places that do different
              things. */}
          <button type="button" className="adestia-home__ask" onClick={focusComposer}>
            <Icon name="search" />
            {/* The block caret: invisible on most liveries, a beating amber
                slab on the one whose whole identity is a terminal. CSS
                decides. */}
            <span className="adestia-home__ask-caret" aria-hidden="true" />
            <span className="adestia-home__ask-text">{skin.placeholder ?? t('Ask…')}</span>
            <kbd className="adestia-home__ask-kbd">{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </>
      )}

      {!ready ? (
        <div className="adestia-loading" role="status"><Icon name="loader-circle" />{t('Loading…')}</div>
      ) : (
        <>
          <Brief
            skin={skin}
            plugins={plugins}
            clock={clock}
            fetchImpl={fetchImpl}
            openPlugin={openPlugin}
            openSection={openSection}
            openPage={openPage}
            ask={ask}
            t={t}
          />

          <Domains
            plugins={plugins}
            entries={entries}
            stores={stores}
            openPlugin={openPlugin}
            openSection={openSection}
            t={t}
          />
        </>
      )}
    </div>
  )
}
