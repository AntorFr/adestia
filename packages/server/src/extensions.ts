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

import { forgetContributedBlocks, registerBlocks } from '@antorfr/golem-content'
import {
  ManifestError,
  parsePluginManifest,
  parseSkinManifest,
  type PluginBlockSpec,
  type PluginManifest,
  type PluginMcpServer,
  type SkinManifest,
} from '@antorfr/golem-schemas'

/**
 * The shape a driver is handed lives in the driver contract; this layer only
 * decides WHICH servers it hands over.
 *
 * Worth stating about `headers`: it is the operator's alone. It is where an
 * HTTP server's authorization goes, and a plugin carrying a token in its
 * manifest would put a credential in a folder anybody can drop into — the very
 * thing the secrets contract exists to prevent. A plugin needing an
 * authenticated server asks the operator to declare it. The manifest schema
 * has no `headers`, so this is enforced rather than merely advised.
 */
import type { McpServer } from '@antorfr/golem-drivers'
export type { McpServer }

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
  /**
   * A translatable identity for this problem, when it has one.
   *
   * `reason` is English prose written where the problem was detected, which is
   * right for a log and wrong under a translated heading — a French panel with
   * an English sentence in it reads as a half-finished product. A problem that
   * a person is meant to ACT on carries a code and its parameters instead, and
   * the shell says it in the instance's language.
   *
   * Codeless problems stay prose on purpose: a malformed manifest is a
   * developer's error, read once while fixing a file, and inventing a
   * translated sentence for each of them would be a vocabulary nobody reads.
   */
  readonly code?: string
  readonly params?: Readonly<Record<string, string>>
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
 * Teaches the content engine the blocks the ACTIVE plugins declare.
 *
 * Called once at startup, before a single page is read: `editable` and the
 * 422 on save both run through `validateDocument`, so a block registered
 * afterwards would be a page refused at boot and accepted a second later.
 *
 * The registry is cleared first. An instance registers once, but a test that
 * builds two instances in one process would otherwise inherit the first
 * one's vocabulary — a page passing validation because of a plugin that is
 * not even mounted here.
 *
 * @returns the collisions, so the caller can NAME them at startup. A block
 *   silently not registered is a page that opens read-only for a reason
 *   nobody can find.
 */
export function registerPluginVocabulary(
  plugins: readonly DiscoveredPlugin[],
): readonly { readonly id: string; readonly name: string }[] {
  forgetContributedBlocks()
  const collisions: { id: string; name: string }[] = []
  for (const plugin of plugins) {
    if (!plugin.active) continue
    const vocabulary = plugin.manifest.vocabulary
    if (!vocabulary) continue
    for (const name of registerBlocks(vocabulary)) {
      collisions.push({ id: plugin.manifest.id, name })
    }
  }
  return collisions
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

/**
 * The outbound MCP servers this instance will hand its driver, from the two
 * layers the product owns.
 *
 * The third layer — the CLI's own `.mcp.json` — is deliberately absent: it is
 * the user's and the agent's, and Golem neither parses nor translates it. Same
 * doctrine as instructions.
 *
 * The OPERATOR wins a name conflict. Not arbitrary: a plugin is something you
 * dropped in a folder, the config is something you wrote — and when the two
 * disagree, the one you wrote is the one you meant. The loser is REPORTED, by
 * name, because a server silently replaced by another under the same name is a
 * tool call going somewhere nobody chose.
 *
 * Plugins are read only while ACTIVE, the same rule as their APIs: turning a
 * plugin off takes its server with it.
 */
export function mcpServersFor(
  operator: readonly McpServer[],
  plugins: readonly DiscoveredPlugin[],
): { servers: readonly McpServer[]; problems: readonly DiscoveryProblem[] } {
  const problems: DiscoveryProblem[] = []
  const byName = new Map<string, McpServer>()
  const owner = new Map<string, string>()

  for (const server of operator) {
    byName.set(server.name, server)
    owner.set(server.name, 'the operator configuration')
  }

  for (const plugin of plugins) {
    if (!plugin.active) continue
    for (const server of plugin.manifest.mcpServers ?? []) {
      const held = owner.get(server.name)
      if (held !== undefined) {
        problems.push({
          id: plugin.manifest.id,
          severity: 'degraded',
          reason: `brings the MCP server "${server.name}", which ${held} already declares — the plugin's is not wired`,
        })
        continue
      }
      byName.set(server.name, server)
      owner.set(server.name, `the plugin "${plugin.manifest.id}"`)
    }
  }

  return { servers: [...byName.values()], problems }
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
  /** Block specs, so the browser registers the same vocabulary the server did. */
  readonly vocabulary?: Readonly<Record<string, PluginBlockSpec>>
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
        ...(manifest.vocabulary ? { vocabulary: manifest.vocabulary } : {}),
        ...(manifest.chrome ? { chrome: manifest.chrome } : {}),
        ...(manifest.styles ? { styles: manifest.styles } : {}),
        ...(manifest.tile ? { tile: manifest.tile } : {}),
      }
    })
}
