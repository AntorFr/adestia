import { describe, expect, it } from 'vitest'

import { loadSkin, narrowSkin, type SkinEnvironment } from '../src/app/skin.js'

function environment(modules: Record<string, Record<string, unknown> | Error> = {}) {
  const stylesheets: string[] = []
  const icons: string[] = []
  const attributes: string[] = []
  const env: SkinEnvironment = {
    importModule(url) {
      const module = modules[url]
      if (module === undefined) return Promise.reject(new Error(`404 ${url}`))
      if (module instanceof Error) return Promise.reject(module)
      return Promise.resolve(module)
    },
    addStylesheet: (url) => void stylesheets.push(url),
    setIcon: (url) => void icons.push(url),
    setAttribute: (value) => void attributes.push(value),
  }
  return { env, stylesheets, icons, attributes }
}

describe('the contract', () => {
  it('keeps the fields a skin may declare', () => {
    const { skin, rejected } = narrowSkin({ brand: 'Atelier', placeholder: 'Ask…' })
    expect(skin).toEqual({ brand: 'Atelier', placeholder: 'Ask…' })
    expect(rejected).toEqual([])
  })

  it('drops a route and says so', () => {
    // The one people try first, and the one that would lodge an APP inside a
    // livery: a screen that exists under one skin and vanishes under another.
    const { skin, rejected } = narrowSkin({ brand: 'X', routes: [{ path: '/secret' }] })
    expect(skin).toEqual({ brand: 'X' })
    expect(rejected).toEqual(['routes'])
  })

  it('drops anything off-contract rather than passing it through', () => {
    const { rejected } = narrowSkin({ css: 'body{}', onLoad: 'alert(1)' })
    expect(rejected.sort()).toEqual(['css', 'onLoad'])
  })

  it('reports a factory that returned nothing usable', () => {
    expect(narrowSkin('a string').error).toContain('no object')
  })
})

describe('loading', () => {
  const descriptor = { id: 'amber', base: '/skin/', styles: './skin.css', module: './skin.js' }

  it('arms the skin attribute even with no files', async () => {
    // The attribute is what the token overrides hang off; without it a
    // stylesheet that loaded fine changes nothing at all.
    const { env, attributes } = environment()
    await loadSkin({ id: 'default', base: '/skin/' }, env)
    expect(attributes).toEqual(['default'])
  })

  it('injects the stylesheet and the icon', async () => {
    const { env, stylesheets, icons } = environment({
      '/skin/skin.js': { default: () => ({ brand: 'Amber' }) },
    })
    await loadSkin({ ...descriptor, icon: './icon.svg' }, env)
    expect(stylesheets).toEqual(['/skin/skin.css'])
    expect(icons).toEqual(['/skin/icon.svg'])
  })

  it('returns what the factory declared', async () => {
    const { env } = environment({ '/skin/skin.js': { default: () => ({ brand: 'Amber' }) } })
    expect((await loadSkin(descriptor, env)).skin).toEqual({ brand: 'Amber' })
  })

  it('leaves the shell dressed as itself when a skin fails', async () => {
    // A livery is not worth an interface.
    const { env } = environment({ '/skin/skin.js': new Error('syntax error') })
    const result = await loadSkin(descriptor, env)
    expect(result.skin).toEqual({})
    expect(result.error).toContain('syntax error')
  })

  it('refuses a module that exports something other than a factory', async () => {
    const { env } = environment({ '/skin/skin.js': { default: { brand: 'X' } } })
    expect((await loadSkin(descriptor, env)).error).toContain('default-export a factory')
  })

  it('works with tokens alone, no module at all', async () => {
    const { env, stylesheets } = environment()
    const result = await loadSkin({ id: 'amber', base: '/skin/', styles: './skin.css' }, env)
    expect(result.skin).toEqual({})
    expect(result.error).toBeUndefined()
    expect(stylesheets).toEqual(['/skin/skin.css'])
  })
})
