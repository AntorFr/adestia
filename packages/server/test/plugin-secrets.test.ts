/**
 * Secrets a plugin declares, and the boundary that makes declaring mean
 * something.
 */

import { describe, expect, it } from 'vitest'

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify from 'fastify'

import { parseConfig } from '../src/config.js'
import { mountPluginApis } from '../src/plugin-host.js'
import type { DiscoveredPlugin } from '../src/extensions.js'

describe('the instance secret table', () => {
  it('holds a named value', () => {
    const config = parseConfig('secrets:\n  GOOGLE_MAPS_API_KEY: abc123\n')
    expect(config.secrets['GOOGLE_MAPS_API_KEY']).toBe('abc123')
  })

  it('takes the value from the environment, so the file holds only wiring', () => {
    const config = parseConfig('secrets:\n  GOOGLE_MAPS_API_KEY: ${MAPS}\n', {
      MAPS: 'from-the-env',
    } as NodeJS.ProcessEnv)
    expect(config.secrets['GOOGLE_MAPS_API_KEY']).toBe('from-the-env')
  })

  it('REFUSES a placeholder whose variable is unset', () => {
    // A key that is literally "${MAPS}" fails somewhere far away, in a
    // request nobody is watching. It has to fail here instead.
    expect(() => parseConfig('secrets:\n  GOOGLE_MAPS_API_KEY: ${MAPS}\n', {} as NodeJS.ProcessEnv))
      .toThrow(/not set/)
  })

  it('refuses a name that is not one', () => {
    expect(() => parseConfig('secrets:\n  "../../etc/passwd": x\n')).toThrow(/not a secret name/)
    expect(() => parseConfig('secrets:\n  lowercase: x\n')).toThrow(/not a secret name/)
  })

  it('is empty rather than absent when nothing is configured', () => {
    // Every consumer can read it without checking; an instance with no
    // secrets is not a special case.
    expect(parseConfig('').secrets).toEqual({})
  })
})

describe('what a plugin actually receives', () => {
  const mount = async (
    manifests: { id: string; secrets?: string[] }[],
    secrets: Record<string, string>,
  ) => {
    const root = await mkdtemp(join(tmpdir(), 'adestia-secrets-'))
    const seen: Record<string, unknown> = {}
    const plugins = []
    for (const entry of manifests) {
      const dir = join(root, entry.id)
      await mkdir(dir, { recursive: true })
      // An API that records exactly what the host handed it.
      await writeFile(
        join(dir, 'api.mjs'),
        `export default async function api(app, opts) { globalThis.__seen ??= {}; globalThis.__seen[opts.pluginId] = opts.secrets }\n`,
      )
      plugins.push({
        dir,
        active: true,
        manifest: {
          schemaVersion: 1,
          id: entry.id,
          kind: 'app',
          description: '',
          api: './api.mjs',
          ...(entry.secrets ? { secrets: entry.secrets } : {}),
        },
      } as unknown as DiscoveredPlugin)
    }

    const app = Fastify()
    const problems = await mountPluginApis(app, plugins, {
      workspaceRoot: root,
      pagesRoot: root,
      dataDir: root,
      scheduleEnabled: false,
      secrets,
    })
    await app.ready()
    Object.assign(seen, (globalThis as { __seen?: Record<string, unknown> }).__seen ?? {})
    delete (globalThis as { __seen?: unknown }).__seen
    return { seen, problems }
  }

  it('hands a plugin the secret it declared', async () => {
    const { seen } = await mount([{ id: 'voyages', secrets: ['MAPS_KEY'] }], { MAPS_KEY: 'k' })
    expect(seen['voyages']).toEqual({ MAPS_KEY: 'k' })
  })

  it('gives the SAME key to every plugin that names it', async () => {
    // The reason names beat ownership: one key, one place to rotate it,
    // however many consumers.
    const { seen } = await mount(
      [
        { id: 'voyages', secrets: ['MAPS_KEY'] },
        { id: 'parcours', secrets: ['MAPS_KEY'] },
      ],
      { MAPS_KEY: 'shared' },
    )
    expect(seen['voyages']).toEqual({ MAPS_KEY: 'shared' })
    expect(seen['parcours']).toEqual({ MAPS_KEY: 'shared' })
  })

  it('never hands over a secret the plugin did not declare', async () => {
    // The declaration is a BOUNDARY, not a comment: without this, one
    // careless log leaks keys a plugin was never meant to know existed.
    const { seen } = await mount([{ id: 'todo' }], { MAPS_KEY: 'k', OTHER: 'x' })
    expect(seen['todo']).toEqual({})
  })

  it('says out loud when a declared secret is missing', async () => {
    // Absent rather than empty: a plugin handed '' fails later, in a
    // request, with an error naming the wrong thing.
    const { seen, problems } = await mount([{ id: 'voyages', secrets: ['MAPS_KEY'] }], {})
    expect(seen['voyages']).toEqual({})
    expect(problems[0]?.reason).toContain('MAPS_KEY')
  })
})
