// @vitest-environment jsdom
/**
 * Une valeur de `view` inconnue se lit comme le défaut du bloc, sans
 * diagnostic : une variante d'affichage ne verrouille jamais une page (AD-35).
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parse, serialize, validateDocument } from '@antorfr/adestia-content'

import { Reader } from '../src/editor/Reader.js'

const FIGURES = ':::figures{view=zorglub}\n- Avancement: 62 %\n- Jalon: 12 sept.\n:::\n'
const LIST = ':::list{view=zorglub}\n- Un\n- Deux\n:::\n'

describe('view inconnu', () => {
  it.each([['figures', FIGURES], ['list', LIST]])('%s : aucun diagnostic', (_n, md) => {
    expect(validateDocument(parse(md))).toEqual([])
  })

  it('figures : dessiné en tuiles', () => {
    const { container } = render(<Reader markdown={FIGURES} />)
    expect(container.querySelectorAll('.adestia-figure')).toHaveLength(2)
    expect(container.querySelector('.adestia-figures--inline')).toBeNull()
  })

  it('list : dessinée, texte conservé, pas de page en lecture seule', () => {
    const { container } = render(<Reader markdown={LIST} />)
    expect(container.textContent).toContain('Deux')
    expect(container.textContent).not.toContain('does not know')
  })

  it('une valeur fermée d\'un autre attribut garde son erreur', () => {
    const d = validateDocument(parse(':::figures{view=tiles}\n- A: 1\n:::\n:::callout{type=zzz}\nx\n:::\n'))
    expect(d.length).toBeGreaterThan(0)
  })

  it('la valeur inconnue est réécrite telle quelle', () => {
    expect(serialize(parse(FIGURES))).toContain('view="zorglub"')
  })
})
