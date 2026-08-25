import { afterEach, describe, expect, it } from 'vitest'

import { forgetContributedBlocks, isKnownBlock } from '@antorfr/golem-content'

import {
  IMPORT_MAP_CONTRACT,
  loadPlugins,
  type LoaderEnvironment,
  type PluginDescriptor,
} from '../src/plugins/loader.js'
import { routeMatches } from '../src/plugins/contract.js'
import { browserEnvironment } from '../src/plugins/loader.js'

afterEach(() => forgetContributedBlocks())

/** A fake environment: no browser, no network, no plugin folder. */
function environment(modules: Record<string, Record<string, unknown> | Error>) {
  const stylesheets: { id: string; url: string }[] = []
  const imported: string[] = []

  const env: LoaderEnvironment = {
    makeApi: (descriptor) => ({
      id: descriptor.id,
      base: descriptor.base,
      locale: 'en',
      fetch: (() => Promise.reject(new Error('not used'))) as unknown as typeof fetch,
      ask: () => undefined,
      trail: () => undefined,
      compose: () => undefined,
      PageEditor: () => null,
    }),
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
  it('imports a view, CALLS its factory, and keeps the component', async () => {
    // Called at load rather than at render: a factory that throws costs its
    // own facet where the shell can report it, instead of exploding inside a
    // render that unmounts the tree around it.
    const Component = () => null
    const { env, imported } = environment({
      '/plugins/workbench/web/app.js': { default: () => ({ component: Component }) },
    })
    const result = await loadPlugins([workbench], env)

    expect(imported).toEqual(['/plugins/workbench/web/app.js'])
    expect(result.loaded[0]).toMatchObject({ id: 'workbench', view: { component: Component } })
    expect(result.failures).toEqual([])
  })

  it('hands the factory an api carrying its own identity', async () => {
    let seen: { id: string; base: string } | undefined
    const { env } = environment({
      '/plugins/workbench/web/app.js': {
        default: (api: { id: string; base: string }) => {
          seen = api
          return () => null
        },
      },
    })
    await loadPlugins([workbench], env)
    expect(seen).toMatchObject({ id: 'workbench', base: '/plugins/workbench/' })
  })

  it('accepts a bare component, the obvious thing to return', async () => {
    const Component = () => null
    const { env } = environment({
      '/plugins/workbench/web/app.js': { default: () => Component },
    })
    const result = await loadPlugins([workbench], env)
    expect(result.loaded[0]?.view?.component).toBe(Component)
  })

  it('keeps the route a view declares', async () => {
    const { env } = environment({
      '/plugins/workbench/web/app.js': {
        default: () => ({ component: () => null, route: '/workbench' }),
      },
    })
    const result = await loadPlugins([workbench], env)
    expect(result.loaded[0]?.view?.route).toBe('/workbench')
  })

  it('keeps the routeFor a view declares, and drops a non-function', async () => {
    // The shell asks it where an absorbed folder opens; a plugin that put
    // something else under that name must not have it called mid-render.
    const routeFor = (folder: string) => `/workbench/${folder}`
    const { env } = environment({
      '/plugins/workbench/web/app.js': {
        default: () => ({ component: () => null, route: '/workbench', routeFor }),
      },
    })
    expect((await loadPlugins([workbench], env)).loaded[0]?.view?.routeFor).toBe(routeFor)

    const { env: wrong } = environment({
      '/plugins/workbench/web/app.js': {
        default: () => ({ component: () => null, route: '/workbench', routeFor: '/nope' }),
      },
    })
    expect((await loadPlugins([workbench], wrong)).loaded[0]?.view?.routeFor).toBeUndefined()
  })

  it('hands a view a way to say where it is, bound to its own id', async () => {
    // The shell draws ONE breadcrumb. A plugin that drew its own put a second
    // one under it; this is what replaced that.
    const said: { id: string; labels: string[] }[] = []
    const env = browserEnvironment(
      () => {},
      () => {},
      'fr',
      (id, crumbs) => said.push({ id, labels: crumbs.map((crumb) => crumb.label) }),
    )
    const api = env.makeApi({ id: 'voyages', base: '/plugins/voyages/', kind: 'app' })
    api.trail([{ label: 'Baden 2026', route: '/voyages/baden-2026' }])
    expect(said).toEqual([{ id: 'voyages', labels: ['Baden 2026'] }])
  })

  it('lets the shell own the stylesheets', async () => {
    // Never `import './x.css'` from a module: that only works under a bundler,
    // and a runtime-loaded plugin has none.
    const { env, stylesheets } = environment({
      '/plugins/workbench/web/app.js': { default: () => () => null },
    })
    await loadPlugins([workbench], env)
    expect(stylesheets).toEqual([{ id: 'workbench', url: '/plugins/workbench/web/app.css' }])
  })

  it('loads several facets of one plugin', async () => {
    const { env } = environment({
      '/plugins/kit/web/app.js': { default: () => () => null },
      '/plugins/kit/web/blocks.js': { default: () => ({ tags: { cutlist: () => null } }) },
      '/plugins/kit/web/chrome.js': {
        default: () => ({ composer: [{ id: 'scan', glyph: '▥', title: 'Scan', onClick: () => {} }] }),
      },
    })
    const result = await loadPlugins(
      [
        {
          id: 'kit',
          kind: 'app',
          base: '/plugins/kit/',
          view: './web/app.js',
          blocks: './web/blocks.js',
          vocabulary: { cutlist: { content: 'empty', description: 'A cutting list.' } },
          chrome: './web/chrome.js',
        },
      ],
      env,
    )
    const kit = result.loaded[0]!
    expect(kit.view?.component).toBeTypeOf('function')
    expect(kit.blocks?.tags).toHaveProperty('cutlist')
    expect(kit.chrome?.composer?.[0]?.glyph).toBe('▥')
    expect(result.failures).toEqual([])
  })

  it('registers the manifest\'s vocabulary, and refuses a core name', async () => {
    const { env } = environment({
      '/plugins/kit/web/blocks.js': { default: () => ({ tags: { cutlist: () => null } }) },
    })
    const result = await loadPlugins(
      [
        {
          id: 'kit',
          kind: 'app',
          base: '/plugins/kit/',
          blocks: './web/blocks.js',
          vocabulary: {
            cutlist: { content: 'empty', description: 'A cutting list.' },
            callout: { content: 'flow', description: 'mine now' },
          },
        },
      ],
      env,
    )
    expect(isKnownBlock('cutlist')).toBe(true)
    // The core keeps its own, and the operator is told rather than left with
    // a `callout` that quietly means something else on this instance.
    expect(result.failures).toContainEqual({
      id: 'kit',
      facet: 'vocabulary',
      reason: 'block ":::callout" is the core\'s own and was not taken over',
    })
    // `callout` was refused, but the plugin\'s own block still loaded.
    expect(result.loaded[0]?.blocks?.tags).toHaveProperty('cutlist')
  })

  it('names a half-declared block instead of leaving it inert', async () => {
    const { env } = environment({
      '/plugins/kit/web/blocks.js': { default: () => ({ tags: { drawn: () => null } }) },
    })
    const result = await loadPlugins(
      [
        {
          id: 'kit',
          kind: 'app',
          base: '/plugins/kit/',
          blocks: './web/blocks.js',
          vocabulary: { declared: { content: 'empty', description: 'Nothing draws me.' } },
        },
      ],
      env,
    )
    // A component the parser will never produce a node for, and a name the
    // renderer has nothing for. Both are silent in a running instance.
    expect(result.failures.map((f) => f.reason)).toEqual([
      'component for ":::drawn" has no matching entry in the manifest\'s `vocabulary`',
      'block ":::declared" is declared but the `blocks` module draws nothing for it',
    ])
  })

  it('does not let a plugin the shell refused teach the parser its words', async () => {
    const { env } = environment({})
    const result = await loadPlugins(
      [
        {
          id: 'kit',
          kind: 'app',
          base: '/plugins/kit/',
          contract: 99,
          vocabulary: { cutlist: { content: 'empty', description: 'A cutting list.' } },
        },
      ],
      env,
    )
    expect(result.failures[0]?.facet).toBe('manifest')
    // Otherwise a page would validate against a block nothing will ever draw,
    // and open editable on the strength of a plugin that never loaded.
    expect(isKnownBlock('cutlist')).toBe(false)
  })

  it('forgets the previous set when plugins are loaded again', async () => {
    const { env } = environment({})
    await loadPlugins(
      [{ id: 'kit', kind: 'app', base: '/plugins/kit/', vocabulary: { gone: { content: 'empty', description: 'x' } } }],
      env,
    )
    expect(isKnownBlock('gone')).toBe(true)
    await loadPlugins([], env)
    // Otherwise a plugin turned off keeps its words, and a page holding one
    // goes on validating against a renderer that is no longer there.
    expect(isKnownBlock('gone')).toBe(false)
  })

  it('reports a factory that threw, and keeps the rest of the page', async () => {
    const { env } = environment({
      '/plugins/boom/app.js': {
        default: () => {
          throw new Error('undefined is not a function')
        },
      },
    })
    const result = await loadPlugins(
      [{ id: 'boom', kind: 'app', base: '/plugins/boom/', view: './app.js' }],
      env,
    )
    expect(result.loaded).toEqual([])
    expect(result.failures[0]?.reason).toContain('undefined is not a function')
  })

  it('names the facet AND what was expected when a shape is wrong', async () => {
    // A generic schema walker produces neither, and the plugin author reads
    // this error at 2am.
    const { env } = environment({
      '/plugins/odd/app.js': { default: () => ({ compnent: () => null }) },
    })
    const result = await loadPlugins(
      [{ id: 'odd', kind: 'app', base: '/plugins/odd/', view: './app.js' }],
      env,
    )
    expect(result.failures[0]).toMatchObject({ facet: 'view' })
    expect(result.failures[0]?.reason).toContain('component')
  })
})

