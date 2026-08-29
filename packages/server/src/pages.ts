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

import {
  isFinished,
  parse,
  serialize,
  validateDocument,
  type Diagnostic,
} from '@antorfr/demeura-content'
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

/**
 * The frontmatter of every page, in one request.
 *
 * This is what the design calls the DERIVED regime: a view computed live from
 * attributes, always current, costing no LLM call. A todo list, a project
 * board and a faceted collection are all one query over this index — which is
 * why it belongs to the content engine rather than to whichever plugin asks
 * for it first.
 *
 * Values are parsed shallowly and left as strings, numbers, booleans or flat
 * lists. Nested YAML is deliberately NOT walked: a query language over deep
 * structures is a database, and the moment a page needs one it should be an
 * app with its own store rather than a page pretending.
 */
export function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  if (!match?.[1]) return {}

  const fields: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    // Only top-level keys: an indented line belongs to a nested structure this
    // index does not model, and guessing at it would produce a field that
    // looks queryable and is not.
    if (/^\s/.test(line)) continue
    const separator = line.indexOf(':')
    if (separator <= 0) continue

    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    if (key === '') continue
    fields[key] = parseScalar(raw)
  }
  return fields
}

function parseScalar(raw: string): unknown {
  if (raw === '') return ''
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item.trim()))
      .filter((item) => item !== '')
  }
  const unquoted = raw.replace(/^["']|["']$/g, '')
  if (unquoted !== raw) return unquoted
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '~') return null
  // Dates stay strings: `2026-08-21` as a number would be nonsense, and as a
  // Date it would serialize differently than it was written.
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
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

  /**
   * The curated brief — "À la une".
   *
   * The MATERIALIZED regime, inherited deliberately: the agent writes
   * `home/brief.json` with its own file tools when asked to refresh the
   * front page, and the shell reads the artifact as-is. Zero model calls at
   * render time, and the brief is a file someone can open, diff and audit
   * like everything else here.
   *
   * Absent is not an error — it is an instance whose agent was never asked
   * to curate one, and the home simply shows no such section.
   */
  app.get('/api/home/brief', async (request, reply) => {
    try {
      return JSON.parse(await readFile(join(options.root, 'home', 'brief.json'), 'utf8'))
    } catch {
      return reply.code(404).send({ error: 'no brief' })
    }
  })

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

  app.get('/api/pages/index', async () => {
    const paths = await listMarkdown(root)
    const entries: {
      path: string
      title: string
      fields: Record<string, unknown>
      finished: boolean
    }[] = []
    for (const path of paths.sort()) {
      const markdown = await readFile(join(root, path), 'utf8').catch(() => '')
      const fields = parseFrontmatter(markdown)
      entries.push({
        path,
        title: titleOf(markdown, path),
        fields,
        /**
         * Whether the page's life is over — answered HERE rather than by
         * whoever draws it.
         *
         * A view can read `status` itself; what it cannot do is know that
         * `réalisé` closes a page and `acheté` closes only a purchase. That
         * knowledge is the content engine's, and publishing its verdict is
         * what lets a plugin — which may import nothing but React — fold
         * finished things away exactly like the shell does. The predecessor
         * kept a copy of the table per view, and they drifted.
         */
        finished: isFinished(fields),
      })
    }
    return { entries }
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
