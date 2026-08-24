import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  claimedTypeCollisions,
  discoverPlugins,
  discoverSkins,
  frontendPayload,
  unmatchedActivations,
  type DiscoveredPlugin,
} from '../src/extensions.js'

let root: string

async function plugin(id: string, manifest: unknown | string): Promise<void> {
  const dir = join(root, 'plugins', id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'golem-plugin.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  )
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-ext-'))

  await plugin('workbench', {
    schemaVersion: 1,
    id: 'workbench',
    kind: 'app',
    description: 'A workbook.',
    view: './web/app.js',
    styles: ['./web/app.css'],
    tile: { label: 'Workbench', icon: '🪚' },
  })
  await plugin('trips', {
    schemaVersion: 1,
    id: 'trips',
    kind: 'app',
    description: 'Trip planner.',
    view: './web/app.js',
  })
  await plugin('scan', {
    schemaVersion: 1,
    id: 'scan',
    kind: 'feature',
    description: 'Barcode reader.',
    chrome: './web/chrome.js',
  })
  await plugin('git', { schemaVersion: 1, id: 'git', kind: 'tool', description: 'Publish code.' })
  await plugin('notes', {
    schemaVersion: 1,
    id: 'notes',
    kind: 'core',
    description: 'The writing contract.',
    skills: ['./skills/notes/SKILL.md'],
  })
  await plugin('broken', '{ not json')
  await plugin('mislabelled', {
    schemaVersion: 1,
    id: 'something-else',
    kind: 'app',
    description: 'Lies about its id.',
  })
  await plugin('outdated', {
    schemaVersion: 99,
    id: 'outdated',
    kind: 'app',
    description: 'From another era.',
  })
  // A folder with no manifest at all: someone's notes, a leftover checkout.
  await mkdir(join(root, 'plugins', 'just-a-folder'), { recursive: true })

  const skinDir = join(root, 'skins', 'amber')
  await mkdir(skinDir, { recursive: true })
  await writeFile(
    join(skinDir, 'golem-skin.json'),
    JSON.stringify({ schemaVersion: 1, id: 'amber', description: 'Amber and monospace.' }),
  )
})

const activation = { apps: ['workbench'], features: ['scan'], tools: [] }

describe('discovery', () => {
  it('finds every well-formed plugin', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(plugins.map((p) => p.manifest.id).sort()).toEqual([
      'git',
      'notes',
      'scan',
      'trips',
      'workbench',
    ])
  })

  it('ignores a folder without a manifest rather than complaining', async () => {
    const { problems } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(problems.map((p) => p.id)).not.toContain('just-a-folder')
  })

  it('reports each broken plugin and keeps serving the rest', async () => {
    // A broken plugin costs its own view, never the server.
    const { plugins, problems } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(problems.map((p) => p.id).sort()).toEqual(['broken', 'mislabelled', 'outdated'])
    expect(plugins.length).toBe(5)
  })

  it('says WHY a plugin was refused', async () => {
    const { problems } = await discoverPlugins(join(root, 'plugins'), activation)
    const reasons = Object.fromEntries(problems.map((p) => [p.id, p.reason]))
    expect(reasons['broken']).toContain('not valid JSON')
    expect(reasons['mislabelled']).toContain('but the folder is "mislabelled"')
    expect(reasons['outdated']).toContain('this build understands 1')
  })

  it('treats a missing plugins directory as an instance with no plugins', async () => {
    const { plugins, problems } = await discoverPlugins(join(root, 'nowhere'), activation)
    expect(plugins).toEqual([])
    expect(problems).toEqual([])
  })
})

describe('activation', () => {
  it('activates core plugins unconditionally', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(plugins.find((p) => p.manifest.id === 'notes')?.active).toBe(true)
  })

  it('leaves a discovered plugin off until config names it', async () => {
    // Mounting a folder must never be enough to turn code on.
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(plugins.find((p) => p.manifest.id === 'trips')?.active).toBe(false)
    expect(plugins.find((p) => p.manifest.id === 'workbench')?.active).toBe(true)
  })

  it('gates each kind on its own axis', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    const active = Object.fromEntries(plugins.map((p) => [p.manifest.id, p.active]))
    // scan is listed under features, git is a tool nobody enabled.
    expect(active).toMatchObject({ scan: true, git: false })
  })

  it('does not let an app be enabled through the wrong list', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), {
      apps: [],
      features: ['workbench'],
      tools: ['workbench'],
    })
    expect(plugins.find((p) => p.manifest.id === 'workbench')?.active).toBe(false)
  })
})

