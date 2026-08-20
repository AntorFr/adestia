/**
 * Extension discovery — reading a mounted directory, refusing loudly.
 *
 * Two properties this file exists to guarantee:
 *
 * 1. **The core knows no plugin by name.** It reads folders, validates
 *    manifests, and wires up whatever they declare. That ignorance is what
 *    makes a plugin shippable from another repository.
 * 2. **A broken plugin costs its own view, never the server.** Every failure
 *    is collected and reported; nothing throws its way out of here.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ManifestError,
  parsePluginManifest,
  parseSkinManifest,
  type PluginManifest,
  type SkinManifest,
} from '@antorfr/golem-schemas'

export interface DiscoveredPlugin {
  readonly manifest: PluginManifest
  /** Absolute path of the plugin folder. */
  readonly dir: string
  /** Whether the instance config turned it on. Discovery is not activation. */
  readonly active: boolean
}

export interface DiscoveredSkin {
  readonly manifest: SkinManifest
  readonly dir: string
}

export interface DiscoveryProblem {
  readonly id: string
  readonly reason: string
}

export interface PluginDiscovery {
  readonly plugins: readonly DiscoveredPlugin[]
  readonly problems: readonly DiscoveryProblem[]
}

export interface ActivationConfig {
  readonly apps: readonly string[]
  readonly features: readonly string[]
  readonly tools: readonly string[]
}

const MANIFEST = 'golem-plugin.json'
const SKIN_MANIFEST = 'golem-skin.json'

function isActive(manifest: PluginManifest, config: ActivationConfig): boolean {
  switch (manifest.kind) {
    case 'core':
      return true
    case 'app':
      return config.apps.includes(manifest.id)
    case 'feature':
      return config.features.includes(manifest.id)
    case 'tool':
      return config.tools.includes(manifest.id)
  }
}

async function readManifest(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function describeError(error: unknown): string {
  if (error instanceof ManifestError) return error.message
  if (error instanceof SyntaxError) return `manifest is not valid JSON: ${error.message}`
  return (error as Error).message
}

export async function discoverPlugins(
  dir: string,
  config: ActivationConfig,
): Promise<PluginDiscovery> {
  const plugins: DiscoveredPlugin[] = []
  const problems: DiscoveryProblem[] = []

  let entries: string[]
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    // A missing plugins directory is an instance with no plugins, not a fault.
    return { plugins: [], problems: [] }
  }

  for (const name of entries.sort()) {
    const folder = join(dir, name)
    let raw: unknown
    try {
      raw = await readManifest(join(folder, MANIFEST))
    } catch (error) {
      // A folder without a manifest is not a plugin — someone's notes, a
      // leftover checkout. Only a malformed manifest is a problem.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      problems.push({ id: name, reason: describeError(error) })
      continue
    }

    try {
      const manifest = parsePluginManifest(raw, name)
      plugins.push({ manifest, dir: folder, active: isActive(manifest, config) })
    } catch (error) {
      problems.push({ id: name, reason: describeError(error) })
    }
  }

  return { plugins, problems }
}

export async function discoverSkins(
  dir: string,
): Promise<{ skins: readonly DiscoveredSkin[]; problems: readonly DiscoveryProblem[] }> {
  const skins: DiscoveredSkin[] = []
  const problems: DiscoveryProblem[] = []

  let entries: string[]
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return { skins: [], problems: [] }
  }

  for (const name of entries.sort()) {
    const folder = join(dir, name)
    let raw: unknown
    try {
      raw = await readManifest(join(folder, SKIN_MANIFEST))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      problems.push({ id: name, reason: describeError(error) })
      continue
    }

    try {
      skins.push({ manifest: parseSkinManifest(raw, name), dir: folder })
    } catch (error) {
      problems.push({ id: name, reason: describeError(error) })
    }
  }

  return { skins, problems }
}

/**
 * What the front end is told: only ACTIVE plugins, and only their front-end
 * facets. An inactive plugin is absent from the payload entirely — the shell
 * imports what this list names and nothing else.
 */
export interface PluginPayload {
  readonly id: string
  readonly kind: string
  readonly base: string
  readonly view?: string
  readonly blocks?: string
  readonly chrome?: string
  readonly styles?: readonly string[]
  readonly tile?: { readonly label: string; readonly icon?: string; readonly route?: string }
}

export function frontendPayload(plugins: readonly DiscoveredPlugin[]): readonly PluginPayload[] {
  return plugins
    .filter((plugin) => plugin.active)
    .map(({ manifest }) => {
      const base = `/plugins/${manifest.id}/`
      return {
        id: manifest.id,
        kind: manifest.kind,
        base,
        ...(manifest.view ? { view: manifest.view } : {}),
        ...(manifest.blocks ? { blocks: manifest.blocks } : {}),
        ...(manifest.chrome ? { chrome: manifest.chrome } : {}),
        ...(manifest.styles ? { styles: manifest.styles } : {}),
        ...(manifest.tile ? { tile: manifest.tile } : {}),
      }
    })
}
