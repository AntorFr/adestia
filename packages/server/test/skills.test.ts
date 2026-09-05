import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { collectSkills, deliverSkills } from '../src/skills.js'
import type { DiscoveredPlugin } from '../src/extensions.js'
import { resolveStores } from '../src/stores.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-skills-'))
})

const plugin = (
  id: string,
  skills: string[] | undefined,
  active = true,
): DiscoveredPlugin => ({
  manifest: {
    schemaVersion: 1,
    id,
    kind: 'app',
    description: 'x',
    ...(skills ? { skills } : {}),
  },
  dir: join(root, 'plugins', id),
  active,
})

const writePluginSkill = async (id: string, path: string, contents: string) => {
  const full = join(root, 'plugins', id, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, contents)
}

describe('collecting', () => {
  it('ships the product’s own authoring contracts', async () => {
    // The point of shipping them: the schema the loader enforces and the
    // skill that teaches it are the same version, always.
    const { skills } = await collectSkills([])
    expect(skills.map((s) => s.path)).toEqual(
      expect.arrayContaining(['plugin-author/SKILL.md', 'skin-author/SKILL.md']),
    )
    expect(skills.every((s) => s.source === 'core')).toBe(true)
  })

  it('collects contracts from active plugins', async () => {
    await writePluginSkill('workbench', './skills/workbench/SKILL.md', '# Workbench')
    const { skills } = await collectSkills([plugin('workbench', ['./skills/workbench/SKILL.md'])])
    expect(skills.find((s) => s.source === 'workbench')?.path).toBe('workbench-workbench/SKILL.md')
  })

  it('resolves {{plugin_dir}} to where the plugin actually sits', async () => {
    // The agent runs from the workspace, not from inside the plugin, and the
    // plugin cannot know where an operator mounted it. Written unresolved,
    // this line taught the agent a command that fails.
    await writePluginSkill(
      'atelier',
      './skills/workbook/SKILL.md',
      'Valide : `node {{plugin_dir}}/tools/atelier.mjs valide <fichier>`',
    )
    const { skills } = await collectSkills([plugin('atelier', ['./skills/workbook/SKILL.md'])])
    const delivered = skills.find((s) => s.source === 'atelier')?.contents ?? ''
    expect(delivered).toContain(`node ${join(root, 'plugins', 'atelier')}/tools/atelier.mjs`)
    expect(delivered).not.toContain('{{plugin_dir}}')
  })

  it('leaves the placeholder alone in a core skill, which belongs to no plugin', async () => {
    // Core contracts are the product's own: nothing to anchor them to, and
    // silently blanking the token would corrupt the very page that documents it.
    const { skills } = await collectSkills([])
    const author = skills.find((s) => s.path === 'plugin-author/SKILL.md')
    expect(author?.contents).toContain('{{plugin_dir}}')
  })

  it('ignores an inactive plugin, which teaches nothing either', async () => {
    await writePluginSkill('off', './skills/off/SKILL.md', '# Off')
    const { skills } = await collectSkills([plugin('off', ['./skills/off/SKILL.md'], false)])
    expect(skills.some((s) => s.source === 'off')).toBe(false)
  })

  it('namespaces by plugin so two cannot overwrite each other', async () => {
    await writePluginSkill('a', './skills/author/SKILL.md', '# A')
    await writePluginSkill('b', './skills/author/SKILL.md', '# B')
    const { skills } = await collectSkills([
      plugin('a', ['./skills/author/SKILL.md']),
      plugin('b', ['./skills/author/SKILL.md']),
    ])
    const paths = skills.filter((s) => s.source !== 'core').map((s) => s.path)
    expect(new Set(paths).size).toBe(2)
  })

  it('makes the declared name agree with the folder it lands in', async () => {
    // The plugin writes a bare name because inside the plugin nothing else is
    // called that; the folder gets namespaced on the way out. Leaving both
    // meant the delivered skill claimed one name and sat in another, so the
    // prose pointing at it had two candidates and no way to choose.
    await writePluginSkill(
      'voyages',
      './skills/voyage-json/SKILL.md',
      '---\nname: voyage-json\ndescription: le contrat\n---\n\n# Contrat\n',
    )
    const { skills } = await collectSkills([plugin('voyages', ['./skills/voyage-json/SKILL.md'])])
    const delivered = skills.find((s) => s.source === 'voyages')!
    expect(delivered.path).toBe('voyages-voyage-json/SKILL.md')
    expect(delivered.contents).toContain('name: voyages-voyage-json')
    // Everything else survives untouched — it is the plugin's document.
    expect(delivered.contents).toContain('description: le contrat')
    expect(delivered.contents).toContain('# Contrat')
  })

  it('leaves a contract with no frontmatter alone', async () => {
    // Nothing to reconcile, and inventing a frontmatter block would rewrite a
    // document whose shape the plugin chose.
    await writePluginSkill('plain', './skills/plain/SKILL.md', '# Just prose\n')
    const { skills } = await collectSkills([plugin('plain', ['./skills/plain/SKILL.md'])])
    expect(skills.find((s) => s.source === 'plain')?.contents).toBe('# Just prose\n')
  })

  it('reports a missing contract without failing the boot', async () => {
    // The plugin still works; the agent just will not know it exists, and
    // that is worth saying out loud.
    const { skills, problems } = await collectSkills([plugin('ghost', ['./skills/ghost/SKILL.md'])])
    expect(problems[0]).toContain('ghost')
    expect(skills.some((s) => s.source === 'ghost')).toBe(false)
  })
})

