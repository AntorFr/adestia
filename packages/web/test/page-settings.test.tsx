// @vitest-environment jsdom
/**
 * A page's properties, drawn from what the core, the plugins and the CORPUS
 * know about it.
 *
 * The three sources are the whole design, and each one has a failure worth
 * pinning: the core's fields must appear on a page that carries nothing, a
 * plugin's must appear only for the type that claims them, and the values
 * must come from what the workspace already writes — otherwise the form is a
 * questionnaire that teaches a second vocabulary beside the one in the files.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Indexed } from '@antorfr/adestia-content'

import { PageSettings } from '../src/editor/PageSettings.js'
import { formFor, pagesOfType, valuesInUse } from '../src/editor/pageform.js'

const PAGES: readonly Indexed[] = [
  { path: 'a.md', fields: { type: 'projet', domaine: 'atelier', id: 'servante', title: 'Servante' } },
  { path: 'b.md', fields: { type: 'projet', domaine: 'atelier', id: 'etabli', title: 'Établi' } },
  { path: 'c.md', fields: { type: 'projet', domaine: 'maison' } },
  { path: 'd.md', fields: { type: 'tache', tags: ['chene', 'etabli'] } },
]

const TODO = {
  tache: {
    plugin: 'todo',
    fields: {
      due: { kind: 'date' as const, label: 'Due' },
      projet: { kind: 'reference' as const, label: 'Project', of: 'projet' },
    },
  },
}

const setup = (fields: Record<string, string | readonly string[]>, extra = {}) => {
  const onChange = vi.fn()
  render(
    <PageSettings
      fields={fields}
      opaque={[]}
      pages={PAGES}
      onChange={onChange}
      onClose={() => {}}
      {...extra}
    />,
  )
  return onChange
}

describe('what the form offers', () => {
  /** A field's own ROW, never its entry in the "add a field" list. */
  const row = (label: string) => screen.queryByText(label, { selector: 'label > span' })

  it('draws the core’s own fields on a page that carries nothing', () => {
    setup({})
    for (const label of ['Title', 'Subject', 'State', 'Tags']) {
      expect(row(label)).toBeTruthy()
    }
    // …and not the ones nobody asked for. A page with no properties must not
    // read as a page with ten things missing — they wait behind "add a field",
    // which is where this same word legitimately appears.
    expect(row('Identifier')).toBeNull()
    expect(row('Colour')).toBeNull()
    expect(screen.getByText('Identifier', { selector: 'option' })).toBeTruthy()
  })

  it('draws a field the page carries even when the core does not ask for it', () => {
    setup({ id: 'servante' })
    expect(row('Identifier')).toBeTruthy()
  })

  it('offers the values the workspace already writes, most used first', () => {
    setup({ domaine: 'atelier' })
    const select = screen.getByText('Domain').closest('label')?.querySelector('select')
    expect([...(select?.options ?? [])].map((one) => one.value)).toEqual([
      '',
      'atelier',
      'maison',
      '\u0000free',
    ])
  })

  it('adds a plugin’s fields for the type that claims them, and only then', () => {
    setup({ type: 'tache' }, { contributions: TODO })
    expect(screen.getByText('Due')).toBeTruthy()
    expect(screen.getByText('todo')).toBeTruthy()
  })

  /**
   * The defect this mechanism was built for: a French instance drawing an
   * English form, while the plugin's own table three files away already knew
   * the word. The manifest is read before the plugin's code runs, so the
   * label arrives in English and the plugin's table is what translates it.
   */
  it('says a plugin’s labels in the plugin’s own words', () => {
    setup(
      { type: 'tache' },
      {
        contributions: {
          tache: {
            ...TODO.tache,
            words: { Due: 'Échéance', todo: 'Tâches', 'When it is due.': 'Quand elle est due.' },
          },
        },
        t: (key: string) => (key === 'Project' ? 'Projet' : key),
      },
    )

    expect(row('Échéance')).toBeTruthy()
    expect(row('Due')).toBeNull()
    expect(screen.getByText('Tâches')).toBeTruthy()
    // And the shell's own table still answers for what the plugin did not
    // translate — the fallback, not a third rule.
    expect(row('Projet')).toBeTruthy()
  })

  it('does not lend one type’s fields to another', () => {
    setup({ type: 'projet' }, { contributions: TODO })
    expect(screen.queryByText('Due')).toBeNull()
  })

  it('points a reference at the pages that can answer, by id', () => {
    setup({ type: 'tache' }, { contributions: TODO })
    const select = screen.getByText('Project').closest('label')?.querySelector('select')
    expect([...(select?.options ?? [])].map((one) => one.value)).toEqual(['', 'etabli', 'servante'])
  })

  it('keeps a reference whose target is gone rather than reading it as none', () => {
    setup({ type: 'tache', projet: 'disparu' }, { contributions: TODO })
    const select = screen.getByText('Project').closest('label')?.querySelector('select')
    expect(select?.value).toBe('disparu')
  })
})

