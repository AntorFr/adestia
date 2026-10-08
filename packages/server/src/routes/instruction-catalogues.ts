/**
 * The catalogue routes: declare a repository of instructions, look inside it,
 * import what is wanted, keep it fresh.
 *
 * The routes decide nothing about WHAT an item is or WHERE it lands — the scan
 * and the materialiser (`instruction-catalogues.ts`) own that. They resolve a
 * request to a declared catalogue and a scanned item, and map the failures to
 * codes: an unknown thing is 404, a thing this engine has no zone for is 422,
 * a collision with a file already there is 409, a forge that cannot be reached
 * is 502.
 *
 * An item is always looked up in the SCAN, never built from the request path:
 * the path in the URL names an item, it is not a file to be read.
 */

import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { type Driver, instructionZones } from '@antorfr/adestia-drivers'

import type { ExtensionSource } from '../config/types.js'
import {
  type CatalogueItem,
  importCatalogueItem,
  materializeItem,
  scanCatalogue,
  withdrawCatalogueItem,
  withdrawItem,
} from '../instruction-catalogues.js'
import type {
  InstructionCatalogue,
  InstructionCataloguesStore,
} from '../instruction-catalogues-store.js'
import { fetchSources } from '../sources.js'

export interface CatalogueRoutesOptions {
  readonly driver: Driver
  readonly workspaceRoot: string
  readonly dataDir: string
  readonly store: InstructionCataloguesStore
  readonly log?: (message: string) => void
}

/** A catalogue as the browser sees it: the token is reported, never returned. */
function publicCatalogue(catalogue: InstructionCatalogue) {
  return {
    id: catalogue.id,
    repo: catalogue.repo,
    ref: catalogue.ref,
    hasToken: catalogue.token !== undefined,
    imports: catalogue.imports,
  }
}

