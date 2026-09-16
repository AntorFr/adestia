import { describe, expect, it } from 'vitest'

import { collectionOf, facetsOf, parseLabels, prettify, statusOf } from '../src/app/collections.js'
import type { IndexEntry } from '../src/app/sections.js'

const entry = (path: string, fields: Record<string, unknown>, title = path): IndexEntry => ({
  path,
  title,
  fields,
})

const DECLARED = {
  type: 'collection',
  of: 'projet',
  groupBy: 'cat',
  labels: 'menuiserie=Menuiserie',
  into: 'diy/projets',
}

const entries: readonly IndexEntry[] = [
  entry('diy/projets.md', DECLARED, 'Projets'),
  entry('diy/projets/garage.md', { type: 'projet', cat: 'menuiserie', status: 'en-cours' }, 'Garage'),
  entry('diy/projets/etagere.md', { type: 'projet', cat: 'menuiserie' }, 'Étagère'),
  entry('diy/projets/capteur.md', { type: 'projet', cat: 'electronique' }, 'Capteur'),
  entry('diy/projets/orphelin.md', { type: 'projet' }, 'Orphelin'),
  entry('diy/projets/terrasse.md', { type: 'projet', cat: 'menuiserie', status: 'clos' }, 'Terrasse'),
  entry('note.md', { type: 'fiche' }, 'Une note'),
]

describe('a collection', () => {
  it('collects by type, and nothing else', () => {
    const { members } = collectionOf(DECLARED, entries)
    expect(members).toHaveLength(5)
    expect(members.some((member) => member.fields['type'] === 'fiche')).toBe(false)
    // The declaration itself is not a member of what it declares.
    expect(members.some((member) => member.path === 'diy/projets.md')).toBe(false)
  })

  it('sends what is finished to the archive, and never drops it', () => {
    // A collection of projects fills with finished ones within a year; a grid
    // where nine cards out of ten are done is a grid nobody scans. Dropping
    // them would be worse: the finished project is what somebody looks for
    // when they want to know how the last one went.
    const projets = collectionOf(DECLARED, entries)
    expect(projets.live.map((member) => member.title).sort()).toEqual(['Capteur', 'Garage', 'Orphelin', 'Étagère'])
    expect(projets.archived.map((member) => member.title)).toEqual(['Terrasse'])
    expect(projets.members).toHaveLength(projets.live.length + projets.archived.length)
  })

  it('takes the verdict from the content engine, never from a table of its own', () => {
    // The one table that says which words close a page is the shell's: a
    // section screen, the editor and a collection all read it, so a status
    // nobody listed stays live rather than vanishing.
    const { live, archived } = collectionOf({ of: 'projet' }, [
      entry('a.md', { type: 'projet', status: 'clos' }),
      entry('b.md', { type: 'projet', statut: 'terminé' }),
      entry('c.md', { type: 'projet', status: 'bizarre' }),
    ])
    expect(archived.map((member) => member.path)).toEqual(['a.md', 'b.md'])
    expect(live.map((member) => member.path)).toEqual(['c.md'])
  })

  it('declares no `of` — collects nothing, and says so', () => {
    // Collecting everything would look like a bug in the pages rather than in
    // the declaration.
    const collection = collectionOf({ type: 'collection' }, entries)
    expect(collection.of).toBeUndefined()
    expect(collection.members).toEqual([])
  })

  it('reads where a new member goes', () => {
    expect(collectionOf(DECLARED, entries).into).toBe('diy/projets')
    expect(collectionOf({ of: 'projet' }, entries).into).toBeUndefined()
  })
})

describe('the facets', () => {
  it('are cards, biggest first, the uncategorised last, labelled when asked', () => {
    // Alphabetical order alone buries the group someone is most likely heading
    // for under whatever starts with A.
    const facets = facetsOf(collectionOf(DECLARED, entries))!
    expect(facets.map((facet) => facet.label)).toEqual(['Menuiserie', 'Electronique', 'Uncategorised'])
    expect(facets[0]!.live.map((member) => member.title)).toEqual(['Garage', 'Étagère'])
    expect(facets[0]!.archived.map((member) => member.title)).toEqual(['Terrasse'])
    expect(facets[2]!.value).toBe('')
  })

  it('speak the reader’s language for the one word they own', () => {
    const facets = facetsOf(collectionOf(DECLARED, entries), (key) =>
      key === 'Uncategorised' ? 'Sans catégorie' : key,
    )!
    expect(facets.at(-1)!.label).toBe('Sans catégorie')
  })

  it('do not exist when the collection groups by nothing', () => {
    expect(facetsOf(collectionOf({ of: 'projet' }, entries))).toBeUndefined()
  })

  it('file a page under every value it carries', () => {
    const facets = facetsOf(
      collectionOf({ of: 'cadeau', groupBy: 'pour' }, [
        entry('velo.md', { type: 'cadeau', pour: ['léa', 'tom'] }),
        entry('livre.md', { type: 'cadeau', pour: 'léa' }),
      ]),
    )!
    expect(facets.map((facet) => [facet.label, facet.live.length])).toEqual([
      ['Léa', 2],
      ['Tom', 1],
    ])
  })
})

describe('the small readers', () => {
  it('parse labels written flat or as a list', () => {
    expect(parseLabels('a=Alpha, b=Bé=ta')).toEqual({ a: 'Alpha', b: 'Bé=ta' })
    expect(parseLabels(['a=Alpha', 'broken'])).toEqual({ a: 'Alpha' })
    expect(parseLabels(undefined)).toEqual({})
  })

  it('prettify a raw value without inventing a vocabulary', () => {
    expect(prettify('rangement-garage')).toBe('Rangement garage')
    expect(prettify('')).toBe('')
  })

  it('read a status under either spelling, and only when written', () => {
    expect(statusOf({ status: 'en-cours' })).toBe('en-cours')
    expect(statusOf({ statut: 'clos' })).toBe('clos')
    expect(statusOf({ status: '' })).toBeUndefined()
  })
})
