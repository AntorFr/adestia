import { describe, expect, it } from 'vitest'

import {
  IMPORT_MAP_CONTRACT,
  loadPlugins,
  type LoaderEnvironment,
  type PluginDescriptor,
} from '../src/plugins/loader.js'

/** A fake environment: no browser, no network, no plugin folder. */
function environment(modules: Record<string, Record<string, unknown> | Error>) {
  const stylesheets: { id: string; url: string }[] = []
  const imported: string[] = []

  const env: LoaderEnvironment = {
    importModule(url) {
      imported.push(url)
      const module = modules[url]
      if (module === undefined) return Promise.reject(new Error(`404 ${url}`))
      if (module instanceof Error) return Promise.reject(module)
      return Promise.resolve(module)
    },
    addStylesheet(id, url) {
      stylesheets.push({ id, url })
    },
    removeStylesheets(id) {
      for (let index = stylesheets.length - 1; index >= 0; index -= 1) {
        if (stylesheets[index]?.id === id) stylesheets.splice(index, 1)
      }
    },
  }
  return { env, stylesheets, imported }
}

const workbench: PluginDescriptor = {
  id: 'workbench',
  kind: 'app',
  base: '/plugins/workbench/',
  view: './web/app.js',
  styles: ['./web/app.css'],
}

describe('loading', () => {
  it('imports a view from the mounted folder', async () => {
    const factory = () => ({})
    const { env, imported } = environment({ '/plugins/workbench/web/app.js': { default: factory } })
    const result = await loadPlugins([workbench], env)

    expect(imported).toEqual(['/plugins/workbench/web/app.js'])
    expect(result.loaded).toEqual([{ id: 'workbench', view: factory }])
    expect(result.failures).toEqual([])
  })

  it('lets the shell own the stylesheets', async () => {
    // Never `import './x.css'` from a module: that only works under a bundler,
    // and a runtime-loaded plugin has none.
    const { env, stylesheets } = environment({
      '/plugins/workbench/web/app.js': { default: () => ({}) },
    })
    await loadPlugins([workbench], env)
    expect(stylesheets).toEqual([{ id: 'workbench', url: '/plugins/workbench/web/app.css' }])
  })

  it('loads several facets of one plugin', async () => {
    const { env } = environment({
      '/plugins/kit/web/app.js': { default: () => 'view' },
      '/plugins/kit/web/blocks.js': { default: () => 'blocks' },
      '/plugins/kit/web/chrome.js': { default: () => 'chrome' },
    })
    const result = await loadPlugins(
      [
        {
          id: 'kit',
          kind: 'app',
          base: '/plugins/kit/',
          view: './web/app.js',
          blocks: './web/blocks.js',
          chrome: './web/chrome.js',
        },
      ],
      env,
    )
    expect(Object.keys(result.loaded[0] ?? {}).sort()).toEqual(['blocks', 'chrome', 'id', 'view'])
  })
})

describe('failure containment', () => {
  it('keeps the other plugins when one fails to import', async () => {
    // A broken plugin costs its own contribution, never the page.
    const { env } = environment({ '/plugins/good/app.js': { default: () => ({}) } })
    const result = await loadPlugins(
      [
        { id: 'missing', kind: 'app', base: '/plugins/missing/', view: './app.js' },
        { id: 'good', kind: 'app', base: '/plugins/good/', view: './app.js' },
      ],
      env,
    )
    expect(result.loaded.map((p) => p.id)).toEqual(['good'])
    expect(result.failures[0]).toMatchObject({ id: 'missing', facet: 'view' })
  })

  it('says why, rather than leaving a blank panel', async () => {
    const { env } = environment({
      '/plugins/boom/app.js': new Error("Failed to resolve module specifier 'lodash'"),
    })
    const result = await loadPlugins(
      [{ id: 'boom', kind: 'app', base: '/plugins/boom/', view: './app.js' }],
      env,
    )
    expect(result.failures[0]?.reason).toContain('lodash')
  })

  it('rejects a module that exports something other than a factory', async () => {
    const { env } = environment({ '/plugins/odd/app.js': { default: { not: 'a function' } } })
    const result = await loadPlugins(
      [{ id: 'odd', kind: 'app', base: '/plugins/odd/', view: './app.js' }],
      env,
    )
    expect(result.failures[0]?.reason).toContain('default-export a factory')
    expect(result.loaded).toEqual([])
  })

  it('removes the CSS of a plugin whose code never loaded', async () => {
    // Otherwise a dead plugin keeps restyling the page it cannot render.
    const { env, stylesheets } = environment({})
    await loadPlugins([workbench], env)
    expect(stylesheets).toEqual([])
  })
})

describe('import-map contract', () => {
  it('refuses a plugin written against another contract, before importing it', async () => {
    // A bare specifier outside the page's import map fails only at load time,
    // in the browser, with an error the plugin author never saw. Refusing on
    // the declared contract turns that into one readable sentence.
    const { env, imported } = environment({ '/plugins/old/app.js': { default: () => ({}) } })
    const result = await loadPlugins(
      [
        {
          id: 'old',
          kind: 'app',
          base: '/plugins/old/',
          view: './app.js',
          contract: IMPORT_MAP_CONTRACT + 1,
        },
      ],
      env,
    )
    expect(imported).toEqual([])
    expect(result.failures[0]).toMatchObject({ id: 'old', facet: 'manifest' })
    expect(result.failures[0]?.reason).toContain('this shell provides 1')
  })

  it('accepts a plugin that declares the current contract', async () => {
    const { env } = environment({ '/plugins/new/app.js': { default: () => ({}) } })
    const result = await loadPlugins(
      [
        {
          id: 'new',
          kind: 'app',
          base: '/plugins/new/',
          view: './app.js',
          contract: IMPORT_MAP_CONTRACT,
        },
      ],
      env,
    )
    expect(result.loaded.map((p) => p.id)).toEqual(['new'])
  })

  it('accepts a plugin that declares none', async () => {
    const { env } = environment({ '/plugins/plain/app.js': { default: () => ({}) } })
    const result = await loadPlugins(
      [{ id: 'plain', kind: 'app', base: '/plugins/plain/', view: './app.js' }],
      env,
    )
    expect(result.loaded).toHaveLength(1)
  })
})

describe('url building', () => {
  it('resolves facets against the plugin base', async () => {
    const { env, imported } = environment({ '/plugins/x/deep/app.js': { default: () => ({}) } })
    await loadPlugins(
      [{ id: 'x', kind: 'app', base: '/plugins/x/', view: './deep/app.js' }],
      env,
    )
    expect(imported).toEqual(['/plugins/x/deep/app.js'])
  })

  it('tolerates a base without a trailing slash', async () => {
    const { env, imported } = environment({ '/plugins/x/app.js': { default: () => ({}) } })
    await loadPlugins([{ id: 'x', kind: 'app', base: '/plugins/x', view: './app.js' }], env)
    expect(imported).toEqual(['/plugins/x/app.js'])
  })
})
