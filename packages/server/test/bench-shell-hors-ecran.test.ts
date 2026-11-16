/**
 * What bench/tests/shell-besoin.test.mjs proved through a browser about the plugin folders the
 * server refuses, and that discovery does: the two refusals of the bench seed (a manifest whose
 * description is not a string, a folder that says another name) keep the validator's own
 * line, the other plugins keep loading. The heading's language is the shell's and stays on screen.
 * See docs/tests-ecran/bench-plugins-shell.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { discoverPlugins } from '../src/extensions.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterAll(cleanTmp)

let root: string

const manifest = (value: unknown) => JSON.stringify({ schemaVersion: 1, ...(value as object) }, null, 2)
async function put(folder: string, value: unknown): Promise<void> {
  const dir = join(root, 'plugins', folder)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'adestia-plugin.json'), manifest(value))
}

beforeAll(async () => {
  root = await tmpDir('adestia-shell-hors-ecran-')
  // The shapes bench/seed/_base.mjs plants.
  await put('bench-refused', { id: 'autre-nom', kind: 'app', description: 'Refused on purpose.' })
  await put('bench-invalid', { id: 'bench-invalid', kind: 'app', description: 42 })
  await put('bench-notes', { id: 'bench-notes', kind: 'tool', description: 'Brings a skill and nothing else.' })
})

describe('the plugin folders the bench seed refuses', () => {
  const activation = { apps: [], features: [], tools: ['bench-notes'] }

  it('keeps the validator line of a manifest whose description is not a string', async () => {
    const { problems } = await discoverPlugins(join(root, 'plugins'), activation)
    const invalid = problems.find((p) => p.id === 'bench-invalid')
    expect(invalid?.reason).toContain('Invalid plugin manifest for "bench-invalid"')
    expect(invalid?.reason).toContain('description: must be a non-empty string')
  })

  it('keeps the line of a folder whose manifest says another name', async () => {
    const { problems } = await discoverPlugins(join(root, 'plugins'), activation)
    const refused = problems.find((p) => p.id === 'bench-refused')
    expect(refused?.reason).toContain('id: is "autre-nom" but the folder is "bench-refused"')
  })

  it('refuses exactly those two and still loads the sound plugin', async () => {
    const { plugins, problems } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(problems.map((p) => p.id).sort()).toEqual(['bench-invalid', 'bench-refused'])
    expect(plugins.map((p) => p.manifest.id)).toEqual(['bench-notes'])
  })
})
