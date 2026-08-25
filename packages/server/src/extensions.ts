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
  /**
   * Whether the extension is OFF or merely diminished.
   *
   * Absent means refused, which is the older and the commoner case. But a
   * plugin can now be perfectly active and still have something to report —
   * a declared secret the instance does not hold turns off its derived
   * features and nothing else. Filing that under "refused" would send
   * somebody hunting for a plugin that is working, so the two are told apart
   * here rather than by reading the sentence.
   */
  readonly severity?: 'refused' | 'degraded'
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

/** Which config list a kind is activated from. */
const LIST_FOR_KIND: Readonly<Record<string, keyof ActivationConfig>> = {
  app: 'apps',
  feature: 'features',
  tool: 'tools',
}

/**
 * Names in the config that activated nothing.
 *
 * Discovery is not activation, which is the right rule — but its failure mode
 * is silence. A typo, or an `app` named under `features`, produces an instance
 * that boots cleanly and is simply missing a tile, with nothing anywhere
 * saying why. The skin already gets told when it is configured and absent;
 * plugins deserve the same courtesy.
 */
export function unmatchedActivations(
  plugins: readonly DiscoveredPlugin[],
  config: ActivationConfig,
): readonly { id: string; list: keyof ActivationConfig; reason: string }[] {
  const unmatched: { id: string; list: keyof ActivationConfig; reason: string }[] = []
  for (const list of ['apps', 'features', 'tools'] as const) {
    for (const id of config[list]) {
      const found = plugins.find((plugin) => plugin.manifest.id === id)
      if (!found) {
        unmatched.push({ id, list, reason: 'no plugin by that name was found' })
      } else if (!found.active) {
        // It exists and it is well-formed; it is simply filed under the wrong
        // heading, which is the mistake worth naming precisely.
        const belongs = LIST_FOR_KIND[found.manifest.kind]
        unmatched.push({
          id,
          list,
          reason: belongs
            ? `it is a ${found.manifest.kind}, so it activates from \`${belongs}\``
            : `it is a ${found.manifest.kind} and does not activate from a list`,
        })
      }
    }
  }
  return unmatched
}

/**
 * Two active plugins claiming the same page `type`.
 *
 * The same silence `unmatchedActivations` guards against a config typo — an
 * instance boots cleanly, logs "N of M active", and one of the two plugins
 * quietly loses pages to the other's filter, or both partially match the
 * same page. Checked across ACTIVE plugins only: two inactive ones sharing a
 * word is not yet anybody's problem, and a plugin that never activates here
 * must not block one that does.
 */
export function claimedTypeCollisions(
  plugins: readonly DiscoveredPlugin[],
): readonly { type: string; ids: readonly string[] }[] {
  const claims = new Map<string, string[]>()
  for (const plugin of plugins) {
    if (!plugin.active) continue
    for (const type of plugin.manifest.types ?? []) {
      const holders = claims.get(type) ?? []
      holders.push(plugin.manifest.id)
      claims.set(type, holders)
    }
  }
  return [...claims.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([type, ids]) => ({ type, ids }))
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
  /** What the plugin says it is — a custom home's tile subtitle. */
  readonly description: string
  /** Page folders this plugin's tile already stands for. */
  readonly absorbs?: readonly string[]
  readonly base: string
  readonly view?: string
  readonly blocks?: string
  readonly chrome?: string
  readonly styles?: readonly string[]
  readonly tile?: {
    readonly label: string
    readonly icon?: string
    readonly glyph?: string
    readonly hue?: string
    readonly route?: string
  }
}

export function frontendPayload(plugins: readonly DiscoveredPlugin[]): readonly PluginPayload[] {
  return plugins
    .filter((plugin) => plugin.active)
    .map(({ manifest }) => {
      const base = `/plugins/${manifest.id}/`
      return {
        id: manifest.id,
        kind: manifest.kind,
        description: manifest.description,
        ...(manifest.absorbs ? { absorbs: manifest.absorbs } : {}),
        base,
        ...(manifest.view ? { view: manifest.view } : {}),
        ...(manifest.blocks ? { blocks: manifest.blocks } : {}),
        ...(manifest.chrome ? { chrome: manifest.chrome } : {}),
        ...(manifest.styles ? { styles: manifest.styles } : {}),
        ...(manifest.tile ? { tile: manifest.tile } : {}),
      }
    })
}
