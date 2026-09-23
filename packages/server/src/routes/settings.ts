/**
 * The instance's own settings, read and written from the browser.
 *
 * Read from the FILE rather than from the loaded config, and the difference
 * matters on every screen after the first save: the running instance is what
 * it was at boot, the file is what it will be at the next one. A screen that
 * echoed the loaded config would show a freshly saved value as unchanged and
 * leave the operator wondering whether the button worked.
 *
 * Which also decides what this route says about restarts: it reports what the
 * file holds and what the catalogue says each key costs, and lets the screen
 * write the sentence. Nothing here restarts anything — a browser that can
 * bounce the process is a browser that can take the instance down, and on an
 * instance running `auth.mode: none` that is anybody who reaches the port.
 */

import type { FastifyInstance } from 'fastify'

import { SETTING_GROUPS, SETTINGS, type SettingsPayload, type SettingView } from '@antorfr/adestia-schemas'

import {
  applyChanges,
  readDocument,
  valueIn,
  writability,
  type SettingChange,
} from '../settings-file.js'

export interface SettingsDependencies {
  /** The config file this instance booted from. */
  readonly configPath: string
}

/** What a body must look like before anything touches the disk. */
function changesIn(body: unknown, issues: string[]): SettingChange[] {
  const raw = (body as { changes?: unknown })?.changes
  if (!Array.isArray(raw)) {
    issues.push('changes must be a list')
    return []
  }
  const changes: SettingChange[] = []
  for (const [index, entry] of raw.entries()) {
    const path = (entry as { path?: unknown })?.path
    if (!Array.isArray(path) || path.length === 0 || !path.every((one) => typeof one === 'string')) {
      issues.push(`changes[${index}].path must be a non-empty list of key names`)
      continue
    }
    changes.push({ path: path as string[], value: (entry as { value?: unknown })?.value })
  }
  return changes
}

export function registerSettings(app: FastifyInstance, deps: SettingsDependencies): void {
  const file = deps.configPath

  app.get('/api/settings', async (_request, reply) => {
    const read = await readDocument(file)
    const can = await writability(file)
    if ('refusal' in read) {
      // The catalogue still travels: an operator whose file will not parse
      // needs to see WHICH settings this screen knows about, and the reason
      // the fields are inert, rather than an empty page.
      const payload: SettingsPayload = {
        groups: SETTING_GROUPS,
        values: SETTINGS.map((spec) => ({
          path: spec.path,
          value: spec.fallback,
          source: 'default' as const,
        })),
        file,
        writable: false,
        readOnlyReason: read.refusal.reason,
        revision: '',
      }
      return reply.send(payload)
    }
    const values: SettingView[] = SETTINGS.map((spec) => ({
      path: spec.path,
      ...valueIn(read.doc, spec),
    }))
    const payload: SettingsPayload = {
      groups: SETTING_GROUPS,
      values,
      file,
      writable: can.writable,
      ...(can.writable ? {} : { readOnlyReason: can.reason ?? 'read-only' }),
      revision: read.revision,
    }
    return reply.send(payload)
  })

  app.put<{ Body: { changes?: unknown; revision?: unknown } }>(
    '/api/settings',
    async (request, reply) => {
      const issues: string[] = []
      const changes = changesIn(request.body, issues)
      if (issues.length > 0) return reply.code(400).send({ error: issues.join('; ') })

      const revision = request.body?.revision
      if (revision !== undefined && typeof revision !== 'string') {
        return reply.code(400).send({ error: 'revision must be a string' })
      }

      const result = await applyChanges(file, changes, revision)
      if ('refusal' in result) {
        // Three different noes, three different things for the operator to
        // do: fix the value, reload the screen, or change the mount. A single
        // 400 for all three would make the screen guess which.
        const status =
          result.refusal.kind === 'stale' ? 409 : result.refusal.kind === 'invalid' ? 400 : 503
        return reply.code(status).send({ error: result.refusal.reason, kind: result.refusal.kind })
      }

      // The saved state, read back from the file rather than echoed from the
      // request: what the screen then shows is what the next boot will read.
      const read = await readDocument(file)
      const values: SettingView[] =
        'refusal' in read
          ? []
          : SETTINGS.map((spec) => ({ path: spec.path, ...valueIn(read.doc, spec) }))
      return reply.send({ revision: result.revision, values })
    },
  )
}
