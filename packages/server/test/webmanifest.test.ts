import { describe, expect, it } from 'vitest'

import {
  baseManifest,
  mergeSkinManifest,
  withInstanceName,
  PREBOOT_ICONS,
} from '../src/webmanifest.js'

describe('the product manifest', () => {
  it('installs as one app per origin', () => {
    const manifest = baseManifest()
    // `id` and `scope` at the root: one instance is one origin, so two Golems
    // on two hosts are two installs and never collide as one.
    expect(manifest['id']).toBe('/')
    expect(manifest['scope']).toBe('/')
    expect(manifest['start_url']).toBe('/')
    expect(manifest['display']).toBe('standalone')
  })

  it('offers the sizes an installer actually requires', () => {
    const icons = baseManifest()['icons'] as Array<Record<string, string>>
    const sizes = icons.map((icon) => icon['sizes'])
    // Chrome's installability floor is 192 and 512; anything else is decoration.
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(icons.some((icon) => icon['purpose'] === 'maskable')).toBe(true)
    // Every icon it names must be an address the server publishes, or the
    // manifest is a promise the product does not keep.
    const routes = new Set<string>(PREBOOT_ICONS.map((icon) => icon.route))
    for (const icon of icons) expect(routes.has(icon['src'] as string)).toBe(true)
  })

  it('states the language when the operator set one, and stays silent otherwise', () => {
    expect(baseManifest({ locale: 'fr' })['lang']).toBe('fr')
    expect('lang' in baseManifest()).toBe(false)
  })
})

describe('a skin dressing the manifest', () => {
  const base = baseManifest()

  it('renames and recolours the install', () => {
    const { manifest, ignored } = mergeSkinManifest(base, {
      name: 'Skippy',
      short_name: 'Skippy',
      theme_color: '#080a0d',
      background_color: '#080a0d',
    })
    expect(manifest['name']).toBe('Skippy')
    expect(manifest['theme_color']).toBe('#080a0d')
    expect(ignored).toEqual([])
  })

  it('refuses to move the app, and says which fields it dropped', () => {
    // The line the token contract draws for CSS, drawn again here: a livery
    // that could move the entry point would change what the app IS.
    const { manifest, ignored } = mergeSkinManifest(base, {
      name: 'Elsewhere',
      start_url: '/somewhere-else',
      scope: '/somewhere-else',
      display: 'fullscreen',
      shortcuts: [{ name: 'x', url: '/x' }],
    })
    expect(manifest['start_url']).toBe('/')
    expect(manifest['scope']).toBe('/')
    expect(manifest['display']).toBe('standalone')
    expect(manifest['name']).toBe('Elsewhere')
    expect(ignored).toEqual(['start_url', 'scope', 'display', 'shortcuts'])
  })

  it('refuses icons, which a skin ships by convention instead', () => {
    // The manifest is served from the ROOT and a skin's files live under
    // /skin/: a relative `src` here would resolve against the wrong folder,
    // silently, and only be visibly wrong on an installed home screen.
    const { manifest, ignored } = mergeSkinManifest(base, {
      icons: [{ src: './assets/icon-192.png', sizes: '192x192' }],
    })
    expect(manifest['icons']).toEqual(base['icons'])
    expect(ignored).toEqual(['icons'])
  })

  it('drops a field whose type would cost the whole install', () => {
    const { manifest, ignored } = mergeSkinManifest(base, { name: 42, short_name: '' })
    expect(manifest['name']).toBe('Golem')
    expect(ignored).toEqual(['name', 'short_name'])
  })

  it('keeps categories only when they are strings', () => {
    expect(mergeSkinManifest(base, { categories: ['productivity'] }).manifest['categories']).toEqual([
      'productivity',
    ])
    expect(mergeSkinManifest(base, { categories: 'productivity' }).ignored).toEqual(['categories'])
  })

  it('survives a fragment that is not an object at all', () => {
    expect(mergeSkinManifest(base, undefined).manifest).toBe(base)
    expect(mergeSkinManifest(base, ['nope']).ignored).toEqual(['(root)'])
    expect(mergeSkinManifest(base, ['nope']).manifest).toBe(base)
  })
})

describe('the operator naming the instance', () => {
  const base = baseManifest()

  it('overrules the livery, which is the whole point', () => {
    // A skin settles two instances wearing two liveries and does nothing for
    // two wearing the same — which is exactly the case an operator running a
    // second Golem hits.
    const dressed = mergeSkinManifest(base, { name: 'Skippy', short_name: 'Skippy' }).manifest
    const named = withInstanceName(dressed, 'Atelier')
    expect(named['name']).toBe('Atelier')
    expect(named['short_name']).toBe('Atelier')
  })

  it('names both fields, so one install does not carry two words', () => {
    // `short_name` is what a launcher shows under the icon.
    expect(withInstanceName(base, 'Atelier')['short_name']).toBe('Atelier')
  })

  it('changes nothing else, and nothing at all when unset', () => {
    const named = withInstanceName(base, 'Atelier')
    expect(named['start_url']).toBe('/')
    expect(named['icons']).toBe(base['icons'])
    expect(withInstanceName(base, undefined)).toBe(base)
  })
})
