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

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import type { FastifyInstance } from 'fastify'

export interface FilesOptions {
  /** Absolute path of the pages directory — the same root pages are read from. */
  readonly root: string
  /**
   * The instance's language, used to order listings. Bare `localeCompare()`
   * was already used here, and it reads the HOST's locale: the same workspace
   * came back in two different orders on two machines, and a golden taken on
   * one failed on the other.
   */
  readonly locale?: string | undefined
}

export interface WorkspaceFile {
  readonly path: string
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
export function safeFilePath(root: string, requested: string): string | undefined {
  if (requested.includes('\0')) return undefined
  const cleaned = requested.replace(/^\/+/, '')
  if (cleaned === '') return undefined
  if (cleaned.split('/').some((segment) => segment.startsWith('.'))) return undefined

  const target = resolve(root, `./${cleaned}`)
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  return target
}

async function walk(
  root: string,
  prefix: string,
  into: WorkspaceFile[],
  recursive: boolean,
): Promise<void> {
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (recursive) await walk(root, rel, into, true)
      continue
    }
    // Markdown is a page, not an attachment: it has its own API, its own
    // vocabulary and its own screen. Listing it here would make every page in
    // a folder show up as a file dangling under its neighbours.
    if (entry.name.toLowerCase().endsWith('.md')) continue
    const info = await stat(join(root, rel)).catch(() => undefined)
    if (!info) continue
    into.push({
      path: rel,
      name: entry.name,
      bytes: info.size,
      modified: new Date(info.mtimeMs).toISOString(),
      kind: kindOf(entry.name),
    })
  }
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
 * Files under any OTHER subfolder are left out: those belong to the pages that
 * live there, and a project folder would otherwise show its every child's
 * documents as its own.
 */
export async function attachmentsOf(
  root: string,
  pagePath: string,
  order: Intl.Collator = new Intl.Collator(undefined, { numeric: true }),
): Promise<WorkspaceFile[]> {
  const folder = dirname(pagePath.replace(/^\/+/, ''))
  const prefix = folder === '.' || folder === '' ? '' : folder

  const found: WorkspaceFile[] = []
  await walk(root, prefix, found, false)
  await walk(root, prefix ? `${prefix}/assets` : 'assets', found, true)

  return found.sort((a, b) => order.compare(a.path, b.path))
}

export function registerFiles(app: FastifyInstance, options: FilesOptions): void {
  const { root } = options
  const order = new Intl.Collator(options.locale, { numeric: true })

  /**
   * What is there, as data.
   *
   * `?page=` answers the question an interface actually has — "what is
   * attached to this page" — so the convention lives HERE rather than being
   * re-derived by the shell, by a plugin, and eventually differently by both.
   */
  app.get<{ Querystring: { page?: string; under?: string } }>('/api/files', async (request) => {
    const page = request.query.page
    if (typeof page === 'string' && page !== '') {
      if (!safeFilePath(root, page)) return { files: [] }
      return { files: await attachmentsOf(root, page, order) }
    }

    const under = typeof request.query.under === 'string' ? request.query.under : ''
    if (under !== '' && !safeFilePath(root, under)) return { files: [] }
    const files: WorkspaceFile[] = []
    await walk(root, under.replace(/^\/+|\/+$/g, ''), files, true)
    return { files: files.sort((a, b) => order.compare(a.path, b.path)) }
  })

  app.get<{ Params: { '*': string }; Querystring: { download?: string } }>(
    '/api/files/*',
    async (request, reply) => {
      const path = safeFilePath(root, request.params['*'])
      if (!path) return reply.code(400).send({ error: 'not a valid file path' })

      let info
      try {
        info = await stat(path)
        if (!info.isFile()) return reply.code(404).send({ error: 'no such file' })
      } catch {
        return reply.code(404).send({ error: 'no such file' })
      }

      const inline = INLINE[extname(path).toLowerCase()]
      const forced = request.query.download !== undefined && request.query.download !== '0'
      const name = path.split(sep).pop() ?? 'file'

      // Weak validator on purpose: mtime plus size is what the pages API
      // already calls a revision, and it costs no read of the bytes.
      const tag = `W/"${Math.trunc(info.mtimeMs)}-${info.size}"`
      reply.header('etag', tag)
      reply.header('last-modified', new Date(info.mtimeMs).toUTCString())
      // Private: this is somebody's workspace behind a session, and a shared
      // cache holding it would hand it to the next person through the proxy.
      reply.header('cache-control', 'private, max-age=0, must-revalidate')
      reply.header('x-content-type-options', 'nosniff')
      reply.header('content-security-policy', "default-src 'none'; sandbox")

      if (request.headers['if-none-match'] === tag) return reply.code(304).send()

      reply.header('content-type', inline && !forced ? inline : 'application/octet-stream')
      reply.header(
        'content-disposition',
        // The filename is quoted and its quotes and backslashes escaped: a
        // file called `x".pdf` must not be able to write a second header field.
        `${inline && !forced ? 'inline' : 'attachment'}; filename="${name.replace(/["\\]/g, '_')}"`,
      )
      reply.header('content-length', String(info.size))
      return reply.send(createReadStream(path))
    },
  )
}
