/**
 * The workspace's other files — the ones that are not pages.
 *
 * A body of pages is never only markdown: a project has a plan as a PDF, a
 * trip has its tickets, a recipe has the photo of the dish. Until now this
 * server served markdown and nothing else, so every such file was a 404 — an
 * image written into a page rendered as a broken square, and each app that
 * needed a document of its own invented a bounded route for it.
 *
 * Two routes, and the split matters: one SAYS what is there (a listing an
 * interface can draw as attachments), the other HANDS OVER the bytes.
 *
 * ## Why this is read-only
 *
 * The agent files things; a browser does not. Uploading through here would
 * make this endpoint a general-purpose file writer behind a session cookie —
 * a much more dangerous thing than the page API, whose contract is a closed
 * vocabulary that gets validated. A file someone wants filed goes through the
 * chat as an attachment, and the agent decides whether it belongs in the
 * workspace at all (see `attachments.ts`).
 *
 * ## Why most files are handed over as a download
 *
 * These bytes are served from the SAME ORIGIN as the interface and its
 * session. An HTML file — or an SVG, which is HTML wearing a picture's name —
 * rendered inline would run its script as the logged-in user. So only an
 * explicit list of inert media types is displayed in place; everything else
 * is `application/octet-stream` with an attachment disposition, plus `nosniff`
 * and a CSP that permits nothing, so a browser cannot decide to be helpful.
 */

import { stat } from 'node:fs/promises'
import { dirname, extname } from 'node:path'

import { gated } from './io.js'
import { fileIn, listAll, type Store } from './stores.js'


export interface WorkspaceFile {
  readonly path: string
  /** Which store carries it — only when the instance has more than one. */
  readonly store?: string
  readonly name: string
  readonly bytes: number
  readonly modified: string
  /** What an interface needs to decide between a thumbnail and a link. */
  readonly kind: FileKind
}

export type FileKind = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'data' | 'file'

/**
 * The types shown IN PLACE, and their media type.
 *
 * Deliberately short, and deliberately not derived from a mime database: this
 * list is a security boundary, so it says exactly what a browser is allowed to
 * render from the workspace rather than whatever the environment happens to
 * know about. `.svg` is absent on purpose — it can carry script, and it would
 * run here with the session.
 */
const INLINE: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
}

/** The inert media type served in place for an extension, if it has one. */
export function inlineTypeOf(path: string): string | undefined {
  return INLINE[extname(path).toLowerCase()]
}

/** What an interface draws it as — a coarser question than the media type. */
export function kindOf(path: string): FileKind {
  const extension = extname(path).toLowerCase()
  const type = INLINE[extension]
  if (type?.startsWith('image/')) return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (type?.startsWith('audio/')) return 'audio'
  if (type?.startsWith('video/')) return 'video'
  if (type?.startsWith('text/')) return 'text'
  if (['.json', '.yaml', '.yml', '.geojson', '.gpx'].includes(extension)) return 'data'
  return 'file'
}

/**
 * A requested path, resolved inside the root or refused.
 *
 * The same reasoning as `safePagePath`, minus the markdown restriction and
 * plus one rule: no segment may start with a dot. `.git` and `.claude` are the
 * workspace's plumbing and the agent's business — being able to fetch
 * `.git/config` through an interface that browses attachments would be a way
 * to read a token out of a remote URL.
 */
export function safeFilePath(store: Store, requested: string): string | undefined {
  const cleaned = requested.replace(/^\/+/, '')
  // `.git/config` carries the remote URL, and a token often rides in it. The
  // dot rule is this workspace's whole boundary between content and plumbing,
  // and it is checked on the LOGICAL name so a mount point cannot smuggle a
  // dotted segment past it.
  if (cleaned === '' || cleaned.split('/').some((segment) => segment.startsWith('.'))) {
    return undefined
  }
  return fileIn(store, cleaned)
}

/** A listed file, as an interface needs it. */
function described(path: string, info: { size: number; mtimeMs: number }, store: Store, multi: boolean): WorkspaceFile {
  return {
    path,
    ...(multi ? { store: store.id } : {}),
    name: path.split('/').pop() ?? path,
    bytes: info.size,
    modified: new Date(info.mtimeMs).toISOString(),
    kind: kindOf(path),
  }
}

/**
 * Everything that is not a page, under one folder of the composed tree.
 *
 * Markdown is a page, not an attachment: it has its own API, its own
 * vocabulary and its own screen. Listing it here would make every page in a
 * folder show up as a file dangling under its neighbours.
 */
export async function collectFiles(
  stores: readonly Store[],
  under: string,
  deep: boolean,
  multi: boolean,
): Promise<WorkspaceFile[]> {
  const { entries } = await listAll(stores, {
    under,
    deep,
    keep: (name) => !name.toLowerCase().endsWith('.md'),
  })
  const infos = await Promise.all(entries.map((entry) => gated(() => stat(entry.file)).catch(() => undefined)))
  const out: WorkspaceFile[] = []
  for (const [i, entry] of entries.entries()) {
    const info = infos[i]
    if (info) out.push(described(entry.path, info, entry.store, multi))
  }
  return out
}

/**
 * The files that belong to one page.
 *
 * The convention `page-author` documents, and the predecessor's: a page's
 * companions are the non-markdown files sitting in ITS OWN FOLDER, plus
 * whatever lives under that folder's `assets/`. Nothing declares the pairing —
 * the layout IS the pairing — which is why an agent that drops a photo next to
 * a page has already attached it, with no frontmatter to remember.
 *
 * Composed like everything else: the photographs of one trip may sit in the
 * shared circle while its notes sit in mine, and the page shows both.
 */
export async function attachmentsOf(
  stores: readonly Store[],
  pagePath: string,
  order: Intl.Collator = new Intl.Collator(undefined, { numeric: true }),
): Promise<WorkspaceFile[]> {
  const folder = dirname(pagePath.replace(/^\/+/, ''))
  const prefix = folder === '.' || folder === '' ? '' : folder
  const multi = stores.length > 1

  const found = [
    // The page's own folder, and NOT what is under it: those files belong to
    // the pages living there, and a project folder would otherwise show its
    // every child's documents as its own.
    ...(await collectFiles(stores, prefix, false, multi)),
    ...(await collectFiles(stores, prefix ? `${prefix}/assets` : 'assets', true, multi)),
  ]
  return found.sort((a, b) => order.compare(a.path, b.path))
}

// The route registration lives under `routes/`; kept importable from here.
export { registerFiles, type FilesOptions } from './routes/files.js'
