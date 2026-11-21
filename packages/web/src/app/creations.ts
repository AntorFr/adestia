/**
 * What the + can create (AD-37, E-38): the core's own entries and the ones plugins
 * declare, merged and filtered by place and by where the caller may write.
 * Pure: the list and the buttons draw what this returns.
 */

import type { PluginCreation, PluginGalleryText } from '@antorfr/adestia-schemas'
import { ICON_NAMES, type IconName } from './icons.js'

export type CreationPlace = { readonly at: 'home' } | { readonly at: 'folder'; readonly folder: string }

/** `folder`: a new empty folder here. `template`: a page seed: opens E-36 on that template. */
export type CreationAction = { readonly folder: true } | { readonly template: string }

export interface CreationDeclaration {
  readonly id: string
  readonly label: string
  readonly line: string
  readonly icon?: IconName
  /** Where it is offered; absent means both. */
  readonly where?: readonly ('home' | 'folder')[]
  readonly action: CreationAction
}

/** An entry of the list: a declaration, with the plugin that brought it (none for the core). */
export interface Creation extends CreationDeclaration {
  readonly plugin?: string
}

export const CORE_CREATIONS: readonly CreationDeclaration[] = [
  {
    id: 'folder',
    label: 'New folder',
    line: 'An empty folder to group pages.',
    icon: 'folder-plus',
    where: ['home', 'folder'],
    action: { folder: true },
  },
]

function allowed(creation: CreationDeclaration, place: CreationPlace, writableFolders: readonly string[]): boolean {
  if (creation.where && !creation.where.includes(place.at)) return false
  if ('folder' in creation.action) return writableFolders.includes(place.at === 'home' ? '' : place.folder)
  return true
}

/** The entries offered at `place`: the core's, then the plugins' (`extra`), in declaration order. */
export function creationsFor(
  place: CreationPlace,
  writableFolders: readonly string[],
  extra: readonly { readonly plugin: string; readonly declaration: CreationDeclaration }[] = [],
): readonly Creation[] {
  const all: Creation[] = [
    ...CORE_CREATIONS,
    ...extra.map(({ plugin, declaration }) => ({ ...declaration, plugin })),
  ]
  return all.filter((creation) => allowed(creation, place, writableFolders))
}

/** Does another entry carry the same label, so a plugin's name must tell them apart? */
export function needsCaption(creation: Creation, all: readonly Creation[]): boolean {
  if (!creation.plugin) return false
  const label = creation.label.trim().toLowerCase()
  return all.some((other) => other !== creation && other.label.trim().toLowerCase() === label)
}

/** The plain page icon, drawn when a manifest names an icon outside the closed set. */
export const DEFAULT_CREATION_ICON: IconName = 'file-text'

function textIn(text: PluginGalleryText, locale: string): string {
  if (typeof text === 'string') return text
  return (locale === 'fr' ? text.fr : undefined) ?? text.en
}

function iconOf(name: string | undefined): IconName {
  return ICON_NAMES.find((known) => known === name) ?? DEFAULT_CREATION_ICON
}

/**
 * The declarations of the plugins that are LOADED, in the shape `creationsFor` merges.
 * A plugin that is off is not loaded and so offers nothing; an unknown icon falls back
 * to the page icon (a manifest is data, an unknown name must not leave a hole).
 */
export function pluginCreations(
  plugins: readonly { readonly id: string; readonly creations?: readonly PluginCreation[] | undefined }[],
  locale: string = 'en',
): readonly { readonly plugin: string; readonly declaration: CreationDeclaration }[] {
  return plugins.flatMap((plugin) =>
    (plugin.creations ?? []).map((entry) => ({
      plugin: plugin.id,
      declaration: {
        id: entry.id,
        label: textIn(entry.label, locale),
        line: textIn(entry.line, locale),
        icon: iconOf(entry.icon),
        ...(entry.where ? { where: entry.where } : {}),
        action: { template: entry.action.template },
      },
    })),
  )
}
