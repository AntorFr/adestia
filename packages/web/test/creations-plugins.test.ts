import { afterEach, describe, expect, it } from 'vitest'

import { forgetContributedBlocks } from '@antorfr/adestia-content'

import { creationsFor, pluginCreations } from '../src/app/creations.js'
import { loadPlugins, type LoaderEnvironment, type PluginDescriptor } from '../src/plugins/loader.js'

afterEach(() => forgetContributedBlocks())

const creation = { id: 'meeting', label: 'Meeting', line: 'A note.', action: { template: 'templates/meeting.md' } }
const seeds = { id: 'seeds', creations: [creation] }

describe('pluginCreations', () => {
  it('lists entries with their plugin of origin after the core ones', () => {
    const list = creationsFor({ at: 'home' }, [''], pluginCreations([seeds]))
    expect(list.map((c) => [c.id, c.plugin])).toEqual([['folder', undefined], ['meeting', 'seeds']])
  })
  it('offers nothing for a plugin that is not in the loaded list (disabled)', () => {
    expect(creationsFor({ at: 'home' }, [''], pluginCreations([])).map((c) => c.id)).toEqual(['folder'])
  })
  it('draws the page icon for an unknown or absent icon, keeps a known one', () => {
    const icons = pluginCreations([{ id: 'p', creations: [
      { ...creation, id: 'a', icon: 'no-such-icon' },
      { ...creation, id: 'b' },
      { ...creation, id: 'c', icon: 'folder-plus' },
      { ...creation, id: 'd', icon: '__proto__' },
    ] }]).map((c) => c.declaration.icon)
    expect(icons).toEqual(['file-text', 'file-text', 'folder-plus', 'file-text'])
  })
  it('picks the locale, falling back to en', () => {
    const p = { id: 'p', creations: [{ ...creation, label: { en: 'Meeting', fr: 'Réunion' }, line: { en: 'x' } }] }
    expect(pluginCreations([p], 'fr')[0]?.declaration).toMatchObject({ label: 'Réunion', line: 'x' })
    expect(pluginCreations([p], 'en')[0]?.declaration.label).toBe('Meeting')
  })
  it('respects where', () => {
    const p = pluginCreations([{ id: 'p', creations: [{ ...creation, where: ['folder'] }] }])
    expect(creationsFor({ at: 'home' }, [''], p).map((c) => c.id)).toEqual(['folder'])
    expect(creationsFor({ at: 'folder', folder: 'a' }, ['a'], p).map((c) => c.id)).toEqual(['folder', 'meeting'])
  })
})

describe('loader keeps creations', () => {
  const env: LoaderEnvironment = {
    makeApi: (d) => ({ id: d.id, base: d.base, locale: 'en' }) as never,
    importModule: () => Promise.reject(new Error('not used')),
    addStylesheet: () => undefined,
    removeStylesheets: () => undefined,
  }
  const descriptor = (extra: Partial<PluginDescriptor>): PluginDescriptor =>
    ({ id: 'seeds', kind: 'feature', base: '/plugins/seeds/', ...extra }) as PluginDescriptor
  it('a creations-only plugin is a plugin, and its entries reach pluginCreations', async () => {
    const { loaded: plugins } = await loadPlugins([descriptor({ creations: [creation] })], env)
    expect(plugins.map((p) => p.id)).toEqual(['seeds'])
    expect(pluginCreations(plugins)[0]?.plugin).toBe('seeds')
  })
  it('an empty creations list alone is not a plugin', async () => {
    const { loaded: plugins } = await loadPlugins([descriptor({ creations: [] })], env)
    expect(plugins).toEqual([])
  })
})
