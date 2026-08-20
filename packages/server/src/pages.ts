/**
 * The pages API — reading and writing the files both hands share.
 *
 * The agent edits these with its native file tools; this endpoint is for the
 * browser. Both write the SAME markdown, validated against the SAME closed
 * vocabulary, which is what keeps the two authors from drifting apart.
 *
 * Three rules the routes below exist to enforce:
 *
 * - a save that would corrupt the vocabulary is REFUSED with diagnostics,
 *   never accepted and never silently rewritten;
 * - a save is refused if the file changed underneath the editor, because the
 *   other author here is an agent that writes without warning;
 * - writes are atomic, since the agent may be reading the file at that moment.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import { parse, serialize, validateDocument, type Diagnostic } from '@antorfr/golem-content'
import type { FastifyInstance } from 'fastify'

export interface PagesOptions {
  /** Absolute path of the pages directory. */
  readonly root: string
}

export interface PageInfo {
  readonly path: string
  readonly title: string
  readonly modified: string
  /** ETag-like: what an editor sends back to prove it read the current file. */
  readonly revision: string
}

export interface PageContent extends PageInfo {
  readonly markdown: string
  readonly diagnostics: readonly Diagnostic[]
  /**
   * False when the document breaks the closed vocabulary. The editor opens it
   * read-only with the diagnostics rather than refusing (which loses the file)
   * or normalizing (which loses the content).
   */
  readonly editable: boolean
}

/** Modification time plus size: enough to notice a write we did not make. */
export function revisionOf(info: { mtimeMs: number; size: number }): string {
  return `${Math.trunc(info.mtimeMs)}-${info.size}`
}

export function safePagePath(root: string, requested: string): string | undefined {
  if (requested.includes('\0')) return undefined
  const target = resolve(root, `./${requested.replace(/^\/+/, '')}`)
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  // Only markdown: this API's contract is the content vocabulary, and a
  // general-purpose file writer behind a session cookie is a different, much
  // more dangerous thing.
  if (extname(target) !== '.md') return undefined
  return target
}

/** The frontmatter title if there is one, else the file name. */
export function titleOf(markdown: string, path: string): string {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  const title = match?.[1] ? /^title:\s*(.+)$/m.exec(match[1])?.[1]?.trim() : undefined
  if (title) return title.replace(/^["']|["']$/g, '')
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]
  return heading ?? path.replace(/\.md$/, '').split('/').pop() ?? path
}

async function listMarkdown(root: string, prefix = ''): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    // Dotfiles are the agent's business (.claude, .git); the page list is the
    // user's content, not the workspace's plumbing.
    if (entry.name.startsWith('.')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...(await listMarkdown(root, rel)))
    else if (entry.name.endsWith('.md')) found.push(rel)
  }
  return found
}

export function registerPages(app: FastifyInstance, options: PagesOptions): void {
  const { root } = options

  app.get('/api/pages', async () => {
    const paths = await listMarkdown(root)
    const pages: PageInfo[] = []
    for (const path of paths.sort()) {
      const full = join(root, path)
      const [info, markdown] = await Promise.all([stat(full), readFile(full, 'utf8')])
      pages.push({
        path,
        title: titleOf(markdown, path),
        modified: new Date(info.mtimeMs).toISOString(),
        revision: revisionOf(info),
      })
    }
    return { pages }
  })

  app.get<{ Params: { '*': string } }>('/api/pages/*', async (request, reply) => {
    const path = safePagePath(root, request.params['*'])
    if (!path) return reply.code(400).send({ error: 'not a valid page path' })

    try {
      const [info, markdown] = await Promise.all([stat(path), readFile(path, 'utf8')])
      const diagnostics = validateDocument(parse(markdown))
      const page: PageContent = {
        path: request.params['*'],
        title: titleOf(markdown, request.params['*']),
        modified: new Date(info.mtimeMs).toISOString(),
        revision: revisionOf(info),
        markdown,
        diagnostics,
        editable: !diagnostics.some((d) => d.severity === 'error'),
      }
      return page
    } catch {
      return reply.code(404).send({ error: 'no such page' })
    }
  })

  app.put<{ Params: { '*': string }; Body: { markdown?: unknown; revision?: unknown } }>(
    '/api/pages/*',
    async (request, reply) => {
      const path = safePagePath(root, request.params['*'])
      if (!path) return reply.code(400).send({ error: 'not a valid page path' })

      const markdown = request.body?.markdown
      if (typeof markdown !== 'string') {
        return reply.code(400).send({ error: 'markdown is required' })
      }

      const diagnostics = validateDocument(parse(markdown))
      if (diagnostics.some((d) => d.severity === 'error')) {
        // Refused, with the reasons. Accepting it would let one save put the
        // page beyond what the renderer and the agent's contract can read.
        return reply.code(422).send({ error: 'the page breaks the vocabulary', diagnostics })
      }

      let current: { mtimeMs: number; size: number } | undefined
      try {
        current = await stat(path)
      } catch {
        /* a new page */
      }

      if (current && request.body?.revision !== revisionOf(current)) {
        // The other author is an agent that writes without warning. Overwriting
        // blind is how one of the two hands loses its work silently.
        return reply.code(409).send({
          error: 'the file changed since it was opened',
          revision: revisionOf(current),
        })
      }

      // Serialized through the same pipeline the renderer uses, so what is
      // stored is exactly what both authors will read back.
      const canonical = serialize(parse(markdown))
      await mkdir(dirname(path), { recursive: true })

      // Atomic: the agent may be reading this file right now, and a partial
      // write is a corrupted page rather than a failed save.
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, canonical, 'utf8')
        await rename(temporary, path)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }

      const info = await stat(path)
      return {
        path: request.params['*'],
        revision: revisionOf(info),
        modified: new Date(info.mtimeMs).toISOString(),
        /**
         * True when saving reformatted something the author would notice.
         *
         * Trailing whitespace is excluded deliberately: editors routinely end
         * a document with a blank line the serializer trims, so counting it
         * would flag EVERY save as reformatted — and a warning that always
         * fires is a warning nobody reads when it finally means something.
         */
        normalized: canonical.trimEnd() !== markdown.trimEnd(),
      }
    },
  )
}
