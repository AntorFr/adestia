/**
 * The mosaic of domains and its arrange mode.
 *
 * Everything that depends on the plugin set, the index and the per-browser
 * order lives here: the home composes it and knows none of it.
 */

import { useEffect, useMemo, useState } from 'react'

import type { LoadedPlugin } from '../plugins/loader.js'
import { wordsFor } from '../plugins/words.js'
import type { TileInfo } from '../plugins/contract.js'
import { Tile } from './Tile.js'
import { sectionsOf, type IndexEntry, type SectionTile, type StoreInfo } from './sections.js'
import { ORDER_KEY_DOMAINS } from './order.js'
import { useReorder } from './useReorder.js'

export function plural(count: number, one: string, many: string): string {
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
 * A door on the home screen: a plugin's, a folder's, the shell's own.
 *
 * What a `Tile` needs and nothing more. The differences between the three —
 * who draws the domain, where it materialises — are settled before this point
 * and never reach the grid.
 */
interface Domain {
  readonly key: string
  readonly icon: string
  readonly glyph?: string
  readonly hue?: string
  readonly label: string
  readonly subtitle?: string
  readonly chips?: readonly { readonly text: string }[]
  /** A section's provenance. A plugin's tile has none: an app is nobody's circle. */
  readonly store?: { readonly label: string; readonly hue?: string }
  readonly mixed?: boolean
  readonly disabled?: boolean
  readonly title?: string
  readonly open: () => void
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

export function Domains({
  plugins,
  entries,
  stores,
  openPlugin,
  openSection,
  t,
}: {
  readonly plugins: readonly LoadedPlugin[]
  readonly entries: readonly IndexEntry[]
  /** The stores this instance composes. Empty when there is only one. */
  readonly stores: readonly StoreInfo[]
  readonly openPlugin: (plugin: LoadedPlugin) => void
  readonly openSection: (path: string) => void
  readonly t: (key: string) => string
}) {
  const info = useTileInfo(plugins)
  /**
   * A tile's name is written in a MANIFEST, which the shell reads before the
   * plugin's code runs — so it cannot be written in the reader's language,
   * and the plugin's own table is what says it here.
   */
  const say = useMemo(() => wordsFor(plugins, t), [plugins, t])
  /**
   * Arranging rather than opening.
   *
   * A mode with a button rather than a long-press: long-press is invisible,
   * and on a screen whose tiles are the only way into half the product an
   * undiscoverable mode is one nobody uses. It also keeps an ordinary tap
   * meaning "open", which is what it means the other 99% of the time.
   */
  const [editing, setEditing] = useState(false)

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

  /**
   * Every door on this instance, in one list.
   *
   * A plugin's tile and a folder's tile are the same kind of thing — a domain
   * — differing only in what draws it and in where it materialises. They are
   * built into a common shape here rather than rendered from two branches, so
   * that one order, one arrange mode and one grid can serve both.
   *
   * The previous split was defended on the grounds that dragging an app among
   * the sections would be "a request to MOVE A FOLDER". It is not: this order
   * is a permutation kept per browser — how one person likes to find their own
   * screen, as `order.ts` says — and it moves nothing on disk. What the old
   * arrangement said about the workspace, it said wrongly.
   */
  const domains: readonly Domain[] = [
    ...tiled.map((plugin) => ({
      key: plugin.id,
      icon: plugin.tile?.icon ?? '▩',
      ...(plugin.tile?.glyph ? { glyph: plugin.tile.glyph } : {}),
      ...(plugin.tile?.hue ? { hue: plugin.tile.hue } : {}),
      label: plugin.tile?.label ? say(plugin.id, plugin.tile.label) : plugin.id,
      ...(info[plugin.id]?.subtitle ? { subtitle: info[plugin.id]!.subtitle! } : {}),
      ...(info[plugin.id]?.chips ? { chips: info[plugin.id]!.chips! } : {}),
      ...(plugin.view ? {} : { disabled: true, title: 'This plugin ships no screen' }),
      open: () => openPlugin(plugin),
    })),
    ...sections.map((section) => {
      // The default store's tiles carry nothing: absence is its mark, and a
      // screen where every tile wears a badge has taught the reader nothing.
      const from = stores.find((store) => store.id === section.store)
      return {
        key: section.path,
        icon: section.icon,
        ...(section.hue ? { hue: section.hue } : {}),
        label: section.title,
        chips: [{ text: plural(section.count, t('page'), t('pages')) }],
        ...(from && !from.default
          ? { store: { label: from.label, ...(from.hue ? { hue: from.hue } : {}) } }
          : {}),
        ...(section.mixed ? { mixed: true } : {}),
        open: () => openSection(section.path),
      }
    }),
  ]

  /**
   * The shell's own closes the mosaic, and is NOT in the permutation.
   *
   * Settings is a domain whose matter is the instance's configuration rather
   * than pages — the one motivated exception to "a domain is a body of pages"
   * — so it earns a tile. It is drawn after the arranged ones because it is
   * the instance itself rather than one of its subjects, and an arrangement is
   * about the subjects.
   *
   * It was briefly made conditional, on the grounds that the cog in the header
   * already offers it. That was wrong, and `SettingsMenu` says why: the cog
   * holds the switches ABOUT THIS SESSION (theme, sign-in, the agent's token)
   * while the CONTENT — the servers this instance reaches, the prose it was
   * told — "is an app on the landing canvas, with tiles like everything else".
   * Removing it did not remove a duplicate; it removed the only door to the
   * MCP servers and the instructions on any populated instance.
   */
  const mosaic = useReorder({
    source: domains,
    keyOf: (domain: Domain) => domain.key,
    storageKey: ORDER_KEY_DOMAINS,
    editing,
  })

  return (
    <>
      {/* ONE mosaic, because there is one kind of thing on it. The split into
          "Apps" and "Sections" asked the reader to sort what the model does
          not sort: a domain materialises as a folder, as a species of page,
          as a reserved root or as nothing at all, and it is drawn by the core
          or by a plugin — properties, not species. See the decision log,
          2026-09-01. */}
      {/* Always drawn: the shell's own tile is there even with nothing else. */}
      <h2 className="adestia-section">
        <span className="adestia-section__name">{t('Domains')}</span>
        {domains.length > 1 && (
          <button
            type="button"
            className="adestia-section__edit"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? t('Done') : t('Arrange')}
          </button>
        )}
      </h2>
      <ul className="adestia-tiles" {...mosaic.listProps}>
        {mosaic.items.map((domain, index) => (
          <Tile
            key={domain.key}
            icon={domain.icon}
            {...(domain.glyph ? { glyph: domain.glyph } : {})}
            {...(domain.hue ? { hue: domain.hue } : {})}
            {...(domain.store ? { store: domain.store } : {})}
            {...(domain.mixed ? { mixed: true } : {})}
            label={domain.label}
            {...(domain.subtitle ? { subtitle: domain.subtitle } : {})}
            {...(domain.chips ? { chips: domain.chips } : {})}
            disabled={domain.disabled ?? false}
            {...(domain.title ? { title: domain.title } : {})}
            onOpen={domain.open}
            editing={editing}
            carried={mosaic.carried === domain.key}
            onNudge={(by) => mosaic.nudge(index, by)}
            drag={mosaic.tileProps(index)}
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

      {tiled.length === 0 && sections.length === 0 && (
        <section className="adestia-empty">
          <p>{t('Nothing to show yet.')}</p>
          <p className="adestia-empty__hint">
            {t('Turn a plugin on in')} <code>adestia.config.yaml</code>,{' '}
            {t('or write a page — a folder holding one becomes a section on its own.')}
          </p>
        </section>
      )}
    </>
  )
}
