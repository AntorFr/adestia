/**
 * A repo or a ref that begins with "-" must never reach git as an option.
 *
 * Criterion (reopened task): `ref='--upload-pack=<cmd>'` runs a command, so
 * POST refuses a repo/ref starting with "-" (400, field named); fetchSources
 * refuses it without calling git, for catalogues AND extension sources, which
 * covers refresh and boot for a declaration saved before the rule; a normal
 * fetch still works with the `--` separators in place. The proof is a marker
 * file the injected command would create — against REAL git.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InstructionCataloguesStore } from '../src/instruction-catalogues-store.js'
import { registerInstructionCatalogues } from '../src/routes/instruction-catalogues.js'
import { fetchSources } from '../src/sources.js'
import { driverWith } from './support/driver.js'
import { git } from './support/git.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const silent = () => {}
const exists = (path: string) => stat(path).then(() => true, () => false)

let repo: string
let marker: string
let dataDir: string
let app: FastifyInstance
let store: InstructionCataloguesStore

beforeEach(async () => {
  repo = await tmpDir('adestia-inj-repo-')
  const scratch = await tmpDir('adestia-inj-marker-')
  marker = join(scratch, 'pwned')
  dataDir = await tmpDir('adestia-inj-data-')
  await git(repo, 'init', '--quiet', '-b', 'main')
  await mkdir(join(repo, 'skills/tri'), { recursive: true })
  await writeFile(join(repo, 'skills/tri/SKILL.md'), '---\nname: tri\ndescription: Trier.\n---\n\n# Tri\n')
  await git(repo, 'add', '--', '.')
  await git(repo, 'commit', '--quiet', '--no-gpg-sign', '-m', 'init')
  store = new InstructionCataloguesStore(dataDir)
  app = Fastify()
  const driver = driverWith({
    instructionPaths: () => [{ path: '.claude/skills', kind: 'skill', entry: '<name>/SKILL.md' }],
  })
  registerInstructionCatalogues(app, { driver, workspaceRoot: await tmpDir('adestia-inj-ws-'), dataDir, store })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  await cleanTmp()
})

describe('POST /api/instruction-catalogues', () => {
  it('refuses a ref beginning with "-" with a 400 that names ref, and stores nothing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${repo}`, ref: `--upload-pack=touch ${marker}`, id: 'evil' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('ref')
    expect(await store.list()).toEqual([])
  })

  it('refuses a repo beginning with "-" with a 400 that names repo, padded or not', async () => {
    for (const repoValue of [`--upload-pack=touch ${marker}`, `  -oProxyCommand=x`]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/instruction-catalogues',
        payload: { repo: repoValue, ref: 'main', id: 'evil' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain('repo')
    }
    expect(await store.list()).toEqual([])
  })

  it('refuses a ref that is padded before its dash', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${repo}`, ref: '  --upload-pack=x', id: 'evil' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('still accepts a ref with a dash inside it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/instruction-catalogues',
      payload: { repo: `file://${repo}`, ref: 'release-1', id: 'ok' },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('a catalogue already saved with an option-like ref', () => {
  beforeEach(async () => {
    await store.update(async (catalogues) => ({
      catalogues: [
        ...catalogues,
        { id: 'old', repo: `file://${repo}`, ref: `--upload-pack=touch ${marker}`, imports: [] },
      ],
      result: undefined,
    }))
  })

  it('is refused on refresh with a readable reason, and git never runs the command', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/instruction-catalogues/old/refresh' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toMatch(/begins with "-"/)
    expect(await exists(marker)).toBe(false)
    expect(await exists(join(dataDir, 'catalogues', 'old', '.git'))).toBe(false)
  })

  it('is refused on first listing of its items, without a command run', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/instruction-catalogues/old/items' })
    expect(res.statusCode).toBe(502)
    expect(await exists(marker)).toBe(false)
  })
})

describe('fetchSources, for every source including extensions', () => {
  it('refuses an option-like ref without creating the file the command would create', async () => {
    const cache = await tmpDir('adestia-inj-cache-')
    const { roots, problems } = await fetchSources(
      [{ kind: 'git', name: 'x', repo: `file://${repo}`, ref: `--upload-pack=touch ${marker}` }],
      cache,
      silent,
    )
    expect(roots).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ severity: 'refused', code: 'source-invalid' })
    expect(await exists(marker)).toBe(false)
  })

  it('refuses an option-like repo too, and fetches the next valid source anyway', async () => {
    const cache = await tmpDir('adestia-inj-cache-')
    const { roots, problems } = await fetchSources(
      [
        { kind: 'git', name: 'bad', repo: `--upload-pack=touch ${marker}`, ref: 'main' },
        { kind: 'git', name: 'good', repo: `file://${repo}`, ref: 'main' },
      ],
      cache,
      silent,
    )
    expect(roots).toEqual([join(cache, 'good')])
    expect(problems.map((p) => p.code)).toEqual(['source-invalid'])
    expect(await exists(marker)).toBe(false)
  })

  it('still fetches, then refetches onto an existing clone (set-url path), with "--" in place', async () => {
    const cache = await tmpDir('adestia-inj-cache-')
    const sources = [{ kind: 'git' as const, name: 'good', repo: `file://${repo}`, ref: 'main' }]
    for (let round = 0; round < 2; round++) {
      const { roots, problems } = await fetchSources(sources, cache, silent)
      expect(problems).toEqual([])
      expect(roots).toEqual([join(cache, 'good')])
    }
  })
})
