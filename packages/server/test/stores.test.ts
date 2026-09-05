/**
 * The composition, tested on its own — before a single route is rewired.
 *
 * Everything the rest of the server will stop knowing lives in `stores.ts`:
 * where the bytes are, how many roots there are, which one wins, and where the
 * traversal guard applies. Testing it here rather than through the routes is
 * what lets the routes be a rename instead of a rewrite.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  candidatesOf,
  fileIn,
  listAll,
  logicalOf,
  resolveStores,
  targetFor,
  type Store,
} from '../src/stores.js'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'adestia-stores-'))
})

const write = async (path: string, content = 'x') => {
  await mkdir(join(workspace, path, '..'), { recursive: true })
  await writeFile(join(workspace, path), content)
}

/** The reference shape: a personal store at the root, a shared one beside it. */
const two = () =>
  resolveStores(
    [
      { id: 'perso', path: 'perso' },
      { id: 'famille', path: 'famille', label: 'Famille', hue: 'violet' },
    ],
    workspace,
  ).stores

describe('resolveStores', () => {
  it('makes the single store the default, unasked', () => {
    const { stores, issues } = resolveStores([{ id: 'perso', path: 'pages' }], workspace)
    expect(issues).toEqual([])
    expect(stores[0]?.isDefault).toBe(true)
    expect(stores[0]?.at).toBe('')
    // An operator with one store writes nothing; the store still has a label,
    // because the interface has to call it something the day a second appears.
    expect(stores[0]?.label).toBe('perso')
  })

  it('puts the default first, whatever the declaration order', () => {
    const { stores } = resolveStores(
      [
        { id: 'famille', path: 'famille' },
        { id: 'perso', path: 'perso', default: true },
      ],
      workspace,
    )
    expect(stores.map((s) => s.id)).toEqual(['perso', 'famille'])
  })

  it('refuses a default mounted below the root', () => {
    // Without a store at level zero the tree has no root, and every path would
    // begin inside somebody's subfolder.
    const { issues } = resolveStores(
      [{ id: 'perso', path: 'perso', at: 'domaines', default: true }],
      workspace,
    )
    expect(issues.join(' ')).toContain('cannot declare "at"')
  })

  it('refuses two defaults and two identical ids', () => {
    const { issues } = resolveStores(
      [
        { id: 'perso', path: 'a', default: true },
        { id: 'perso', path: 'b', default: true },
      ],
      workspace,
    )
    expect(issues.join(' ')).toContain('both claim to be the default')
    expect(issues.join(' ')).toContain('two stores are called')
  })

  it('resolves a relative path against the workspace and keeps an absolute one', () => {
    const { stores } = resolveStores(
      [
        { id: 'perso', path: 'pages' },
        { id: 'famille', path: '/shared/famille' },
      ],
      workspace,
    )
    expect(stores[0]?.dir).toBe(join(workspace, 'pages'))
    expect(stores[1]?.dir).toBe('/shared/famille')
  })

  it('normalizes a mount point', () => {
    const { stores } = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'famille', path: 'f', at: '/voyages/famille/' },
      ],
      workspace,
    )
    expect(stores[1]?.at).toBe('voyages/famille')
  })
})

describe('fileIn', () => {
  it('strips the mount point before touching the disk', () => {
    const [, famille] = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'famille', path: '/shared/voyage', at: 'voyages/famille' },
      ],
      workspace,
    ).stores as [Store, Store]
    // The logical name says `voyages/famille`, the disk says `/shared/voyage`.
    // Nothing outside this module is allowed to know that.
    expect(fileIn(famille, 'voyages/famille/italie.md')).toBe('/shared/voyage/italie.md')
    // A path outside this store's mount point is not this store's business.
    expect(fileIn(famille, 'voyages/italie.md')).toBeUndefined()
  })

  it('refuses to walk out, store by store', () => {
    const [perso] = two() as [Store]
    expect(fileIn(perso, '../famille/italie.md')).toBeUndefined()
    expect(fileIn(perso, 'domaines/../../famille/italie.md')).toBeUndefined()
    // The mount point is not a way in either.
    const [, famille] = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'famille', path: 'famille', at: 'voyages/famille' },
      ],
      workspace,
    ).stores as [Store, Store]
    expect(fileIn(famille, 'voyages/famille/../../../etc/passwd')).toBeUndefined()
  })

  it('refuses a NUL', () => {
    const [perso] = two() as [Store]
    expect(fileIn(perso, 'italie.md\0.png')).toBeUndefined()
  })
})

