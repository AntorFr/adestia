/**
 * What the block gallery lists (E-34, AD-deplacer-2).
 *
 * The core's table plus the `gallery` records of the plugins that are LOADED —
 * the loader only ever sees active ones, so a disabled plugin has no record
 * here to list. A plugin block with no record still gets a card, under its
 * identifier: an unlisted block would be one nobody could insert.
 */

import type { PluginGalleryFields, PluginGalleryText, PluginGalleryView } from '@antorfr/adestia-schemas'

import { CORE_GALLERY, type Locale } from './galleryTable.js'

/** The slice of a loaded plugin the gallery reads. */
export interface GalleryPlugin {
  readonly id: string
  readonly base: string
  readonly blockNames?: readonly string[] | undefined
  readonly gallery?: Readonly<
    Record<
      string,
      {
        name: PluginGalleryText
        line: PluginGalleryText
        image: string
        group: string
        fields?: PluginGalleryFields | undefined
        view?: PluginGalleryView | undefined
      }
    >
  > | undefined
  /** The plugin's own translations of its English sentences. */
  readonly words?: Readonly<Record<string, string>> | undefined
}

export interface GalleryCard {
  /** The block's name — what `:::name` writes. */
  readonly id: string
  readonly name: string
  readonly line: string
  /** URL of the picture, absent when a plugin gave none. */
  readonly image?: string
  readonly group: string
  /** `core` or the plugin's id. */
  readonly source: string
  /** Its variants, when it has several. */
  readonly view?: PluginGalleryView
  /** Its form columns and line codec, when it declares them. */
  readonly fields?: PluginGalleryFields
}

function say(text: PluginGalleryText, locale: Locale, words?: GalleryPlugin['words']): string {
  if (typeof text === 'string') {
    return words && Object.hasOwn(words, text) ? (words[text] as string) : text
  }
  return (locale === 'fr' ? text.fr : undefined) ?? text.en
}

function imageUrl(base: string, image: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${image.replace(/^\.\//, '')}`
}

export function galleryCards(plugins: readonly GalleryPlugin[], locale: Locale): readonly GalleryCard[] {
  const cards = new Map<string, GalleryCard>()
  for (const [id, card] of Object.entries(CORE_GALLERY)) {
    cards.set(id, {
      id,
      name: card.name[locale],
      line: card.line[locale],
      image: card.image,
      group: card.group[locale],
      source: 'core',
      ...(card.view ? { view: card.view } : {}),
      ...(card.fields ? { fields: card.fields } : {}),
    })
  }
  for (const plugin of plugins) {
    const names = new Set([...(plugin.blockNames ?? []), ...Object.keys(plugin.gallery ?? {})])
    for (const id of names) {
      // One card per block name: a plugin claiming a core name does not
      // duplicate it, and two plugins on one name keep the first.
      if (cards.has(id)) continue
      const record = plugin.gallery && Object.hasOwn(plugin.gallery, id) ? plugin.gallery[id] : undefined
      cards.set(
        id,
        record
          ? {
              id,
              name: say(record.name, locale, plugin.words),
              line: say(record.line, locale, plugin.words),
              image: imageUrl(plugin.base, record.image),
              group: say(record.group, locale, plugin.words),
              source: plugin.id,
              ...(record.view ? { view: record.view } : {}),
              ...(record.fields ? { fields: record.fields } : {}),
            }
          : { id, name: id, line: '', group: plugin.id, source: plugin.id },
      )
    }
  }
  return [...cards.values()]
}
