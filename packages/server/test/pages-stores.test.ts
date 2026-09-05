/**
 * The routes, once memory is several places.
 *
 * The witness next door proves the single-store case did not move. This proves
 * the other half: what a second circle adds, and — more importantly — what the
 * routes REFUSE to decide. Every case below was argued before it was written,
 * and each one is a failure somebody would otherwise meet on their own corpus:
 * a card believed corrected while another was read, a save that forks a shared
 * page into a private copy, a listing that shows one of two homonyms and hides
 * the other.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { registerFiles } from '../src/files.js'
import { registerPages } from '../src/pages.js'
import { resolveStores, type Store } from '../src/stores.js'

let workspace: string
let stores: readonly Store[]
let app: FastifyInstance

const write = async (path: string, content = '---\ntitle: X\n---\n\nCorps.\n') => {
  await mkdir(join(workspace, path, '..'), { recursive: true })
  await writeFile(join(workspace, path), content)
}

/** Two circles: mine at the root, the family's beside it. */
const mount = async (declared = [{ id: 'perso', path: 'perso' }, { id: 'famille', path: 'famille', label: 'Famille', hue: 'violet' }]) => {
  stores = resolveStores(declared, workspace).stores
  app = Fastify()
  registerPages(app, { stores, locale: 'fr' })
  registerFiles(app, { stores, locale: 'fr' })
  await app.ready()
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'adestia-multi-'))
})

describe('what a second store adds to a listing', () => {
  it('names the store of every card, and the stores themselves', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/baden.md')
    await mount()

    const body = (await app.inject({ url: '/api/pages' })).json()
    expect(body.pages.map((p: { path: string; store: string }) => [p.path, p.store])).toEqual([
      ['voyages/baden.md', 'famille'],
      ['voyages/lisbonne.md', 'perso'],
    ])
    // The label and the hue travel once, with the list: the shell needs the
    // label to suffix a card and the hue to draw its rim, and a store carrying
    // nothing must still appear in a legend.
    expect(body.stores).toEqual([
      { id: 'perso', label: 'perso', default: true },
      { id: 'famille', label: 'Famille', hue: 'violet' },
    ])
  })

  it('shows BOTH copies of a homonym rather than hiding the loser', async () => {
    // The predecessor kept the winner and masked the other. A card that is
    // hidden is a card nobody can correct; showing two is a worse-looking
    // screen and a better outcome.
    await write('perso/voyages/italie.md')
    await write('famille/voyages/italie.md')
    await mount()

    const body = (await app.inject({ url: '/api/pages' })).json()
    expect(body.pages.map((p: { store: string }) => p.store)).toEqual(['perso', 'famille'])
  })

  it('merges two folders of the same name into one', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/baden.md')
    await mount()

    const index = (await app.inject({ url: '/api/pages/index' })).json()
    // One `voyages` on screen, not two: homonymous FOLDERS are the point of
    // composing, only homonymous FILES are a clash.
    expect(index.entries.map((e: { path: string }) => e.path)).toEqual([
      'voyages/baden.md',
      'voyages/lisbonne.md',
    ])
  })
})

