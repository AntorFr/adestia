/**
 * The way into creating (B-32, E-38): the + beside Ask or in a folder's header, or the
 * same entries as buttons for an empty place. Both open the same flow — the list, then
 * for New folder the name sheet, which calls the route.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'

import { Creations, CreationButtons } from './Creations.js'
import { creationsFor, pluginCreations, type Creation, type CreationPlace } from './creations.js'
import type { LoadedPlugin } from '../plugins/loader.js'
import type { Locale } from './i18n.js'
import { TemplateSheet } from './NewFromTemplate.js'
import type { IndexEntry, StoreInfo } from './sections.js'
import { jsonInit, requestJson } from './request.js'
import { slugOf, type TemplateSource } from './templates.js'
import { Button, NameSheet, type NameRefusal } from './ui/index.js'

export interface CreateEntryProps {
  readonly place: CreationPlace
  readonly writableFolders: readonly string[]
  /** `plus`: the + that opens the list; `buttons`: the entries themselves, for an empty place. */
  readonly variant: 'plus' | 'buttons'
  readonly fetchImpl?: typeof fetch
  /** A folder was made at this logical path. */
  readonly onCreated: (path: string) => void | Promise<void>
  /** The loaded plugins: their `creations` join the core's, and a `template` one reads its file from here. */
  readonly plugins?: readonly LoadedPlugin[]
  readonly pages?: readonly IndexEntry[]
  readonly stores?: readonly StoreInfo[]
  readonly locale?: string
  readonly openPage?: (path: string, store?: string) => void
  readonly t: (key: string) => string
}

// The + list is modal: while it is open, the entry buttons of the empty state
// behind it are not drawn, so each entry is on screen once. Two instances of
// CreateEntry (the + and the buttons) share this flag.
let listOpen = false
const watchers = new Set<() => void>()
const setListOpen = (open: boolean) => {
  listOpen = open
  watchers.forEach((notify) => notify())
}
const watchList = (notify: () => void) => {
  watchers.add(notify)
  return () => { watchers.delete(notify) }
}

type Step =
  | { readonly at: 'list' }
  | { readonly at: 'folder-name' }
  | { readonly at: 'template'; readonly source: TemplateSource }
  | undefined

/** The seed a `template` creation names: the plugin's own static route, listed in its `templates` or not. */
function sourceOf(creation: Creation, plugins: readonly LoadedPlugin[]): TemplateSource | undefined {
  if (!('template' in creation.action)) return undefined
  const plugin = plugins.find((entry) => entry.id === creation.plugin)
  if (!plugin) return undefined
  const base = plugin.base.endsWith('/') ? plugin.base : `${plugin.base}/`
  return { id: `${plugin.id}/${creation.action.template}`, url: `${base}${creation.action.template}`, words: plugin.words }
}

export function CreateEntry({ place, writableFolders, variant, fetchImpl = (...args) => fetch(...args), onCreated, plugins = [], pages = [], stores = [], locale = 'en', openPage, t }: CreateEntryProps) {
  const [step, setStep] = useState<Step>()
  const listShown = useSyncExternalStore(watchList, () => listOpen)
  const listing = step?.at === 'list'
  useEffect(() => {
    if (!listing) return undefined
    setListOpen(true)
    return () => setListOpen(false)
  }, [listing])
  const creations = creationsFor(place, writableFolders, pluginCreations(plugins, locale))
  if (creations.length === 0) return null

  const parent = place.at === 'home' ? '' : place.folder
  const choose = (creation: Creation) => {
    if ('folder' in creation.action) setStep({ at: 'folder-name' })
    else {
      const source = sourceOf(creation, plugins)
      if (source) setStep({ at: 'template', source })
    }
  }
  const create = async (name: string): Promise<NameRefusal | undefined> => {
    const slug = slugOf(name)
    const path = parent === '' ? slug : `${parent}/${slug}`
    const result = await requestJson<{ path?: string }>(fetchImpl, '/api/folders', jsonInit('POST', { path }), t)
    if (!result.ok) return result.status === 409 ? 'taken' : 'failed'
    setStep(undefined)
    await onCreated(result.data?.path ?? path)
    return undefined
  }

  return (
    <>
      {variant === 'plus' ? (
        <Button variant="ghost" icon="plus" aria-label={t('New…')} onClick={() => setStep({ at: 'list' })} />
      ) : listShown ? null : (
        <CreationButtons creations={creations} onChoose={choose} t={t} />
      )}
      {step?.at === 'list' ? (
        <Creations creations={creations} onChoose={choose} onClose={() => setStep(undefined)} t={t} />
      ) : null}
      {step?.at === 'template' && openPage ? (
        <TemplateSheet
          creation
          {...(place.at === 'folder' ? { folder: place.folder } : { writableFolders })}
          sources={[step.source]}
          pages={pages}
          stores={stores}
          fetchImpl={fetchImpl}
          locale={locale === 'fr' ? 'fr' : ('en' as Locale)}
          openPage={openPage}
          t={t}
          onClose={() => setStep(undefined)}
        />
      ) : null}
      {step?.at === 'folder-name' ? (
        <NameSheet
          title={t('New folder')}
          question={t('Folder name')}
          submitLabel={t('Create')}
          accepts={(name) => slugOf(name) !== ''}
          onSubmit={create}
          onCancel={() => setStep(undefined)}
          t={t}
        />
      ) : null}
    </>
  )
}
