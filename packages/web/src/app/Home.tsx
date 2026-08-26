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
import { routeForPath } from './owners.js'
import { ORDER_KEY_APPS, ORDER_KEY_SECTIONS } from './order.js'
import { useReorder } from './useReorder.js'

export interface HomeProps {
  readonly skin: Skin
  readonly plugins: readonly LoadedPlugin[]
  readonly entries: readonly IndexEntry[]
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

/**
 * One entry of the curated brief.
 *
 * The predecessor's field names are accepted alongside the plain ones
 * (`titre`/`title`, `raison`/`reason`, `cible`/`target`): the file is written
 * by an agent following whatever contract its instance carries, and a rename
 * should never blank a working front page.
 */
interface BriefItem {
  readonly ico?: string
  readonly title?: string
  readonly titre?: string
  readonly reason?: string
  readonly raison?: string
  readonly target?: BriefTarget
  readonly cible?: BriefTarget
}

interface BriefTarget {
  readonly type?: string
  readonly path?: string
  readonly id?: string
}

interface Brief {
  readonly generatedAt?: string
  readonly items?: readonly BriefItem[]
}

/** How old the brief is, said the way a person would. */
function briefAge(
  generatedAt: string | undefined,
  now: Date,
  t: (key: string) => string,
): string | undefined {
  if (!generatedAt) return undefined
  const hours = Math.round((now.getTime() - new Date(generatedAt).getTime()) / 3_600_000)
  if (!Number.isFinite(hours) || hours < 0) return undefined
  if (hours < 1) return t('just now')
  if (hours < 24) return `${t('%n h ago').replace('%n', String(hours))}`
  return `${t('%n d ago').replace('%n', String(Math.round(hours / 24)))}`
}

/** The hue a target's kind wears — the predecessor's mapping, in named hues. */
const BRIEF_HUES: Readonly<Record<string, string>> = {
  workbook: 'emeraude',
  fiche: 'bleu',
  page: 'bleu',
  domaine: 'indigo',
  section: 'indigo',
  todo: 'rouge',
  app: 'rouge',
}

/** After this hour the greeting turns to the evening form. */
const EVENING_FROM = 18

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The shell's own app, on the mosaic of apps.
 *
 * Settings is a domain of this instance — the engine it answers with, the
 * servers it reaches, what it looks like, what it was told — and it stopped
 * being a dialog over whatever screen you were on. So it is where a domain
 * belongs: a tile, opening a screen with the whole canvas to say it in.
 *
 * Pinned last rather than dragged with the others. It is furniture, not one
 * of the apps this workspace was given, and a tile that is in the same place
 * on every instance is one nobody has to look for.
 */
const SHELL_APP = { icon: '⚙', hue: 'ardoise', route: '/settings' } as const

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
  /** Edit mode: the tile is furniture to be moved, not a way in. */
  readonly editing?: boolean
  readonly carried?: boolean
  /** Moves this tile one place. Present only while editing. */
  readonly onNudge?: (by: -1 | 1) => void
  readonly drag?: Record<string, unknown>
  readonly t?: (key: string) => string
}) {
  const drawn = glyphOf(props.glyph)
  const t = props.t ?? ((key: string) => key)
  return (
    <li
      className={[
        'golem-tile-slot',
        props.editing ? 'golem-tile-slot--editing' : '',
        props.carried ? 'golem-tile-slot--carried' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...(props.editing ? props.drag ?? {} : {})}
    >
      {/* Arrows, because a mosaic that can only be dragged is a mosaic some
          people cannot reorder at all — and "hold and drag" is the hardest
          gesture to discover even for those who can. */}
      {props.editing && props.onNudge && (
        <span className="golem-tile-slot__arrows">
          <button
            type="button"
            aria-label={`${t('Move earlier')} — ${props.label}`}
            onClick={() => props.onNudge?.(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={`${t('Move later')} — ${props.label}`}
            onClick={() => props.onNudge?.(1)}
          >
            ›
          </button>
        </span>
      )}
      <button
        type="button"
        className="golem-tile"
        style={hueStyle(props.hue)}
        // Editing, the tile is being ARRANGED. Opening what you are trying to
        // pick up is the classic way an edit mode betrays the person in it.
        //
        // Inert by `pointer-events: none` from the slot rather than by
        // `disabled`: a disabled button swallows pointer events in some
        // browsers, and those are exactly the events the drag is listening
        // for on the slot around it. Untabbable too, so the keyboard is not
        // offered a control that does nothing.
        onClick={props.editing ? undefined : props.onOpen}
        disabled={props.disabled ?? false}
        {...(props.editing ? { tabIndex: -1, 'aria-hidden': true } : {})}
        {...(props.title && !props.editing ? { title: props.title } : {})}
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
  openPage,
  focusComposer,
  ask,
  fetchImpl,
  now,
  t = (key) => key,
  locale = 'en',
}: HomeProps) {
  const info = useTileInfo(plugins)
  const clock = now ?? new Date()
  const [brief, setBrief] = useState<Brief | undefined>(undefined)
  /**
   * Arranging rather than opening.
   *
   * A mode with a button rather than a long-press: long-press is invisible,
   * and on a screen whose tiles are the only way into half the product an
   * undiscoverable mode is one nobody uses. It also keeps an ordinary tap
   * meaning "open", which is what it means the other 99% of the time.
   */
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let live = true
    const doFetch = fetchImpl ?? fetch
    void doFetch('/api/home/brief')
      .then((response) => (response.ok ? (response.json() as Promise<Brief>) : undefined))
      .then((data) => {
        if (live && data?.items?.length) setBrief(data)
      })
      .catch(() => {
        /* no brief is a home without that section, never an error */
      })
    return () => {
      live = false
    }
  }, [fetchImpl])

  /** Where a brief entry leads. Unknown kinds fall back to the composer. */
  const openTarget = (target: BriefTarget | undefined, label: string) => {
    const kind = target?.type
    if ((kind === 'app' || kind === 'todo') && plugins.length > 0) {
      const wanted = target?.id ?? (kind === 'todo' ? 'todo' : undefined)
      const found = plugins.find((entry) => entry.id === wanted)
      if (found) {
        // An app named WITH a path opens on that path — "the bench, on the
        // garage job" rather than "the bench". Asked of that app alone: a
        // named target is an instruction, not a question.
        const inside = target?.path ? routeForPath([found], target.path) : undefined
        if (inside) {
          location.hash = inside
          return
        }
        return openPlugin(found)
      }
    }
    if ((kind === 'fiche' || kind === 'page') && target?.path) {
      return openPage(target.path.replace(/\.md$/, '') + '.md')
    }
    if ((kind === 'domaine' || kind === 'section') && target?.path) return openSection(target.path)
    // Any other path goes to whoever owns it — no `type` the shell has to
    // learn, no plugin's URL shape written down here. `workbook` used to be
    // spelled out at this spot, atelier route and all, which meant the shell
    // knew one plugin by name and every future one would have needed its own
    // line. A brief written that way still works, and now for the right
    // reason: the atelier claims the path, the shell merely asks.
    if (target?.path) {
      const owned = routeForPath(plugins, target.path)
      if (owned) {
        location.hash = owned
        return
      }
    }
    // The truthful fallback: let the person ask about it.
    ask?.(`Ouvre « ${label} »`)
  }

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
  /**
   * Folders an ACTIVE app already stands for. Inactive plugins absorb
   * nothing: turning one off gives its folder back as an ordinary section
   * rather than hiding it forever.
   */
  const absorbed = [
    ...plugins.flatMap((plugin) => plugin.absorbs ?? []),
    // The shell absorbs its own: `home/` holds the curated brief this very
    // screen renders (see `page-author`). A "Home" tile on the home screen
    // would offer to open what the reader is already looking at.
    'home',
  ]
  const sections: readonly SectionTile[] = sectionsOf(entries, absorbed)

  // One order per mosaic. An app cannot be dragged among the sections: that
  // would be a request to MOVE A FOLDER, which is a different act entirely
  // and not one a drag on the home screen should be able to perform.
  const apps = useReorder({
    source: tiled,
    keyOf: (plugin: LoadedPlugin) => plugin.id,
    storageKey: ORDER_KEY_APPS,
    editing,
  })
  const shelves = useReorder({
    source: sections,
    keyOf: (section: SectionTile) => section.path,
    storageKey: ORDER_KEY_SECTIONS,
    editing,
  })

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
        <span className="golem-home__ask-text">{skin.placeholder ?? t('Ask…')}</span>
        <kbd className="golem-home__ask-kbd">⌘K</kbd>
      </button>

      {brief && (
        <>
          <h2 className="golem-section">
            À la une
            {(() => {
              const age = briefAge(brief.generatedAt, clock, t)
              const by = skin.brand ?? t('the agent')
              return (
                <span className="golem-section__by">
                  — {t('chosen by')} {by}
                  {age ? ` · ${age}` : ''}
                </span>
              )
            })()}
            {ask && (
              <button
                type="button"
                className="golem-section__refresh"
                title={t('Ask for a fresh brief')}
                onClick={() => ask('Rafraîchis ma une')}
              >
                ↺
              </button>
            )}
          </h2>
          <div className="golem-brief">
            {(brief.items ?? []).slice(0, 4).map((item) => {
              const label = item.title ?? item.titre ?? '…'
              const target = item.target ?? item.cible
              const hue = BRIEF_HUES[target?.type ?? '']
              return (
                <button
                  key={label}
                  type="button"
                  className="golem-brief__item"
                  style={(hue ? { '--u': `var(--golem-hue-${hue}, var(--accent))` } : {}) as Record<string, string>}
                  title={item.reason ?? item.raison ?? ''}
                  onClick={() => openTarget(target, label)}
                >
                  <span className="golem-brief__icon" aria-hidden="true">
                    {item.ico ?? '•'}
                  </span>
                  <span className="golem-brief__text">{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Always drawn: even an instance with no plugin at all has the shell's
          own app on it, and on a fresh one that tile is the whole way in —
          the credential is armed from behind it. */}
      <h2 className="golem-section">
        <span className="golem-section__name">{t('Apps')}</span>
        {/* One switch for both mosaics: two edit modes on one screen would
            be two states to keep track of for a gesture that is the same
            gesture. Only offered when there is something to arrange. */}
        {tiled.length + sections.length > 1 && (
          <button
            type="button"
            className="golem-section__edit"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? t('Done') : t('Arrange')}
          </button>
        )}
      </h2>
      <ul className="golem-tiles" {...apps.listProps}>
        {apps.items.map((plugin, index) => (
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
            editing={editing}
            carried={apps.carried === plugin.id}
            onNudge={(by) => apps.nudge(index, by)}
            drag={apps.tileProps(index)}
            t={t}
          />
        ))}
        <Tile
          key="shell:settings"
          icon={SHELL_APP.icon}
          hue={SHELL_APP.hue}
          label={t('Settings')}
          onOpen={() => {
            location.hash = SHELL_APP.route
          }}
          t={t}
        />
      </ul>

      {sections.length > 0 && (
        <>
          <h2 className="golem-section">
            <span className="golem-section__name">{t('Sections')}</span>
            {/* The switch lives on the Apps heading when there is one; here
                only when this is the sole mosaic on the screen. */}
            {tiled.length === 0 && sections.length > 1 && (
              <button
                type="button"
                className="golem-section__edit"
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? t('Done') : t('Arrange')}
              </button>
            )}
          </h2>
          <ul className="golem-tiles" {...shelves.listProps}>
            {shelves.items.map((section, index) => (
              <Tile
                key={section.path}
                icon={section.icon}
                label={section.title}
                {...(section.hue ? { hue: section.hue } : {})}
                chips={[{ text: plural(section.count, t('page'), t('pages')) }]}
                onOpen={() => openSection(section.path)}
                editing={editing}
                carried={shelves.carried === section.path}
                onNudge={(by) => shelves.nudge(index, by)}
                drag={shelves.tileProps(index)}
                t={t}
              />
            ))}
          </ul>
        </>
      )}

      {tiled.length === 0 && sections.length === 0 && (
        <section className="golem-empty">
          <p>{t('Nothing to show yet.')}</p>
          <p className="golem-empty__hint">
            {t('Turn a plugin on in')} <code>golem.config.yaml</code>,{' '}
            {t('or write a page — a folder holding one becomes a section on its own.')}
          </p>
        </section>
      )}
    </div>
  )
}
