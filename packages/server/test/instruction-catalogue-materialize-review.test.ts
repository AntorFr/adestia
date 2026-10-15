/**
 * Review-phase tests for catalogue materialisation: derived from the task's
 * exit criterion and the design (technique.md), not from the implementation.
 */

import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { instructionZones, type Driver } from '@antorfr/adestia-drivers'
import { describe, expect, it } from 'vitest'

import {
  importCatalogueItem,
  materializeItem,
  withdrawCatalogueItem,
  type CatalogueItem,
} from '../src/instruction-catalogues.js'
import { InstructionCataloguesStore, type InstructionCatalogue } from '../src/instruction-catalogues-store.js'
import { MANAGED_MARKER } from '../src/skills.js'

const driverWith = (paths: ReturnType<NonNullable<Driver['instructionPaths']>>): Driver =>
  ({
    describe: () => Promise.resolve({ id: 'test', label: 'Test', cliVersion: '0', capabilities: [] }),
    env: () => Promise.resolve({}),
    instructionPaths: () => paths,
    runTurn: async function* () {},
  }) as Driver

const SKILL = driverWith([{ path: '.claude/skills', kind: 'skill', entry: '<name>/SKILL.md' }])
const CLAUDE_MD = driverWith([{ path: 'CLAUDE.md', kind: 'instruction' }])
const AGENTS = driverWith([{ path: '.claude/agents', kind: 'agent', entry: '<name>.md' }])

const tmp = (prefix: string) => mkdtemp(join(tmpdir(), prefix))
const cat = (id: string): InstructionCatalogue => ({ id, repo: `https://example.org/${id}`, ref: 'main', imports: [] })

async function clone(files: Record<string, string>): Promise<string> {
  const root = await tmp('adestia-rv-clone-')
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), body)
  }
  return root
}

const skillItem = (name: string): CatalogueItem => ({ itemPath: `s/${name}`, kind: 'skill', name, description: 'd' })

