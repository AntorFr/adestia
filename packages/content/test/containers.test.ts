/**
 * Containers (AD-32, B-28 grammar, B-31): `section`, `columns` and `col` nest by
 * fence length, round-trip byte for byte, and a misplacement is diagnosed by
 * name without losing the text. Every source below is written by hand in the
 * canonical form (fence one longer than the longest child, attributes quoted).
 */
import { describe, expect, it } from 'vitest'

import { parse, serialize } from '../src/pipeline.js'
import { validateDocument } from '../src/validate.js'

const FM = '---\ntitle: P\n---\n\n'

const PAGE =
  FM +
  `::::::section{title="Intro" ico="book" closed="fold"}
Texte de la section.

:::::columns
:::col
Gauche.
:::

::::col
:::callout{type="tip" w="1/2"}
Droite.
:::
::::
:::::

::::columns
:::col
A
:::

:::col
B
:::

:::col
C
:::
::::
::::::
`

const codes = (src: string) => validateDocument(parse(src)).map((d) => d.code)
const col = (text: string) => `:::col\n${text}\n:::\n`
const band = (n: number) => '::::columns\n' + Array.from({ length: n }, (_, i) => col(`T${i}`)).join('\n') + '::::\n'

describe('containers: the fork nests', () => {
  it('reads columns around col as directive nodes, not as text', () => {
    const tree = parse(PAGE)
    const section = tree.children.find((c) => c.type === 'containerDirective') as any
    expect(section.name).toBe('section')
    expect(section.attributes).toEqual({ title: 'Intro', ico: 'book', closed: 'fold' })
    const bands = section.children.filter((c: any) => c.name === 'columns')
    expect(bands.map((b: any) => b.children.map((c: any) => c.name))).toEqual([
      ['col', 'col'],
      ['col', 'col', 'col'],
    ])
  })

  it('writes a section, a band of two and a band of three back identical, byte for byte', () => {
    expect(serialize(parse(PAGE))).toBe(PAGE)
  })

  it('raises no diagnostic on that legal page', () => {
    expect(validateDocument(parse(PAGE))).toEqual([])
  })

  it('a page without containers is untouched by the new names', () => {
    const plain = FM + ':::callout{type="tip"}\nHello\n:::\n'
    expect(serialize(parse(plain))).toBe(plain)
    expect(codes(plain)).toEqual([])
  })
})

describe('containers: a refused placement is named and keeps its text', () => {
  it('a section in a section: container-depth', () => {
    const src = FM + ':::::section{title="A"}\n::::section{title="B"}\nDedans.\n::::\n:::::\n'
    expect(codes(src)).toEqual(['container-depth'])
    expect(serialize(parse(src))).toContain('Dedans.')
  })

  it('columns in a col: container-depth', () => {
    const src = FM + ':::::columns\n::::col\n:::columns\n' + col('in1') + '\n' + col('in2') + ':::\n::::\n\n::::col\nr\n::::\n:::::\n'
    expect(codes(src)).toContain('container-depth')
    const out = serialize(parse(src))
    for (const t of ['in1', 'in2']) expect(out).toContain(t)
  })

  it('a section in a col: container-depth', () => {
    const src = FM + ':::::columns\n::::col\n:::section{title="S"}\nsec text\n:::\n::::\n\n::::col\nr\n::::\n:::::\n'
    expect(codes(src)).toContain('container-depth')
    expect(serialize(parse(src))).toContain('sec text')
  })

  for (const n of [1, 4]) {
    it(`a band of ${n} col: columns-count`, () => {
      const src = FM + band(n)
      expect(codes(src)).toContain('columns-count')
      const out = serialize(parse(src))
      for (let i = 0; i < n; i++) expect(out).toContain(`T${i}`)
    })
  }

  it('a band of 2 and a band of 3 raise no columns-count', () => {
    expect(codes(FM + band(2))).toEqual([])
    expect(codes(FM + band(3))).toEqual([])
  })

  it('an empty band: columns-count', () => {
    expect(codes(FM + '::::columns\n::::\n')).toContain('columns-count')
  })

  it('a col outside any columns: col-outside-columns', () => {
    expect(codes(FM + col('x'))).toContain('col-outside-columns')
  })

  it('a stray block in a band: columns-content, text kept', () => {
    const src = FM + '::::columns\nstray\n\n' + col('a') + '\n' + col('b') + '::::\n'
    expect(codes(src)).toContain('columns-content')
    expect(serialize(parse(src))).toContain('stray')
  })

  it('a section holds a band of columns without diagnostic', () => {
    const src = FM + ':::::section{title="S"}\n' + band(2) + ':::::\n'
    expect(codes(src)).toEqual([])
    expect(serialize(parse(src))).toBe(src)
  })

  it('a section holds a section-free flow of blocks without diagnostic', () => {
    expect(codes(FM + ':::section{title="S"}\nText\n:::\n')).toEqual([])
  })
})

describe('containers: w in a col', () => {
  const src = FM + ':::::columns\n::::col\n:::callout{type="tip" w="1/2"}\nx\n:::\n::::\n\n:::col\ny\n:::\n:::::\n'

  it('stays in the file when the page is written', () => {
    expect(serialize(parse(src))).toContain('w="1/2"')
  })

  it('is no diagnostic', () => {
    expect(codes(src)).toEqual([])
  })
})
