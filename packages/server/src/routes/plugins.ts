/**
 * The plugins this instance found, and the one thing a browser may change
 * about them: whether the file names each in the list of its kind.
 *
 * `loaded` is what booted; `wanted` is what the FILE says now, for the reason
 * `settings.ts` gives — the gap between them is the restart the screen offers.
 * Only an id the instance discovered can be switched, and only in the list
 * its manifest kind selects, so this is not a way to write any key of the file
 * (`extensions.sources`, `driver.command` and secrets stay behind its frontier).
 */

import type { FastifyInstance } from 'fastify'

import type { PluginProblem, PluginRow, PluginsPayload } from '@antorfr/adestia-schemas'

import type { DiscoveredPlugin, DiscoveryProblem } from '../extensions.js'
import { activationIn, readDocument, setActivation, writability } from '../settings-file.js'

interface PluginsDependencies {
  readonly configPath: string
  readonly plugins: readonly DiscoveredPlugin[]
  readonly problems: readonly DiscoveryProblem[]
  readonly pluginsDir: string
}

const LIST_OF_KIND = { app: 'apps', feature: 'features', tool: 'tools' } as const

function viewOf(problem: DiscoveryProblem): PluginProblem {
  return {
    id: problem.id,
    reason: problem.reason,
    ...(problem.code ? { code: problem.code } : {}),
    ...(problem.params ? { params: problem.params } : {}),
  }
}

export function registerPlugins(app: FastifyInstance, deps: PluginsDependencies): void {
  const file = deps.configPath

  app.get('/api/plugins', async (_request, reply) => {
    const read = await readDocument(file)
    const can = await writability(file)
    const unreadable = 'refusal' in read

    const rows: PluginRow[] = deps.plugins.map((plugin) => {
      const { manifest } = plugin
      const list = manifest.kind === 'core' ? undefined : LIST_OF_KIND[manifest.kind]
      // A file that does not parse says nothing: the screen then shows what is loaded.
      const wanted =
        manifest.kind === 'core' ? true : unreadable || !list ? plugin.active : activationIn(read.doc, list).includes(manifest.id)
      return {
        id: manifest.id,
        kind: manifest.kind,
        description: manifest.description,
        ...(manifest.version ? { version: manifest.version } : {}),
        origin: plugin.origin ?? { kind: 'folder' },
        loaded: plugin.active,
        wanted,
        problems: deps.problems
          .filter((problem) => problem.severity === 'degraded' && problem.id === manifest.id)
          .map(viewOf),
      }
    })

    const refused = deps.problems
      .filter((problem) => problem.severity === undefined || problem.severity === 'refused')
      .map(viewOf)

    const reason = unreadable ? read.refusal.reason : can.writable ? undefined : (can.reason ?? 'read-only')
    const payload: PluginsPayload = {
      plugins: rows,
      refused,
      file,
      writable: !unreadable && can.writable,
      ...(reason ? { readOnlyReason: reason } : {}),
      revision: unreadable ? '' : read.revision,
      pluginsDir: deps.pluginsDir,
    }
    return reply.send(payload)
  })

  app.put<{ Params: { id: string }; Body: { active?: unknown; revision?: unknown } }>(
    '/api/plugins/:id',
    async (request, reply) => {
      const active = request.body?.active
      if (typeof active !== 'boolean') return reply.code(400).send({ error: 'active must be true or false' })
      const revision = request.body?.revision
      if (revision !== undefined && typeof revision !== 'string') {
        return reply.code(400).send({ error: 'revision must be a string' })
      }

      // Matched against what was discovered, never interpolated into the file
      // unless it is one of those ids.
      const found = deps.plugins.find((plugin) => plugin.manifest.id === request.params.id)
      if (!found) return reply.code(404).send({ error: 'no such plugin on this instance' })
      if (found.manifest.kind === 'core') {
        return reply.code(409).send({ error: 'the core plugin is always on', kind: 'core' })
      }

      const result = await setActivation(
        file,
        LIST_OF_KIND[found.manifest.kind],
        found.manifest.id,
        active,
        revision,
      )
      if ('refusal' in result) {
        const status =
          result.refusal.kind === 'stale' ? 409 : result.refusal.kind === 'invalid' ? 400 : 503
        return reply.code(status).send({ error: result.refusal.reason, kind: result.refusal.kind })
      }
      return reply.send({ id: found.manifest.id, wanted: active, revision: result.revision })
    },
  )
}
