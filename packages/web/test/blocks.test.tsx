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

import { forgetContributedBlocks, registerBlocks } from '@antorfr/adestia-content'

import { Reader } from '../src/editor/Reader.js'
import type { BlockProps } from '../src/plugins/contract.js'

const PARCOURS = {
  parcours: { content: 'empty', description: 'A walk.', attributes: { source: { required: true } } },
} as const

const page = 'Avant.\n\n:::parcours{source="assets/val.parcours.json"}\n:::\n\nAprès.\n'

afterEach(() => forgetContributedBlocks())

describe('blocks that share a line', () => {
  const TWO = { note: { content: 'empty', description: 'A note.' } } as const
  const Note = ({ attributes }: BlockProps) => <i data-testid="note">{attributes['w'] ?? 'full'}</i>

  const rowsIn = (container: HTMLElement) => [...container.querySelectorAll('.adestia-row')]

  it('gathers neighbours whose widths fit one line', () => {
    registerBlocks(TWO, { plugin: 'demo', kind: 'feature' })
    const { container } = render(
      <Reader
        markdown={':::note{w="1/2"}\n:::\n\n:::note{w="1/2"}\n:::\n'}
        path="p.md"
        blocks={{ demo: { note: Note } }}
      />,
    )
    const rows = rowsIn(container)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.querySelectorAll('.adestia-row__cell')).toHaveLength(2)
    // The cell says the share; the block itself never has to know.
    expect(rows[0]?.querySelector('.adestia-row__cell--1-2')).toBeTruthy()
  })

  it('starts a new line rather than shrinking one to fit', () => {
    // 2/3 then 1/2 do not add up. The second is not squeezed into a width
    // nobody asked for — it takes its own line.
    registerBlocks(TWO, { plugin: 'demo', kind: 'feature' })
    const { container } = render(
      <Reader
        markdown={':::note{w="2/3"}\n:::\n\n:::note{w="1/2"}\n:::\n'}
        path="p.md"
        blocks={{ demo: { note: Note } }}
      />,
    )
    expect(rowsIn(container)).toHaveLength(2)
  })

  it('fits three thirds, which do not add to one in binary', () => {
    registerBlocks(TWO, { plugin: 'demo', kind: 'feature' })
    const { container } = render(
      <Reader
        markdown={':::note{w="1/3"}\n:::\n\n:::note{w="1/3"}\n:::\n\n:::note{w="1/3"}\n:::\n'}
        path="p.md"
        blocks={{ demo: { note: Note } }}
      />,
    )
    expect(rowsIn(container)).toHaveLength(1)
    expect(rowsIn(container)[0]?.querySelectorAll('.adestia-row__cell')).toHaveLength(3)
  })

  it('leaves a full-width block alone, and prose between two breaks the run', () => {
    registerBlocks(TWO, { plugin: 'demo', kind: 'feature' })
    const { container } = render(
      <Reader
        markdown={':::note\n:::\n\n:::note{w="1/2"}\n:::\n\nDu texte.\n\n:::note{w="1/2"}\n:::\n'}
        path="p.md"
        blocks={{ demo: { note: Note } }}
      />,
    )
    // The full-width one is not in a row at all; the two halves are in two,
    // because a paragraph came between them.
    expect(rowsIn(container)).toHaveLength(2)
    expect(container.textContent).toContain('Du texte.')
  })
})

