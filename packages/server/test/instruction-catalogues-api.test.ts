/**
 * The catalogue routes, driven over HTTP against a REAL git repository.
 *
 * Criterion: POST a catalogue, GET its items (clones), PUT an item (import),
 * POST refresh, DELETE the item — each call returns the expected code and
 * body; GET /api/instructions carries `source` for an imported item and not
 * for a local file. Expected values are written by hand from the design
 * (technique.md §Contrats d'interface), not read back from the routes.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Driver } from '@antorfr/adestia-drivers'

import { InstructionCataloguesStore } from '../src/instruction-catalogues-store.js'
import { registerInstructionCatalogues } from '../src/routes/instruction-catalogues.js'
import { registerInstructions } from '../src/routes/instructions.js'
import { MANAGED_MARKER } from '../src/skills.js'

const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.org',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.org',
    },
  })
}
async function commitAll(dir: string): Promise<void> {
  await git(dir, 'add', '--', '.')
  await git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', 'change')
}
const exists = (path: string) => stat(path).then(() => true, () => false)

/** A driver that reads skills and the root instruction, but has no agent zone. */
type Zone = { path: string; kind: 'instruction' | 'skill' | 'agent'; entry?: string }
function driverWith(zones: Zone[]): Driver {
  return { instructionPaths: () => zones } as unknown as Driver
}
const NO_AGENT: Zone[] = [
  { path: 'CLAUDE.md', kind: 'instruction' as const },
  { path: '.claude/skills', kind: 'skill' as const, entry: '<name>/SKILL.md' },
]

let repo: string
let workspace: string
let dataDir: string
let app: FastifyInstance

async function boot(zones: Zone[] = NO_AGENT): Promise<void> {
  const store = new InstructionCataloguesStore(dataDir)
  const driver = driverWith(zones)
  app = Fastify()
  registerInstructions(app, { driver, workspaceRoot: workspace, catalogues: store })
  registerInstructionCatalogues(app, { driver, workspaceRoot: workspace, dataDir, store })
  await app.ready()
}

async function declare(): Promise<void> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/instruction-catalogues',
    payload: { repo: `file://${repo}`, ref: 'main', id: 'core' },
  })
  expect(created.statusCode).toBe(201)
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'adestia-cat-api-repo-'))
  workspace = await mkdtemp(join(tmpdir(), 'adestia-cat-api-ws-'))
  dataDir = await mkdtemp(join(tmpdir(), 'adestia-cat-api-data-'))
  await git(repo, 'init', '--quiet', '-b', 'main')
  await mkdir(join(repo, 'dev-flow/skills/tri'), { recursive: true })
  await writeFile(
    join(repo, 'dev-flow/skills/tri/SKILL.md'),
    '---\nname: tri\ndescription: Trier les demandes.\n---\n\n# Tri v1\n',
  )
  await mkdir(join(repo, 'agents'), { recursive: true })
  await writeFile(
    join(repo, 'agents/relecteur.agent.md'),
    '---\nname: relecteur\ndescription: Relit un diff.\ntools: Read\n---\n\n# Relecteur\n',
  )
  await commitAll(repo)
  await boot()
})

afterEach(async () => {
  await app.close()
})

