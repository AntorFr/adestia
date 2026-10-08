/**
 * The dépôts-catalogues store, on its own — no route, no scan, no fetch.
 *
 * What this file exists to hold: a catalogue and its imports survive a
 * restart because they are read back from disk rather than kept only in
 * memory, and the write that puts them there is atomic and 0600 because it
 * can carry a token for a private repository.
 */

import { describe, expect, it } from 'vitest'

import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { InstructionCataloguesStore, type InstructionCatalogue } from '../src/instruction-catalogues-store.js'

async function dataDir() {
  return mkdtemp(join(tmpdir(), 'adestia-catalogues-'))
}

const CATALOGUE: InstructionCatalogue = {
  id: 'homelab-sdlc-core',
  repo: 'https://github.com/AntorFr/homelab-sdlc-core',
  ref: 'main',
  token: 'shh',
  imports: [{ itemPath: 'dev-flow/skills/tri', kind: 'skill', landedAt: '.claude/skills/tri' }],
}

describe('surviving a restart', () => {
  it('saves a catalogue and its import, and reads them back from a fresh store', async () => {
    const dir = await dataDir()
    const first = new InstructionCataloguesStore(dir)
    await first.save([CATALOGUE])

    // A fresh instance, as a restarted process would build one: nothing
    // carries over except what is on disk.
    const restarted = new InstructionCataloguesStore(dir)
    expect(await restarted.list()).toEqual([CATALOGUE])
  })

  it('reads an absent file as an empty list', async () => {
    const dir = await dataDir()
    expect(await new InstructionCataloguesStore(dir).list()).toEqual([])
  })

  it('keeps entries that still parse rather than throwing', async () => {
    const dir = await dataDir()
    const store = new InstructionCataloguesStore(dir)
    await store.save([CATALOGUE])
    await writeFile(
      join(dir, 'instruction-catalogues.json'),
      JSON.stringify({ catalogues: [CATALOGUE, { nonsense: true }, { ...CATALOGUE, id: 'bad', imports: 'nope' }] }),
    )
    expect((await store.list()).map((catalogue) => catalogue.id)).toEqual(['homelab-sdlc-core'])
  })
})

describe('writing the file', () => {
  it('writes atomically, at 0600, and leaves no temporary file behind', async () => {
    const dir = await dataDir()
    await new InstructionCataloguesStore(dir).save([CATALOGUE])

    const path = join(dir, 'instruction-catalogues.json')
    const info = await stat(path)
    expect(info.mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ catalogues: [CATALOGUE] })

    const leftovers = (await readdir(dir)).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('updates the cache only once the write has actually landed', async () => {
    const dir = await dataDir()
    const store = new InstructionCataloguesStore(dir)
    expect(store.current()).toEqual([])
    await store.save([CATALOGUE])
    expect(store.current()).toEqual([CATALOGUE])
  })

  it('serializes two saves so neither is lost to a read-modify-write race', async () => {
    const dir = await dataDir()
    const store = new InstructionCataloguesStore(dir)
    const second: InstructionCatalogue = { ...CATALOGUE, id: 'other-repo', imports: [] }

    await Promise.all([store.save([CATALOGUE]), store.save([CATALOGUE, second])])

    const restarted = new InstructionCataloguesStore(dir)
    expect((await restarted.list()).map((catalogue) => catalogue.id)).toEqual(['homelab-sdlc-core', 'other-repo'])
  })
})