describe('drawing one', () => {
  it('hands the component its attributes and a fetchable URL', () => {
    registerBlocks(PARCOURS, { plugin: 'parcours', kind: 'feature' })
    const Parcours = ({ attributes, resolve }: BlockProps) => (
      <div data-testid="parcours">{resolve(attributes['source'] ?? '')}</div>
    )
    render(
      <Reader markdown={page} path="domaines/voyages/broceliande-2026/val.md" blocks={{ parcours: { parcours: Parcours } }} />,
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

  it('hands the block the page it sits in — logical path, store and fields', () => {
    // What `locate('.')` could not answer honestly: a page at the ROOT has an
    // empty folder, so deriving the scope from a relative path gives `.` and
    // a filter that matches nothing. And a folder is not the page anyway —
    // `fields` is what lets a block say "the tasks of THIS worksite".
    registerBlocks({ jeton: { content: 'empty', description: 'A token.' } }, { plugin: 'demo', kind: 'feature' })
    const seen: BlockProps[] = []
    const Jeton = (props: BlockProps) => {
      seen.push(props)
      return <div data-testid="jeton" />
    }
    render(
      <Reader
        markdown={':::jeton\n:::\n'}
        path="domaines/diy/garage.md"
        store="famille"
        fields={{ type: 'projet', id: '01M1RX' }}
        blocks={{ demo: { jeton: Jeton } }}
      />,
    )
    expect(seen[0]?.path).toBe('domaines/diy/garage.md')
    expect(seen[0]?.store).toBe('famille')
    expect(seen[0]?.fields).toEqual({ type: 'projet', id: '01M1RX' })
  })

  it('leaves the page absent where there is no page — prose in a bubble', () => {
    registerBlocks({ jeton: { content: 'empty', description: 'A token.' } }, { plugin: 'demo', kind: 'feature' })
    const seen: BlockProps[] = []
    const Jeton = (props: BlockProps) => {
      seen.push(props)
      return <div />
    }
    render(<Reader markdown={':::jeton\n:::\n'} blocks={{ demo: { jeton: Jeton } }} />)
    // Undefined rather than a guessed root: the same answer relative links
    // already give, for the same reason.
    expect(seen[0]?.path).toBeUndefined()
    expect(seen[0]?.store).toBeUndefined()
  })

  it('gives a flow block its body, and an empty one none', () => {
    registerBlocks(
      {
        encadre: { content: 'flow', description: 'A framed aside.' },
        jeton: { content: 'empty', description: 'A token.' },
      },
      { plugin: 'demo', kind: 'feature' },
    )
    const seen: Record<string, boolean> = {}
    const spy = (name: string) => ({ children }: BlockProps) => {
      seen[name] = children !== undefined
      return <div>{children}</div>
    }
    render(
      <Reader
        markdown={':::encadre\nDu texte.\n:::\n\n:::jeton\n:::\n'}
        path="x.md"
        blocks={{ demo: { encadre: spy('encadre'), jeton: spy('jeton') } }}
      />,
    )
    expect(seen).toEqual({ encadre: true, jeton: false })
    expect(screen.getByText('Du texte.')).toBeTruthy()
  })

  it('hands a flow block its list items as text, and an empty one none', () => {
    registerBlocks(
      {
        planning: { content: 'flow', description: 'Body as data.' },
        jeton: { content: 'empty', description: 'A token.' },
      },
      { plugin: 'demo', kind: 'feature' },
    )
    const seen: Record<string, readonly string[] | undefined> = {}
    const spy = (name: string) => ({ items }: BlockProps) => {
      seen[name] = items
      return <div />
    }
    render(
      <Reader
        markdown={':::planning\n- Cadrage: 2026-01-15 → 2026-03-01\n- Recette: 2026-06-01\n:::\n\n:::jeton\n:::\n'}
        path="x.md"
        blocks={{ demo: { planning: spy('planning'), jeton: spy('jeton') } }}
      />,
    )
    // The exact strings the grammar read, label and dates in one piece —
    // parsing them is the block's business, not the reader's.
    expect(seen['planning']).toEqual(['Cadrage: 2026-01-15 → 2026-03-01', 'Recette: 2026-06-01'])
    expect(seen['jeton']).toBeUndefined()
  })
})

describe('when it cannot be drawn', () => {
  it('says so where the block is, rather than drawing nothing', () => {
    registerBlocks(PARCOURS, { plugin: 'parcours', kind: 'feature' })
    // Registered but no component — the plugin's `blocks` module failed to
    // load. The page still reads; the gap is visible and reportable.
    render(<Reader markdown={page} path="x.md" />)
    expect(screen.getByText(/does not render yet/)).toBeTruthy()
    expect(screen.getByText('Avant.')).toBeTruthy()
  })

  it('keeps the words a flow block held, rather than losing them with it', () => {
    registerBlocks(
      { encadre: { content: 'flow', description: 'A framed aside.' } },
      { plugin: 'demo', kind: 'feature' },
    )
    // No component: the plugin is off, or its module failed. The frame is
    // gone; the prose inside it must not be.
    render(<Reader markdown={':::encadre\nDu texte encadré.\n:::\n'} path="x.md" />)
    expect(screen.getByText(/does not render yet/)).toBeTruthy()
    expect(screen.getByText('Du texte encadré.')).toBeTruthy()
  })

  it('keeps a throwing block from taking the page with it', () => {
    registerBlocks(PARCOURS, { plugin: 'parcours', kind: 'feature' })
    // React logs the caught error; the noise would drown the run's output.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => {
      throw new Error('no such file')
    }
    render(<Reader markdown={page} path="x.md" blocks={{ parcours: { parcours: Boom } }} />)
    expect(screen.getByText('no such file')).toBeTruthy()
    // The whole point: the text around the block survived.
    expect(screen.getByText('Avant.')).toBeTruthy()
    expect(screen.getByText('Après.')).toBeTruthy()
    quiet.mockRestore()
  })
})
