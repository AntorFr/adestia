// @vitest-environment jsdom
/**
 * The replacement page of a folder (AD-42) and the shell's **Folder** link (B-39/B-40).
 *
 * The defect each case guards: a `page` that opens nothing, a `?classic` that
 * the redirect swallows (no way back), a `page` naming a missing file that
 * shows an error, a link drawn on every page, or drawn by anything but the shell.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { App } from '../src/app/App.js'
import { FolderCorner } from '../src/app/ScreenEdges.js'
import { translator } from '../src/app/i18n.js'
import type { LoadedPlugin } from '../src/plugins/loader.js'
import {
  classicRoute,
  folderOwnedAt,
  folderRoute,
  replacedFolder,
  replacementOf,
} from '../src/app/owners.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

const PAGES = [
  { path: 'resume/synthese.md', title: 'Synthèse', fields: {} },
  { path: 'resume/autre.md', title: 'Autre', fields: {} },
  { path: 'ailleurs/note.md', title: 'Note', fields: {} },
]

function apiFetch(settings: Record<string, Record<string, unknown>>): typeof fetch {
  return ((url: string) => {
    if (String(url).startsWith('/api/instance')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INSTANCE) } as unknown as Response)
    }
    const target = String(url)
    if (target.startsWith('/api/pages/') && !target.startsWith('/api/pages/index')) {
      const path = decodeURIComponent(target.slice('/api/pages/'.length).split('?')[0] ?? '')
      const found = PAGES.find((entry) => entry.path === `${path}.md` || entry.path === path)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ path: found?.path ?? path, title: found?.title ?? path, markdown: '# corps', fields: {}, diagnostics: [], revision: 'r' }),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ entries: PAGES, conversations: [], folderSettings: settings, folders: ['resume', 'ailleurs'] }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

const entry = (path: string) => ({ path, title: path, fields: {} }) as never
const link = (container: HTMLElement) => container.querySelector('a[href$="?classic"]')

afterEach(() => {
  location.hash = ''
})

describe('folderRoute: the ladder', () => {
  const pages = [entry('resume/synthese.md')]

  it('ouvre la page choisie', () => {
    expect(folderRoute([], 'resume', pages, { resume: { page: 'synthese.md', revision: 'a' } })).toBe(
      '/page/resume/synthese',
    )
  })
  it('ignore un page absent : la liste', () => {
    expect(folderRoute([], 'resume', pages, { resume: { page: 'fantome.md', revision: 'a' } })).toBe('/section/resume')
    expect(folderRoute([], 'resume', [], { resume: { page: 'synthese.md', revision: 'a' } })).toBe('/section/resume')
  })
  it('ignore un page vide ou non textuel', () => {
    expect(replacementOf('resume', pages, { resume: { page: '', revision: 'a' } })).toBeUndefined()
    expect(replacementOf('resume', pages, { resume: { page: 3, revision: 'a' } } as never)).toBeUndefined()
  })
  it('sans réglage : la liste', () => {
    expect(folderRoute([], 'resume', pages, {})).toBe('/section/resume')
  })
  it('ne prend pas la page d’un autre dossier', () => {
    expect(folderRoute([], 'autre', pages, { autre: { page: 'synthese.md', revision: 'a' } })).toBe('/section/autre')
  })
  it('classicRoute', () => {
    expect(classicRoute('a/b')).toBe('/section/a/b?classic')
  })
  it('replacedFolder : seulement pour LA page de remplacement', () => {
    const settings = { resume: { page: 'synthese.md', revision: 'a' } }
    const all = [entry('resume/synthese.md'), entry('resume/autre.md'), entry('top.md')]
    expect(replacedFolder('resume/synthese', all, settings)).toBeUndefined() // sans extension : pas un chemin d'index
    expect(replacedFolder('resume/synthese.md', all, settings)).toBe('resume')
    expect(replacedFolder('resume/autre.md', all, settings)).toBeUndefined()
    expect(replacedFolder('top.md', all, settings)).toBeUndefined()
  })
  it('un dossier de plugin garde son écran même avec un page', () => {
    const plugin: LoadedPlugin = {
      id: 'voyages',
      kind: 'app',
      base: '/plugins/voyages/',
      absorbs: ['resume'],
      view: { component: (() => null) as never, route: '/voyages' },
    } as never
    const settings = { resume: { page: 'synthese.md', revision: 'a' } }
    expect(folderRoute([plugin], 'resume', [entry('resume/synthese.md')], settings)).toBe('/voyages')
    expect(folderOwnedAt([plugin], '/voyages', ['resume'], settings)).toBe('resume')
    expect(folderOwnedAt([plugin], '/section/resume', ['resume'], settings)).toBeUndefined()
    expect(folderOwnedAt([], '/voyages', ['resume'], settings)).toBeUndefined()
  })
})

describe('the shell', () => {
  const SET = { resume: { page: 'synthese.md', revision: 'a' } }

  it('#/section/<dossier> s’ouvre sur la page choisie, avec le lien Folder vers ?classic', async () => {
    location.hash = '#/section/resume'
    const { container } = render(<App fetchImpl={apiFetch(SET)} />)
    await waitFor(() => expect(location.hash).toBe('#/page/resume/synthese'))
    await waitFor(() => expect(link(container)).toBeTruthy())
    expect(link(container)?.getAttribute('href')).toBe('#/section/resume?classic')
    expect(link(container)?.textContent).toBe('Folder')
    expect(container.querySelectorAll('a[href$="?classic"]').length).toBe(1)
  })

  it('le lien Folder est une rangée du corps, avec icône et nom du dossier, jamais dans l’en-tête', async () => {
    location.hash = '#/section/resume'
    const { container } = render(<App fetchImpl={apiFetch(SET)} />)
    await waitFor(() => expect(link(container)).toBeTruthy())
    const a = link(container) as HTMLElement
    const row = a.closest('.adestia-folder-row')
    expect(row).toBeTruthy()
    expect(row?.closest('.adestia-canvas__body')).toBeTruthy()
    expect(a.closest('.adestia-canvas__header')).toBeNull()
    expect(a.querySelector('svg')).toBeTruthy()
    expect(row?.querySelector('.adestia-folder-row__name')?.textContent).toBe('Resume')
    expect(a.getAttribute('title')).toBe('Resume')
  })

  it('?classic ouvre la vue classique et y reste', async () => {
    location.hash = '#/section/resume?classic'
    const { container } = render(<App fetchImpl={apiFetch(SET)} />)
    await waitFor(() => expect(container.textContent).toContain('Autre'))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(location.hash).toBe('#/section/resume?classic')
    expect(link(container)).toBeNull()
    expect(container.textContent).toContain('Synthèse') // listed as a card
  })

  it('un page absent : la vue classique, sans écran d’erreur ni lien', async () => {
    location.hash = '#/section/resume'
    const { container } = render(<App fetchImpl={apiFetch({ resume: { page: 'fantome.md', revision: 'a' } })} />)
    await waitFor(() => expect(container.textContent).toContain('Autre'))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(location.hash).toBe('#/section/resume')
    expect(link(container)).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('une page ordinaire, et une page d’un autre dossier, ne portent pas le lien', async () => {
    location.hash = '#/page/resume/autre'
    const { container, unmount } = render(<App fetchImpl={apiFetch(SET)} />)
    await waitFor(() => expect(screen.queryAllByText('Autre').length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(link(container)).toBeNull()
    unmount()
    location.hash = '#/page/ailleurs/note'
    const second = render(<App fetchImpl={apiFetch(SET)} />)
    await waitFor(() => expect(screen.queryAllByText('Note').length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(link(second.container)).toBeNull()
  })
})

describe('the corner link of a plugin screen', () => {
  it('est un lien du shell vers ?classic, libellé en et fr', () => {
    for (const [locale, label] of [['en', 'Folder'], ['fr', 'Dossier']] as const) {
      const t = translator(locale)
      const { container, unmount } = render(<FolderCorner href="#/section/resume?classic" name="Résumé" t={t} />)
      const a = container.querySelector('a')
      expect(a?.getAttribute('href')).toBe('#/section/resume?classic')
      expect(a?.textContent).toBe(label)
      expect(a?.querySelector('svg')).toBeTruthy()
      expect(container.querySelector('.adestia-folder-row__name')?.textContent).toBe('Résumé')
      expect(container.querySelectorAll('a').length).toBe(1)
      unmount()
    }
  })
})
