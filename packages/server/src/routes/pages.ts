/**
 * The pages routes — reading and writing the files both hands share.
 *
 * What a page IS (its address, title, revision) stays in `../pages.ts`, which
 * other modules import; this file only mounts it on HTTP. Three rules the
 * routes below exist to enforce:
 *
 * - a save that would corrupt the vocabulary is REFUSED with diagnostics,
 *   never accepted and never silently rewritten;
 * - a save is refused if the file changed underneath the editor, because the
 *   other author here is an agent that writes without warning;
 * - writes are atomic, since the agent may be reading the file at that moment.
 */

import { createHash, randomUUID } from 'node:crypto'
import { access, chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

import {
  contentDigest,
  isFinished,
  toneOf,
  type StatusTone,
  parse,
  serialize,
  validateDocument,
} from '@antorfr/adestia-content'
import type {
  CreateFolderRequest,
  CreateFolderResponse,
  FolderSettingsResponse,
  PageIndexFolders,
  RenameFolderRequest,
  RenameFolderResponse,
} from '@antorfr/adestia-schemas'
import type { FastifyInstance } from 'fastify'

import { parseFrontmatter, splitFrontmatter } from '../frontmatter.js'
import type { DiscoveredPlugin } from '../extensions.js'
import { rewriteLinks } from '../folder-links.js'
import { folderSettingsOf, isFolderSettingsPath, writeFolderSettings } from '../folder-settings.js'
import { gated } from '../io.js'
import { allFolders, creatableRoot, isAbsorbed, writableFolders } from '../writable-folders.js'
import { revisionOf, safePagePath, titleOf, type PageContent, type PageInfo } from '../pages.js'
import {
  candidatesOf,
  fileIn,
  listAll,
  targetFor,
  type Store,
} from '../stores.js'

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
  /** Plugins discovered; the ACTIVE ones' `absorbs` leave the writable folders. */
  readonly plugins?: readonly DiscoveredPlugin[] | undefined
  /** Logical folders a configuration key names (`workspace.memory`, `workspace.planif`): not renamable. */
  readonly configured?: readonly string[] | undefined
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
 * Whether anything is written UNDER the frontmatter.
 *
 * A boolean rather than the text, and the difference is the whole reason this
 * exists. The index answers for every page at once, so returning bodies would
 * ship the entire corpus to draw a list — two hundred pages to decide where to
 * put a small mark. The server already holds each body here, to parse the
 * frontmatter and find the title, so saying whether there IS one costs
 * nothing and travels in five bytes.
 *
 * What it buys: a list can show which of its rows carry an explanation,
 * instead of every row looking equally bare until you open it.
 *
 * Whitespace is not a body. A page whose text is a single heading is one —
 * a heading is what somebody wrote.
 */
function hasBody(markdown: string): boolean {
  return splitFrontmatter(markdown).body.trim() !== ''
}

/** E-36's slug: runs of `[a-z0-9]` separated by single dashes. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

  // A full markdown parse per page per index request was most of its CPU. The
  // key is a hash of the text, not the text: any change — whoever made it —
  // invalidates, and the cache holds a few bytes per page rather than a copy
  // of the workspace.
  const digests = new Map<string, { hash: string; digest: Record<string, string> }>()
  const digestOf = (file: string, markdown: string): Record<string, string> => {
    const hash = createHash('sha256').update(markdown).digest('hex')
    const known = digests.get(file)
    if (known?.hash === hash) return known.digest
    const digest = contentDigest(markdown)
    digests.set(file, { hash, digest })
    return digest
  }
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
    const sorted = [...entries].sort((a, b) => order.compare(a.path, b.path))
    const pages: PageInfo[] = await Promise.all(
      sorted.map(async (entry) => {
        const [info, markdown] = await Promise.all([
          gated(() => stat(entry.file)),
          gated(() => readFile(entry.file, 'utf8')),
        ])
        return {
          path: entry.path,
          ...(multi ? { store: entry.store.id } : {}),
          title: titleOf(markdown, entry.path),
          modified: new Date(info.mtimeMs).toISOString(),
          revision: revisionOf(info),
        }
      }),
    )
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
      tone: StatusTone
      body: boolean
      blocks?: Record<string, string>
    }[] = []
    const sorted = [...entries].sort((a, b) => order.compare(a.path, b.path))
    const texts = await Promise.all(
      sorted.map((entry) => gated(() => readFile(entry.file, 'utf8')).catch(() => '')),
    )
    const listed = new Set(sorted.map((entry) => entry.file))
    for (const file of digests.keys()) if (!listed.has(file)) digests.delete(file)
    for (const [i, entry] of sorted.entries()) {
      const markdown = texts[i] ?? ''
      const fields = parseFrontmatter(markdown)
      const digest = digestOf(entry.file, markdown)
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
        /**
         * WHICH family the status belongs to — under way, waiting on the
         * world, or settled.
         *
         * Published for the same reason `finished` is, one line up: a plugin
         * may import nothing but React, and the alternative to this field is
         * a copy of the engine's table inside every plugin that wants to draw
         * a state. `finished` does not answer it — "waiting" and "under way"
         * are both unfinished, and they are the two a plugin most needs to
         * tell apart, since one of them means nobody can advance the page.
         */
        tone: toneOf(fields['status'] ?? fields['statut']),
        /**
         * Whether the page says anything under its frontmatter — see
         * `hasBody`. Published for every page rather than for the one app
         * that asked: "does this row carry a note" is a question a journal, a
         * collection and a task list all have, and answering it here is what
         * keeps them from each fetching the corpus to find out.
         */
        body: hasBody(markdown),
        /**
         * What each written `:::content` block says, bounded — so a row can
         * show a child's `type=etat` without a request per child. Omitted
         * when there is none, which is most pages: a field that appears only
         * when it means something, exactly like `store`.
         */
        ...(Object.keys(digest).length > 0 ? { blocks: digest } : {}),
      })
    }
    // The store table travels with the listing the shell actually draws from,
    // exactly as it does with the plain list: a card needs a LABEL to be
    // suffixed and a HUE for its rim, and a store carrying nothing still has
    // to reach the legend.
    // Computed on every call, never cached: a folder made read-only, or a
    // plugin switched on, must show on the next index.
    const absorbed = (options.plugins ?? [])
      .filter((plugin) => plugin.active)
      .flatMap((plugin) => plugin.manifest.absorbs ?? [])
    const folders = await writableFolders(stores, absorbed, order)
    const every = await allFolders(stores, order)
    const fields: PageIndexFolders = {
      writableFolders: folders,
      folders: every,
      folderSettings: await folderSettingsOf(stores, every),
    }
    return multi
      ? { entries: out, stores: table(), ...fields }
      : { entries: out, ...fields }
  })

  /**
   * Taken: a directory or a page file of that logical name in ANY store, or a
   * folder that is the mount point (or the logical parent) of one.
   */
  const nameTaken = async (asked: string): Promise<boolean> => {
    const exists = async (store: Store, logical: string): Promise<boolean> => {
      const there = logical === store.at ? store.dir : fileIn(store, logical)
      if (!there) return false
      return stat(there).then(
        () => true,
        () => false,
      )
    }
    for (const store of stores) {
      if (store.at === asked || store.at.startsWith(`${asked}/`)) return true
      if ((await exists(store, asked)) || (await exists(store, `${asked}.md`))) return true
    }
    return false
  }

  const isWritable = (path: string): Promise<boolean> =>
    access(path, constants.W_OK).then(
      () => true,
      () => false,
    )

  /**
   * AD-39: rename the last segment of a folder, then mend the path links that
   * led into it. The directory `rename` is the verdict and is never undone;
   * a page that cannot be mended is counted in `unrewritten`.
   */
  app.post<{ Body: Partial<Record<keyof RenameFolderRequest, unknown>> }>(
    '/api/folders/rename',
    async (request, reply) => {
      const asked = request.body?.path
      const name = request.body?.name
      if (typeof asked !== 'string' || asked === '' || asked.includes('\0')) {
        return reply.code(400).send({ error: 'path is required' })
      }
      if (typeof name !== 'string' || !SLUG.test(name) || name.length > 80) {
        return reply.code(400).send({ error: 'not a valid folder name' })
      }
      const segments = asked.split('/')
      if (segments.some((part) => part === '' || part === '.' || part === '..')) {
        return reply.code(400).send({ error: 'not a valid folder path' })
      }
      const renamed = [...segments.slice(0, -1), name].join('/')

      // Mount points and the logical parents of mounts are held by no one.
      const mounted = stores.some((store) => store.at === asked || store.at.startsWith(`${asked}/`))
      const holders: { store: Store; dir: string }[] = []
      for (const store of stores) {
        const dir = fileIn(store, asked)
        if (!dir) continue
        const info = await stat(dir).catch(() => undefined)
        if (info?.isDirectory()) holders.push({ store, dir })
      }
      if (!mounted && holders.length === 0) {
        return reply.code(404).send({ error: 'no such folder' })
      }

      const absorbed = (options.plugins ?? [])
        .filter((plugin) => plugin.active)
        .flatMap((plugin) => plugin.manifest.absorbs ?? [])
      if (isAbsorbed(absorbed, asked)) {
        return reply.code(422).send({ error: 'this folder belongs to an app' })
      }
      if ((options.configured ?? []).some((one) => one === asked || one.startsWith(`${asked}/`))) {
        return reply.code(422).send({ error: 'this folder is named in the configuration' })
      }
      if (mounted) return reply.code(422).send({ error: 'this folder is a mount point' })
      if (holders.length > 1) {
        return reply.code(422).send({ error: 'several stores hold this folder' })
      }
      const [held] = holders
      if (!held) return reply.code(404).send({ error: 'no such folder' })

      if (!(await isWritable(held.dir)) || !(await isWritable(dirname(held.dir)))) {
        return reply.code(403).send({ error: 'write refused' })
      }
      if (await nameTaken(renamed)) {
        return reply.code(409).send({ error: 'name already taken' })
      }

      const target = join(dirname(held.dir), name)
      try {
        await rename(held.dir, target)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST' || code === 'ENOTEMPTY') {
          return reply.code(409).send({ error: 'name already taken' })
        }
        if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
          return reply.code(403).send({ error: 'write refused' })
        }
        if (code === 'ENOENT') return reply.code(404).send({ error: 'no such folder' })
        throw error
      }

      let unrewritten = 0
      const writableStore = new Map<string, boolean>()
      const { entries } = await listAll(stores, { keep: (file) => file.endsWith('.md') })
      for (const entry of entries) {
        // A page of the renamed folder is read where it lives now, its
        // relative links resolved from where it was written.
        const inside = entry.path === renamed || entry.path.startsWith(`${renamed}/`)
        const was = inside ? `${asked}${entry.path.slice(renamed.length)}` : entry.path
        let text: string
        try {
          text = await readFile(entry.file, 'utf8')
        } catch {
          continue
        }
        if (!text.includes(segments[segments.length - 1] ?? '')) continue
        let rewritten: string | undefined
        try {
          rewritten = rewriteLinks(text, {
            from: asked,
            name,
            pageDir: was.includes('/') ? was.slice(0, was.lastIndexOf('/')) : '',
          })
        } catch (error) {
          request.log.warn({ err: error, page: entry.path }, 'a page could not be read for its links')
          continue
        }
        if (rewritten === undefined) continue
        let open = writableStore.get(entry.store.id)
        if (open === undefined) {
          open = await isWritable(entry.store.dir)
          writableStore.set(entry.store.id, open)
        }
        if (!open) {
          unrewritten += 1
          continue
        }
        const temporary = join(dirname(entry.file), `.${basename(entry.file)}.${randomUUID()}.tmp`)
        try {
          await writeFile(temporary, rewritten, 'utf8')
          await chmod(temporary, (await stat(entry.file)).mode & 0o7777).catch(() => undefined)
          await rename(temporary, entry.file)
        } catch (error) {
          await unlink(temporary).catch(() => undefined)
          request.log.warn({ err: error, page: entry.path }, 'a page could not be rewritten')
          unrewritten += 1
        }
      }
      const done: RenameFolderResponse = { path: renamed, unrewritten }
      return reply.code(200).send(done)
    },
  )

  /**
   * AD-38: make an empty folder. The client sends the path already reduced to
   * slugs (E-36); the server never slugs, it refuses a last segment that is
   * not one. The folder goes in the first store that holds the parent and
   * lets the user write there; the `mkdir` is the atomic verdict.
   */
  app.post<{ Body: Partial<Record<keyof CreateFolderRequest, unknown>> }>('/api/folders', async (request, reply) => {
    const asked = request.body?.path
    if (typeof asked !== 'string' || asked.includes('\0')) {
      return reply.code(400).send({ error: 'path is required' })
    }
    const segments = asked.split('/')
    const name = segments[segments.length - 1] ?? ''
    if (!SLUG.test(name) || name.length > 80) {
      return reply.code(400).send({ error: 'not a valid folder name' })
    }
    const parents = segments.slice(0, -1)
    if (parents.some((part) => part === '' || part === '.' || part === '..')) {
      return reply.code(400).send({ error: 'not a valid parent folder' })
    }
    const parent = parents.join('/')

    if (await nameTaken(asked)) {
      return reply.code(409).send({ error: 'name already taken' })
    }

    const absorbed = (options.plugins ?? [])
      .filter((plugin) => plugin.active)
      .flatMap((plugin) => plugin.manifest.absorbs ?? [])
    if (parent !== '' && isAbsorbed(absorbed, parent)) {
      return reply.code(403).send({ error: 'write refused' })
    }
    // Default store first, then the others as declared.
    const ordered = [...stores.filter((s) => s.isDefault), ...stores.filter((s) => !s.isDefault)]
    for (const store of ordered) {
      const parentDir = parent === store.at ? store.dir : parent === '' ? undefined : fileIn(store, parent)
      if (!parentDir) continue
      const held = await stat(parentDir).then(
        (info) => info.isDirectory(),
        () => false,
      )
      if (!held) {
        // A fresh instance has no pages directory yet: the first folder makes it.
        if (parent !== store.at || !(await creatableRoot(store))) continue
        await mkdir(parentDir, { recursive: true }).catch(() => undefined)
      }
      const writable = await access(parentDir, constants.W_OK).then(
        () => true,
        () => false,
      )
      if (!writable) continue
      const target = join(parentDir, name)
      try {
        await mkdir(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return reply.code(409).send({ error: 'name already taken' })
        }
        continue
      }
      const made: CreateFolderResponse = { path: asked }
      return reply.code(201).send(made)
    }
    return reply.code(403).send({ error: 'write refused' })
  })

  /** AD-40: write a folder's settings; the rules live in `../folder-settings.ts`. */
  app.put<{ Body: unknown }>('/api/folders/settings', async (request, reply) => {
    const done = await writeFolderSettings(stores, request.body)
    if (!done.ok) {
      return reply
        .code(done.status)
        .send({ error: done.error, ...(done.revision === undefined ? {} : { revision: done.revision }) })
    }
    const answer: FolderSettingsResponse = { settings: done.settings, revision: done.revision }
    return reply.code(200).send(answer)
  })

  app.get<{ Params: { '*': string }; Querystring: { store?: string } }>(
    '/api/pages/*',
    async (request, reply) => {
      const logical = request.params['*']
      if (isFolderSettingsPath(logical) || !stores.some((store) => safePagePath(store, logical))) {
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
          fields: parseFrontmatter(markdown),
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
    if (isFolderSettingsPath(logical) || !stores.some((store) => safePagePath(store, logical))) {
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
