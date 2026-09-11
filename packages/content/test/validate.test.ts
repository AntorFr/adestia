import { describe, expect, it } from 'vitest'

import { contentDigest, parse } from '../src/pipeline.js'
import { isEditable, validateDocument } from '../src/validate.js'
import {
  VOCABULARY,
  forgetContributedBlocks,
  isKnownBlock,
  registerBlocks,
} from '../src/vocabulary.js'

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

  it('says nothing either way about a block whose body is optional', () => {
    // One rendering, two provenances: the planning written in the block and
    // the one read from the pages below. Either shape would be an error
    // under a single declaration, and both are legal here.
    registerBlocks(
      {
        planning: {
          content: 'optional',
          description: 'Written or queried.',
          attributes: { depth: { values: ['self', 'subtree'], default: 'self' } },
        },
      },
      { plugin: 'demo', kind: 'feature' },
    )
    expect(check(':::planning\n- Cadrage: 2026-01-15 → 2026-03-01\n:::\n')).toEqual([])
    expect(check(':::planning{depth=subtree}\n:::\n')).toEqual([])
    forgetContributedBlocks()
  })

  it('lets an optional definition settle the shape for a name the core fixes', () => {
    // The core says `app` is empty; a plugin that takes a body sometimes must
    // not turn every page holding one into a locked page.
    registerBlocks(
      { app: { content: 'optional', description: 'Sometimes bodied.' } },
      { plugin: 'demo', kind: 'app' },
    )
    expect(check(':::app{id="workbench"}\nstray body\n:::\n')).toEqual([])
    forgetContributedBlocks()
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

describe('a colon in prose is punctuation', () => {
  // Reported from a real page: a schedule line reading "19:30:59" parsed as
  // the text "19:30" plus an inline directive named "59", and the page opened
  // read-only. The vocabulary has no inline form, so the grammar no longer
  // offers one.
  const timestamp = 'Départ à 19:30:59, retour à 7:15.\n'

  it('leaves a time as a single text node', () => {
    const paragraph = parse(timestamp).children[0]
    expect(paragraph?.type).toBe('paragraph')
    const kinds = (paragraph as { children: { type: string }[] }).children.map((c) => c.type)
    expect(kinds).toEqual(['text'])
  })

  it('keeps the page editable', () => {
    expect(check(timestamp)).toEqual([])
    expect(isEditable(check(timestamp))).toBe(true)
  })

  it('still reads the block forms it always did', () => {
    expect(check(':::callout{type="note"}\nAt 9:45.\n:::\n')).toEqual([])
    expect(messages('::mystery\n')).toEqual([
      'Unknown block ":::mystery". The vocabulary is closed; extending it is a coded change.',
    ])
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

describe('le digest des blocs rédigés', () => {
  it('rend ce que chaque `:::content` dit, par son sujet', () => {
    const page = [
      '---', 'title: Socle', '---', '',
      ':::content{type=etat}', 'Huit lots sur treize.', ':::', '',
      ':::content{type=perimetre}', 'Hors infra.', ':::', '',
    ].join('\n')
    expect(contentDigest(page)).toEqual({ etat: 'Huit lots sur treize.', perimetre: 'Hors infra.' })
  })

  it('borne le texte, parce qu’il voyage dans la liste de TOUTES les pages', () => {
    const long = 'mot '.repeat(200)
    const digest = contentDigest(`:::content{type=etat}\n${long}\n:::\n`, 40)
    expect(digest['etat']?.length).toBeLessThanOrEqual(41)
    expect(digest['etat']?.endsWith('…')).toBe(true)
  })

  it('garde le PREMIER quand une page en porte deux du même sujet', () => {
    const page = ':::content{type=etat}\nUn.\n:::\n\n:::content{type=etat}\nDeux.\n:::\n'
    expect(contentDigest(page)).toEqual({ etat: 'Un.' })
  })

  it('ignore un bloc sans sujet, et une page qui n’en porte aucun', () => {
    expect(contentDigest(':::content\nSans sujet.\n:::\n')).toEqual({})
    expect(contentDigest('# Titre\n\nDe la prose.\n')).toEqual({})
  })

  it('aplatit ce qui est écrit dedans, liens et gras compris', () => {
    const page = ':::content{type=etat}\nUn **lot** et [un lien](x.md).\n:::\n'
    // Et la ponctuation reste collée : une phrase est un seul flot de texte,
    // pas une liste de morceaux à séparer.
    expect(contentDigest(page)['etat']).toBe('Un lot et un lien.')
  })
})
