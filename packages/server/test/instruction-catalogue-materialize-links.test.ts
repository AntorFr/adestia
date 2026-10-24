/**
 * Review-phase tests: a catalogue is a THIRD party's repository, so a link in
 * it must never carry a file from outside the clone into the workspace.
 */

import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { instructionZones } from '@antorfr/adestia-drivers'
import { afterEach, describe, expect, it } from 'vitest'

import { importCatalogueItem, materializeItem, type CatalogueItem } from '../src/instruction-catalogues.js'
import { InstructionCataloguesStore } from '../src/instruction-catalogues-store.js'
import { driverWith } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const SKILL = driverWith({
  instructionPaths: () => [{ path: '.claude/skills', kind: 'skill', entry: '<name>/SKILL.md' }],
})

const tmp = tmpDir
const item: CatalogueItem = { itemPath: 's/a', kind: 'skill', name: 'a', description: 'd' }

async function allFiles(dir: string, base = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await allFiles(join(dir, e.name), rel)))
    else out.push(rel)
  }
  return out.sort()
}

async function cloneWithLinks() {
  const outside = await tmp('adestia-lk-outside-')
  await writeFile(join(outside, 'token'), 'SECRET-TOKEN')
  await mkdir(join(outside, 'dir'))
  await writeFile(join(outside, 'dir', 'inner'), 'SECRET-INNER')
  const root = await tmp('adestia-lk-clone-')
  const skill = join(root, 's', 'a')
  await mkdir(join(skill, 'refs', 'deep'), { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: a\ndescription: d\n---\nbody\n')
  await writeFile(join(skill, 'refs', 'ok.md'), 'fine')
  await symlink(join(outside, 'token'), join(skill, 'leak-top'))
  await symlink(join(outside, 'token'), join(skill, 'refs', 'deep', 'leak-deep'))
  await symlink(join(outside, 'dir'), join(skill, 'leak-dir'))
  await symlink(join(outside, 'missing'), join(skill, 'broken'))
  return { root, outside }
}

describe('links inside a skill folder', () => {
  it('are never copied, at any depth, and the regular files still land', async () => {
    const { root } = await cloneWithLinks()
    const workspaceRoot = await tmp('adestia-lk-ws-')
    const { landedAt, skipped } = await materializeItem({
      workspaceRoot, zones: instructionZones(SKILL), catalogueRoot: root, item, catalogueId: 'c',
    })
    expect(landedAt).toBe('.claude/skills/a')
    expect(await allFiles(join(workspaceRoot, landedAt))).toEqual(['SKILL.md', 'refs/ok.md'])
    expect([...skipped].sort()).toEqual(['broken', 'leak-dir', 'leak-top', 'refs/deep/leak-deep'])
  })

  it('leave no secret anywhere in the workspace, and importCatalogueItem reports them', async () => {
    const { root } = await cloneWithLinks()
    const workspaceRoot = await tmp('adestia-lk-ws-')
    const store = new InstructionCataloguesStore(join(await tmp('adestia-lk-store-'), 'c.json'))
    await store.save([{ id: 'c', repo: 'https://example.org/c', ref: 'main', imports: [] }])
    const result = await importCatalogueItem(store, 'c', root, workspaceRoot, instructionZones(SKILL), item)
    expect(result.landedAt).toBe('.claude/skills/a')
    expect([...(result.skipped ?? [])].sort()).toEqual(['broken', 'leak-dir', 'leak-top', 'refs/deep/leak-deep'])
    for (const f of await allFiles(workspaceRoot)) {
      expect(await readFile(join(workspaceRoot, f), 'utf8')).not.toContain('SECRET')
    }
  })
})

describe('a link as the item itself', () => {
  it('a skill folder that is a link is refused readably and nothing is written', async () => {
    const outside = await tmp('adestia-lk-outside-')
    await writeFile(join(outside, 'SKILL.md'), 'SECRET-SKILL')
    const root = await tmp('adestia-lk-clone-')
    await mkdir(join(root, 's'))
    await symlink(outside, join(root, 's', 'a'))
    const workspaceRoot = await tmp('adestia-lk-ws-')
    await expect(
      materializeItem({ workspaceRoot, zones: instructionZones(SKILL), catalogueRoot: root, item, catalogueId: 'c' }),
    ).rejects.toThrow(/link|special/)
    expect(await allFiles(workspaceRoot)).toEqual([])
  })
})
