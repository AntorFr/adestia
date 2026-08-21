import { describe, expect, it } from 'vitest'

import { ManifestError, parsePluginManifest, parseSkinManifest } from '../src/validate.js'

const valid = {
  schemaVersion: 1,
  id: 'workbench',
  kind: 'app',
  description: 'A woodworking workbook.',
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (error) {
    if (error instanceof ManifestError) return error.issues.map((i) => `${i.field}: ${i.message}`)
    throw error
  }
  throw new Error('expected the manifest to be refused')
}

describe('plugin manifest', () => {
  it('accepts the minimal shape', () => {
    expect(parsePluginManifest(valid, 'workbench').id).toBe('workbench')
  })

  it('accepts every declared facet', () => {
    const full = {
      ...valid,
      contract: 1,
      view: './web/app.js',
      blocks: './web/blocks.js',
      chrome: './web/chrome.js',
      styles: ['./web/app.css'],
      tile: { label: 'Workbench', icon: '🪚' },
      api: './api.js',
      setup: './setup',
      skills: ['./skills/workbench/SKILL.md'],
      types: ['pièce', 'plaque'],
      mcpServers: [{ name: 'cutlist', command: 'node', args: ['./bin/cutlist.js'] }],
    }
    expect(() => parsePluginManifest(full, 'workbench')).not.toThrow()
  })

  it('refuses a manifest whose id disagrees with its folder', () => {
    // The folder wins: silently re-mapping the id would mean the thing you
    // enable in config is not the thing that loaded.
    expect(issuesOf(() => parsePluginManifest(valid, 'atelier'))).toContain(
      'id: is "workbench" but the folder is "atelier"',
    )
  })

  it('refuses an unknown kind rather than defaulting', () => {
    expect(issuesOf(() => parsePluginManifest({ ...valid, kind: 'gadget' }, 'workbench'))).toEqual([
      'kind: must be one of core, app, feature, tool',
    ])
  })

  it('refuses a manifest from another schema version', () => {
    expect(issuesOf(() => parsePluginManifest({ ...valid, schemaVersion: 2 }, 'workbench'))).toEqual([
      'schemaVersion: is 2, this build understands 1',
    ])
  })

  it('requires schemaVersion at all', () => {
    const { schemaVersion: _drop, ...without } = valid
    expect(issuesOf(() => parsePluginManifest(without, 'workbench'))).toContain(
      'schemaVersion: is required (expected 1)',
    )
  })

  it('reports every issue at once', () => {
    const issues = issuesOf(() => parsePluginManifest({ schemaVersion: 1 }, 'workbench'))
    expect(issues).toEqual([
      'id: is required',
      'description: is required',
      'kind: is required',
    ])
  })

  describe('facet paths', () => {
    it('refuses traversal out of the plugin folder', () => {
      expect(
        issuesOf(() => parsePluginManifest({ ...valid, view: '../../etc/passwd' }, 'workbench')),
      ).toEqual(['view: must not escape the plugin folder ("..")'])
    })

    it('refuses an absolute path', () => {
      expect(issuesOf(() => parsePluginManifest({ ...valid, api: '/etc/passwd' }, 'workbench'))).toEqual(
        ['api: must be relative to the plugin folder'],
      )
    })

    it('refuses a remote URL', () => {
      expect(
        issuesOf(() => parsePluginManifest({ ...valid, view: 'https://cdn.example/x.js' }, 'workbench')),
      ).toEqual(['view: must be a relative path, not a URL'])
    })

    it('rejects `types` that is not an array of strings', () => {
      expect(issuesOf(() => parsePluginManifest({ ...valid, types: 'tache' }, 'workbench'))).toEqual([
        'types: must be an array of non-empty strings',
      ])
    })

    it('checks stylesheet paths too', () => {
      expect(
        issuesOf(() => parsePluginManifest({ ...valid, styles: ['../secrets.css'] }, 'workbench')),
      ).toEqual(['styles[0]: must not escape the plugin folder ("..")'])
    })
  })

  describe('mcpServers', () => {
    it('requires a transport', () => {
      expect(
        issuesOf(() => parsePluginManifest({ ...valid, mcpServers: [{ name: 'x' }] }, 'workbench')),
      ).toEqual(['mcpServers[0]: needs either "command" (stdio) or "url" (http)'])
    })

    it('accepts an http server', () => {
      const m = { ...valid, mcpServers: [{ name: 'x', url: 'https://hub.example/mcp' }] }
      expect(() => parsePluginManifest(m, 'workbench')).not.toThrow()
    })
  })

  it('refuses a non-object', () => {
    expect(issuesOf(() => parsePluginManifest('nope', 'workbench'))).toEqual([
      '(root): must be a JSON object',
    ])
  })
})

describe('skin manifest', () => {
  const skin = { schemaVersion: 1, id: 'skippy', description: 'Amber, monospace, no shadows.' }

  it('accepts the minimal shape', () => {
    expect(parseSkinManifest(skin, 'skippy').id).toBe('skippy')
  })

  it('accepts its declared facets', () => {
    const full = {
      ...skin,
      module: './skin.js',
      styles: './skin.css',
      icon: './assets/icon.svg',
      manifest: './assets/manifest.json',
    }
    expect(() => parseSkinManifest(full, 'skippy')).not.toThrow()
  })

  it('enforces the folder-wins rule as well', () => {
    expect(issuesOf(() => parseSkinManifest(skin, 'alfred'))).toContain(
      'id: is "skippy" but the folder is "alfred"',
    )
  })

  it('refuses traversal in its asset paths', () => {
    expect(issuesOf(() => parseSkinManifest({ ...skin, icon: '../../id_rsa' }, 'skippy'))).toEqual([
      'icon: must not escape the skin folder ("..")',
    ])
  })
})
