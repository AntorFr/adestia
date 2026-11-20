/**
 * The way into creating (B-32, E-37): the + beside Ask or in a folder's header, or the
 * same entries as buttons for an empty place. Both open the same flow — the list, then
 * for New folder the name sheet, which calls the route.
 */

import { useState } from 'react'

import { Creations, CreationButtons } from './Creations.js'
import { creationsFor, type Creation, type CreationPlace } from './creations.js'
import { jsonInit, requestJson } from './request.js'
import { slugOf } from './templates.js'
import { Button, NameSheet, type NameRefusal } from './ui/index.js'

export interface CreateEntryProps {
  readonly place: CreationPlace
  readonly writableFolders: readonly string[]
  /** `plus`: the + that opens the list; `buttons`: the entries themselves, for an empty place. */
  readonly variant: 'plus' | 'buttons'
  readonly fetchImpl?: typeof fetch
  /** A folder was made at this logical path. */
  readonly onCreated: (path: string) => void | Promise<void>
  readonly t: (key: string) => string
}

type Step = { readonly at: 'list' } | { readonly at: 'folder-name' } | undefined

export function CreateEntry({ place, writableFolders, variant, fetchImpl = (...args) => fetch(...args), onCreated, t }: CreateEntryProps) {
  const [step, setStep] = useState<Step>()
  const creations = creationsFor(place, writableFolders)
  if (creations.length === 0) return null

  const parent = place.at === 'home' ? '' : place.folder
  const choose = (creation: Creation) => {
    if ('folder' in creation.action) setStep({ at: 'folder-name' })
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
      ) : (
        <CreationButtons creations={creations} onChoose={choose} t={t} />
      )}
      {step?.at === 'list' ? (
        <Creations creations={creations} onChoose={choose} onClose={() => setStep(undefined)} t={t} />
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
