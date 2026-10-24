/**
 * What the active plugins contribute to the pages, flattened once.
 *
 * Recomputed only when the loaded set changes: each is a lookup the page
 * reader walks on every render.
 */

import { useMemo } from 'react'

import { CollectionLayout } from './Collection.js'
import type { BlockComponents, LayoutComponents } from '../editor/Reader.js'
import type { FieldContributions } from '../editor/pageform.js'
import type { LoadedPlugin } from '../plugins/loader.js'

export function useContributions(loaded: readonly LoadedPlugin[]) {
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

  return { blocks, featureOrder, layouts, fieldContributions }
}

/** Composer buttons every active plugin contributed, flattened once. */
export function composerButtonsOf(
  loaded: readonly LoadedPlugin[],
  locale: string,
  channel: {
    readonly ask: { readonly current: ((prompt: string) => void) | undefined }
    readonly compose: { readonly current: ((text: string) => void) | undefined }
  },
) {
  return loaded.flatMap((plugin) =>
    (plugin.chrome?.composer ?? []).map((entry) => ({
      ...entry,
      // Namespaced: two plugins may both call a button "scan".
      key: `${plugin.id}:${entry.id}`,
      api: {
        id: plugin.id,
        base: plugin.base,
        locale,
        fetch,
        ask: (p: string) => channel.ask.current?.(p),
        compose: (t: string) => channel.compose.current?.(t),
      },
    })),
  )
}
