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
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'

import {
  isFinished,
  parse,
  serialize,
  validateDocument,
  type Diagnostic,
} from '@antorfr/adestia-content'
import type { FastifyInstance } from 'fastify'

import {
  candidatesOf,
  fileIn,
  listAll,
  targetFor,
  type Store,
} from './stores.js'

export interface PagesOptions {
  /**
   * The stores this instance composes, in precedence order — the default
   * first. Always at least one; with exactly one, every answer below is what
   * it was before memory could be composed at all.
   */
  readonly stores: readonly Store[]
  /**
   * The instance's language, used to ORDER what it lists.
   *
   * `Array.sort()` compares UTF-16 code units, which is not an alphabet: on a
   * French corpus it filed `Ébène` after `zinc`, and `fiche-10` before
   * `fiche-2` — thirteen numbered pages shuffled in every folder, visible on
   * screen and in no test. Absent, the host's own locale decides, which is
   * what an instance that declared no language honestly means.
   */
  readonly locale?: string | undefined
}

export interface PageInfo {
  readonly path: string
  /**
   * Which store carries this copy — present ONLY when the instance has more
   * than one. Adding it to the single-store case would change the answer for
   * nothing, and teach the shell a division that does not exist on its own
   * instance.
   */
  readonly store?: string
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

/**
 * A requested page inside ONE store, or refused.
 *
 * The location half is `fileIn` — mount prefix stripped, guard applied against
 * that store's own directory. What stays here is the rule that has nothing to
 * do with where files are: only markdown. This API's contract is the content
 * vocabulary, and a general-purpose file writer behind a session cookie is a
 * different, much more dangerous thing.
 */
export function safePagePath(store: Store, requested: string): string | undefined {
  const target = fileIn(store, requested)
  if (!target) return undefined
  return extname(target) === '.md' ? target : undefined
}

/**
 * The store a `?store=` qualifier names, or undefined.
 *
 * A qualifier is a fact of LOCATION, never a name: the bare address stays the
 * canonical one and resolves by precedence, so every wikilink, favourite and
 * reference written before stores existed keeps working. This exists only so
 * the folder view can link the copy the bare address does not designate.
 */
function qualified(stores: readonly Store[], asked: unknown): Store | undefined {
  return typeof asked === 'string' && asked !== ''
    ? stores.find((store) => store.id === asked)
    : undefined
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

/** This API's whole contract, as a predicate: markdown, and nothing else. */
const isMarkdown = (name: string): boolean => name.endsWith('.md')

/** Candidates for a logical path, markdown-only, precedence order. */
async function pageCandidates(stores: readonly Store[], logical: string) {
  const found = await candidatesOf(stores, logical)
  return found.filter((one) => extname(one.file) === '.md')
}

/** What a refusal tells the shell so it can draw the choice. */
const choiceOf = (stores: readonly { id: string; label: string }[]) =>
  stores.map((store) => ({ store: store.id, label: store.label }))

export function registerPages(app: FastifyInstance, options: PagesOptions): void {
  const { stores } = options
  const order = new Intl.Collator(options.locale, { numeric: true })
  // The division is published only when it exists. On a single-store instance
  // every answer below is byte for byte what it was before stores existed —
  // which is not an intention but a committed witness.
  const multi = stores.length > 1
  /** What the shell needs to draw provenance: a name, a hue, and which is mine. */
  const table = () =>
    stores.map((store) => ({
      id: store.id,
      label: store.label,
      ...(store.hue ? { hue: store.hue } : {}),
      ...(store.isDefault ? { default: true } : {}),
    }))

  /**
   * The curated brief — "À la une".
   *
   * The MATERIALIZED regime, inherited deliberately: the agent writes
   * `home/brief.json` with its own file tools when asked to refresh the front
   * page, and the shell reads the artifact as-is. Zero model calls at render
   * time, and the brief is a file someone can open, diff and audit like
   * everything else here.
   *
   * Composed like the rest: a shared circle may carry the brief, and the
   * default store wins when both do. Absent is not an error — it is an
   * instance whose agent was never asked to curate one.
   */
  app.get('/api/home/brief', async (_request, reply) => {
    const [found] = await candidatesOf(stores, 'home/brief.json')
    if (!found) return reply.code(404).send({ error: 'no brief' })
    try {
      return JSON.parse(await readFile(found.file, 'utf8'))
    } catch {
      return reply.code(404).send({ error: 'no brief' })
    }
  })

  app.get('/api/pages', async () => {
    const { entries } = await listAll(stores, { keep: isMarkdown })
    const pages: PageInfo[] = []
    for (const entry of [...entries].sort((a, b) => order.compare(a.path, b.path))) {
      const [info, markdown] = await Promise.all([stat(entry.file), readFile(entry.file, 'utf8')])
      pages.push({
        path: entry.path,
        ...(multi ? { store: entry.store.id } : {}),
        title: titleOf(markdown, entry.path),
        modified: new Date(info.mtimeMs).toISOString(),
        revision: revisionOf(info),
      })
    }
    // The stores travel with the list, once, rather than being guessed from
    // the entries: the shell needs the LABEL to suffix a card and the HUE to
    // draw its rim, and a store carrying nothing must still appear in a legend.
    return multi ? { pages, stores: table() } : { pages }
  })

  app.get('/api/pages/index', async () => {
    const { entries } = await listAll(stores, { keep: isMarkdown })
    const out: {
      path: string
      store?: string
      title: string
      fields: Record<string, unknown>
      finished: boolean
    }[] = []
    for (const entry of [...entries].sort((a, b) => order.compare(a.path, b.path))) {
      const markdown = await readFile(entry.file, 'utf8').catch(() => '')
      const fields = parseFrontmatter(markdown)
      out.push({
        path: entry.path,
        ...(multi ? { store: entry.store.id } : {}),
        title: titleOf(markdown, entry.path),
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
    // The store table travels with the listing the shell actually draws from,
    // exactly as it does with the plain list: a card needs a LABEL to be
    // suffixed and a HUE for its rim, and a store carrying nothing still has
    // to reach the legend.
    return multi ? { entries: out, stores: table() } : { entries: out }
  })

  app.get<{ Params: { '*': string }; Querystring: { store?: string } }>(
    '/api/pages/*',
    async (request, reply) => {
      const logical = request.params['*']
      if (!stores.some((store) => safePagePath(store, logical))) {
        return reply.code(400).send({ error: 'not a valid page path' })
      }

      const only = qualified(stores, request.query.store)
      if (request.query.store !== undefined && !only) {
        return reply.code(404).send({ error: 'no such store' })
      }

      /**
       * A qualifier is a HINT, not a key.
       *
       * It exists so a folder view can link the copy the bare address does not
       * designate — and the day that copy is promoted into another circle, the
       * link must keep opening something. Falling back to the bare resolution
       * is what keeps a favourite alive across a `mv`, which is the whole
       * promise of a name that never contains its store. Answering 404 would
       * reintroduce, through the qualifier, exactly the breakage the rule was
       * written to prevent.
       */
      const named = only ? await pageCandidates([only], logical) : []
      const found = named.length > 0 ? named : await pageCandidates(stores, logical)
      const first = found[0]
      if (!first) return reply.code(404).send({ error: 'no such page' })

      /**
       * The one read this product refuses to answer.
       *
       * Several SHARED circles carry the name and mine does not: precedence
       * has no claim to arbitrate with — a card in the default store is one I
       * made, between two peers' circles I have no such title. Answering
       * either would be the failure this whole design is built against, a card
       * believed corrected while another was read. The shell navigates to the
       * parent folder instead, where both are drawn and can be told apart.
       */
      if (named.length === 0 && found.length > 1 && !first.store.isDefault) {
        return reply.code(409).send({
          error: 'several stores carry this page',
          candidates: choiceOf(found.map((one) => one.store)),
        })
      }

      try {
        const [info, markdown] = await Promise.all([stat(first.file), readFile(first.file, 'utf8')])
        const diagnostics = validateDocument(parse(markdown))
        const page: PageContent = {
          path: logical,
          ...(multi ? { store: first.store.id } : {}),
          title: titleOf(markdown, logical),
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
    },
  )

  app.put<{
    Params: { '*': string }
    Querystring: { store?: string }
    Body: { markdown?: unknown; revision?: unknown }
  }>('/api/pages/*', async (request, reply) => {
    const logical = request.params['*']
    if (!stores.some((store) => safePagePath(store, logical))) {
      return reply.code(400).send({ error: 'not a valid page path' })
    }

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

    const only = qualified(stores, request.query.store)
    if (request.query.store !== undefined && !only) {
      return reply.code(404).send({ error: 'no such store' })
    }

    /**
     * Where the bytes land — deduced, or asked for.
     *
     * An existing page goes back to ITS OWN store, which is the whole reason
     * co-editing a shared circle works: writing to the default instead would
     * fork the card, and since both copies are now drawn, the author would see
     * two cards where they corrected one — and the one they meant unchanged.
     */
    const target = only
      ? ({ kind: 'store', store: only, file: safePagePath(only, logical)! } as const)
      : await targetFor(stores, logical)
    if (target.kind !== 'store') {
      return reply.code(409).send({
        error: 'several stores carry this folder — name one',
        candidates: choiceOf(target.stores),
      })
    }
    const file = target.file

    let current: { mtimeMs: number; size: number } | undefined
    try {
      current = await stat(file)
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

    // Atomic, and in the TARGET store's own directory: `rename` is atomic only
    // within one filesystem, and stores are mounts — writing beside the target
    // is what keeps that true when the circles live on different volumes.
    const temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`)
    try {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(temporary, canonical, 'utf8')
      await rename(temporary, file)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        // The disk refused, not the product. Named, because the cure is on the
        // other side of the mount — a dataset the pod cannot write is a group
        // missing from its spec, and an unqualified 500 sends the operator
        // reading this code instead of their manifest.
        return reply.code(403).send({
          error: `the store "${target.store.id}" refused the write`,
          store: target.store.id,
        })
      }
      throw error
    }

    const info = await stat(file)
    return {
      path: logical,
      ...(multi ? { store: target.store.id } : {}),
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
  })
}
