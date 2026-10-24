/**
 * Re-copying what a catalogue's imports came from: the one gesture behind the
 * Refresh button and the reload at boot, so the two cannot drift apart.
 */

import { join } from 'node:path'

import { type Driver, instructionZones } from '@antorfr/adestia-drivers'

import type { ExtensionSource } from './config/types.js'
import { materializeItem, scanCatalogue } from './instruction-catalogues.js'
import type { InstructionCatalogue } from './instruction-catalogues-store.js'
import { fetchSources } from './sources.js'

interface CatalogueRefreshContext {
  readonly driver: Driver
  readonly workspaceRoot: string
  readonly dataDir: string
  readonly log?: (message: string) => void
}

/** Where a catalogue's clone sits, apart from plugin sources. */
export const catalogueClone = (dataDir: string, id: string): string => join(dataDir, 'catalogues', id)

function catalogueSource(catalogue: InstructionCatalogue): ExtensionSource {
  return {
    kind: 'git',
    name: catalogue.id,
    repo: catalogue.repo,
    ref: catalogue.ref,
    ...(catalogue.token !== undefined ? { token: catalogue.token } : {}),
  }
}

/** Fetches the clone; the reason it failed when nothing usable came of it. */
export async function fetchCatalogueClone(
  catalogue: InstructionCatalogue,
  { dataDir, log = () => undefined }: CatalogueRefreshContext,
): Promise<string | undefined> {
  const { roots, problems } = await fetchSources([catalogueSource(catalogue)], join(dataDir, 'catalogues'), log)
  if (roots.length === 0) return problems[0]?.reason ?? 'could not be fetched'
  return undefined
}

/**
 * Fetches, then re-copies every import the new tree still offers.
 *
 * An import the tree no longer offers is left where it is and reported:
 * deleting a person's working copy because upstream moved a folder is not a
 * refresh.
 */
export async function refreshCatalogue(
  catalogue: InstructionCatalogue,
  context: CatalogueRefreshContext,
): Promise<{ failure: string } | { refreshed: string[]; missing: string[] }> {
  const failure = await fetchCatalogueClone(catalogue, context)
  if (failure !== undefined) return { failure }

  const root = catalogueClone(context.dataDir, catalogue.id)
  const items = await scanCatalogue(root)
  const zones = instructionZones(context.driver)
  const refreshed: string[] = []
  const missing: string[] = []
  for (const entry of catalogue.imports) {
    const item = items.find((candidate) => candidate.itemPath === entry.itemPath)
    if (!item) {
      missing.push(entry.itemPath)
      continue
    }
    await materializeItem({
      workspaceRoot: context.workspaceRoot,
      zones,
      catalogueRoot: root,
      item,
      catalogueId: catalogue.id,
      landedAt: entry.landedAt,
    })
    refreshed.push(entry.itemPath)
  }
  return { refreshed, missing }
}

/**
 * Reloads every catalogue that has imports, at boot.
 *
 * Within a ceiling: a repository that does not answer must not hold the
 * instance down, so past `ceilingMs` the boot goes on and the reload finishes
 * on its own. Catalogues are fetched one after the other, and one that fails
 * leaves its copies where they were.
 */
export async function refreshCataloguesAtBoot(
  catalogues: readonly InstructionCatalogue[],
  context: CatalogueRefreshContext,
  ceilingMs = 20_000,
): Promise<void> {
  const log = context.log ?? (() => undefined)
  const all = (async () => {
    for (const catalogue of catalogues) {
      if (catalogue.imports.length === 0) continue
      try {
        const result = await refreshCatalogue(catalogue, context)
        if ('failure' in result) {
          log(`catalogue "${catalogue.id}" not reloaded — ${result.failure}`)
        } else {
          for (const path of result.missing) {
            log(`catalogue "${catalogue.id}": ${path} is no longer offered, copy kept`)
          }
        }
      } catch (error) {
        log(`catalogue "${catalogue.id}" not reloaded — ${(error as Error).message}`)
      }
    }
  })()
  let timer: NodeJS.Timeout | undefined
  const ceiling = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ceilingMs)
    timer.unref()
  })
  await Promise.race([all, ceiling])
  clearTimeout(timer)
}