describe('logicalOf', () => {
  it('gives back the name the product speaks, mount point included', () => {
    const stores = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'famille', path: 'famille', at: 'voyages/famille' },
      ],
      workspace,
    ).stores
    expect(logicalOf(stores, join(workspace, 'perso/domaines/x.md'))).toBe('domaines/x.md')
    expect(logicalOf(stores, join(workspace, 'famille/italie.md'))).toBe(
      'voyages/famille/italie.md',
    )
    expect(logicalOf(stores, '/elsewhere/x.md')).toBeUndefined()
  })
})

describe('candidatesOf', () => {
  it('returns every copy, the default first', async () => {
    await write('perso/voyages/italie.md')
    await write('famille/voyages/italie.md')
    const found = await candidatesOf(two(), 'voyages/italie.md')
    expect(found.map((c) => c.store.id)).toEqual(['perso', 'famille'])
  })

  it('returns the shared copy alone when the default does not carry it', async () => {
    await write('famille/voyages/corse.md')
    const found = await candidatesOf(two(), 'voyages/corse.md')
    expect(found.map((c) => c.store.id)).toEqual(['famille'])
  })

  it('ignores a directory of the same name', async () => {
    await mkdir(join(workspace, 'perso/voyages/italie.md'), { recursive: true })
    expect(await candidatesOf(two(), 'voyages/italie.md')).toEqual([])
  })
})

describe('listAll', () => {
  it('is the identity on a single store', async () => {
    await write('perso/a.md')
    await write('perso/domaines/b.md')
    const single = resolveStores([{ id: 'perso', path: 'perso' }], workspace).stores
    const { entries, collisions } = await listAll(single, { keep: (name) => name.endsWith('.md') })
    expect(entries.map((e) => e.path).sort()).toEqual(['a.md', 'domaines/b.md'])
    expect(collisions).toEqual([])
  })

  it('merges homonymous folders and reports homonymous files', async () => {
    await write('perso/voyages/italie.md')
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/italie.md')
    await write('famille/voyages/baden.md')
    const { entries, collisions } = await listAll(two(), { keep: (name) => name.endsWith('.md') })
    // One folder on screen, four cards, and the clash named rather than hidden.
    expect(entries.map((e) => `${e.path}@${e.store.id}`).sort()).toEqual([
      'voyages/baden.md@famille',
      'voyages/italie.md@famille',
      'voyages/italie.md@perso',
      'voyages/lisbonne.md@perso',
    ])
    expect(collisions).toEqual(['voyages/italie.md'])
    // Precedence: the first occurrence is what a bare address resolves to.
    expect(entries.find((e) => e.path === 'voyages/italie.md')?.store.id).toBe('perso')
  })

  it('reaches a store mounted below the folder being asked for', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/italie.md')
    const stores = resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'famille', path: 'famille', at: 'voyages/famille' },
      ],
      workspace,
    ).stores
    const { entries } = await listAll(stores, { under: 'voyages', keep: (name) => name.endsWith('.md') })
    expect(entries.map((e) => e.path).sort()).toEqual([
      'voyages/famille/italie.md',
      'voyages/lisbonne.md',
    ])
  })

  it('skips the plumbing and survives a store that is not mounted', async () => {
    await write('perso/.git/config')
    await write('perso/.claude/settings.json')
    await write('perso/a.md')
    // `famille` is declared and its directory does not exist: one circle
    // unmounted must not take the others down.
    const { entries } = await listAll(two(), { keep: (name) => name.endsWith('.md') })
    expect(entries.map((e) => e.path)).toEqual(['a.md'])
  })
})

describe('targetFor', () => {
  it('sends an existing page back to its own store', async () => {
    await write('famille/voyages/italie.md')
    const target = await targetFor(two(), 'voyages/italie.md')
    expect(target.kind === 'store' && target.store.id).toBe('famille')
  })

  it('sends a new page to the only store carrying its folder', async () => {
    await write('famille/voyages/baden.md')
    const target = await targetFor(two(), 'voyages/corse.md')
    expect(target.kind === 'store' && target.store.id).toBe('famille')
  })

  it('refuses to choose when several stores carry the folder', async () => {
    await write('perso/voyages/lisbonne.md')
    await write('famille/voyages/baden.md')
    const target = await targetFor(two(), 'voyages/corse.md')
    expect(target.kind).toBe('ambiguous')
    expect(target.kind === 'ambiguous' && target.stores.map((s) => s.id)).toEqual([
      'perso',
      'famille',
    ])
  })

  it('creates a brand-new folder where this shell writes', async () => {
    const target = await targetFor(two(), 'nouveau/fiche.md')
    expect(target.kind === 'store' && target.store.id).toBe('perso')
  })

  it('puts a page at the root in the default store', async () => {
    const target = await targetFor(two(), 'notes.md')
    expect(target.kind === 'store' && target.store.id).toBe('perso')
  })
})
