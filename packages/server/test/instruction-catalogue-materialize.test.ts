/**
 * Materialising a catalogue item into the active driver's declared zone, and
 * withdrawing it again — the two gestures `instruction-catalogues.ts` adds on
 * top of the scan.
 *
 * No real driver is pulled in: what matters here is the ZONE a driver
 * declares, not which CLI declared it, so a minimal stand-in built from the
 * same `instructionZones()` the real drivers go through is the honest double.
 */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { instructionZones, type Driver } from '@antorfr/adestia-drivers'
import { describe, expect, it } from 'vitest'

import {
  importCatalogueItem,
  materializeItem,
  withdrawCatalogueItem,
  withdrawItem,
  type CatalogueItem,
} from '../src/instruction-catalogues.js'
import { InstructionCataloguesStore, type InstructionCatalogue } from '../src/instruction-catalogues-store.js'
import { MANAGED_MARKER } from '../src/skills.js'

/** Declares only what the materializer reads: `instructionPaths`. */
const testDriver = (paths: ReturnType<NonNullable<Driver['instructionPaths']>>): Driver =>
  ({
    describe: () => Promise.resolve({ id: 'test', label: 'Test', cliVersion: '0', capabilities: [] }),
    env: () => Promise.resolve({}),
    instructionPaths: () => paths,
    runTurn: async function* () {},
  }) as Driver

// Declares a skill zone and no agent zone — the second fact is what the
// "refused" test below exercises, the same shape `codex-cli` has in reality.
const SKILL_ZONE = testDriver([{ path: '.claude/skills', kind: 'skill', entry: '<name>/SKILL.md' }])

async function catalogueFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'adestia-catalogue-clone-'))
  await mkdir(join(root, 'dev-flow/skills/tri'), { recursive: true })
  await writeFile(
    join(root, 'dev-flow/skills/tri/SKILL.md'),
    '---\nname: tri\ndescription: Trier les demandes entrantes.\n---\n\n# Tri\n',
  )
  await writeFile(join(root, 'dev-flow/skills/tri/reference.md'), 'Notes annexes, jamais stamped.\n')
  return root
}

const TRI_ITEM: CatalogueItem = {
  itemPath: 'dev-flow/skills/tri',
  kind: 'skill',
  name: 'tri',
  description: 'Trier les demandes entrantes.',
}

describe('materializeItem', () => {
  it('writes a skill into the zone the driver declares, stamped and whole', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    const catalogueRoot = await catalogueFixture()

    const { landedAt } = await materializeItem({
      workspaceRoot,
      zones: instructionZones(SKILL_ZONE),
      catalogueRoot,
      item: TRI_ITEM,
      catalogueId: 'homelab-sdlc-core',
    })

    expect(landedAt).toBe('.claude/skills/tri')
    const skill = await readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')
    expect(skill).toContain(MANAGED_MARKER)
    expect(skill).toContain('# Tri')

    // A sibling file the skill carries alongside its contract: copied as-is,
    // never stamped — it is not an instruction to disclaim.
    const reference = await readFile(join(workspaceRoot, '.claude/skills/tri/reference.md'), 'utf8')
    expect(reference).toBe('Notes annexes, jamais stamped.\n')
  })

  it('namespaces by catalogue rather than clobbering a same-named local skill', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    await mkdir(join(workspaceRoot, '.claude/skills/tri'), { recursive: true })
    await writeFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), '# Mine, hand-written\n')
    const catalogueRoot = await catalogueFixture()

    const { landedAt } = await materializeItem({
      workspaceRoot,
      zones: instructionZones(SKILL_ZONE),
      catalogueRoot,
      item: TRI_ITEM,
      catalogueId: 'homelab-sdlc-core',
    })

    expect(landedAt).toBe('.claude/skills/homelab-sdlc-core-tri')
    expect(await readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')).toBe('# Mine, hand-written\n')
  })

  it('refuses an item whose kind has no zone on the active driver, with a readable error', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    const catalogueRoot = await catalogueFixture()

    await expect(
      materializeItem({
        workspaceRoot,
        zones: instructionZones(SKILL_ZONE),
        catalogueRoot,
        item: { itemPath: 'dev-flow/agents/relecteur.agent.md', kind: 'agent', name: 'relecteur', description: 'x' },
        catalogueId: 'homelab-sdlc-core',
      }),
    ).rejects.toThrow(/agent/)
  })
})

describe('withdrawItem', () => {
  it('removes exactly what was landed, and nothing else in the folder', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    await mkdir(join(workspaceRoot, '.claude/skills/other'), { recursive: true })
    await writeFile(join(workspaceRoot, '.claude/skills/other/SKILL.md'), '# A neighbour\n')
    const catalogueRoot = await catalogueFixture()

    const { landedAt } = await materializeItem({
      workspaceRoot,
      zones: instructionZones(SKILL_ZONE),
      catalogueRoot,
      item: TRI_ITEM,
      catalogueId: 'homelab-sdlc-core',
    })

    await withdrawItem(workspaceRoot, landedAt)

    await expect(readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')).rejects.toThrow()
    expect(await readFile(join(workspaceRoot, '.claude/skills/other/SKILL.md'), 'utf8')).toBe('# A neighbour\n')
  })

  it('leaves a folder alone when it was never stamped as managed', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    await mkdir(join(workspaceRoot, '.claude/skills/tri'), { recursive: true })
    await writeFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), '# Hand-written, not ours\n')

    await withdrawItem(workspaceRoot, '.claude/skills/tri')

    expect(await readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')).toBe('# Hand-written, not ours\n')
  })
})

describe('importCatalogueItem / withdrawCatalogueItem', () => {
  const catalogue = (): InstructionCatalogue => ({
    id: 'homelab-sdlc-core',
    repo: 'https://example.org/homelab-sdlc-core',
    ref: 'main',
    imports: [],
  })

  it('lands the item and records landedAt in the store', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    const catalogueRoot = await catalogueFixture()
    const dataDir = await mkdtemp(join(tmpdir(), 'adestia-store-'))
    const store = new InstructionCataloguesStore(dataDir)
    await store.save([catalogue()])

    await importCatalogueItem(store, 'homelab-sdlc-core', catalogueRoot, workspaceRoot, instructionZones(SKILL_ZONE), TRI_ITEM)

    expect(await readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')).toContain(MANAGED_MARKER)
    const saved = await store.list()
    expect(saved[0]!.imports).toEqual([{ itemPath: 'dev-flow/skills/tri', kind: 'skill', landedAt: '.claude/skills/tri' }])
  })

  it('removes the file and the store entry together', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'adestia-workspace-'))
    const catalogueRoot = await catalogueFixture()
    const dataDir = await mkdtemp(join(tmpdir(), 'adestia-store-'))
    const store = new InstructionCataloguesStore(dataDir)
    await store.save([catalogue()])
    await importCatalogueItem(store, 'homelab-sdlc-core', catalogueRoot, workspaceRoot, instructionZones(SKILL_ZONE), TRI_ITEM)

    await withdrawCatalogueItem(store, workspaceRoot, 'homelab-sdlc-core', 'dev-flow/skills/tri')

    await expect(readFile(join(workspaceRoot, '.claude/skills/tri/SKILL.md'), 'utf8')).rejects.toThrow()
    expect((await store.list())[0]!.imports).toEqual([])
  })
})
