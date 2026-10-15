/**
 * Scanning a catalogue by shape, not by path.
 *
 * Against a REAL git clone, the way `fetchSources` hands the rest of the
 * product a plain directory — what has to hold here is that the scan finds an
 * item wherever it sits, because the real catalogue that motivated this
 * feature (`homelab-sdlc-core`) keeps its skills outside every folder
 * convention an engine ships.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { scanCatalogue } from '../src/instruction-catalogues.js'
import { fetchSources } from '../src/sources.js'

const execFileAsync = promisify(execFile)
const silent = () => {}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    // A runner has no identity configured, and a commit without one fails.
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.org',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.org',
    },
  })
}

async function seedRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'adestia-catalogue-repo-'))
  await git(dir, 'init', '--quiet', '-b', 'main')
  return dir
}

async function commit(dir: string): Promise<void> {
  await git(dir, 'add', '--', '.')
  await git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', 'seed')
}

async function cloned(repo: string): Promise<string> {
  const cache = await mkdtemp(join(tmpdir(), 'adestia-catalogue-cache-'))
  const { roots, problems } = await fetchSources(
    [{ kind: 'git', name: 'catalogue', repo: `file://${repo}`, ref: 'main' }],
    cache,
    silent,
  )
  expect(problems).toEqual([])
  return roots[0]!
}

describe('scanCatalogue', () => {
  it('finds a SKILL.md at a path no engine convention would guess', async () => {
    const repo = await seedRepo()
    // Neither .claude/, .codex/ nor .github/ — the real shape of
    // homelab-sdlc-core, which a path-based scan would have missed entirely.
    await mkdir(join(repo, 'dev-flow/skills/tri'), { recursive: true })
    await writeFile(
      join(repo, 'dev-flow/skills/tri/SKILL.md'),
      '---\nname: tri\ndescription: Trier les demandes entrantes avant la conception.\n---\n\n# Tri\n',
    )
    await commit(repo)

    const items = await scanCatalogue(await cloned(repo))
    expect(items).toEqual([
      {
        itemPath: 'dev-flow/skills/tri',
        kind: 'skill',
        name: 'tri',
        description: 'Trier les demandes entrantes avant la conception.',
      },
    ])
  })

  it('reads CLAUDE.md and AGENTS.md at the root as instructions', async () => {
    const repo = await seedRepo()
    await writeFile(join(repo, 'CLAUDE.md'), '# Comment travailler ici\n')
    await writeFile(
      join(repo, 'AGENTS.md'),
      '---\nname: agents-racine\ndescription: Consignes pour tout agent de ce dépôt.\n---\n\n# AGENTS\n',
    )
    await commit(repo)

    const items = await scanCatalogue(await cloned(repo))
    expect(items).toEqual(
      expect.arrayContaining([
        { itemPath: 'CLAUDE.md', kind: 'instruction' },
        {
          itemPath: 'AGENTS.md',
          kind: 'instruction',
          name: 'agents-racine',
          description: 'Consignes pour tout agent de ce dépôt.',
        },
      ]),
    )
  })

  it('does not read a CLAUDE.md or AGENTS.md outside the root as an instruction', async () => {
    const repo = await seedRepo()
    await mkdir(join(repo, 'sub'), { recursive: true })
    await writeFile(join(repo, 'sub/AGENTS.md'), '# pas la racine\n')
    await commit(repo)

    const items = await scanCatalogue(await cloned(repo))
    expect(items).toEqual([])
  })

  it('finds a <name>.agent.md carrying agent-shaped frontmatter, wherever it sits', async () => {
    const repo = await seedRepo()
    await mkdir(join(repo, 'dev-flow/agents'), { recursive: true })
    await writeFile(
      join(repo, 'dev-flow/agents/relecteur.agent.md'),
      '---\nname: relecteur\ndescription: Relit un diff et ne dit que ce qui casse.\n---\n\n# Relecteur\n',
    )
    await commit(repo)

    const items = await scanCatalogue(await cloned(repo))
    expect(items).toEqual([
      {
        itemPath: 'dev-flow/agents/relecteur.agent.md',
        kind: 'agent',
        name: 'relecteur',
        description: 'Relit un diff et ne dit que ce qui casse.',
      },
    ])
  })

  it('ignores a .agent.md with no usable name or description — the suffix alone is not enough', async () => {
    const repo = await seedRepo()
    await writeFile(join(repo, 'brouillon.agent.md'), '# Rien de prêt\n')
    await commit(repo)

    expect(await scanCatalogue(await cloned(repo))).toEqual([])
  })

  it('does not classify an ordinary document as any kind', async () => {
    const repo = await seedRepo()
    await writeFile(
      join(repo, 'README.md'),
      '---\nname: le-catalogue\ndescription: Un dépôt de plus.\n---\n\n# README\n',
    )
    await commit(repo)

    expect(await scanCatalogue(await cloned(repo))).toEqual([])
  })

  it('does not walk into .git or node_modules', async () => {
    const repo = await seedRepo()
    await mkdir(join(repo, 'node_modules/whatever'), { recursive: true })
    await writeFile(
      join(repo, 'node_modules/whatever/SKILL.md'),
      '---\nname: intrus\ndescription: Ne devrait jamais apparaître.\n---\n',
    )
    await commit(repo)

    expect(await scanCatalogue(await cloned(repo))).toEqual([])
  })
})
