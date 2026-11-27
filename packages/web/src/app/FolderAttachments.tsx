/**
 * The Attachments brick of a folder (E-3, B-38): the files that sit in the
 * folder and its `assets/`, after the pages.
 *
 * The rule is the server's (`GET /api/files?folder=`); this only draws what
 * it answers, with the rows of the page's attachments strip. A brick that has
 * nothing to say is ABSENT — no empty frame, and no message when the read
 * fails: files are an addition to the view, never a precondition of it.
 */

import { useEffect, useState } from 'react'

import { AttachmentRow, type Attachment } from '../editor/Attachments.js'
import { Loading } from './ui/Loading.js'
import { requestJson } from './request.js'

/** Rows shown before « Show all n ». */
export const ATTACHMENT_ROWS = 12

export function FolderAttachments({
  folder,
  fetchImpl = fetch,
  locale = 'en',
  t = (key) => key,
  announce = true,
}: {
  readonly folder: string
  /** Draw the shell's wait row while asking; false waits silently (the section is still empty). */
  readonly announce?: boolean
  readonly fetchImpl?: typeof fetch
  readonly locale?: string
  readonly t?: (key: string) => string
}) {
  // undefined: asking; [] covers none and failed alike — both draw nothing.
  const [files, setFiles] = useState<readonly Attachment[] | undefined>(undefined)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFiles(undefined)
    setAll(false)
    void (async () => {
      const response = await requestJson<{ files?: readonly Attachment[] }>(
        fetchImpl,
        `/api/files?folder=${encodeURIComponent(folder)}`,
      )
      if (!cancelled) setFiles(response.ok ? (response.data?.files ?? []) : [])
    })()
    return () => {
      cancelled = true
    }
  }, [folder, fetchImpl])

  if (files === undefined) return announce ? <Loading t={t} /> : null
  if (files.length === 0) return null

  const shown = all ? files : files.slice(0, ATTACHMENT_ROWS)
  return (
    <section className="adestia-page-files adestia-folder-files">
      <h2 className="adestia-section">
        {t('Attachments')} <span className="adestia-archive__count">{files.length}</span>
      </h2>
      <ul className="adestia-page-files__list">
        {shown.map((file) => (
          <AttachmentRow key={file.path} file={file} locale={locale} />
        ))}
      </ul>
      {!all && files.length > ATTACHMENT_ROWS && (
        <button type="button" className="adestia-btn adestia-btn--ghost" onClick={() => setAll(true)}>
          {t('Show all %n').replace('%n', String(files.length))}
        </button>
      )}
    </section>
  )
}
