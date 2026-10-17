// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { loadSkin, type SkinEnvironment } from '../src/app/skin.js'

const NAMES = ['alfred', 'dobby', 'nestor', 'skippy'] as const
type Name = (typeof NAMES)[number]

async function factory(name: Name): Promise<(context?: unknown) => Record<string, unknown>> {
  const path = `../../../skins/${name}/skin.js`
  return (await import(/* @vite-ignore */ path)).default
}

// Words that only one of the two languages uses; a leak shows as a hit.
const FRENCH = /[àâçéèêëîïôûùœ’«»]|\b(le|la|les|du|des|est|au|et|ou|vous|encore|toujours|bonjour|bonsoir|monsieur|madame|petit|quelque|chose|écrire|que|qu)\b/i
const ENGLISH = /\b(the|you|your|good|morning|evening|at|is|are|ask|write|give|something|still|back|what|little|monkey|sir|madam|online|idle)\b/i

const WORDS = [
  'placeholder',
  'idleLabel',
  'busyLabel',
  'greetingDay',
  'greetingEvening',
  'greetingAside',
] as const

function environment(module: Record<string, unknown>): SkinEnvironment {
  return {
    importModule: async () => module,
    addStylesheet: () => {},
    setIcon: () => {},
    setAttribute: () => {},
    setScheme: () => {},
  }
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as never
}

// jsdom has no canvas; skippy's core draws on one.
HTMLCanvasElement.prototype.getContext = (() =>
  new Proxy({}, { get: () => () => {}, set: () => true })) as never

describe.each(NAMES)('%s speaks the instance language', (name) => {
  it('says no French on an English instance', async () => {
    const skin = (await factory(name))({ locale: 'en' })
    for (const key of WORDS) {
      if (skin[key] === undefined) continue
      expect(skin[key], `${name}.${key}`).not.toMatch(FRENCH)
    }
    expect(skin.placeholder).toBeTypeOf('string')
  })

  it('says no English on a French instance', async () => {
    const skin = (await factory(name))({ locale: 'fr' })
    for (const key of WORDS) {
      if (skin[key] === undefined) continue
      expect(skin[key], `${name}.${key}`).not.toMatch(ENGLISH)
    }
  })

  it('gives the same set of words in both languages', async () => {
    const make = await factory(name)
    const keys = (s: Record<string, unknown>) => Object.keys(s).sort()
    expect(keys(make({ locale: 'en' }))).toEqual(keys(make({ locale: 'fr' })))
  })

  it('falls back to French when handed nothing, as before', async () => {
    const make = await factory(name)
    expect(make().placeholder).toBe(make({ locale: 'fr' }).placeholder)
    expect(make({}).placeholder).toBe(make({ locale: 'fr' }).placeholder)
  })

  it('renders its hero in the instance language', async () => {
    for (const [locale, bad] of [
      ['en', FRENCH],
      ['fr', ENGLISH],
    ] as const) {
      const skin = (await factory(name))({ locale }) as {
        hero?: (host: HTMLElement, ctx: unknown) => void
        console?: (host: HTMLElement, ctx: unknown) => void
      }
      const info = {
        driver: { label: 'X', cliVersion: '1' },
        plugins: [{}, {}],
        turns: { running: 0, max: 2 },
      }
      for (const slot of [skin.hero, skin.console]) {
        if (!slot) continue
        const host = document.createElement('div')
        slot(host, { instance: info, user: undefined })
        const text = (host.textContent ?? '')
          .replace(/EX LIBRIS|SKIPPY|[⌘K↑]/g, '')
          .replace(/Dobby|Nestor|Alfred|Madame|Madam/g, '')
        expect(text, `${name} ${locale}`).not.toMatch(bad)
      }
    }
  })
})

describe('skippy keeps its register', () => {
  it('tutoies in French', async () => {
    const skin = (await factory('skippy'))({ locale: 'fr' })
    expect(skin.greetingDay).toBe('Encore toi, petit singe.')
    expect(skin.greetingEvening).toBe('Toujours là, petit singe.')
    expect(JSON.stringify(skin)).not.toMatch(/\bvous|votre\b/i)
  })
})

describe('the shell hands the locale to the factory', () => {
  const descriptor = { id: 'x', base: '/skins/x/', module: './skin.js' }

  it('passes { locale } to the factory', async () => {
    let seen: unknown
    const module = {
      default: (context: unknown) => ((seen = context), { placeholder: 'p' }),
    }
    await loadSkin(descriptor, environment(module), 'fr')
    expect(seen).toEqual({ locale: 'fr' })
    await loadSkin(descriptor, environment(module), 'en')
    expect(seen).toEqual({ locale: 'en' })
  })

  it('loads an external skin that ignores locale, as before', async () => {
    const module = { default: () => ({ brand: 'Ext', placeholder: 'Salut' }) }
    const loaded = await loadSkin(descriptor, environment(module), 'en')
    expect(loaded.skin).toEqual({ brand: 'Ext', placeholder: 'Salut' })
    expect(loaded.error).toBeUndefined()
  })

  it('loads an external skin with no parameter at all', async () => {
    const module = { default: function legacy() { return { brand: 'Old' } } }
    expect((await loadSkin(descriptor, environment(module), 'fr')).skin).toEqual({ brand: 'Old' })
  })
})
