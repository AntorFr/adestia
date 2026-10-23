// @vitest-environment jsdom
/**
 * One language per screen: the editor's chrome and the reader's notes speak
 * the instance's language, and never a word of the other.
 *
 * Each case renders in `fr` then `en` and checks the output of one language
 * against the words of the OTHER as they were before the page tranche (the
 * list in the task's exit criterion). Expected strings are literal.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { VOCABULARY } from '@antorfr/adestia-content'

import { translator } from '../src/app/i18n.js'
import { BlockSettings } from '../src/editor/BlockSettings.js'
import { directiveView } from '../src/editor/blockview.js'
import { Reader } from '../src/editor/Reader.js'
import { SaveStatus } from '../src/editor/SaveStatus.js'
import { buildBlockTypes } from '../src/editor/toolbar.js'

afterEach(cleanup)

const fr = translator('fr')
const en = translator('en')

const FRENCH_IN_ENGLISH = [
  'Fermer', 'Réglages du bloc', 'Ce bloc', 'Déplacer le bloc', 'Aperçu', 'Liste à puces', 'Aucun fichier ici.',
  'Enregistrement', 'Enregistré', 'introuvable',
]
const ENGLISH_IN_FRENCH = ['Saving…', 'Saved', 'this page was not found', 'The agent changed this page']

const absent = (text: string, words: readonly string[]) => {
  for (const word of words) expect(text, `"${word}"`).not.toContain(word)
}

const settings = (t: (key: string) => string) => {
  const { container, baseElement } = render(
    <BlockSettings
      name="list"
      spec={VOCABULARY['list']}
      attributes={{ bogus: 'x' }}
      onChange={() => {}}
      onClose={() => {}}
      t={t}
    />,
  )
  return (baseElement.textContent ?? '') + container.innerHTML + baseElement.innerHTML
}

describe('BlockSettings', () => {
  it('speaks French, and none of the English words it used to carry', () => {
    const out = settings(fr)
    expect(out).toContain('Réglages du bloc')
    expect(out).toContain('Ce bloc')
    expect(out).toContain('Fermer')
    absent(out, ['Block settings', 'This block', 'aria-label="Close"'])
  })
  it('speaks English, and none of the French words', () => {
    const out = settings(en)
    expect(out).toContain('Block settings')
    expect(out).toContain('This block')
    absent(out, FRENCH_IN_ENGLISH)
  })
})

describe('the toolbar', () => {
  const labels = (t: (key: string) => string) => {
    const seen: string[] = []
    const builder = {
      addGroup(_key: string, label: string) { seen.push(label); return builder },
      addItem(_key: string, item: { label: string }) { seen.push(item.label); return builder },
    }
    buildBlockTypes(builder as never, t)
    return seen
  }
  it('French words, byte for byte', () => {
    expect(labels(fr)).toEqual([
      'Blocs de texte', 'Liste à puces', 'Liste numérotée', 'Titre', 'Sous-titre', 'Citation', 'Texte simple',
    ])
  })
  it('English words, none of French', () => {
    const out = labels(en)
    expect(out).toEqual(['Text blocks', 'Bullet list', 'Numbered list', 'Title', 'Subtitle', 'Quote', 'Plain text'])
  })
})

describe('the block bar', () => {
  const bar = (t: (key: string) => string) => {
    const host = document.createElement('div')
    document.body.append(host)
    const view = {
      dom: host,
      state: { doc: { resolve: () => ({ depth: 0 }) }, schema: { topNodeType: { create: () => ({}) } } },
    }
    const node = { type: { create: () => ({}) }, attrs: { attributes: { source: 'rows' } } }
    const made = directiveView('list', false, { t })({} as never)(node as never, view as never, () => 0)
    return made.dom.outerHTML
  }
  it('French', () => {
    const out = bar(fr)
    expect(out).toContain('aria-label="Déplacer le bloc"')
    expect(out).toContain('>Modifier<')
    absent(out, ['Move block', 'Delete block', 'Block settings', '>Edit<'])
    expect(out).toContain('aria-label="Réglages du bloc"'.replace('Réglages du bloc', fr('Block settings')))
  })
  it('English', () => {
    const out = bar(en)
    expect(out).toContain('aria-label="Move block"')
    expect(out).toContain('>Edit<')
    absent(out, FRENCH_IN_ENGLISH)
    absent(out, ['Modifier', 'Supprimer', 'Réglages'])
  })
})

describe('SaveStatus', () => {
  const states = [
    { kind: 'saving' },
    { kind: 'saved', normalized: false },
    { kind: 'saved', normalized: true },
    { kind: 'conflict' },
    { kind: 'rejected', diagnostics: [] },
  ] as const
  const all = (t: (key: string) => string) =>
    states.map((state) => {
      const { container } = render(<SaveStatus state={state} t={t} />)
      const text = container.textContent ?? ''
      cleanup()
      return text
    })
  it('French, literal', () => {
    expect(all(fr)).toEqual([
      'Enregistrement…',
      'Enregistré',
      'Enregistré, remis au style de la maison',
      expect.stringContaining('L’agent'),
      expect.stringMatching(/^Non enregistré : /),
    ])
    absent(all(fr).join('|'), ENGLISH_IN_FRENCH)
    absent(all(fr).join('|'), ['the page breaks', 'Not saved'])
  })
  it('English, literal', () => {
    expect(all(en)).toEqual([
      'Saving…',
      'Saved',
      'Saved, tidied to house style',
      'The agent changed this page. Reload to see its version.',
      'Not saved: the page breaks the vocabulary',
    ])
  })
})

describe('the reader’s notes', () => {
  const page = (locale: 'fr' | 'en') => {
    const { container } = render(
      <Reader
        markdown={'Voir [[fiche#01M1ZZZZZZZZZZZZZZZZZZZZZZ:la boucle]].\n\n:::list{source=files}\n:::\n'}
        pages={[]}
        locale={locale}
      />,
    )
    return container.innerHTML
  }
  it('French: no English note', () => {
    const out = page('fr')
    expect(out).toContain('cette fiche est introuvable')
    absent(out, ENGLISH_IN_FRENCH)
    absent(out, ['This list needs'])
  })
  it('English: no French note', () => {
    const out = page('en')
    expect(out).toContain('this page was not found')
    expect(out).toContain('This list needs the page whose files it shows.')
    absent(out, FRENCH_IN_ENGLISH)
  })
})
