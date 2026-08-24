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

import { useEffect, useState } from 'react'

import type { LoadedPlugin } from '../plugins/loader.js'
import type { TileInfo } from '../plugins/contract.js'
import type { Skin } from './skin.js'
import { glyphOf } from './glyphs.js'
import { sectionsOf, type IndexEntry, type SectionTile } from './sections.js'

export interface HomeProps {
  readonly skin: Skin
  readonly plugins: readonly LoadedPlugin[]
  readonly entries: readonly IndexEntry[]
  readonly openPlugin: (plugin: LoadedPlugin) => void
  readonly openSection: (path: string) => void
  /** Puts the cursor in the composer — what the search affordance actually does. */
  readonly focusComposer: () => void
  /** Injectable so the greeting can be tested at a fixed hour. */
  readonly now?: Date
}

/** After this hour the greeting turns to the evening form. */
const EVENING_FROM = 18

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * A tile's colour.
 *
 * A declared hue becomes `--golem-hue-<name>`, which a skin may define and
 * most will not — so the fallback is the accent rather than a colour invented
 * here. Inventing one would mean a palette the skin cannot reach.
 */
function hueStyle(hue?: string): Record<string, string> {
  return hue ? { '--tile-color': `var(--golem-hue-${hue}, var(--accent))` } : {}
}

function Tile(props: {
  readonly icon: string
  /** `ic:` name resolved against the shell's closed glyph set. */
  readonly glyph?: string
  readonly label: string
  readonly subtitle?: string
  readonly chips?: TileInfo['chips']
  readonly hue?: string
  readonly disabled?: boolean
  readonly title?: string
  readonly onOpen: () => void
}) {
  const drawn = glyphOf(props.glyph)
  return (
    <li>
      <button
        type="button"
        className="golem-tile"
        style={hueStyle(props.hue)}
        onClick={props.onOpen}
        disabled={props.disabled ?? false}
        {...(props.title ? { title: props.title } : {})}
      >
        {/* The markup comes from the shell's own closed set, never from a
            manifest — which is what makes the injection safe. */}
        {drawn ? (
          <span
            className="golem-tile__icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: drawn }}
          />
        ) : (
          <span className="golem-tile__icon" aria-hidden="true">
            {props.icon}
          </span>
        )}
        <span className="golem-tile__label">{props.label}</span>
        {props.subtitle && <span className="golem-tile__subtitle">{props.subtitle}</span>}
        <span className="golem-tile__foot">
          {(props.chips ?? []).map((chip) => (
            <span
              key={chip.text}
              className={chip.hot ? 'golem-chip golem-chip--hot' : 'golem-chip'}
            >
              {chip.text}
            </span>
          ))}
        </span>
      </button>
    </li>
  )
}

/**
 * Live tile figures, gathered without ever blocking the render.
 *
 * Each plugin is asked separately and folded in as it answers, so one slow or
 * throwing `tileInfo` costs its own numbers and nothing else. A tile with no
 * figures is a tile, not a hole.
 */
function useTileInfo(plugins: readonly LoadedPlugin[]): Record<string, TileInfo> {
  const [info, setInfo] = useState<Record<string, TileInfo>>({})

  useEffect(() => {
    let live = true
    for (const plugin of plugins) {
      const ask = plugin.view?.tileInfo
      if (!ask) continue
      void Promise.resolve()
        .then(() => ask())
        .then((result) => {
          if (live && result) setInfo((current) => ({ ...current, [plugin.id]: result }))
        })
        .catch(() => {
          /* a tile without its count is still a tile */
        })
    }
    return () => {
      live = false
    }
  }, [plugins])

  return info
}

export function Home({
  skin,
  plugins,
  entries,
  openPlugin,
  openSection,
  focusComposer,
  now,
}: HomeProps) {
  const info = useTileInfo(plugins)
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

  const tiled = plugins.filter((plugin) => plugin.tile)
  const sections: readonly SectionTile[] = sectionsOf(entries)

  const greeting =
    (clock.getHours() >= EVENING_FROM ? skin.greetingEvening : skin.greetingDay) ??
    (clock.getHours() >= EVENING_FROM ? 'Good evening.' : 'Good morning.')

  // Written by the shell because the shell is what knows the corpus: the
  // number is the reason the line exists, and a date with nothing after it is
  // decoration.
  const pages = entries.filter((entry) => !/(^|\/)index\.md$/i.test(entry.path)).length
  const context = `${clock.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })} — ${plural(pages, 'page', 'pages')}.`

  return (
    <div className="golem-home">
      <h1 className="golem-home__greeting">
        {greeting}
        {skin.greetingAside && (
          <span className="golem-home__aside"> {skin.greetingAside}</span>
        )}
      </h1>
      <p className="golem-home__context">
        {context.charAt(0).toUpperCase() + context.slice(1)}
      </p>

      {/* Not a search box: it puts the cursor in the composer. The chat IS the
          way in, and a second input that only looked like one would split the
          user's attention between two places that do different things. */}
      <button type="button" className="golem-home__ask" onClick={focusComposer}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        {/* The block caret: invisible on most liveries, a beating amber slab
            on the one whose whole identity is a terminal. CSS decides. */}
        <span className="golem-home__ask-caret" aria-hidden="true" />
        <span className="golem-home__ask-text">{skin.placeholder ?? 'Ask…'}</span>
        <kbd className="golem-home__ask-kbd">⌘K</kbd>
      </button>

      {tiled.length > 0 && (
        <>
          <h2 className="golem-section">Apps</h2>
          <ul className="golem-tiles">
            {tiled.map((plugin) => (
              <Tile
                key={plugin.id}
                icon={plugin.tile?.icon ?? '▩'}
                {...(plugin.tile?.glyph ? { glyph: plugin.tile.glyph } : {})}
                {...(plugin.tile?.hue ? { hue: plugin.tile.hue } : {})}
                label={plugin.tile?.label ?? plugin.id}
                {...(info[plugin.id]?.subtitle
                  ? { subtitle: info[plugin.id]!.subtitle! }
                  : {})}
                {...(info[plugin.id]?.chips ? { chips: info[plugin.id]!.chips! } : {})}
                disabled={!plugin.view}
                {...(plugin.view ? {} : { title: 'This plugin ships no screen' })}
                onOpen={() => openPlugin(plugin)}
              />
            ))}
          </ul>
        </>
      )}

      {sections.length > 0 && (
        <>
          <h2 className="golem-section">Sections</h2>
          <ul className="golem-tiles">
            {sections.map((section) => (
              <Tile
                key={section.path}
                icon={section.icon}
                label={section.title}
                {...(section.hue ? { hue: section.hue } : {})}
                chips={[{ text: plural(section.count, 'page', 'pages') }]}
                onOpen={() => openSection(section.path)}
              />
            ))}
          </ul>
        </>
      )}

      {tiled.length === 0 && sections.length === 0 && (
        <section className="golem-empty">
          <p>Nothing to show yet.</p>
          <p className="golem-empty__hint">
            Turn a plugin on in <code>golem.config.yaml</code>, or give a folder of pages
            an <code>INDEX.md</code> to make it a section.
          </p>
        </section>
      )}
    </div>
  )
}