describe('the whole criterion, in order', () => {
  it('declares, scans, imports, refreshes and withdraws with the expected codes and bodies', async () => {
    // POST — 201, the token is never echoed.
    const created = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${repo}`, ref: 'main', id: 'core', token: 'sekret' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      id: 'core',
      repo: `file://${repo}`,
      ref: 'main',
      hasToken: true,
      imports: [],
    })
    expect(created.body).not.toContain('sekret')

    // GET items — the first call clones.
    const items = await app.inject({ method: 'GET', url: '/api/instruction-catalogues/core/items' })
    expect(items.statusCode).toBe(200)
    expect(items.json().items).toEqual([
      {
        itemPath: 'agents/relecteur.agent.md',
        kind: 'agent',
        name: 'relecteur',
        description: 'Relit un diff.',
        importable: false,
        imported: false,
      },
      {
        itemPath: 'dev-flow/skills/tri',
        kind: 'skill',
        name: 'tri',
        description: 'Trier les demandes.',
        importable: true,
        imported: false,
      },
    ])

    // PUT — import.
    const put = await app.inject({
      method: 'PUT',
      url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri',
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toEqual({
      itemPath: 'dev-flow/skills/tri',
      kind: 'skill',
      landedAt: '.claude/skills/tri',
    })
    const landed = await readFile(join(workspace, '.claude/skills/tri/SKILL.md'), 'utf8')
    expect(landed).toContain(MANAGED_MARKER)
    expect(landed).toContain('# Tri v1')

    // GET /api/instructions — source on the imported file.
    const listed = await app.inject({ method: 'GET', url: '/api/instructions' })
    const files = listed.json().files as Array<{ path: string; managed: boolean; source?: unknown }>
    const tri = files.find((file) => file.path === '.claude/skills/tri/SKILL.md')
    expect(tri?.managed).toBe(true)
    expect(tri?.source).toEqual({ catalogue: 'core', repo: `file://${repo}`, ref: 'main' })

    // The item now reports itself imported.
    const again = await app.inject({ method: 'GET', url: '/api/instruction-catalogues/core/items' })
    const tri2 = again.json().items.find((i: { itemPath: string }) => i.itemPath === 'dev-flow/skills/tri')
    expect(tri2.imported).toBe(true)
    expect(tri2.landedAt).toBe('.claude/skills/tri')

    // Upstream moves; refresh re-copies.
    await writeFile(
      join(repo, 'dev-flow/skills/tri/SKILL.md'),
      '---\nname: tri\ndescription: Trier les demandes.\n---\n\n# Tri v2\n',
    )
    await commitAll(repo)
    const refreshed = await app.inject({ method: 'POST', url: '/api/instruction-catalogues/core/refresh' })
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.json()).toEqual({ refreshed: ['dev-flow/skills/tri'], missing: [] })
    expect(await readFile(join(workspace, '.claude/skills/tri/SKILL.md'), 'utf8')).toContain('# Tri v2')

    // DELETE the item.
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri',
    })
    expect(deleted.statusCode).toBe(204)
    expect(deleted.body).toBe('')
    expect(await exists(join(workspace, '.claude/skills/tri'))).toBe(false)
    const after = await app.inject({ method: 'GET', url: '/api/instructions' })
    expect((after.json().files as Array<{ path: string }>).some((f) => f.path.includes('tri'))).toBe(false)
  })
})

