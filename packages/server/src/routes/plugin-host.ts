/**
 * The plugin API mount: each ACTIVE plugin's `api` module is registered under
 * `/api/plugin/<id>`. An inactive plugin mounts nothing; a broken one costs
 * only its own contribution (see `../plugin-host.ts`).
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { PluginManifest } from '@antorfr/adestia-schemas'
import type { FastifyInstance } from 'fastify'

import type { DiscoveredPlugin } from '../extensions.js'
import type { HostProblem, PluginApiContext } from '../plugin-host.js'

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
