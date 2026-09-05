/**
 * What an ACTIVE plugin contributes on the server: an API, and a setup step.
 *
 * The rule both obey: an inactive plugin contributes nothing. It mounts no
 * route and runs no command — consistent with having no tile and shipping no
 * code to the browser. Presence on disk was never activation, and this is the
 * surface where getting that wrong would be worst: a route answering into the
 * void, or a command running on an instance that never asked for it.
 *
 * The other rule: a broken plugin costs its own contribution. An API that
 * fails to import is reported and skipped, and the server keeps serving.
 */

import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import type { FastifyInstance } from 'fastify'

import type { DiscoveredPlugin } from './extensions.js'
import type { PagesService } from './stores.js'
import type { PluginManifest } from '@antorfr/adestia-schemas'

const execFileAsync = promisify(execFile)

/** A setup script gets this long before it is killed, in ms. */
export const SETUP_TIMEOUT_MS = 30_000

export interface HostProblem {
  readonly id: string
  readonly reason: string
  /** Off, or merely diminished. See `DiscoveryProblem` — same vocabulary. */
  readonly severity?: 'refused' | 'degraded'
  /** See `DiscoveryProblem` — same contract. */
  readonly code?: string
  readonly params?: Readonly<Record<string, string>>
}

/**
 * Runs each active plugin's `setup`, if it declares one.
 *
 * Run at EVERY startup, so a setup script is idempotent by contract. That is
 * stated in the authoring skill because the alternative — running it once and
 * remembering — means a recreated container silently loses whatever the script
 * wired up, and nobody notices until the first failure.
 */
export async function runSetups(
  plugins: readonly DiscoveredPlugin[],
  log: (message: string) => void,
): Promise<readonly HostProblem[]> {
  const problems: HostProblem[] = []

  for (const plugin of plugins) {
    if (!plugin.active || !plugin.manifest.setup) continue
    const script = resolve(plugin.dir, plugin.manifest.setup)

    try {
      // Checked before running: "not executable" and "failed" produce very
      // different fixes, and a permission bit is the more common of the two.
      await access(script, constants.X_OK)
    } catch {
      problems.push({
        id: plugin.manifest.id,
        reason: `setup script is missing or not executable: ${plugin.manifest.setup}`,
      })
      continue
    }

    try {
      const { stdout, stderr } = await execFileAsync(script, [], {
        cwd: plugin.dir,
        timeout: SETUP_TIMEOUT_MS,
        // A setup script that prints a megabyte is a script with a bug; the
        // cap keeps it from becoming the server's bug too.
        maxBuffer: 1024 * 1024,
      })
      const output = `${stdout}${stderr}`.trim()
      if (output) log(`setup "${plugin.manifest.id}": ${output.split('\n').slice(-3).join(' | ')}`)
    } catch (error) {
      // Reported, never fatal: an instance that refuses to boot because one
      // optional plugin's setup failed is an instance held hostage by its
      // least important part.
      problems.push({ id: plugin.manifest.id, reason: `setup failed: ${(error as Error).message}` })
    }
  }

  return problems
}

/**
 * Mounts each active plugin's `api` as a Fastify plugin.
 *
 * Every route lands under `/api/plugin/<id>/`, enforced by the host rather
 * than trusted to the plugin. A plugin registering `/api/turn` would otherwise
 * shadow the product's own route — and the failure would look like the chat
 * breaking, not like a plugin misbehaving.
 */
/**
 * What a plugin's API is told about the instance.
 *
 * Deliberately small, and deliberately paths rather than objects: a plugin
 * needs to find files, not to reach the driver, the secret store or another
 * plugin's data. Anything added here becomes part of the contract, so the
 * question for each field is not "would this be handy" but "would a plugin
 * that cannot do its job without it be a plugin worth having".
 */
export interface PluginApiContext {
  readonly workspaceRoot: string
  /**
   * Memory, as a service rather than a path.
   *
   * A plugin used to be handed `pagesRoot`, an absolute directory, so it would
   * not have to guess a folder name that is instance configuration. Correct
   * while the tree was ONE directory; the day it became several, that same
   * disclosure became the blindness it was meant to prevent — a plugin reading
   * one root shows nothing of the shared circle, on screen, in silence.
   *
   * So the physical layout stops being disclosed and starts being answered.
   * Logical paths in, logical paths out, each carrying its store.
   */
  readonly pages: PagesService
  readonly dataDir: string
  /** Whether scheduled turns are on — a plugin showing them must not lie. */
  readonly scheduleEnabled: boolean
  /** The instance's whole secret table; each plugin sees only what it declared. */
  readonly secrets?: Readonly<Record<string, string>>
}

/**
 * What one plugin's API is handed: the shared context, plus exactly the
 * secrets it DECLARED and the instance actually holds.
 *
 * Narrowed per plugin rather than passed whole. Handing every API the entire
 * table would make one careless `console.log` a leak of keys that plugin was
 * never meant to know existed — and would make the manifest's declaration a
 * comment rather than a boundary.
 *
 * A declared secret the instance does not hold is simply ABSENT, and the
 * refusal is a boot-time line rather than an empty string: a plugin handed
 * `''` fails later, in a request, with an error naming the wrong thing.
 */
function secretsFor(
  manifest: PluginManifest,
  available: Readonly<Record<string, string>>,
): { granted: Record<string, string>; missing: readonly string[] } {
  const granted: Record<string, string> = {}
  const missing: string[] = []
  for (const name of manifest.secrets ?? []) {
    if (available[name] === undefined) missing.push(name)
    else granted[name] = available[name]
  }
  return { granted, missing }
}

export async function mountPluginApis(
  app: FastifyInstance,
  plugins: readonly DiscoveredPlugin[],
  context: PluginApiContext,
): Promise<readonly HostProblem[]> {
  const problems: HostProblem[] = []

  for (const plugin of plugins) {
    if (!plugin.active || !plugin.manifest.api) continue
    const file = join(plugin.dir, plugin.manifest.api)

    try {
      const module = (await import(pathToFileURL(file).href)) as { default?: unknown }
      const register = module.default
      if (typeof register !== 'function') {
        problems.push({
          id: plugin.manifest.id,
          reason: 'api module must default-export a Fastify plugin function',
        })
        continue
      }

      const { granted, missing } = secretsFor(plugin.manifest, context.secrets ?? {})
      for (const name of missing) {
        // Loud, and by name: a plugin quietly missing its key fails later in
        // a request, with an error blaming the API it called. Reported as
        // DEGRADED rather than refused — the plugin mounts and works, minus
        // whatever that key bought. A trip still has a timeline without a
        // weather key.
        problems.push({
          id: plugin.manifest.id,
          severity: 'degraded',
          code: 'missing-secret',
          params: { name },
          reason: `runs without the secret ${name}, which this instance does not provide — whatever it needed that key for is off`,
        })
      }

      // The whole table never travels: `context.secrets` is replaced by the
      // narrowed one, so a plugin cannot read a key it did not declare even
      // by accident.
      const { secrets: _all, ...shared } = context
      await app.register(register as Parameters<FastifyInstance['register']>[0], {
        prefix: `/api/plugin/${plugin.manifest.id}`,
        ...shared,
        secrets: granted,
        pluginDir: plugin.dir,
        pluginId: plugin.manifest.id,
      })
    } catch (error) {
      // A broken plugin costs its view, not the gateway.
      problems.push({ id: plugin.manifest.id, reason: `api failed to load: ${(error as Error).message}` })
    }
  }

  return problems
}
