// @vitest-environment jsdom
/**
 * The diagnostic of a page speaks the instance's language (P-5, E-4).
 * Expected sentences are literal. The English side must equal, byte for byte,
 * what `validateDocument` really emits; the French side must not.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  forgetContributedBlocks,
  parse,
  registerBlocks,
  validateDocument,
  type Diagnostic,
} from '@antorfr/adestia-content'

import { translator } from '../src/app/i18n.js'
import { diagnosticMessage } from '../src/editor/diagnostics.js'
import { SaveStatus } from '../src/editor/SaveStatus.js'

afterEach(() => {
  cleanup()
  forgetContributedBlocks()
})

const fr = translator('fr')
const en = translator('en')

const emitted = (markdown: string): readonly Diagnostic[] => validateDocument(parse(markdown))
const text = (state: Parameters<typeof SaveStatus>[0]['state'], t: (key: string) => string) =>
  render(<SaveStatus state={state} t={t} />).container.textContent ?? ''

// One page per code `validate.ts` can emit, the disputed forms included.
const PAGES: Readonly<Record<string, () => string>> = {
  'unknown-block': () => ':::inconnu\nCorps.\n:::\n',
  'no-content': () => ':::app{id="x"}\ncorps\n:::\n',
  'needs-content': () => ':::callout{type="note"}\n:::\n',
  'attribute-required': () => ':::app{project="garage"}\n:::\n',
  'attribute-value': () => ':::callout{type="danger"}\nCorps.\n:::\n',
  'attribute-unknown': () => ':::callout{type="note" bogus="1"}\nCorps.\n:::\n',
  'no-content-disputed': () => {
    registerBlocks({ app: { content: 'flow', description: 'd', attributes: { id: {} } } }, { plugin: 'p', kind: 'app' })
    return ':::app{id=x}\nUn corps.\n:::\n'
  },
  'needs-content-disputed': () => {
    registerBlocks({ callout: { content: 'empty', description: 'd', attributes: { type: {} } } }, { plugin: 'p', kind: 'app' })
    return ':::callout{type="note"}\n:::\n'
  },
}

describe('every code of validate.ts is translated', () => {
  const source = readFileSync(resolve(process.cwd(), 'packages/content/src/validate.ts'), 'utf8')
  const codes = [...new Set([...source.matchAll(/code:[^\n]*/g)].flatMap((l) => [...l[0].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!)))]

  it('finds the eight codes the design names', () => {
    expect(codes.sort()).toEqual(Object.keys(PAGES).sort())
  })

  for (const code of Object.keys(PAGES)) {
    it(`${code}: English identical to the server's message, French differs and keeps no placeholder`, () => {
      const page = PAGES[code]!()
      const found = emitted(page).filter((d) => d.code === code)
      expect(found.length, `a page that emits ${code}`).toBeGreaterThan(0)
      for (const d of found) {
        expect(diagnosticMessage(d, en)).toBe(d.message)
        const french = diagnosticMessage(d, fr)
        expect(french).not.toBe(d.message)
        expect(french).not.toMatch(/%(block|key|value|accepted)\b/)
        expect(french).not.toMatch(/Unknown|needs content|takes no content|requires the attribute|accepted:|will be ignored|only some/)
      }
    })
  }
})

describe('literal sentences', () => {
  it('draws the unknown block in French with its name as written', () => {
    const [d] = emitted(':::inconnu\nCorps.\n:::\n')
    expect(diagnosticMessage(d!, fr)).toBe('Bloc inconnu « :::inconnu ». Le vocabulaire est fermé ; l’étendre nécessite une modification du code.')
    expect(diagnosticMessage(d!, en)).toBe('Unknown block ":::inconnu". The vocabulary is closed; extending it is a coded change.')
  })

  it('draws a refused attribute value in French', () => {
    const [d] = emitted(':::callout{type="danger"}\nCorps.\n:::\n')
    expect(diagnosticMessage(d!, fr)).toBe('L’attribut « type » de « :::callout » vaut « danger » ; valeurs acceptées : note, tip, warning.')
  })

  it('accepts a reserved-attribute value diagnostic (w) the same way', () => {
    const d = emitted(':::callout{type="note" w="zzz"}\nCorps.\n:::\n').find((x) => x.code === 'attribute-value')!
    expect(diagnosticMessage(d, en)).toBe(d.message)
    expect(diagnosticMessage(d, fr)).toContain('« zzz »')
  })

  it('keeps author text literal even when it looks like a placeholder or a replacement pattern', () => {
    const d: Diagnostic = {
      severity: 'error',
      message: 'x',
      code: 'attribute-value',
      args: { block: '%key', key: '%value', value: '$& $1 $$ %accepted', accepted: '%block' },
    }
    expect(diagnosticMessage(d, fr)).toBe('L’attribut « %value » de « :::%key » vaut « $& $1 $$ %accepted » ; valeurs acceptées : %block.')
  })
})

describe('what is not recognised is drawn as received', () => {
  const t = fr
  it('a message alone', () => expect(diagnosticMessage({ message: 'Plugin says no' }, t)).toBe('Plugin says no'))
  it('an unknown code', () =>
    expect(diagnosticMessage({ message: 'Plugin says no', code: 'zz-unknown', args: { block: 'a' } }, t)).toBe('Plugin says no'))
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('the inherited name %s is no code', (code) =>
    expect(diagnosticMessage({ message: 'raw', code, args: {} }, t)).toBe('raw'))
  it('known code with missing args', () =>
    expect(diagnosticMessage({ message: 'raw', code: 'unknown-block' }, t)).toBe('raw'))
  it('known code with incomplete args', () =>
    expect(diagnosticMessage({ message: 'raw', code: 'attribute-value', args: { block: 'a', key: 'b' } }, t)).toBe('raw'))
  it('known code with a non-string arg', () =>
    expect(diagnosticMessage({ message: 'raw', code: 'unknown-block', args: { block: 3 as unknown as string } }, t)).toBe('raw'))
})

describe('the save line', () => {
  const rejected = (d: { message: string; code?: string; args?: Record<string, string> }) =>
    ({ kind: 'rejected', diagnostics: [d] }) as const

  it('speaks French for a refused save', () => {
    const [d] = emitted(':::inconnu\nCorps.\n:::\n')
    expect(text(rejected(d!), fr)).toBe('Non enregistré : Bloc inconnu « :::inconnu ». Le vocabulaire est fermé ; l’étendre nécessite une modification du code.')
  })

  it('is the server sentence under en', () => {
    const [d] = emitted(':::inconnu\nCorps.\n:::\n')
    expect(text(rejected(d!), en)).toBe(`Not saved: ${d!.message}`)
  })

  it('draws an unknown code as received', () => {
    expect(text(rejected({ message: 'Plugin says no', code: 'zz' }), fr)).toBe('Non enregistré : Plugin says no')
  })

  it('keeps $& and %reason in the block name literal', () => {
    const d = { message: 'x', code: 'unknown-block', args: { block: '$& %reason' } }
    expect(text(rejected(d), fr)).toBe('Non enregistré : Bloc inconnu « :::$& %reason ». Le vocabulaire est fermé ; l’étendre nécessite une modification du code.')
  })

  it('falls back to the generic sentence with no diagnostic', () => {
    expect(text({ kind: 'rejected', diagnostics: [] }, en)).toBe('Not saved: the page breaks the vocabulary')
  })
})