describe('what the form writes', () => {
  /** The control of a field's row — required, so a typo in a label fails here. */
  const control = <K extends keyof HTMLElementTagNameMap>(label: string, tag: K) => {
    const found = screen.getByText(label).closest('label')?.querySelector(tag)
    if (!found) throw new Error(`no <${tag}> in the row for "${label}"`)
    return found
  }

  it('writes the chosen value', () => {
    const onChange = setup({ domaine: 'atelier' })
    fireEvent.change(control('Domain', 'select'), { target: { value: 'maison' } })
    expect(onChange).toHaveBeenCalledWith('domaine', 'maison')
  })

  it('REMOVES a field that was emptied, rather than writing it empty', () => {
    const onChange = setup({ domaine: 'atelier' })
    fireEvent.change(control('Domain', 'select'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('domaine', undefined)
  })

  it('takes a word the corpus has never seen', () => {
    const onChange = setup({})
    const select = screen.getByText('Domain').closest('label')?.querySelector('select')
    // The page carries no domain, so the row is reached through "add a field".
    expect(select).toBeUndefined()
    fireEvent.change(screen.getByDisplayValue('+ add a field…'), { target: { value: 'domaine' } })
    fireEvent.change(control('Domain', 'select'), { target: { value: '\u0000free' } })
    fireEvent.change(control('Domain', 'input'), { target: { value: 'garage' } })
    expect(onChange).toHaveBeenLastCalledWith('domaine', 'garage')
  })

  it('keeps the value when asked for a word of one’s own, rather than clearing it', () => {
    // "another value…" is how somebody CORRECTS a word, not only how they
    // replace one. Clearing on the way in made it a delete button.
    const onChange = setup({ domaine: 'atelier' })
    fireEvent.change(control('Domain', 'select'), { target: { value: '\u0000free' } })
    expect(onChange).not.toHaveBeenCalled()
    expect((control('Domain', 'input') as HTMLInputElement).value).toBe('atelier')
  })

  it('adds and removes one tag at a time', () => {
    const onChange = setup({ tags: ['etabli'] })
    const input = screen.getByPlaceholderText('add…')
    fireEvent.change(input, { target: { value: 'chene' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('tags', ['etabli', 'chene'])
    fireEvent.click(screen.getByLabelText('Remove tag etabli'))
    expect(onChange).toHaveBeenLastCalledWith('tags', undefined)
  })
})

describe('what the form refuses to touch', () => {
  it('shows a structure it does not model, and offers no control for it', () => {
    render(
      <PageSettings
        fields={{ title: 'X' }}
        opaque={[{ key: 'cotes', text: 'cotes:\n  hauteur: 1000' }]}
        pages={PAGES}
        onChange={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Kept as written')).toBeTruthy()
    expect(screen.getByText(/hauteur: 1000/)).toBeTruthy()
  })

  it('says a page it cannot parse is not editable, and draws no field at all', () => {
    render(
      <PageSettings
        fields={{}}
        opaque={[]}
        broken
        pages={PAGES}
        onChange={vi.fn()}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText('Title')).toBeNull()
    expect(screen.getByText(/does not parse/)).toBeTruthy()
  })

  it('yields the title to a caller that already draws one', () => {
    setup({ title: 'Servante' }, { without: ['title'] })
    expect(screen.queryByText('Title')).toBeNull()
  })
})

describe('the corpus, read directly', () => {
  it('counts values and files the busiest first', () => {
    expect(valuesInUse(PAGES, 'domaine')).toEqual(['atelier', 'maison'])
    // A list field contributes each of its words, not its printed form.
    expect(valuesInUse(PAGES, 'tags')).toEqual(['chene', 'etabli'])
  })

  it('offers only the pages that can be named — those with an id', () => {
    expect(pagesOfType(PAGES, 'projet').map((one) => one.id)).toEqual(['etabli', 'servante'])
  })

  it('keeps a key nobody declares visible, so it can be seen and removed', () => {
    const { unknown } = formFor({ present: { chantier: 'cuisine' }, pages: PAGES })
    expect(unknown).toEqual(['chantier'])
  })
})