describe('source on /api/instructions', () => {
  it('is absent on a local file, a plugin-managed file, and a sibling that shares a prefix', async () => {
    await declare()
    await app.inject({ method: 'GET', url: '/api/instruction-catalogues/core/items' })
    await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri' })
    await writeFile(join(workspace, 'CLAUDE.md'), '# local\n')
    // `tri-local` starts with `tri` but is not inside the import.
    await mkdir(join(workspace, '.claude/skills/tri-local'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/tri-local/SKILL.md'), '---\nname: tri-local\n---\n# mine\n')
    await mkdir(join(workspace, '.claude/skills/plugin-one'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/plugin-one/SKILL.md'), `${MANAGED_MARKER}\n# plugin\n`)

    const files = (await app.inject({ method: 'GET', url: '/api/instructions' })).json().files as Array<
      Record<string, unknown>
    >
    const byPath = Object.fromEntries(files.map((file) => [file.path as string, file]))
    expect(byPath['CLAUDE.md']).toBeDefined()
    expect('source' in byPath['CLAUDE.md']!).toBe(false)
    expect('source' in byPath['.claude/skills/tri-local/SKILL.md']!).toBe(false)
    expect(byPath['.claude/skills/plugin-one/SKILL.md']!.managed).toBe(true)
    expect('source' in byPath['.claude/skills/plugin-one/SKILL.md']!).toBe(false)
    expect(byPath['.claude/skills/tri/SKILL.md']!.source).toBeDefined()
  })
})

describe('what is refused', () => {
  it('rejects a declaration without repo or ref, or with an empty token', async () => {
    for (const payload of [{ ref: 'main' }, { repo: 'x' }, { repo: ' ', ref: 'main' }, { repo: 'x', ref: 'main', token: '' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/instruction-catalogues', payload })
      expect(res.statusCode).toBe(400)
    }
    const none = await app.inject({ method: 'POST', url: '/api/instruction-catalogues' })
    expect(none.statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/instruction-catalogues' })).json()).toEqual({
      catalogues: [],
    })
  })

  it('refuses an id that is not a plain name, and a second catalogue with the same id', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: 'x', ref: 'main', id: '../escape' },
    })
    expect(bad.statusCode).toBe(400)
    await declare()
    const twice = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: 'other', ref: 'main', id: 'core' },
    })
    expect(twice.statusCode).toBe(409)
  })

  it('answers 404 for every route on an undeclared catalogue', async () => {
    for (const [method, url] of [
      ['GET', '/api/instruction-catalogues/nope/items'],
      ['PUT', '/api/instruction-catalogues/nope/items/a/b'],
      ['DELETE', '/api/instruction-catalogues/nope/items/a/b'],
      ['POST', '/api/instruction-catalogues/nope/refresh'],
      ['DELETE', '/api/instruction-catalogues/nope'],
    ] as const) {
      const res = await app.inject({ method, url })
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }
  })

  it('answers 404 for an item the scan does not offer, including a path that climbs out', async () => {
    await declare()
    for (const path of ['no/such/skill', '../../etc/passwd', 'dev-flow/skills/tri/SKILL.md']) {
      const res = await app.inject({ method: 'PUT', url: `/api/instruction-catalogues/core/items/${path}` })
      expect(res.statusCode, path).toBe(404)
    }
    expect(await exists(join(workspace, '.claude/skills'))).toBe(false)
  })

  it('answers 404 when withdrawing an item that was never imported', async () => {
    await declare()
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri',
    })
    expect(res.statusCode).toBe(404)
  })

  it('answers 422 for a kind the active driver has no zone for, and writes nothing', async () => {
    await declare()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/instruction-catalogues/core/items/agents/relecteur.agent.md',
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toContain('agent')
    expect(await exists(join(workspace, '.claude'))).toBe(false)
    const listed = (await app.inject({ method: 'GET', url: '/api/instruction-catalogues' })).json()
    expect(listed.catalogues[0].imports).toEqual([])
  })

  it('imports the same item where a driver that does declare the zone says', async () => {
    await app.close()
    await boot([...NO_AGENT, { path: '.claude/agents', kind: 'agent', entry: '<name>.md' }])
    await declare()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/instruction-catalogues/core/items/agents/relecteur.agent.md',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().landedAt.startsWith('.claude/agents/')).toBe(true)
    expect(await readFile(join(workspace, res.json().landedAt), 'utf8')).toContain(MANAGED_MARKER)
  })

  it('lands beside a local skill of the same name under a namespaced path, never over it', async () => {
    await declare()
    await mkdir(join(workspace, '.claude/skills/tri'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/tri/SKILL.md'), '# mine, by hand\n')
    const res = await app.inject({
      method: 'PUT',
      url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().landedAt).toBe('.claude/skills/core-tri')
    expect(await readFile(join(workspace, '.claude/skills/tri/SKILL.md'), 'utf8')).toBe('# mine, by hand\n')
    const files = (await app.inject({ method: 'GET', url: '/api/instructions' })).json().files as Array<{
      path: string
      source?: unknown
    }>
    expect(files.find((f) => f.path === '.claude/skills/tri/SKILL.md')).not.toHaveProperty('source')
    expect(files.find((f) => f.path === '.claude/skills/core-tri/SKILL.md')).toHaveProperty('source')
  })

  it('answers 409 when the engine keeps its instruction in one file that already exists', async () => {
    await writeFile(join(repo, 'AGENTS.md'), '# from the catalogue\n')
    await commitAll(repo)
    await app.close()
    await boot([{ path: 'AGENTS.md', kind: 'instruction' }])
    await declare()
    await writeFile(join(workspace, 'AGENTS.md'), '# mine\n')
    const res = await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/core/items/AGENTS.md' })
    expect(res.statusCode).toBe(409)
    expect(await readFile(join(workspace, 'AGENTS.md'), 'utf8')).toBe('# mine\n')
    const listed = (await app.inject({ method: 'GET', url: '/api/instruction-catalogues' })).json()
    expect(listed.catalogues[0].imports).toEqual([])
  })

  it('answers 502 when the repository cannot be fetched (items and refresh)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${repo}-missing`, ref: 'main', id: 'ghost' },
    })
    const items = await app.inject({ method: 'GET', url: '/api/instruction-catalogues/ghost/items' })
    expect(items.statusCode).toBe(502)
    expect(typeof items.json().error).toBe('string')
    const refresh = await app.inject({ method: 'POST', url: '/api/instruction-catalogues/ghost/refresh' })
    expect(refresh.statusCode).toBe(502)
  })
})

