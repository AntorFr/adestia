/**
 * What the + can create (AD-37, E-37): the core's own entries and the ones plugins
 * declare, merged and filtered by place and by where the caller may write.
 * Pure: the list and the buttons draw what this returns.
 */

import type { IconName } from './icons.js'

export type CreationPlace = { readonly at: 'home' } | { readonly at: 'folder'; readonly folder: string }

/** `folder`: a new empty folder here. `template`: a page seed (played by a later slice). */
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
