/**
 * The files routes: a listing of the workspace's non-page files, and the
 * bytes of one. Read-only on purpose, and served inline only for inert media
 * types — the reasoning lives with the types, in `../files.ts`.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { sep } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { attachmentsOf, collectFiles, inlineTypeOf, safeFilePath } from '../files.js'
import { candidatesOf, type Store } from '../stores.js'

export interface FilesOptions {
  /** The same stores the pages API composes: an attachment is a file next to a page. */
  readonly stores: readonly Store[]
  /**
   * The instance's language, used to order listings. Bare `localeCompare()`
   * was already used here, and it reads the HOST's locale: the same workspace
   * came back in two different orders on two machines, and a golden taken on
   * one failed on the other.
   */
  readonly locale?: string | undefined
}
export function registerFiles(app: FastifyInstance, options: FilesOptions): void {
  const { stores } = options
  const order = new Intl.Collator(options.locale, { numeric: true })
  const multi = stores.length > 1

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
      if (!stores.some((store) => safeFilePath(store, page))) return { files: [] }
      return { files: await attachmentsOf(stores, page, order) }
    }

    const under = typeof request.query.under === 'string' ? request.query.under : ''
    if (under !== '' && !stores.some((store) => safeFilePath(store, under))) return { files: [] }
    const files = await collectFiles(stores, under.replace(/^\/+|\/+$/g, ''), true, multi)
    return { files: files.sort((a, b) => order.compare(a.path, b.path)) }
  })

  app.get<{ Params: { '*': string }; Querystring: { download?: string; store?: string } }>(
    '/api/files/*',
    async (request, reply) => {
      const asked = request.params['*']
      if (!stores.some((store) => safeFilePath(store, asked))) {
        return reply.code(400).send({ error: 'not a valid file path' })
      }

      // The same qualifier the pages API takes, for the same reason: the bare
      // address stays canonical and resolves by precedence, and this exists
      // only so a view can point at the copy it does not designate.
      const only =
        typeof request.query.store === 'string' && request.query.store !== ''
          ? stores.find((store) => store.id === request.query.store)
          : undefined
      if (request.query.store !== undefined && !only) {
        return reply.code(404).send({ error: 'no such store' })
      }

      // Same fallback as a page's: a qualifier says where to look first, not
      // where the file must be.
      const named = only ? await candidatesOf([only], asked) : []
      const found = named.length > 0 ? named : await candidatesOf(stores, asked)
      const first = found[0]
      if (!first) return reply.code(404).send({ error: 'no such file' })

      let info
      try {
        info = await stat(first.file)
        if (!info.isFile()) return reply.code(404).send({ error: 'no such file' })
      } catch {
        return reply.code(404).send({ error: 'no such file' })
      }

      const inline = inlineTypeOf(first.file)
      const forced = request.query.download !== undefined && request.query.download !== '0'
      const name = first.file.split(sep).pop() ?? 'file'

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
      return reply.send(createReadStream(first.file))
    },
  )
}
