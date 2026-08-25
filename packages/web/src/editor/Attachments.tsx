/**
 * What a page carries besides its words.
 *
 * A body of pages is never only markdown: the project has its plan as a PDF,
 * the trip its tickets, the recipe the photo of the dish. Those files already
 * sit next to the page on disk — the agent files them there — and until this
 * strip existed the only way to know was to open a terminal.
 *
 * The rule is the layout, not a declaration: whatever is in the page's folder
 * and under its `assets/` belongs to it. The server answers that question
 * (`/api/files?page=…`) so the shell, the plugins and the skill all describe
 * ONE convention rather than three that nearly agree.
 *
 * What is NOT shown here: a file the page already displays in its body. A
 * photo shown twice — once in place, once again in a strip below — makes the
 * strip read as a list of leftovers rather than as the page's documents.
 */

import { useEffect, useState } from 'react'

export interface Attachment {
  readonly path: string
  readonly name: string
  readonly bytes: number
  readonly modified: string
  readonly kind: 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'data' | 'file'
}

const GLYPHS: Readonly<Record<Attachment['kind'], string>> = {
  image: '🖼',
  pdf: '📕',
  audio: '🎵',
  video: '🎬',
  text: '📄',
  data: '📊',
  file: '📎',
}

export const fileUrl = (path: string, download = false): string =>
  `/api/files/${path.split('/').map(encodeURIComponent).join('/')}${download ? '?download=1' : ''}`

/**
 * The names a page already points at, from its own source.
 *
 * Read off the markdown rather than off the rendered tree, and matched on the
 * LAST segment: `![x](assets/avant.jpg)` and `![x](./avant.jpg)` name the same
 * photo, and a strip that showed it again because the spelling differed would
 * be wrong in the way nobody reports.
 */
export function referencedNames(markdown: string): ReadonlySet<string> {
  const names = new Set<string>()
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(\s*<?([^)>\s]+)/g)) {
    const url = match[1]
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) continue
    const name = decodeURIComponent(url.split('#')[0]?.split('?')[0]?.split('/').pop() ?? '')
    if (name !== '') names.add(name)
  }
  return names
}

/** "412 ko" — a size somebody can judge a download by, in their own locale. */
export function humanSize(bytes: number, locale = 'en'): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}

export function Attachments({
  path,
  markdown,
  fetchImpl = fetch,
  locale = 'en',
  t = (key) => key,
}: {
  readonly path: string
  readonly markdown: string
  readonly fetchImpl?: typeof fetch
  readonly locale?: string
  readonly t?: (key: string) => string
}) {
  const [files, setFiles] = useState<readonly Attachment[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetchImpl(`/api/files?page=${encodeURIComponent(path)}`)
        if (!response.ok) return
        const body = (await response.json()) as { files?: readonly Attachment[] }
        if (!cancelled) setFiles(body.files ?? [])
      } catch {
        // A page whose companions cannot be listed is still a readable page:
        // this strip is an addition, never a precondition.
        if (!cancelled) setFiles([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path, fetchImpl])

  const shown = referencedNames(markdown)
  const rest = files.filter((file) => !shown.has(file.name))
  if (rest.length === 0) return null

  const images = rest.filter((file) => file.kind === 'image')
  const others = rest.filter((file) => file.kind !== 'image')

  return (
    <section className="golem-page-files">
      <h2 className="golem-page-files__title">{t('Attached files')}</h2>

      {images.length > 0 && (
        <div className="golem-page-files__grid">
          {images.map((file) => (
            // Opened rather than downloaded: looking at a photo is what
            // somebody wants nine times out of ten, and the download is one
            // right-click away in every browser.
            <a
              key={file.path}
              className="golem-page-files__thumb"
              href={fileUrl(file.path)}
              target="_blank"
              rel="noreferrer"
              title={file.name}
            >
              <img src={fileUrl(file.path)} alt={file.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <ul className="golem-page-files__list">
          {others.map((file) => (
            <li key={file.path}>
              <a
                className="golem-page-files__file"
                href={fileUrl(file.path)}
                target="_blank"
                rel="noreferrer"
              >
                <span className="golem-page-files__glyph" aria-hidden="true">
                  {GLYPHS[file.kind]}
                </span>
                <span className="golem-page-files__name">{file.name}</span>
                <span className="golem-page-files__size">{humanSize(file.bytes, locale)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
