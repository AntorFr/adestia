/**
 * Rename a folder (B-35, E-3 + E-37): the control in the folder's header, the name sheet in
 * rename mode, and the line left when some pages still point to the old name.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { jsonInit, requestJson } from './request.js'
import { pageRoute } from './owners.js'
import { type IndexEntry } from './sections.js'
import { slugOf } from './templates.js'
import { Button, NameSheet, Notice, type NameRefusal } from './ui/index.js'

/** The answer of `POST /api/folders/rename` (packages/schemas `RenameFolderResponse`). */
interface RenameFolderResponse { readonly path: string; readonly unrewritten: number }

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const lastOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** Whether Rename is drawn: the folder and its parent writable, the folder held by the index, no app owning it. */
export function canRename(section: string, writableFolders: readonly string[], folders: readonly string[], owned: boolean): boolean {
  if (section === '' || owned) return false
  return writableFolders.includes(section) && writableFolders.includes(parentOf(section)) && folders.includes(section)
}

// The line outlives the sheet and the screen change that follows it, and goes when the user leaves the folder.
interface Left { readonly path: string; readonly from: string; readonly count: number }
let left: Left | undefined
const watchers = new Set<() => void>()
const setLeft = (next: Left | undefined) => {
  left = next
  watchers.forEach((notify) => notify())
}
const watchLeft = (notify: () => void) => {
  watchers.add(notify)
  return () => { watchers.delete(notify) }
}

export interface RenameFolderProps {
  readonly section: string
  readonly fetchImpl?: typeof fetch
  /** The folder lives at this path now: read the index again and open it. */
  readonly onRenamed: (path: string) => void | Promise<void>
  readonly t: (key: string) => string
}

export function RenameFolder({ section, fetchImpl = (...args) => fetch(...args), onRenamed, t }: RenameFolderProps) {
  const [open, setOpen] = useState(false)
  const parent = parentOf(section)
  const current = lastOf(section)
  const rename = async (name: string): Promise<NameRefusal | undefined> => {
    const result = await requestJson<RenameFolderResponse>(fetchImpl, '/api/folders/rename', jsonInit('POST', { path: section, name: slugOf(name) }), t)
    if (!result.ok) {
      switch (result.status) {
        case 409: return 'taken'
        case 400:
        case 422: return { message: result.error }
        case 403: return { message: t('this folder cannot be written') }
        case 404: return { message: t('this folder no longer exists'), then: 'close' }
        default: return { message: t('Something went wrong. Try again.'), then: 'retry' }
      }
    }
    const path = result.data?.path ?? `${parent === '' ? '' : `${parent}/`}${slugOf(name)}`
    const count = result.data?.unrewritten ?? 0
    setLeft(count > 0 ? { path, from: section, count } : undefined)
    setOpen(false)
    await onRenamed(path)
    return undefined
  }
  return (
    <>
      <Button className="adestia-btn--rename" icon="pencil" aria-label={t('Rename')} onClick={() => setOpen(true)}>
        <span className="adestia-btn__word">{t('Rename')}</span>
      </Button>
      {open ? (
        <NameSheet
          title={t('Rename folder')}
          question={t('Folder name')}
          submitLabel={t('Rename')}
          initial={current}
          context={t('in %folder').replace('%folder', parent === '' ? '/' : `${parent}/`)}
          selectOnOpen
          accepts={(name) => slugOf(name) !== '' && slugOf(name) !== current}
          onSubmit={rename}
          onCancel={() => setOpen(false)}
          t={t}
        />
      ) : null}
    </>
  )
}

/** Candidates are read in small batches, and no more than this many: the list is a help, the count is the fact. */
const SCAN_CAP = 400
const SCAN_BATCH = 8

/** The pages that still hold a path link into the old folder, found by reading the pages the index lists. */
export async function pagesStillPointing(
  from: string,
  entries: readonly IndexEntry[],
  fetchImpl: typeof fetch,
  limit: number,
): Promise<readonly IndexEntry[]> {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}/`)
  const found: IndexEntry[] = []
  const queue = entries.slice(0, SCAN_CAP)
  for (let at = 0; at < queue.length && found.length < limit; at += SCAN_BATCH) {
    const batch = queue.slice(at, at + SCAN_BATCH)
    const read = await Promise.all(
      batch.map(async (entry) => {
        const result = await requestJson<{ markdown?: string }>(
          fetchImpl,
          `/api/pages/${entry.path}${entry.store ? `?store=${encodeURIComponent(entry.store)}` : ''}`,
        )
        return result.ok && typeof result.data?.markdown === 'string' && pattern.test(result.data.markdown) ? entry : undefined
      }),
    )
    for (const entry of read) if (entry) found.push(entry)
  }
  return found
}

export interface RenameNoticeProps {
  readonly section: string
  readonly pages: readonly IndexEntry[]
  readonly fetchImpl?: typeof fetch
  readonly t: (key: string) => string
}

/** « n pages still point to the old name », under the E-3 header, until closed or until the user leaves E-3. */
export function RenameNotice({ section, pages, fetchImpl = (...args) => fetch(...args), t }: RenameNoticeProps) {
  const now = useSyncExternalStore(watchLeft, () => left)
  const [details, setDetails] = useState(false)
  const [links, setLinks] = useState<readonly IndexEntry[] | undefined>()
  const here = now !== undefined && now.path === section
  // The rename opens the new path a moment after it set the line: it goes only once the user was here and left.
  const arrived = useRef(false)
  useEffect(() => {
    if (here) arrived.current = true
    else if (arrived.current) {
      arrived.current = false
      setLeft(undefined)
    }
  }, [here])
  useEffect(() => {
    if (!here || !details || links !== undefined || now === undefined) return undefined
    let cancelled = false
    void pagesStillPointing(now.from, pages, fetchImpl, now.count).then((found) => {
      if (!cancelled) setLinks(found)
    })
    return () => { cancelled = true }
  }, [here, details, links, now, pages, fetchImpl])
  if (!here || now === undefined) return null
  const text = (now.count === 1 ? t('1 page still points to the old name') : t('%n pages still point to the old name')).replace('%n', String(now.count))
  return (
    <Notice
      id="adestia-rename-notice"
      text={text}
      actions={
        <>
          <Button small aria-expanded={details} aria-controls="adestia-rename-details" onClick={() => setDetails(!details)}>
            {t('Details')}
          </Button>
          <Button small onClick={() => setLeft(undefined)}>{t('Close')}</Button>
        </>
      }
    >
      <div id="adestia-rename-details" hidden={!details}>
        {links === undefined ? (
          <p>{t('Looking for them…')}</p>
        ) : links.length === 0 ? (
          <p>{t('These pages could not be listed.')}</p>
        ) : (
          <ul>
            {links.map((entry) => (
              <li key={`${entry.store ?? ''}:${entry.path}`}>
                <a href={`#${pageRoute(entry.path, entry.store)}`}>{entry.title || entry.path}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Notice>
  )
}