describe('failure containment', () => {
  it('keeps the other plugins when one fails to import', async () => {
    // A broken plugin costs its own contribution, never the page.
    const { env } = environment({ '/plugins/good/app.js': { default: () => () => null } })
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
    const { env, imported } = environment({ '/plugins/old/app.js': { default: () => () => null } })
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
    const { env } = environment({ '/plugins/new/app.js': { default: () => () => null } })
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
    const { env } = environment({ '/plugins/plain/app.js': { default: () => () => null } })
    const result = await loadPlugins(
      [{ id: 'plain', kind: 'app', base: '/plugins/plain/', view: './app.js' }],
      env,
    )
    expect(result.loaded).toHaveLength(1)
  })
})

describe('url building', () => {
  it('resolves facets against the plugin base', async () => {
    const { env, imported } = environment({ '/plugins/x/deep/app.js': { default: () => () => null } })
    await loadPlugins(
      [{ id: 'x', kind: 'app', base: '/plugins/x/', view: './deep/app.js' }],
      env,
    )
    expect(imported).toEqual(['/plugins/x/deep/app.js'])
  })

  it('tolerates a base without a trailing slash', async () => {
    const { env, imported } = environment({ '/plugins/x/app.js': { default: () => () => null } })
    await loadPlugins([{ id: 'x', kind: 'app', base: '/plugins/x', view: './app.js' }], env)
    expect(imported).toEqual(['/plugins/x/app.js'])
  })
})

describe('routeMatches', () => {
  it('matches a route exactly', () => {
    expect(routeMatches('/atelier', '/atelier')).toBe(true)
  })

  it('matches anything below a route, so detail screens can be bookmarked', () => {
    expect(routeMatches('/atelier', '/atelier/projets%2Fgarage%2Fworkbook.json')).toBe(true)
    expect(routeMatches('/atelier', '/atelier/a/b/c')).toBe(true)
  })

  it('stops at a segment boundary, so a route cannot swallow a sibling', () => {
    expect(routeMatches('/note', '/notebook')).toBe(false)
    expect(routeMatches('/note', '/notes')).toBe(false)
  })

  it('never matches a view that declares no route', () => {
    expect(routeMatches(undefined, '')).toBe(false)
    expect(routeMatches(undefined, '/anything')).toBe(false)
  })
})
