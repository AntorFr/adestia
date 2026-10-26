// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MissingPage } from '../src/app/MissingPage.js'
import { trailOf } from '../src/app/trail.js'

const base = {
  settings: undefined,
  openApp: undefined,
  loaded: [],
  pluginTrail: { id: '', crumbs: [] },
  stores: [],
  t: (key: string) => key,
}

describe('the trail of a page at the root', () => {
  it('invents no folder from the file name, even when that name would be accepted', () => {
    // `notes.m` is what slicing off the last character of `notes.md` yields.
    const pages = [
      { path: 'notes.md', title: 'Notes', fields: {} },
      { path: 'notes.m/autre.md', title: 'Autre', fields: {} },
    ]
    const trail = trailOf({
      ...base,
      page: { path: 'notes.md', title: 'Notes' },
      section: 'notes.m',
      pages,
    })
    expect(trail).toEqual([{ label: 'Notes' }])
  })

  it('keeps the folders of a nested page', () => {
    const pages = [
      { path: 'a/INDEX.md', title: 'Alpha', fields: {} },
      { path: 'a/b/INDEX.md', title: 'Beta', fields: {} },
      { path: 'a/b/c.md', title: 'Cee', fields: {} },
    ]
    const trail = trailOf({ ...base, page: { path: 'a/b/c.md', title: 'Cee' }, section: undefined, pages })
    expect(trail).toEqual([
      { folder: 'a', label: 'Alpha' },
      { folder: 'a/b', label: 'Beta' },
      { label: 'Cee' },
    ])
  })
})

describe('the missing page at the root', () => {
  it('leads to Home', () => {
    const { container } = render(<MissingPage path="notes.md" status={404} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('#/')
    expect(link?.textContent).toBe('Home')
  })
})
