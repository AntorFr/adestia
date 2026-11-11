import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { galleryCards, type GalleryPlugin } from '../src/editor/gallery.js'
import { CORE_GALLERY } from '../src/editor/galleryTable.js'

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../../../plugins/project-management/adestia-plugin.json'), 'utf8'),
)

function pm(): GalleryPlugin {
  return {
    id: 'project-management',
    base: '/plugins/project-management',
    blockNames: Object.keys(manifest.vocabulary),
    gallery: manifest.gallery,
  }
}

describe('core gallery table', () => {
  it('covers the seven insertable core blocks', () => {
    expect(Object.keys(CORE_GALLERY).sort()).toEqual(['callout', 'content', 'figures', 'gallery', 'list', 'row', 'table'])
  })

  it.each(Object.entries(CORE_GALLERY))('%s has name, line, image, group in en and fr', (_id, card) => {
    for (const key of ['name', 'line', 'group'] as const) {
      expect(card[key].en.length).toBeGreaterThan(0)
      expect(card[key].fr.length).toBeGreaterThan(0)
    }
    expect(card.image).toMatch(/^\/blocks\/.+\.svg$/)
    expect(() => readFileSync(resolve(__dirname, '../public', card.image.slice(1)))).not.toThrow()
  })
})

describe('galleryCards', () => {
  it('lists every core block with its own words per locale', () => {
    const fr = galleryCards([], 'fr')
    const en = galleryCards([], 'en')
    expect(fr.map((c) => c.id).sort()).toEqual(Object.keys(CORE_GALLERY).sort())
    expect(fr.find((c) => c.id === 'callout')?.name).toBe('Encadré')
    expect(en.find((c) => c.id === 'callout')?.name).toBe('Callout')
  })

  it('names timeline and subproject of an active project-management, not by identifier', () => {
    for (const locale of ['en', 'fr'] as const) {
      const cards = galleryCards([pm()], locale)
      for (const id of ['timeline', 'subproject']) {
        const card = cards.find((c) => c.id === id)
        expect(card?.name).toBeTruthy()
        expect(card?.name).not.toBe(id)
        expect(card?.line).toBeTruthy()
        expect(card?.group).toBe('Project')
        expect(card?.image).toMatch(/^\/plugins\/project-management\/web\/gallery\/.+\.svg$/)
      }
    }
    expect(galleryCards([pm()], 'fr').find((c) => c.id === 'timeline')?.name).toBe('Frise chronologique')
  })

  it('does not list a disabled plugin (it is not among the loaded ones)', () => {
    expect(galleryCards([], 'en').some((c) => c.id === 'timeline')).toBe(false)
  })

  it('lists a plugin block with a record, and one without under its identifier', () => {
    const cards = galleryCards(
      [
        {
          id: 'bench',
          base: '/p/bench/',
          blockNames: ['plank', 'bare'],
          gallery: { plank: { name: 'Plank', line: 'A plank.', image: './a.svg', group: 'Bench' } },
          words: { Plank: 'Planche' },
        },
      ],
      'fr',
    )
    expect(cards.find((c) => c.id === 'plank')).toMatchObject({ name: 'Planche', image: '/p/bench/a.svg', source: 'bench' })
    expect(cards.find((c) => c.id === 'bare')).toMatchObject({ name: 'bare', source: 'bench' })
  })

  it('does not let a plugin duplicate or override a core name', () => {
    const cards = galleryCards(
      [{ id: 'x', base: '/p/x', blockNames: ['table'], gallery: { table: { name: 'Mine', line: 'l', image: 'a.svg', group: 'g' } } }],
      'en',
    )
    expect(cards.filter((c) => c.id === 'table')).toHaveLength(1)
    expect(cards.find((c) => c.id === 'table')?.name).toBe('Table')
  })

  it('keeps gallery keys of project-management equal to its vocabulary keys', () => {
    expect(Object.keys(manifest.gallery).sort()).toEqual(Object.keys(manifest.vocabulary).sort())
  })

  it('does not pick up prototype keys as blocks', () => {
    const cards = galleryCards([{ id: 'x', base: '/p/x', blockNames: ['constructor'] }], 'en')
    expect(cards.find((c) => c.id === 'constructor')).toMatchObject({ name: 'constructor' })
  })
})