describe('frontend payload', () => {
  it('carries only active plugins', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    expect(frontendPayload(plugins).map((p) => p.id).sort()).toEqual(['notes', 'scan', 'workbench'])
  })

  it('gives the shell a base URL and the facets to import', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    const workbench = frontendPayload(plugins).find((p) => p.id === 'workbench')
    expect(workbench).toMatchObject({
      id: 'workbench',
      kind: 'app',
      base: '/plugins/workbench/',
      view: './web/app.js',
      styles: ['./web/app.css'],
      tile: { label: 'Workbench', icon: '🪚' },
    })
    // The description travels too: a custom home renders it as the tile's
    // subtitle, and inventing one client-side would put words in the
    // plugin's mouth.
    expect(typeof workbench?.description).toBe('string')
  })

  it('omits facets a plugin does not declare', async () => {
    const { plugins } = await discoverPlugins(join(root, 'plugins'), activation)
    const notes = frontendPayload(plugins).find((p) => p.id === 'notes')
    expect(notes).not.toHaveProperty('view')
    expect(notes).not.toHaveProperty('chrome')
  })
})

describe('skins', () => {
  it('discovers a skin folder', async () => {
    const { skins, problems } = await discoverSkins(join(root, 'skins'))
    expect(skins.map((s) => s.manifest.id)).toEqual(['amber'])
    expect(problems).toEqual([])
  })

  it('treats a missing skins directory as no skins', async () => {
    expect((await discoverSkins(join(root, 'nowhere'))).skins).toEqual([])
  })
})

describe('unmatchedActivations', () => {
  const plugin = (id: string, kind: string): DiscoveredPlugin =>
    ({ dir: `/p/${id}`, active: false, manifest: { schemaVersion: 1, id, kind } }) as DiscoveredPlugin

  const lists = { apps: [] as string[], features: [] as string[], tools: [] as string[] }

  it('says nothing when every name matched an active plugin', () => {
    const found = [{ ...plugin('todo', 'app'), active: true }]
    expect(unmatchedActivations(found, { ...lists, apps: ['todo'] })).toEqual([])
  })

  it('names a plugin that does not exist, and the list it was named in', () => {
    const missed = unmatchedActivations([], { ...lists, apps: ['tdoo'] })
    expect(missed).toHaveLength(1)
    expect(missed[0]?.id).toBe('tdoo')
    expect(missed[0]?.list).toBe('apps')
    expect(missed[0]?.reason).toMatch(/no plugin by that name/)
  })

  it('tells you which list a plugin should have been named in', () => {
    // The silent failure this exists for: the plugin is there, it is valid,
    // and it simply never appears.
    const missed = unmatchedActivations([plugin('scan', 'feature')], { ...lists, apps: ['scan'] })
    expect(missed[0]?.reason).toMatch(/`features`/)
  })

  it('does not claim a core plugin belongs in a list', () => {
    const missed = unmatchedActivations([plugin('editor', 'core')], { ...lists, tools: ['editor'] })
    expect(missed[0]?.reason).toMatch(/does not activate from a list/)
  })
})

describe('claimedTypeCollisions', () => {
  const plugin = (id: string, types: string[], active = true): DiscoveredPlugin =>
    ({
      dir: `/p/${id}`,
      active,
      manifest: { schemaVersion: 1, id, kind: 'app', description: '', types },
    }) as DiscoveredPlugin

  it('says nothing when every claimed type is unique', () => {
    const found = [plugin('todo', ['tache', 'liste']), plugin('collections', ['collection'])]
    expect(claimedTypeCollisions(found)).toEqual([])
  })

  it('names a type two active plugins both claim', () => {
    const found = [plugin('todo', ['tache']), plugin('impostor', ['tache'])]
    expect(claimedTypeCollisions(found)).toEqual([{ type: 'tache', ids: ['todo', 'impostor'] }])
  })

  it('ignores a claim from a plugin that never activated', () => {
    const found = [plugin('todo', ['tache']), plugin('impostor', ['tache'], false)]
    expect(claimedTypeCollisions(found)).toEqual([])
  })

  it('says nothing about a plugin that claims no type at all', () => {
    const found = [
      {
        ...plugin('atelier', []),
        manifest: { schemaVersion: 1, id: 'atelier', kind: 'app', description: '' },
      } as DiscoveredPlugin,
    ]
    expect(claimedTypeCollisions(found)).toEqual([])
  })
})