describe('what a refresh and a removal leave alone', () => {
  it('keeps an import the repository no longer offers, and reports it as missing', async () => {
    await declare()
    await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri' })
    await git(repo, 'rm', '-r', '--quiet', 'dev-flow')
    await commitAll(repo)
    const res = await app.inject({ method: 'POST', url: '/api/instruction-catalogues/core/refresh' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ refreshed: [], missing: ['dev-flow/skills/tri'] })
    expect(await exists(join(workspace, '.claude/skills/tri/SKILL.md'))).toBe(true)
  })

  it('refreshing one catalogue does not touch another catalogue\'s import', async () => {
    await declare()
    await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri' })
    const other = await mkdtemp(join(tmpdir(), 'adestia-cat-api-other-'))
    await git(other, 'init', '--quiet', '-b', 'main')
    await mkdir(join(other, 'skills/zed'), { recursive: true })
    await writeFile(join(other, 'skills/zed/SKILL.md'), '---\nname: zed\ndescription: z\n---\n# zed\n')
    await commitAll(other)
    await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${other}`, ref: 'main', id: 'other' },
    })
    await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/other/items/skills/zed' })
    const res = await app.inject({ method: 'POST', url: '/api/instruction-catalogues/other/refresh' })
    expect(res.json()).toEqual({ refreshed: ['skills/zed'], missing: [] })
  })

  it('removing a catalogue withdraws its copies and spares local files', async () => {
    await declare()
    await app.inject({ method: 'PUT', url: '/api/instruction-catalogues/core/items/dev-flow/skills/tri' })
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), '# mine\n')
    const res = await app.inject({ method: 'DELETE', url: '/api/instruction-catalogues/core' })
    expect(res.statusCode).toBe(204)
    expect(await exists(join(workspace, '.claude/skills/tri'))).toBe(false)
    expect(await readFile(join(workspace, '.claude/skills/mine/SKILL.md'), 'utf8')).toBe('# mine\n')
    expect((await app.inject({ method: 'GET', url: '/api/instruction-catalogues' })).json()).toEqual({
      catalogues: [],
    })
  })

  it('never returns the token, on list or create', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: 'x', ref: 'main', id: 'tok', token: 'ghp_secret' },
    })
    const list = await app.inject({ method: 'GET', url: '/api/instruction-catalogues' })
    expect(list.body).not.toContain('ghp_secret')
    expect(list.json().catalogues[0].hasToken).toBe(true)
  })
})
