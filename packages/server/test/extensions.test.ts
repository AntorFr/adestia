import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { parsePluginManifest } from '@antorfr/demeura-schemas'

import {
  forgetContributedBlocks,
  isKnownBlock,
  parse,
  validateDocument,
} from '@antorfr/demeura-content'

import {
  claimedTypeCollisions,
  registerPluginVocabulary,
  discoverPlugins,
  discoverSkins,
  frontendPayload,
  mcpServersFor,
  unmatchedActivations,
  type DiscoveredPlugin,
} from '../src/extensions.js'

let root: string

async function plugin(id: string, manifest: unknown | string): Promise<void> {
  const dir = join(root, 'plugins', id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'demeura-plugin.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  )
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'demeura-ext-'))

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
    join(skinDir, 'demeura-skin.json'),
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

describe('the plugins Demeura actually ships', () => {
  /**
   * Every bundled manifest, parsed by the real validator.
   *
   * The suite is full of hand-built manifests proving the validator refuses
   * what it should; none of them proves the folder next door is VALID. A typo
   * in a shipped manifest would surface at somebody's boot, as a plugin that
   * simply never activates.
   */
  it('all parse', async () => {
    const root = join(import.meta.dirname, '..', '..', '..', 'plugins')
    const folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    expect(folders.length).toBeGreaterThan(0)
    for (const folder of folders) {
      const raw = JSON.parse(await readFile(join(root, folder, 'demeura-plugin.json'), 'utf8'))
      expect(() => parsePluginManifest(raw, folder)).not.toThrow()
    }
  })
})

describe('registerPluginVocabulary', () => {
  const plugin = (
    id: string,
    vocabulary: Record<string, { content: 'flow' | 'empty'; description: string; attributes?: Record<string, { required?: boolean }> }>,
    active = true,
  ): DiscoveredPlugin =>
    ({
      dir: `/p/${id}`,
      active,
      manifest: { schemaVersion: 1, id, kind: 'app', description: '', vocabulary },
    }) as DiscoveredPlugin

  afterEach(() => forgetContributedBlocks())

  it('teaches the content engine an active plugin\'s blocks', () => {
    const walk = { content: 'empty', description: 'A walk.', attributes: { source: { required: true } } } as const
    expect(registerPluginVocabulary([plugin('parcours', { parcours: walk })])).toEqual([])
    // Which is what decides `editable` on every page holding one.
    expect(validateDocument(parse(':::parcours{source="x.json"}\n:::\n'))).toEqual([])
  })

  it('ignores a plugin that is mounted but not active', () => {
    registerPluginVocabulary([plugin('parcours', { parcours: { content: 'empty', description: 'A walk.' } }, false)])
    expect(isKnownBlock('parcours')).toBe(false)
  })

  it('names the plugin that tried to take a core block over', () => {
    expect(
      registerPluginVocabulary([plugin('impostor', { callout: { content: 'flow', description: 'mine now' } })]),
    ).toEqual([{ id: 'impostor', name: 'callout' }])
  })

  it('starts from nothing, so one instance never inherits another\'s words', () => {
    registerPluginVocabulary([plugin('parcours', { parcours: { content: 'empty', description: 'A walk.' } })])
    registerPluginVocabulary([])
    expect(isKnownBlock('parcours')).toBe(false)
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

describe('mcpServersFor', () => {
  const withServers = (id: string, servers: unknown[], active = true): DiscoveredPlugin =>
    ({
      dir: `/p/${id}`,
      active,
      manifest: { schemaVersion: 1, id, kind: 'app', description: '', mcpServers: servers },
    }) as DiscoveredPlugin

  it('wires both layers when nothing collides', () => {
    const { servers, problems } = mcpServersFor(
      [{ name: 'home-assistant', url: 'https://ha/mcp' }],
      [withServers('atelier', [{ name: 'cutlist', command: 'node' }])],
    )
    expect(servers.map((server) => server.name)).toEqual(['home-assistant', 'cutlist'])
    expect(problems).toEqual([])
  })

  it('gives the operator the name, and says so', () => {
    // A server silently replaced by another under the same name is a tool call
    // going somewhere nobody chose.
    const { servers, problems } = mcpServersFor(
      [{ name: 'shared', url: 'https://mine/mcp' }],
      [withServers('greedy', [{ name: 'shared', command: 'node' }])],
    )
    expect(servers).toEqual([{ name: 'shared', url: 'https://mine/mcp' }])
    expect(problems).toEqual([
      {
        id: 'greedy',
        severity: 'degraded',
        reason:
          'brings the MCP server "shared", which the operator configuration already declares — the plugin\'s is not wired',
      },
    ])
  })

  it('names the plugin that got there first when two plugins collide', () => {
    const { servers, problems } = mcpServersFor(
      [],
      [
        withServers('first', [{ name: 'shared', command: 'a' }]),
        withServers('second', [{ name: 'shared', command: 'b' }]),
      ],
    )
    expect(servers).toEqual([{ name: 'shared', command: 'a' }])
    expect(problems[0]?.reason).toContain('the plugin "first" already declares')
  })

  it('takes nothing from a plugin that is off', () => {
    // Same rule as its API: turning a plugin off takes its server with it.
    const { servers } = mcpServersFor([], [withServers('sleeping', [{ name: 'x', command: 'a' }], false)])
    expect(servers).toEqual([])
  })

  it('is empty when neither layer declares anything', () => {
    expect(mcpServersFor([], []).servers).toEqual([])
  })
})