/** A folder name derived from the address: `https://host/org/name.git` → `name`. */
function idFromRepo(repo: string): string {
  const last = repo.replace(/[/\\]+$/, '').split(/[/\\:]/).pop() ?? ''
  const cleaned = last
    .replace(/\.git$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
  return cleaned === '' ? 'catalogue' : cleaned
}

const VALID_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function registerInstructionCatalogues(
  app: FastifyInstance,
  { driver, workspaceRoot, dataDir, store, log = () => undefined }: CatalogueRoutesOptions,
): void {
  const cacheDir = join(dataDir, 'catalogues')
  const cloneOf = (id: string): string => join(cacheDir, id)

  const sourceOf = (catalogue: InstructionCatalogue): ExtensionSource => ({
    kind: 'git',
    name: catalogue.id,
    repo: catalogue.repo,
    ref: catalogue.ref,
    ...(catalogue.token !== undefined ? { token: catalogue.token } : {}),
  })

  /** Fetches the clone; the reason it failed when nothing usable came of it. */
  async function fetchClone(catalogue: InstructionCatalogue): Promise<string | undefined> {
    const { roots, problems } = await fetchSources([sourceOf(catalogue)], cacheDir, log)
    if (roots.length === 0) return problems[0]?.reason ?? 'could not be fetched'
    return undefined
  }

  const isCloned = (id: string): Promise<boolean> =>
    stat(join(cloneOf(id), '.git')).then(
      (info) => info.isDirectory(),
      () => false,
    )

  app.get('/api/instruction-catalogues', async () => ({
    catalogues: (await store.list()).map(publicCatalogue),
  }))

  app.post<{ Body: { repo?: unknown; ref?: unknown; token?: unknown; id?: unknown } }>(
    '/api/instruction-catalogues',
    async (request, reply) => {
      const { repo, ref, token, id: requested } = request.body ?? {}
      if (typeof repo !== 'string' || repo.trim() === '') {
        return reply.code(400).send({ error: 'repo is required' })
      }
      // No default, for the reason a plugin source has none: what is fetched
      // is chosen, not whatever the default branch happens to be today.
      if (typeof ref !== 'string' || ref.trim() === '') {
        return reply.code(400).send({ error: 'ref is required' })
      }
      if (token !== undefined && (typeof token !== 'string' || token === '')) {
        return reply.code(400).send({ error: 'token must be a non-empty string' })
      }
      if (requested !== undefined && (typeof requested !== 'string' || !VALID_ID.test(requested))) {
        return reply.code(400).send({ error: 'id must be a plain name' })
      }
      const id = (requested as string | undefined) ?? idFromRepo(repo.trim())

      const created = await store.update(async (catalogues) => {
        if (catalogues.some((candidate) => candidate.id === id)) {
          return { catalogues, result: undefined }
        }
        const catalogue: InstructionCatalogue = {
          id,
          repo: repo.trim(),
          ref: ref.trim(),
          ...(typeof token === 'string' ? { token } : {}),
          imports: [],
        }
        return { catalogues: [...catalogues, catalogue], result: catalogue }
      })
      if (!created) return reply.code(409).send({ error: `a catalogue "${id}" is already declared` })
      return reply.code(201).send(publicCatalogue(created))
    },
  )

  app.delete<{ Params: { id: string } }>('/api/instruction-catalogues/:id', async (request, reply) => {
    const { id } = request.params
    // The copies it delivered go with it: an import whose catalogue is gone
    // could never be refreshed or withdrawn again.
    const removed = await store.update(async (catalogues) => {
      const catalogue = catalogues.find((candidate) => candidate.id === id)
      return {
        catalogues: catalogues.filter((candidate) => candidate.id !== id),
        result: catalogue,
      }
    })
    if (!removed) return reply.code(404).send({ error: 'no such catalogue' })
    for (const entry of removed.imports) {
      await withdrawItem(workspaceRoot, entry.landedAt)
    }
    return reply.code(204).send()
  })

  /** The declared catalogue and its scanned items, fetching when never cloned. */
  async function scanned(
    id: string,
  ): Promise<
    | { readonly catalogue: InstructionCatalogue; readonly items: readonly CatalogueItem[] }
    | { readonly status: 404 | 502; readonly error: string }
  > {
    const catalogue = (await store.list()).find((candidate) => candidate.id === id)
    if (!catalogue) return { status: 404, error: 'no such catalogue' }
    if (!(await isCloned(id))) {
      const failure = await fetchClone(catalogue)
      if (failure !== undefined) return { status: 502, error: failure }
    }
    return { catalogue, items: await scanCatalogue(cloneOf(id)) }
  }

  app.get<{ Params: { id: string } }>('/api/instruction-catalogues/:id/items', async (request, reply) => {
    const found = await scanned(request.params.id)
    if ('status' in found) return reply.code(found.status).send({ error: found.error })
    const zones = instructionZones(driver)
    return {
      items: found.items.map((item) => {
        const imported = found.catalogue.imports.find((entry) => entry.itemPath === item.itemPath)
        return {
          ...item,
          // Greyed, not hidden — see technique.md: the catalogue offers it
          // even if this engine cannot receive it.
          importable: zones.some((zone) => zone.kind === item.kind),
          imported: imported !== undefined,
          ...(imported ? { landedAt: imported.landedAt } : {}),
        }
      }),
    }
  })

  app.put<{ Params: { id: string; '*': string } }>(
    '/api/instruction-catalogues/:id/items/*',
    async (request, reply) => {
      const found = await scanned(request.params.id)
      if ('status' in found) return reply.code(found.status).send({ error: found.error })
      const item = found.items.find((candidate) => candidate.itemPath === request.params['*'])
      if (!item) return reply.code(404).send({ error: 'no such item in this catalogue' })

      const zones = instructionZones(driver)
      if (!zones.some((zone) => zone.kind === item.kind)) {
        return reply.code(422).send({
          error: `"${item.itemPath}" is a ${item.kind}, and the active driver declares no ${item.kind} zone to land it in`,
        })
      }
      try {
        const imported = await importCatalogueItem(
          store,
          found.catalogue.id,
          cloneOf(found.catalogue.id),
          workspaceRoot,
          zones,
          item,
        )
        return imported
      } catch (error) {
        return reply.code(409).send({ error: (error as Error).message })
      }
    },
  )

  app.delete<{ Params: { id: string; '*': string } }>(
    '/api/instruction-catalogues/:id/items/*',
    async (request, reply) => {
      const catalogue = (await store.list()).find((candidate) => candidate.id === request.params.id)
      if (!catalogue) return reply.code(404).send({ error: 'no such catalogue' })
      if (!catalogue.imports.some((entry) => entry.itemPath === request.params['*'])) {
        return reply.code(404).send({ error: 'this item is not imported' })
      }
      await withdrawCatalogueItem(store, workspaceRoot, catalogue.id, request.params['*'])
      return reply.code(204).send()
    },
  )

  app.post<{ Params: { id: string } }>('/api/instruction-catalogues/:id/refresh', async (request, reply) => {
    const catalogue = (await store.list()).find((candidate) => candidate.id === request.params.id)
    if (!catalogue) return reply.code(404).send({ error: 'no such catalogue' })

    const failure = await fetchClone(catalogue)
    if (failure !== undefined) return reply.code(502).send({ error: failure })

    const items = await scanCatalogue(cloneOf(catalogue.id))
    const zones = instructionZones(driver)
    const refreshed: string[] = []
    // An import the new tree no longer offers is left where it is and
    // reported: deleting a person's working copy because upstream moved a
    // folder is not a refresh.
    const missing: string[] = []
    for (const entry of catalogue.imports) {
      const item = items.find((candidate) => candidate.itemPath === entry.itemPath)
      if (!item) {
        missing.push(entry.itemPath)
        continue
      }
      await materializeItem({
        workspaceRoot,
        zones,
        catalogueRoot: cloneOf(catalogue.id),
        item,
        catalogueId: catalogue.id,
        landedAt: entry.landedAt,
      })
      refreshed.push(entry.itemPath)
    }
    return { refreshed, missing }
  })
}