describe('delivering', () => {
  const target = () => join(root, 'workspace', '.claude', 'skills')

  it('writes the contracts where the CLI reads them', async () => {
    await deliverSkills(target(), [
      { path: 'plugin-author/SKILL.md', contents: '# Plugins', source: 'core' },
    ])
    expect(await readFile(join(target(), 'plugin-author', 'SKILL.md'), 'utf8')).toContain('# Plugins')
  })

  it('withdraws a contract whose plugin was turned off', async () => {
    await deliverSkills(target(), [{ path: 'gone/SKILL.md', contents: '# Gone', source: 'x' }])
    const result = await deliverSkills(target(), [])
    expect(result.removed).toBe(1)
    expect(await readdir(target())).toEqual([])
  })

  it('never deletes a skill somebody wrote by hand', async () => {
    // The workspace belongs to its owner. Deleting their work because it
    // sits in the same folder would be the product destroying what it was
    // asked to sit next to.
    await mkdir(join(target(), 'mine'), { recursive: true })
    await writeFile(join(target(), 'mine', 'SKILL.md'), '# My own skill')

    await deliverSkills(target(), [{ path: 'core/SKILL.md', contents: '# Core', source: 'core' }])
    expect(await readFile(join(target(), 'mine', 'SKILL.md'), 'utf8')).toBe('# My own skill')
  })

  it('refreshes rather than accumulating', async () => {
    // A plugin upgraded in place would otherwise leave the agent reading last
    // version's instructions for code that changed underneath it.
    await deliverSkills(target(), [{ path: 'a/SKILL.md', contents: '# v1', source: 'x' }])
    await deliverSkills(target(), [{ path: 'a/SKILL.md', contents: '# v2', source: 'x' }])
    expect(await readFile(join(target(), 'a', 'SKILL.md'), 'utf8')).toContain('# v2')
  })

  it('creates the directory when the workspace is new', async () => {
    const result = await deliverSkills(join(root, 'brand-new', '.claude', 'skills'), [
      { path: 'a/SKILL.md', contents: '# A', source: 'core' },
    ])
    expect(result.written).toBe(1)
  })
})

describe('the stores contract', () => {
  it('is not delivered at all on a single-store instance', async () => {
    // Rule seven, applied to prose: a division that does not exist on this
    // instance must not be taught to its agent, or every turn carries a page
    // of noise about a shape it will never meet.
    const { stores } = resolveStores([{ id: 'perso', path: 'pages' }], '/w')
    const { skills } = await collectSkills([], stores)
    expect(skills.some((skill) => skill.path === 'memory-stores/SKILL.md')).toBe(false)
  })

  it('names each store, its disk and its mount point, once there are several', async () => {
    const { stores } = resolveStores(
      [
        { id: 'perso', path: '/w/pages' },
        { id: 'famille', path: '/shared/voyage', at: 'voyages/famille', label: 'Famille' },
      ],
      '/w',
    )
    const { skills } = await collectSkills([], stores)
    const contract = skills.find((skill) => skill.path === 'memory-stores/SKILL.md')
    expect(contract).toBeDefined()

    // The agent works on FILES: it is the one author here that needs the disk,
    // and the only place where disclosing the layout is required rather than
    // merely convenient.
    expect(contract?.contents).toContain('/shared/voyage')
    expect(contract?.contents).toContain('voyages/famille')
    // And which store this shell writes to when nothing else decides.
    expect(contract?.contents).toContain('this shell writes here by default')
    // The rule it exists for: the one case nobody can deduce.
    expect(contract?.contents).toContain('ASK which one')
  })
})
