// @vitest-environment jsdom
/**
 * A plugin's block, drawn inside somebody's page.
 *
 * The facet existed on paper long before this: the loader narrowed it, and
 * nothing ever read the result. What these guard is the wiring that closed
 * that gap — and the two properties that make a block safe to put in a
 * document: it is handed a URL it could not have built itself, and it cannot
 * take the page down with it.
 */

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { forgetContributedBlocks, registerBlocks } from '@antorfr/demeura-content'

import { Reader } from '../src/editor/Reader.js'
import type { BlockProps } from '../src/plugins/contract.js'

const PARCOURS = {
  parcours: { content: 'empty', description: 'A walk.', attributes: { source: { required: true } } },
} as const

const page = 'Avant.\n\n:::parcours{source="assets/val.parcours.json"}\n:::\n\nAprès.\n'

afterEach(() => forgetContributedBlocks())

describe('drawing one', () => {
  it('hands the component its attributes and a fetchable URL', () => {
    registerBlocks(PARCOURS)
    const Parcours = ({ attributes, resolve }: BlockProps) => (
      <div data-testid="parcours">{resolve(attributes['source'] ?? '')}</div>
    )
    render(
      <Reader markdown={page} path="domaines/voyages/broceliande-2026/val.md" blocks={{ parcours: Parcours }} />,
    )
    // Relative to the PAGE's folder, and pointing at the file route: neither
    // is something the plugin could have worked out on its own.
    expect(screen.getByTestId('parcours').textContent).toBe(
      '/api/files/domaines/voyages/broceliande-2026/assets/val.parcours.json',
    )
    // The prose around it is untouched.
    expect(screen.getByText('Avant.')).toBeTruthy()
    expect(screen.getByText('Après.')).toBeTruthy()
  })

  it('reads the other shell’s spelling as the same block', () => {
    registerBlocks(PARCOURS)
    const Parcours = ({ attributes }: BlockProps) => <i>{attributes['source']}</i>
    render(
      <Reader
        markdown={'{% parcours source="assets/val.parcours.json" /%}\n'}
        path="voyages/val.md"
        blocks={{ parcours: Parcours }}
      />,
    )
    expect(screen.getByText('assets/val.parcours.json')).toBeTruthy()
  })

  it('gives a flow block its body, and an empty one none', () => {
    registerBlocks({
      encadre: { content: 'flow', description: 'A framed aside.' },
      jeton: { content: 'empty', description: 'A token.' },
    })
    const seen: Record<string, boolean> = {}
    const spy = (name: string) => ({ children }: BlockProps) => {
      seen[name] = children !== undefined
      return <div>{children}</div>
    }
    render(
      <Reader
        markdown={':::encadre\nDu texte.\n:::\n\n:::jeton\n:::\n'}
        path="x.md"
        blocks={{ encadre: spy('encadre'), jeton: spy('jeton') }}
      />,
    )
    expect(seen).toEqual({ encadre: true, jeton: false })
    expect(screen.getByText('Du texte.')).toBeTruthy()
  })
})

describe('when it cannot be drawn', () => {
  it('says so where the block is, rather than drawing nothing', () => {
    registerBlocks(PARCOURS)
    // Registered but no component — the plugin's `blocks` module failed to
    // load. The page still reads; the gap is visible and reportable.
    render(<Reader markdown={page} path="x.md" />)
    expect(screen.getByText(/does not render yet/)).toBeTruthy()
    expect(screen.getByText('Avant.')).toBeTruthy()
  })

  it('keeps the words a flow block held, rather than losing them with it', () => {
    registerBlocks({ encadre: { content: 'flow', description: 'A framed aside.' } })
    // No component: the plugin is off, or its module failed. The frame is
    // gone; the prose inside it must not be.
    render(<Reader markdown={':::encadre\nDu texte encadré.\n:::\n'} path="x.md" />)
    expect(screen.getByText(/does not render yet/)).toBeTruthy()
    expect(screen.getByText('Du texte encadré.')).toBeTruthy()
  })

  it('keeps a throwing block from taking the page with it', () => {
    registerBlocks(PARCOURS)
    // React logs the caught error; the noise would drown the run's output.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('no such file')
    }
    render(<Reader markdown={page} path="x.md" blocks={{ parcours: Boom }} />)
    expect(screen.getByText('no such file')).toBeTruthy()
    // The whole point: the text around the block survived.
    expect(screen.getByText('Avant.')).toBeTruthy()
    expect(screen.getByText('Après.')).toBeTruthy()
    quiet.mockRestore()
  })
})