describe('reading a page', () => {
  it('resolves the bare address to the default store', async () => {
    await write('perso/voyages/italie.md', '---\ntitle: Mienne\n---\n\nCorps.\n')
    await write('famille/voyages/italie.md', '---\ntitle: Familiale\n---\n\nCorps.\n')
    await mount()

    const page = (await app.inject({ url: '/api/pages/voyages/italie.md' })).json()
    expect(page.title).toBe('Mienne')
    expect(page.store).toBe('perso')
  })

  it('opens the other copy through the qualifier, which is not part of the name', async () => {
    await write('perso/voyages/italie.md', '---\ntitle: Mienne\n---\n\nCorps.\n')
    await write('famille/voyages/italie.md', '---\ntitle: Familiale\n---\n\nCorps.\n')
    await mount()

    const page = (
      await app.inject({ url: '/api/pages/voyages/italie.md?store=famille' })
    ).json()
    expect(page.title).toBe('Familiale')
    // The path is unchanged: the qualifier says WHERE, never WHAT.
    expect(page.path).toBe('voyages/italie.md')
  })

  it('refuses to arbitrate between two shared circles', async () => {
    // Precedence has a claim to make between mine and a peer's — a card in my
    // own store is one I made. Between two peers' circles it has none, so
    // answering either would be the exact failure this design exists against.
    await write('parents/voyages/italie.md')
    await write('famille/voyages/italie.md')
    stores = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'parents', path: 'parents', label: 'Parents' },
        { id: 'famille', path: 'famille', label: 'Famille' },
      ],
      workspace,
    ).stores
    app = Fastify()
    registerPages(app, { stores })
    await app.ready()

    const refused = await app.inject({ url: '/api/pages/voyages/italie.md' })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().candidates).toEqual([
      { store: 'parents', label: 'Parents' },
      { store: 'famille', label: 'Famille' },
    ])
  })

  it('falls back to precedence when the named store no longer carries it', async () => {
    // A qualified link is a hint, not a key: a page promoted from the family
    // circle to mine must keep opening something rather than 404.
    await write('perso/voyages/italie.md', '---\ntitle: Promue\n---\n\nCorps.\n')
    await mount()

    const page = await app.inject({ url: '/api/pages/voyages/italie.md?store=famille' })
    expect(page.statusCode).toBe(200)
    expect(page.json().store).toBe('perso')
  })
})

describe('writing a page', () => {
  it('sends an existing page back to its own store', async () => {
    // The trap this whole rule exists for: writing to the default instead
    // would fork the shared card, and since both copies are now drawn, the
    // author would see two cards where they corrected one.
    await write('famille/voyages/italie.md')
    await mount()

    const before = (await app.inject({ url: '/api/pages/voyages/italie.md' })).json()
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/pages/voyages/italie.md',
      payload: { markdown: '---\ntitle: Corrigée\n---\n\nCorps.\n', revision: before.revision },
    })

    expect(saved.statusCode).toBe(200)
    expect(saved.json().store).toBe('famille')
    expect(await readFile(join(workspace, 'famille/voyages/italie.md'), 'utf8')).toContain(
      'Corrigée',
    )
    // And nothing was created in the default store.
    await expect(readFile(join(workspace, 'perso/voyages/italie.md'), 'utf8')).rejects.toThrow()
  })

  it('creates a new page in the only store carrying its folder', async () => {
    await write('famille/voyages/baden.md')
    await mount()

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/pages/voyages/corse.md',
      payload: { markdown: '---\ntitle: Corse\n---\n\nCorps.\n' },
    })
    expect(saved.json().store).toBe('famille')
  })

  it('refuses to choose when both circles carry the folder', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/baden.md')
    await mount()

    const refused = await app.inject({
      method: 'PUT',
      url: '/api/pages/voyages/corse.md',
      payload: { markdown: '---\ntitle: Corse\n---\n\nCorps.\n' },
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().candidates).toEqual([
      { store: 'perso', label: 'perso' },
      { store: 'famille', label: 'Famille' },
    ])
  })

  it('takes the qualifier as the answer to that question', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/baden.md')
    await mount()

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/pages/voyages/corse.md?store=famille',
      payload: { markdown: '---\ntitle: Corse\n---\n\nCorps.\n' },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().store).toBe('famille')
  })
})

describe('attachments', () => {
  it('unions the companions of one logical folder across circles', async () => {
    // A trip's notes in mine, its photographs in the family's: the page shows
    // both, because the layout IS the pairing and the layout is now composed.
    await write('perso/voyages/italie.md')
    await mkdir(join(workspace, 'famille/voyages/assets'), { recursive: true })
    await writeFile(join(workspace, 'famille/voyages/assets/photo.jpg'), 'JPG')
    await writeFile(join(workspace, 'perso/voyages/devis.pdf'), 'PDF')
    await mount()

    const body = (await app.inject({ url: '/api/files?page=voyages/italie.md' })).json()
    expect(body.files.map((f: { path: string; store: string }) => [f.path, f.store])).toEqual([
      ['voyages/assets/photo.jpg', 'famille'],
      ['voyages/devis.pdf', 'perso'],
    ])
  })
})