describe('single-file zone (CLAUDE.md, AGENTS.md)', () => {
  const item: CatalogueItem = { itemPath: 'rules/CLAUDE.md', kind: 'instruction', name: 'rules', description: 'd' }

  it('lands a stamped instruction when the file does not exist yet', async () => {
    const root = await clone({ 'rules/CLAUDE.md': '# Rules\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const { landedAt } = await materializeItem({ workspaceRoot, zones: instructionZones(CLAUDE_MD), catalogueRoot: root, item, catalogueId: 'c' })
    expect(landedAt).toBe('CLAUDE.md')
    expect(await readFile(join(workspaceRoot, 'CLAUDE.md'), 'utf8')).toContain(MANAGED_MARKER)
  })

  it('refuses with a readable error, and leaves the hand-written file untouched, when it already exists', async () => {
    const root = await clone({ 'rules/CLAUDE.md': '# Rules\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    await writeFile(join(workspaceRoot, 'CLAUDE.md'), '# Mine\n')
    await expect(
      materializeItem({ workspaceRoot, zones: instructionZones(CLAUDE_MD), catalogueRoot: root, item, catalogueId: 'c' }),
    ).rejects.toThrow(/CLAUDE\.md.*already exists/)
    expect(await readFile(join(workspaceRoot, 'CLAUDE.md'), 'utf8')).toBe('# Mine\n')
  })

  it('withdraw removes the managed single file but never a hand-written one', async () => {
    const root = await clone({ 'rules/CLAUDE.md': '# Rules\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('c')])
    await importCatalogueItem(store, 'c', root, workspaceRoot, instructionZones(CLAUDE_MD), item)
    await withdrawCatalogueItem(store, workspaceRoot, 'c', item.itemPath)
    await expect(readFile(join(workspaceRoot, 'CLAUDE.md'), 'utf8')).rejects.toThrow()

    // Hand-written file at the recorded path: the store entry goes, the file stays.
    await store.save([{ ...cat('c'), imports: [{ itemPath: item.itemPath, kind: 'instruction', landedAt: 'CLAUDE.md' }] }])
    await writeFile(join(workspaceRoot, 'CLAUDE.md'), '# Mine\n')
    await withdrawCatalogueItem(store, workspaceRoot, 'c', item.itemPath)
    expect(await readFile(join(workspaceRoot, 'CLAUDE.md'), 'utf8')).toBe('# Mine\n')
  })
})

describe('concurrent imports into the store', () => {
  it('two imports into two catalogues at once both survive', async () => {
    const rootA = await clone({ 's/a/SKILL.md': '---\nname: a\n---\n# A\n' })
    const rootB = await clone({ 's/b/SKILL.md': '---\nname: b\n---\n# B\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA'), cat('catB')])
    await Promise.all([
      importCatalogueItem(store, 'catA', rootA, workspaceRoot, instructionZones(SKILL), skillItem('a')),
      importCatalogueItem(store, 'catB', rootB, workspaceRoot, instructionZones(SKILL), skillItem('b')),
    ])
    const saved = await store.list()
    expect(saved.find((c) => c.id === 'catA')!.imports.map((i) => i.landedAt)).toEqual(['.claude/skills/a'])
    expect(saved.find((c) => c.id === 'catB')!.imports.map((i) => i.landedAt)).toEqual(['.claude/skills/b'])
  })

  it('an import and a withdrawal at once both take effect', async () => {
    const rootA = await clone({ 's/a/SKILL.md': '# A\n' })
    const rootB = await clone({ 's/b/SKILL.md': '# B\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA'), cat('catB')])
    await importCatalogueItem(store, 'catA', rootA, workspaceRoot, instructionZones(SKILL), skillItem('a'))
    await Promise.all([
      withdrawCatalogueItem(store, workspaceRoot, 'catA', 's/a'),
      importCatalogueItem(store, 'catB', rootB, workspaceRoot, instructionZones(SKILL), skillItem('b')),
    ])
    const saved = await store.list()
    expect(saved.find((c) => c.id === 'catA')!.imports).toEqual([])
    expect(saved.find((c) => c.id === 'catB')!.imports).toHaveLength(1)
  })

  it('a failed import leaves the store as it was and the queue usable', async () => {
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA')])
    await expect(
      importCatalogueItem(store, 'catA', '/nonexistent', workspaceRoot, instructionZones(SKILL), skillItem('a')),
    ).rejects.toThrow()
    expect((await store.list())[0]!.imports).toEqual([])
    const root = await clone({ 's/a/SKILL.md': '# A\n' })
    await importCatalogueItem(store, 'catA', root, workspaceRoot, instructionZones(SKILL), skillItem('a'))
    expect((await store.list())[0]!.imports).toHaveLength(1)
  })
})

describe('refusals', () => {
  it('unknown catalogue id is refused and writes nothing to the workspace', async () => {
    const root = await clone({ 's/a/SKILL.md': '# A\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA')])
    await expect(
      importCatalogueItem(store, 'nope', root, workspaceRoot, instructionZones(SKILL), skillItem('a')),
    ).rejects.toThrow(/nope/)
    await expect(readdir(join(workspaceRoot, '.claude'))).rejects.toThrow()
  })

  it('refused kind via importCatalogueItem leaves store and workspace untouched', async () => {
    const root = await clone({ 'a/x.agent.md': '# X\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA')])
    const item: CatalogueItem = { itemPath: 'a/x.agent.md', kind: 'agent', name: 'x', description: 'd' }
    await expect(
      importCatalogueItem(store, 'catA', root, workspaceRoot, instructionZones(SKILL), item),
    ).rejects.toThrow(/agent.*zone/)
    expect((await store.list())[0]!.imports).toEqual([])
  })

  it('agent item lands as a flat stamped file in the declared agent zone', async () => {
    const root = await clone({ 'a/x.agent.md': '---\nname: x\n---\n# X\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const item: CatalogueItem = { itemPath: 'a/x.agent.md', kind: 'agent', name: 'x', description: 'd' }
    const { landedAt } = await materializeItem({ workspaceRoot, zones: instructionZones(AGENTS), catalogueRoot: root, item, catalogueId: 'c' })
    expect(landedAt).toBe('.claude/agents/x.md')
    expect(await readFile(join(workspaceRoot, landedAt), 'utf8')).toContain(MANAGED_MARKER)
  })
})

describe('hostile or degenerate names', () => {
  it('an item named ".." or "." cannot land outside, or on, the zone folder', async () => {
    for (const name of ['..', '.']) {
      const root = await clone({ 's/x/SKILL.md': '# X\n' })
      const workspaceRoot = await tmp('adestia-rv-ws-')
      const { landedAt } = await materializeItem({
        workspaceRoot,
        zones: instructionZones(SKILL),
        catalogueRoot: root,
        item: { itemPath: 's/x', kind: 'skill', name, description: 'd' },
        catalogueId: 'c',
      })
      expect(landedAt.startsWith('.claude/skills/')).toBe(true)
      expect(landedAt).not.toBe('.claude/skills/')
    }
  })
})

describe('importing the same item twice', () => {
  it('does not leave a second copy behind and keeps one store entry', async () => {
    const root = await clone({ 's/a/SKILL.md': '# A\n' })
    const workspaceRoot = await tmp('adestia-rv-ws-')
    const store = new InstructionCataloguesStore(await tmp('adestia-rv-store-'))
    await store.save([cat('catA')])
    await importCatalogueItem(store, 'catA', root, workspaceRoot, instructionZones(SKILL), skillItem('a'))
    await importCatalogueItem(store, 'catA', root, workspaceRoot, instructionZones(SKILL), skillItem('a'))
    expect((await store.list())[0]!.imports).toHaveLength(1)
    expect(await readdir(join(workspaceRoot, '.claude/skills'))).toEqual(['a'])
  })
})
