/**
 * What a plugin's front-end factories receive, and what they may return.
 *
 * Every facet is a default-exported function taking one `api` object. Injection
 * rather than imports, for a reason that decides the whole loading model: the
 * shell imports the PLUGIN, so a plugin importing the shell would be a cycle —
 * and worse, would pin a plugin to a build of the shell it can never see.
 *
 * The whitelist below is enforced in code, not just described here. A
 * contribution carrying a field off-contract is dropped AND reported, because
 * a silently ignored field is an hour spent wondering why nothing happens.
 */

import type { ComponentType } from 'react'

/** What every factory is handed. Stable across all three facet kinds. */
export interface PluginApi {
  /** The plugin's own id — useful for namespacing storage and CSS. */
  readonly id: string
  /** URL prefix its own files are served from, for assets and lazy chunks. */
  readonly base: string
  /**
   * Fetch, already carrying the session. A plugin calling bare `fetch` works
   * too; this exists so the obvious call is the correct one.
   */
  readonly fetch: typeof fetch
  /**
   * Sends a message to the agent, as if the user had typed it.
   *
   * Deliberately present: an app whose button can ask the agent something is
   * the whole point of pairing a chat with apps. It is also the single most
   * powerful thing a plugin can do, which is why `plugins/README` says a view
   * ships JavaScript into the page and there is no sandbox.
   */
  ask(prompt: string): void
  /**
   * Puts text in the composer WITHOUT sending it.
   *
   * Distinct from `ask` on purpose, and the distinction is a design position
   * rather than a convenience: a barcode reader is a KEYBOARD, not a scanner
   * that commands. It deposits what it read and the person decides what the
   * message means — "add these to the shopping list", "how much protein is in
   * this". A plugin that sent on every beep would be making that decision for
   * them, badly.
   */
  compose(text: string): void
}

/** One live figure on a plugin's tile. */
export interface TileChip {
  readonly text: string
  /**
   * Drawn in the tile's own colour rather than in the quiet default. For the
   * one figure that is not merely informative — overdue, failing, waiting on
   * somebody. A tile where everything is hot says nothing.
   */
  readonly hot?: boolean
}

/** What a plugin puts on its own tile, computed when the launcher renders. */
export interface TileInfo {
  readonly subtitle?: string
  readonly chips?: readonly TileChip[]
}

/** A launcher view: one React component, optionally a route to reach it. */
export interface ViewContribution {
  readonly component: ComponentType<Record<string, never>>
  /**
   * Hash route this view answers to (`#/workbench`). Absent means the view is
   * reached only from its tile.
   *
   * A route owns its descendants: a view declaring `/workbench` also answers
   * to `/workbench/anything/deeper`, and reads the rest itself. Without that,
   * a plugin with a detail screen has nowhere to put it — either the shell
   * learns every plugin's URL shape, or detail screens live in component
   * state and cannot be bookmarked, shared, or survive a reload.
   */
  readonly route?: string

  /**
   * Live figures for this plugin's tile — "12 to do", "3 overdue".
   *
   * Asked for by the launcher, answered by the plugin, because only the
   * plugin knows what counts. The shell will not wait on it: a tile renders
   * immediately from the manifest and fills in when this resolves, so a slow
   * or failing count costs a number, never the launcher.
   */
  tileInfo?(): TileInfo | Promise<TileInfo | undefined> | undefined
}

/**
 * Whether a hash falls inside a route.
 *
 * The boundary is a SEGMENT boundary, so `/note` never captures `/notebook`.
 * Two plugins claiming overlapping routes is a configuration mistake, and one
 * silently swallowing the other's screens would be an unpleasant way to find
 * out.
 */
export function routeMatches(route: string | undefined, hash: string): boolean {
  if (!route) return false
  return hash === route || hash.startsWith(`${route}/`)
}

/** Composer buttons and settings entries a plugin adds to the shell. */
export interface ChromeContribution {
  readonly composer?: readonly {
    readonly id: string
    readonly glyph: string
    readonly title: string
    onClick(api: PluginApi): void
  }[]
  readonly settings?: readonly {
    readonly id: string
    readonly label: string
    onClick(api: PluginApi): void
  }[]
}

/** Content-engine tags a plugin adds to the closed vocabulary. */
export interface BlocksContribution {
  readonly tags: Readonly<Record<string, unknown>>
}

export type Facet = 'view' | 'blocks' | 'chrome'

export interface ContractIssue {
  readonly facet: Facet
  readonly reason: string
}

/**
 * Narrows what a factory returned to what the shell will actually use.
 *
 * Written as three small validators rather than one clever one: the error a
 * plugin author reads has to name the facet AND what was expected, and a
 * generic schema walker produces neither.
 */
export function narrowView(raw: unknown): { view?: ViewContribution; issue?: ContractIssue } {
  if (typeof raw === 'function') {
    // A bare component is the obvious thing to return, so it is accepted:
    // refusing it would be pedantry over a shape that is unambiguous.
    return { view: { component: raw as ComponentType<Record<string, never>> } }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'view', reason: 'must return a component or { component }' } }
  }
  const record = raw as Record<string, unknown>
  if (typeof record['component'] !== 'function') {
    return { issue: { facet: 'view', reason: '`component` must be a React component' } }
  }
  const route = record['route']
  const tileInfo = record['tileInfo']
  return {
    view: {
      component: record['component'] as ComponentType<Record<string, never>>,
      ...(typeof route === 'string' ? { route } : {}),
      ...(typeof tileInfo === 'function'
        ? { tileInfo: tileInfo as NonNullable<ViewContribution['tileInfo']> }
        : {}),
    },
  }
}

export function narrowChrome(raw: unknown): { chrome?: ChromeContribution; issue?: ContractIssue } {
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'chrome', reason: 'must return { composer?, settings? }' } }
  }
  const record = raw as Record<string, unknown>

  const entries = (value: unknown, needs: readonly string[]) =>
    Array.isArray(value)
      ? value.filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            needs.every((key) => typeof (item as Record<string, unknown>)[key] === 'string') &&
            typeof (item as Record<string, unknown>)['onClick'] === 'function',
        )
      : []

  const composer = entries(record['composer'], ['id', 'glyph', 'title'])
  const settings = entries(record['settings'], ['id', 'label'])

  if (composer.length === 0 && settings.length === 0) {
    return {
      issue: {
        facet: 'chrome',
        reason: 'declared nothing usable — composer entries need {id, glyph, title, onClick}',
      },
    }
  }
  const chrome: ChromeContribution = {
    ...(composer.length > 0
      ? { composer: composer as NonNullable<ChromeContribution['composer']> }
      : {}),
    ...(settings.length > 0
      ? { settings: settings as NonNullable<ChromeContribution['settings']> }
      : {}),
  }
  return { chrome }
}

export function narrowBlocks(raw: unknown): { blocks?: BlocksContribution; issue?: ContractIssue } {
  if (typeof raw !== 'object' || raw === null) {
    return { issue: { facet: 'blocks', reason: 'must return { tags }' } }
  }
  const tags = (raw as Record<string, unknown>)['tags']
  if (typeof tags !== 'object' || tags === null) {
    return { issue: { facet: 'blocks', reason: '`tags` must be an object of block definitions' } }
  }
  return { blocks: { tags: tags as Record<string, unknown> } }
}
