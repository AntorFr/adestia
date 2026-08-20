import { describe, expect, it } from 'vitest'

import { parse } from '../src/pipeline.js'
import { isEditable, validateDocument } from '../src/validate.js'
import { VOCABULARY, isKnownBlock } from '../src/vocabulary.js'

const check = (markdown: string) => validateDocument(parse(markdown))
const messages = (markdown: string) => check(markdown).map((d) => d.message)

describe('closed vocabulary', () => {
  it('accepts a declared block', () => {
    expect(check(':::callout{type="warning"}\nBody.\n:::\n')).toEqual([])
  })

  it('reports an unknown block instead of dropping or accepting it', () => {
    const diagnostics = check(':::mystery\nBody.\n:::\n')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.severity).toBe('error')
    expect(diagnostics[0]?.message).toContain('Unknown block ":::mystery"')
  })

  it('locates the offending block by line', () => {
    expect(check('# Title\n\nText.\n\n:::mystery\nx\n:::\n')[0]?.line).toBe(5)
  })

  it('exposes the vocabulary as data for the renderer and the skill', () => {
    expect(isKnownBlock('callout')).toBe(true)
    expect(isKnownBlock('mystery')).toBe(false)
    expect(Object.keys(VOCABULARY)).toContain('app')
  })
})

describe('block content rules', () => {
  it('refuses a body on a block whose attributes are its whole meaning', () => {
    // The serializer would silently drop it — a body lost without a word is
    // exactly the failure this project refuses to ship.
    expect(messages(':::app{id="workbench"}\nstray body\n:::\n')).toEqual([
      'Block ":::app" takes no content — its attributes are its whole meaning.',
    ])
  })

  it('accepts the same block empty', () => {
    expect(check(':::app{id="workbench"}\n:::\n')).toEqual([])
  })

  it('refuses an empty block that needs content', () => {
    expect(messages(':::callout{type="note"}\n:::\n')).toEqual(['Block ":::callout" needs content.'])
  })
})

describe('attributes', () => {
  it('requires the required ones', () => {
    expect(messages(':::app{project="garage"}\n:::\n')).toEqual([
      'Block ":::app" requires the attribute "id".',
    ])
  })

  it('enforces a closed value set', () => {
    expect(messages(':::callout{type="danger"}\nBody.\n:::\n')).toEqual([
      '":::callout" attribute "type" is "danger"; accepted: note, tip, warning.',
    ])
  })

  it('warns about an unknown attribute without locking the document', () => {
    const diagnostics = check(':::callout{type="note" colour="red"}\nBody.\n:::\n')
    expect(diagnostics.map((d) => d.severity)).toEqual(['warning'])
    expect(isEditable(diagnostics)).toBe(true)
  })
})

describe('editability gate', () => {
  it('keeps a clean document editable', () => {
    expect(isEditable(check('# Title\n\nJust prose.\n'))).toBe(true)
  })

  it('drops a document with an error to read-only', () => {
    // Verdict decision: never a hard refusal (loses the file), never a silent
    // rewrite (loses the content) — read-only plus a diagnostic.
    expect(isEditable(check(':::mystery\nx\n:::\n'))).toBe(false)
  })
})
