/**
 * Reading the other shell's block syntax.
 *
 * The measurements these guard: 111 callouts and 25 enriched links across 51
 * of the corpus's 190 pages — a quarter of what somebody wrote, rendered as
 * literal braces until this existed.
 */

import { describe, expect, it } from 'vitest'

import { parse, serialize } from '../src/pipeline.js'
import { validateDocument } from '../src/validate.js'

const first = (markdown: string) => parse(markdown).children[0]

describe('callout', () => {
  it('becomes the same node a ::: block makes', () => {
    const tree = parse('{% callout type="attention" %}\n\nAttention à la lame.\n\n{% /callout %}\n')
    const node = tree.children[0] as { type: string; name: string; attributes: Record<string, string> }
    expect(node.type).toBe('containerDirective')
    expect(node.name).toBe('callout')
    expect(node.attributes.type).toBe('warning')
  })

  it('translates the vocabulary the corpus actually writes', () => {
    // Measured: attention 68, note 40, info 2, astuce 1.
    const tone = (kind: string) => {
      const node = parse(`{% callout type="${kind}" %}\n\nx\n\n{% /callout %}\n`)
        .children[0] as { attributes: Record<string, string> }
      return node.attributes.type
    }
    expect(tone('attention')).toBe('warning')
    expect(tone('note')).toBe('note')
    expect(tone('info')).toBe('note')
    expect(tone('astuce')).toBe('tip')
  })

  it('falls back to note for a type it has never met', () => {
    const node = parse('{% callout type="inconnu" %}\n\nx\n\n{% /callout %}\n')
      .children[0] as { attributes: Record<string, string> }
    expect(node.attributes.type).toBe('note')
  })

  it('keeps the words inside it', () => {
    const markdown = serialize(
      parse('{% callout type="note" %}\n\nDeux **mots**.\n\n{% /callout %}\n'),
    )
    expect(markdown).toContain('Deux **mots**.')
  })

  it('produces a document the validator accepts', () => {
    // The whole point of translating to the SAME nodes: everything
    // downstream works without knowing this syntax exists.
    const tree = parse('{% callout type="attention" %}\n\nx\n\n{% /callout %}\n')
    expect(validateDocument(tree)).toEqual([])
  })
})

describe('web', () => {
  it('becomes a link that works', () => {
    const tree = parse('{% web url="https://example.org" titre="Le site" /%}\n')
    const paragraph = tree.children[0] as { type: string; children: { type: string; url?: string }[] }
    expect(paragraph.children[0]?.type).toBe('link')
    expect(paragraph.children[0]?.url).toBe('https://example.org')
    expect(serialize(tree)).toContain('[Le site](https://example.org)')
  })

  it('falls back to the URL when no title is given', () => {
    expect(serialize(parse('{% web url="https://example.org" /%}\n'))).toContain('example.org')
  })

  it('is left alone when it carries no url at all', () => {
    // Nothing to link to: the line stays as written rather than vanishing.
    expect(serialize(parse('{% web titre="orphelin" /%}\n'))).toContain('{% web')
  })
})

describe('what it refuses to guess', () => {
  it('leaves an unclosed container in place instead of swallowing the page', () => {
    const markdown = serialize(parse('{% callout type="note" %}\n\nDébut.\n\nSuite.\n'))
    expect(markdown).toContain('Début.')
    expect(markdown).toContain('Suite.')
  })

  it('gives up an unknown container’s wrapper but keeps its content', () => {
    // The words somebody wrote matter more than the box the other shell drew
    // around them.
    const markdown = serialize(parse('{% piece ref="A1" %}\n\nUne pièce.\n\n{% /piece %}\n'))
    expect(markdown).toContain('Une pièce.')
    expect(markdown).not.toContain('{% piece')
  })

  it('turns an attachment tag into a link, path untouched', () => {
    // The corpus writes `assets/<file>`, relative to the page — which is what
    // `resolveHref` already resolves against the page's folder. Rewriting the
    // path is the one way to break links that currently work.
    const markdown = serialize(
      parse('{% piece-jointe fichier="assets/carnet-de-voyage.pdf" /%}\n'),
    )
    expect(markdown).toContain('[carnet-de-voyage.pdf](assets/carnet-de-voyage.pdf)')
  })

  it('leaves an attachment tag alone when it names no file', () => {
    // Nothing to point at: keeping the line beats emitting a link to nowhere.
    expect(serialize(parse('{% piece-jointe /%}\n'))).toContain('{% piece-jointe /%}')
  })

  it('does not touch braces that are merely prose', () => {
    expect(first('Le gain est de {% environ 3 %} sur la coupe.\n')?.type).toBe('paragraph')
    expect(serialize(parse('Le gain est de {% environ 3 %}.\n'))).toContain('{% environ 3 %}')
  })
})

describe('tags glued to the sentence below', () => {
  it('reads a callout whose opener has no blank line after it', () => {
    // How the corpus actually writes them — 110 of them, all well-formed,
    // all reaching the screen as literal braces until this.
    const tree = parse(
      '{% callout type="attention" %}\n**Pointure non tranchée.** Choisir entre 42 et 43.\n{% /callout %}\n',
    )
    const node = tree.children[0] as { type: string; name: string; attributes: Record<string, string> }
    expect(node.type).toBe('containerDirective')
    expect(node.attributes.type).toBe('warning')
    expect(serialize(tree)).toContain('Pointure non tranchée.')
  })

  it('leaves a tag inside a code block exactly as written', () => {
    // The page that documents this syntax must be able to show it.
    const markdown = '```\n{% callout type="note" %}\nexemple\n{% /callout %}\n```\n'
    expect(serialize(parse(markdown))).toContain('{% callout type="note" %}')
  })

  it('does not disturb ordinary prose around it', () => {
    const markdown = serialize(
      parse('Avant.\n\n{% callout type="note" %}\nDedans.\n{% /callout %}\n\nAprès.\n'),
    )
    expect(markdown).toContain('Avant.')
    expect(markdown).toContain('Dedans.')
    expect(markdown).toContain('Après.')
  })
})
