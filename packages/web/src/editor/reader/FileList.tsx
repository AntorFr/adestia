import { useEffect, useState } from 'react'
import { Icon } from '../../app/Icon.js'
import { fileUrl, KIND_ICONS, humanSize, type Attachment } from '../Attachments.js'
import { Note, sayOf } from './Note.js'
import { folderOf } from '../../app/paths.js'
import { requestJson } from '../../app/request.js'
import type { Node } from '../nodes.js'
import type { Ctx } from './types.js'

/**
 * `:::list{source=files}` — the page's other files, where the author put the
 * block rather than in the strip under the page.
 *
 * The same files the strip shows, by the rule the server owns: the page's
 * folder and its `assets/` (`/api/files?page=…`). `depth=subtree` widens it to
 * everything below the folder, the one question the strip never asks. `type`
 * keeps the kinds it names (`image`, `pdf`, `data`…), `sort=modified` puts the
 * newest first. A file OPENS, in a tab, as it does from the strip.
 */
export function FileList({ node, ctx, view }: { readonly node: Node; readonly ctx: Ctx; readonly view: string }) {
  const say = sayOf(ctx)
  const attrs = node.attributes ?? {}
  const path = ctx.page?.path
  const deep = attrs['depth'] === 'subtree'
  const ask = ctx.fetchImpl ?? globalThis.fetch
  const [files, setFiles] = useState<readonly Attachment[] | 'failed' | undefined>(undefined)

  useEffect(() => {
    if (path === undefined) return
    let cancelled = false
    const query = deep ? `under=${encodeURIComponent(folderOf(path))}` : `page=${encodeURIComponent(path)}`
    void (async () => {
      const response = await requestJson<{ files?: readonly Attachment[] }>(ask, `/api/files?${query}`)
      if (!cancelled) setFiles(response.ok ? (response.data?.files ?? []) : 'failed')
    })()
    return () => {
      cancelled = true
    }
  }, [path, deep, ask])

  // No page — a chat bubble, a preview: nothing to list the files OF.
  if (path === undefined) {
    return <Note>{say('This list needs the page whose files it shows.')}</Note>
  }
  // Still asking. The heading, if any, holds the place; rows arrive under it.
  if (files === undefined) return null
  if (files === 'failed') {
    return <Note icon="circle-alert">{say('This page’s files could not be listed.')}</Note>
  }

  const kinds = (attrs['type'] ?? '').split(',').map((one) => one.trim()).filter(Boolean)
  const shown = files.filter((file) => kinds.length === 0 || kinds.includes(file.kind))
  if (attrs['sort'] === 'modified') {
    shown.sort((a, b) => b.modified.localeCompare(a.modified))
  } else if (attrs['sort'] === 'name') {
    shown.sort((a, b) => a.name.localeCompare(b.name, ctx.locale, { numeric: true }))
  }
  if (shown.length === 0) return <Note>{say('No file here.')}</Note>

  const size = (file: Attachment) => humanSize(file.bytes, ctx.locale)
  const opens = (file: Attachment) => ({
    href: fileUrl(file.path),
    target: '_blank',
    rel: 'noreferrer',
    title: file.path,
  })

  if (view === 'cards') {
    // A contact sheet: every card the same shape, a photo filling its frame,
    // anything else its glyph in the same frame, so a PDF beside two photos
    // does not read as a hole.
    return (
      <div className="adestia-list adestia-list--cards adestia-list--files">
        {shown.map((file) => (
          <a key={file.path} className="adestia-list__row" {...opens(file)}>
            <span className="adestia-list__thumb">
              {file.kind === 'image' ? (
                <img src={fileUrl(file.path)} alt="" loading="lazy" />
              ) : (
                <Icon name={KIND_ICONS[file.kind]} />
              )}
            </span>
            <span className="adestia-list__title">{file.name}</span>
            <span className="adestia-list__size">{size(file)}</span>
          </a>
        ))}
      </div>
    )
  }

  if (view === 'chips') {
    return (
      <div className="adestia-list adestia-list--chips adestia-list--files">
        {shown.map((file) => (
          <a key={file.path} className="adestia-list__row" {...opens(file)}>
            <i className="adestia-chip__plate" aria-hidden="true">
              <Icon name={KIND_ICONS[file.kind]} />
            </i>
            <span className="adestia-list__title">{file.name}</span>
          </a>
        ))}
      </div>
    )
  }

  return (
    <div className="adestia-list adestia-list--rows adestia-list--files">
      {shown.map((file) => (
        <a key={file.path} className="adestia-list__row" {...opens(file)}>
          <i className="adestia-list__ico" aria-hidden="true">
            <Icon name={KIND_ICONS[file.kind]} />
          </i>
          <span className="adestia-list__title">{file.name}</span>
          <span className="adestia-list__size">{size(file)}</span>
        </a>
      ))}
    </div>
  )
}

