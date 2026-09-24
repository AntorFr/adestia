/**
 * Frontmatter under a FORM — several fields at once, and everything else
 * untouched.
 *
 * The cases that matter are not the happy ones. A page carries conventions
 * this engine does not model, and a form that saves one field must leave a
 * nested list, a comment and a `${VAR}` exactly where they were; a value
 * carrying a colon must come back as one value; and a block that does not
 * parse must not be "repaired" into a shorter one.
 */

import { describe, expect, it } from 'vitest'

import { readFrontmatter, splitFrontmatter, writeFrontmatter } from '../src/frontmatter.js'

const page = [
  '---',
  '# la fiche elle-même',
  'type: projet',
  'title: Servante',
  'status: en cours   # arrêté le 12',
  'tags: [etabli, rangement]',
  'sources:',
  '  - https://exemple/plan.pdf',
  '  - https://exemple/cotes.pdf',
  '---',
  '',
  'Le corps.',
  '',
].join('\n')

describe('reading', () => {
  it('separates what a form may edit from what it must not', () => {
    const read = readFrontmatter(page)
    expect(read.present).toBe(true)
    expect(read.broken).toBe(false)
    expect(read.keys).toEqual(['type', 'title', 'status', 'tags', 'sources'])
    expect(read.fields['title']).toBe('Servante')
    expect(read.fields['tags']).toEqual(['etabli', 'rangement'])
    // A block-style list of strings is still a flat list of scalars, so it is
    // a field like any other — the SHAPE decides, never the spelling.
    expect(read.fields['sources']).toEqual([
      'https://exemple/plan.pdf',
      'https://exemple/cotes.pdf',
    ])
    expect(read.opaque).toEqual([])
  })

  it('names the structures it keeps, with the lines that carry them', () => {
    const nested = '---\ntitle: X\ncotes:\n  hauteur: 1000\n  largeur: 720\n---\n\nCorps.\n'
    const read = readFrontmatter(nested)
    expect(read.opaque).toHaveLength(1)
    expect(read.opaque[0]?.key).toBe('cotes')
    expect(read.opaque[0]?.text).toBe('cotes:\n  hauteur: 1000\n  largeur: 720')
  })

  it('says a page has none rather than pretending it has an empty one', () => {
    const read = readFrontmatter('# Un titre\n\nDu texte.\n')
    expect(read.present).toBe(false)
    expect(read.keys).toEqual([])
  })

  it('reports a block that does not parse instead of throwing', () => {
    const read = readFrontmatter('---\ntitle: [unclosed\n---\n\nCorps.\n')
    expect(read.present).toBe(true)
    expect(read.broken).toBe(true)
  })

  it('only counts frontmatter at the very top of the file', () => {
    expect(splitFrontmatter('Du texte.\n\n---\ntitle: X\n---\n').head).toBeUndefined()
  })
})

describe('writing', () => {
  it('changes the fields it was given and reprints the rest verbatim', () => {
    const next = writeFrontmatter(page, { title: 'Servante à roulettes', status: 'terminé' })
    expect(next).toMatch(/^title: Servante à roulettes$/m)
    expect(next).toMatch(/^type: projet$/m)
    // The comments — the one on its own line and the one beside a value.
    expect(next).toMatch(/^# la fiche elle-même$/m)
    expect(next).toMatch(/# arrêté le 12/)
    // The structure nobody asked about.
    expect(next).toMatch(/^ {2}- https:\/\/exemple\/plan\.pdf$/m)
    expect(next).toMatch(/^ {2}- https:\/\/exemple\/cotes\.pdf$/m)
    expect(next).toMatch(/Le corps\./)
  })

  it('leaves every line it was not asked about BYTE for byte', () => {
    // The module's whole promise, pinned as a whole rather than clause by
    // clause: a corpus carries spellings nobody modelled, and one respaced
    // line is a diff on a page nobody edited. Found on the bench, where
    // `tags: [etabli, rangement]` came back `[ etabli, rangement ]` after a
    // change to `status`.
    const before = page.split('\n')
    const after = writeFrontmatter(page, { status: 'terminé' }).split('\n')
    expect(after.filter((line) => !line.startsWith('status:'))).toEqual(
      before.filter((line) => !line.startsWith('status:')),
    )
  })

  it('never writes a value that would not parse back as one value', () => {
    const next = writeFrontmatter(page, { title: 'Servante: le retour' })
    expect(readFrontmatter(next).fields['title']).toBe('Servante: le retour')
  })

  it('keeps a list a list', () => {
    const next = writeFrontmatter(page, { tags: ['etabli', 'chene', 'mobile'] })
    expect(readFrontmatter(next).fields['tags']).toEqual(['etabli', 'chene', 'mobile'])
  })

  it('removes a field that was emptied, rather than blanking it', () => {
    const next = writeFrontmatter(page, { status: '   ', tags: [] })
    expect(next).not.toMatch(/^status:/m)
    expect(next).not.toMatch(/^tags:/m)
    expect(next).toMatch(/^title: Servante$/m)
  })

  it('adds a field the page never had', () => {
    expect(writeFrontmatter(page, { domaine: 'atelier' })).toMatch(/^domaine: atelier$/m)
  })

  it('gives a page with no frontmatter one, because that is the naming case', () => {
    const bare = '# Un titre\n\nDu texte.\n'
    const named = writeFrontmatter(bare, { title: 'Le gabarit' })
    expect(named.startsWith('---\ntitle: Le gabarit\n---\n')).toBe(true)
    expect(named).toMatch(/Du texte\./)
    // And clearing a field on a page that has none changes nothing at all.
    expect(writeFrontmatter(bare, { title: '' })).toBe(bare)
  })

  it('takes the block away with its last field', () => {
    const one = '---\ntitle: Seul\n---\n\nCorps.\n'
    expect(writeFrontmatter(one, { title: '' })).toBe('\nCorps.\n')
  })

  it('leaves the file alone when nothing actually changes', () => {
    expect(writeFrontmatter(page, { title: 'Servante' })).toBe(page)
    expect(writeFrontmatter(page, {})).toBe(page)
    // Written twice, a title stays one line — the second `title:` scar.
    const once = writeFrontmatter(page, { title: 'Deux' })
    expect(writeFrontmatter(once, { title: 'Deux' }).match(/^title:/gm)).toHaveLength(1)
  })

  it('refuses to touch a block that does not parse', () => {
    const broken = '---\ntitle: [unclosed\n---\n\nCorps.\n'
    expect(writeFrontmatter(broken, { title: 'Réparé' })).toBe(broken)
  })

  it('survives a value carrying regex and replacement punctuation', () => {
    const odd = writeFrontmatter(page, { title: 'Coût $& (a+b) [x]' })
    expect(readFrontmatter(odd).fields['title']).toBe('Coût $& (a+b) [x]')
    expect(odd.match(/^title:/gm)).toHaveLength(1)
  })
})
