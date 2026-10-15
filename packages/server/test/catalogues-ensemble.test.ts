/**
 * Instruction catalogues, end to end: a REAL instance (`start()`, the driver
 * the config names, the real routes, a real workspace and data directory on
 * disk) against REAL git repositories, driven over HTTP.
 *
 * The expectations come from the product need (the feature's functional
 * design), written by hand: what a person declaring, importing, refreshing and
 * retiring catalogue items must find on disk and on the API. Nothing here is
 * read back from what the code returned.
 *
 * Needs: `git` on the PATH. No engine binary, no credential.
 */

import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type StartedInstance, start } from '../src/start.js'

const run = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@example.org',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@example.org',
    },
  })
}

const exists = (path: string) => stat(path).then(() => true, () => false)

/** A git repository holding exactly these files, on `main`. */
async function makeRepo(root: string, name: string, files: Record<string, string>): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await git(dir, 'init', '--quiet', '-b', 'main')
  await commitFiles(dir, files, 'init')
  return dir
}

async function commitFiles(dir: string, files: Record<string, string>, message: string): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  await git(dir, 'add', '--', '.')
  await git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', message)
}

const skill = (name: string, body: string) =>
  `---\nname: ${name}\ndescription: The ${name} skill\n---\n${body}\n`
const agent = (name: string, body: string) =>
  `---\nname: ${name}\ndescription: The ${name} agent\n---\n${body}\n`

let root: string
let dataDir: string
let workspace: string
let instance: StartedInstance | undefined
let driverId = 'claude-code'

async function boot(): Promise<void> {
  // An engine binary that stays up and says nothing: the driver spawns it at
  // boot (codex-cli), and a process that exits at once breaks its pipe.
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${dataDir}\nworkspace:\n  root: ${workspace}\ndriver:\n  id: ${driverId}\n  command: ${idle}\n`,
  )
  instance = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
}
async function shutdown(): Promise<void> {
  await instance?.close()
  instance = undefined
}
async function reboot(): Promise<void> {
  await shutdown()
  await boot()
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(new URL(path, instance!.url), {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, json: text === '' ? undefined : JSON.parse(text) }
}

const declare = (repo: string, id: string, ref = 'main') =>
  api('POST', '/api/instruction-catalogues', { repo: `file://${repo}`, ref, id })
const importItem = (id: string, itemPath: string) =>
  api('PUT', `/api/instruction-catalogues/${id}/items/${itemPath}`)
const withdrawItem = (id: string, itemPath: string) =>
  api('DELETE', `/api/instruction-catalogues/${id}/items/${itemPath}`)
const refresh = (id: string) => api('POST', `/api/instruction-catalogues/${id}/refresh`)
const items = async (id: string) => (await api('GET', `/api/instruction-catalogues/${id}/items`)).json.items as any[]
const read = (path: string) => readFile(join(workspace, path), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-cat-e2e-'))
  dataDir = join(root, 'data')
  workspace = join(root, 'workspace')
  driverId = 'claude-code'
})
afterEach(async () => {
  await shutdown()
  await rm(root, { recursive: true, force: true })
})

describe('B-declare: a list of catalogue repositories, kept by the instance, not by the config file', () => {
  it('a declared catalogue is listed with its address and ref, and survives a restart', async () => {
    // Fails if the list lived in memory only, or the ref were dropped.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A1') })
    await boot()
    expect((await api('GET', '/api/instruction-catalogues')).json).toEqual({ catalogues: [] })
    const created = await declare(repo, 'core')
    expect(created.status).toBe(201)
    await reboot()
    const listed = (await api('GET', '/api/instruction-catalogues')).json
    expect(listed).toEqual({
      catalogues: [{ id: 'core', repo: `file://${repo}`, ref: 'main', hasToken: false, imports: [] }],
    })
  })

  it('declaring does not write into the instance configuration file', async () => {
    // Fails if the screen's list were saved into adestia.config.yaml.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A1') })
    await boot()
    const before = await readFile(join(root, 'adestia.config.yaml'), 'utf8')
    await declare(repo, 'core')
    expect(await readFile(join(root, 'adestia.config.yaml'), 'utf8')).toBe(before)
  })

  it('an address without a ref is refused, and so is a missing address', async () => {
    // A catalogue is repository AND ref; neither is guessed.
    await boot()
    expect((await api('POST', '/api/instruction-catalogues', { repo: 'file:///x' })).status).toBe(400)
    expect((await api('POST', '/api/instruction-catalogues', { ref: 'main' })).status).toBe(400)
    expect((await api('GET', '/api/instruction-catalogues')).json.catalogues).toEqual([])
  })

  it('the same catalogue cannot be declared twice', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A1') })
    await boot()
    expect((await declare(repo, 'core')).status).toBe(201)
    expect((await declare(repo, 'core')).status).toBe(409)
    expect((await api('GET', '/api/instruction-catalogues')).json.catalogues).toHaveLength(1)
  })

  it('a token given with the address is never sent back to the browser', async () => {
    // Fails if the list route returned the stored secret.
    await boot()
    const created = await api('POST', '/api/instruction-catalogues', {
      repo: 'file:///nowhere',
      ref: 'main',
      id: 'priv',
      token: 'SECRET-TOKEN-123',
    })
    expect(created.status).toBe(201)
    const listed = await api('GET', '/api/instruction-catalogues')
    expect(JSON.stringify(created.json) + JSON.stringify(listed.json)).not.toContain('SECRET-TOKEN-123')
    expect(listed.json.catalogues[0].hasToken).toBe(true)
  })

  it('a catalogue can be removed from the list', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A1') })
    await boot()
    await declare(repo, 'core')
    expect((await api('DELETE', '/api/instruction-catalogues/core')).status).toBe(204)
    expect((await api('GET', '/api/instruction-catalogues')).json.catalogues).toEqual([])
    expect((await api('DELETE', '/api/instruction-catalogues/core')).status).toBe(404)
  })
})

describe('B-browse: the grain is the item, found by the shape of the files', () => {
  it('lists skills, agents and the root instruction, each with its kind, and imports none by itself', async () => {
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'A1'),
      'deep/er/beta/SKILL.md': skill('beta', 'B1'),
      'scout.agent.md': agent('scout', 'S1'),
      'CLAUDE.md': 'root rules\n',
      'README.md': 'not an instruction item\n',
    })
    await boot()
    await declare(repo, 'core')
    const listed = await items('core')
    const summary = listed.map((i) => `${i.kind}:${i.itemPath}:${i.imported}`).sort()
    expect(summary).toEqual([
      'agent:scout.agent.md:false',
      'instruction:CLAUDE.md:false',
      'skill:deep/er/beta:false',
      'skill:skills/alpha:false',
    ])
    expect(await exists(join(workspace, '.claude/skills/alpha'))).toBe(false)
    expect(await exists(join(workspace, '.claude/agents/scout.md'))).toBe(false)
  })

  it('a repository that cannot be reached says so and offers nothing', async () => {
    await boot()
    await declare(join(root, 'does-not-exist'), 'ghost')
    const response = await api('GET', '/api/instruction-catalogues/ghost/items')
    expect(response.status).toBe(502)
    expect(typeof response.json.error).toBe('string')
  })

  it('an unknown catalogue is a 404, not an empty list', async () => {
    await boot()
    expect((await api('GET', '/api/instruction-catalogues/nope/items')).status).toBe(404)
  })

  it('a repository holding no instruction at all lists no item', async () => {
    const repo = await makeRepo(root, 'empty', { 'notes.txt': 'nothing here\n' })
    await boot()
    await declare(repo, 'empty')
    expect(await items('empty')).toEqual([])
  })
})

describe('B-import: importing copies the item into the folder the active engine reads', () => {
  it('a skill lands as a real copy, with its extra files, under .claude/skills', async () => {
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'ALPHA-BODY-1'),
      'skills/alpha/references/notes.md': 'REF-NOTES\n',
      'skills/beta/SKILL.md': skill('beta', 'BETA-BODY-1'),
    })
    await boot()
    await declare(repo, 'core')
    const done = await importItem('core', 'skills/alpha')
    expect(done.status).toBe(200)
    expect(done.json.landedAt).toBe('.claude/skills/alpha')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('ALPHA-BODY-1')
    expect(await read('.claude/skills/alpha/references/notes.md')).toContain('REF-NOTES')
    // A physical copy, not a link into the clone.
    expect((await lstat(join(workspace, '.claude/skills/alpha/SKILL.md'))).isSymbolicLink()).toBe(false)
    expect((await lstat(join(workspace, '.claude/skills/alpha'))).isSymbolicLink()).toBe(false)
    // Only the chosen item.
    expect(await exists(join(workspace, '.claude/skills/beta'))).toBe(false)
    const listed = await items('core')
    expect(listed.find((i) => i.itemPath === 'skills/alpha').imported).toBe(true)
    expect(listed.find((i) => i.itemPath === 'skills/beta').imported).toBe(false)
  })

  it('an agent lands under .claude/agents on a claude-code instance', async () => {
    const repo = await makeRepo(root, 'core', { 'scout.agent.md': agent('scout', 'SCOUT-BODY') })
    await boot()
    await declare(repo, 'core')
    const done = await importItem('core', 'scout.agent.md')
    expect(done.status).toBe(200)
    expect(await read('.claude/agents/scout.md')).toContain('SCOUT-BODY')
  })

  it('the copy is not a live view: upstream moves, the copy stays until a refresh', async () => {
    // Fails if the import were a link or a read on demand.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'OLD-BODY') })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await commitFiles(repo, { 'skills/alpha/SKILL.md': skill('alpha', 'NEW-BODY') }, 'change')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('OLD-BODY')
  })

  it('an item that the catalogue does not offer is a 404 and writes nothing', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await boot()
    await declare(repo, 'core')
    const before = (await readdir(join(workspace, '.claude/skills'))).sort()
    expect((await importItem('core', 'skills/zeta')).status).toBe(404)
    expect((await readdir(join(workspace, '.claude/skills'))).sort()).toEqual(before)
  })

  it('a path that climbs out of the catalogue imports nothing', async () => {
    // The URL names an item; it is never a file to read.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await writeFile(join(root, 'secret.md'), '---\nname: secret\ndescription: s\n---\nTOP-SECRET\n')
    await boot()
    await declare(repo, 'core')
    const response = await api('PUT', '/api/instruction-catalogues/core/items/..%2F..%2Fsecret.md')
    expect([400, 404]).toContain(response.status)
    const response2 = await api('PUT', '/api/instruction-catalogues/core/items/skills/../../secret.md')
    expect([400, 404]).toContain(response2.status)
    expect(await exists(join(workspace, '.claude/skills/secret'))).toBe(false)
  })

  it('an import never overwrites or changes a file written by hand with the same name', async () => {
    // Imported and local stay two universes.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'FROM-CATALOGUE') })
    await boot()
    await mkdir(join(workspace, '.claude/skills/alpha'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/alpha/SKILL.md'), skill('alpha', 'MY-OWN-WORDS'))
    await declare(repo, 'core')
    const response = await importItem('core', 'skills/alpha')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('MY-OWN-WORDS')
    expect(await read('.claude/skills/alpha/SKILL.md')).not.toContain('FROM-CATALOGUE')
    // Refused or landed elsewhere: the need only says the local file is not touched.
    expect(response.status).toBeLessThan(500)
  })

  it('withdrawing after a collision with a hand-written file never deletes that file', async () => {
    // Fails if the import were recorded over a local file and then withdrawn with it.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'FROM-CATALOGUE') })
    await boot()
    await mkdir(join(workspace, '.claude/skills/alpha'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/alpha/SKILL.md'), skill('alpha', 'MY-OWN-WORDS'))
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await withdrawItem('core', 'skills/alpha')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('MY-OWN-WORDS')
  })

  it('the selection is declared state: it survives a restart', async () => {
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'A'),
      'skills/beta/SKILL.md': skill('beta', 'B'),
    })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await reboot()
    const catalogue = (await api('GET', '/api/instruction-catalogues')).json.catalogues[0]
    expect(catalogue.imports.map((i: any) => i.itemPath)).toEqual(['skills/alpha'])
    expect((await items('core')).find((i) => i.itemPath === 'skills/alpha').imported).toBe(true)
  })
})

describe('B-provenance: an imported item names its source and is read-only; a local one is neither', () => {
  it('the instructions list gives the catalogue, repository and ref of an import, and nothing of the kind for a local file', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await boot()
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), skill('mine', 'LOCAL'))
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    const files = (await api('GET', '/api/instructions')).json.files as any[]
    const imported = files.find((f) => f.path === '.claude/skills/alpha/SKILL.md')
    const local = files.find((f) => f.path === '.claude/skills/mine/SKILL.md')
    expect(imported.source).toEqual({ catalogue: 'core', repo: `file://${repo}`, ref: 'main' })
    expect(imported.managed).toBe(true)
    expect(local.source).toBeUndefined()
    expect(local.managed).toBe(false)
  })

  it('an imported file cannot be edited through the instructions API; a local one can', async () => {
    // Fails if the imported copy were as editable as a hand-written file.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await boot()
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), skill('mine', 'LOCAL'))
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    const edit = await api('PUT', '/api/instructions/.claude/skills/alpha/SKILL.md', { markdown: 'HACKED' })
    expect(edit.status).toBe(409)
    expect(await read('.claude/skills/alpha/SKILL.md')).not.toContain('HACKED')
    const own = await api('PUT', '/api/instructions/.claude/skills/mine/SKILL.md', {
      markdown: skill('mine', 'EDITED-LOCAL'),
    })
    expect(own.status).toBe(200)
    expect(await read('.claude/skills/mine/SKILL.md')).toContain('EDITED-LOCAL')
  })
})

describe('B-driver: compatibility is bounded by the zones the ACTIVE driver declares', () => {
  it('on claude-code an agent is importable', async () => {
    const repo = await makeRepo(root, 'core', { 'scout.agent.md': agent('scout', 'S') })
    await boot()
    await declare(repo, 'core')
    expect((await items('core'))[0].importable).toBe(true)
  })

  it('on codex-cli an agent is listed but cannot be imported (422), nothing is written; a skill still can', async () => {
    driverId = 'codex-cli'
    const repo = await makeRepo(root, 'core', {
      'scout.agent.md': agent('scout', 'S'),
      'skills/alpha/SKILL.md': skill('alpha', 'A'),
    })
    await boot()
    await declare(repo, 'core')
    const listed = await items('core')
    expect(listed.find((i) => i.kind === 'agent').importable).toBe(false)
    expect(listed.find((i) => i.kind === 'skill').importable).toBe(true)
    expect((await importItem('core', 'scout.agent.md')).status).toBe(422)
    expect(await exists(join(workspace, '.claude/agents'))).toBe(false)
    expect(await exists(join(workspace, '.codex/agents'))).toBe(false)
    expect((await api('GET', '/api/instruction-catalogues')).json.catalogues[0].imports).toEqual([])
    expect((await importItem('core', 'skills/alpha')).status).toBe(200)
  })
})

describe('B-reload: refresh on demand, per catalogue, and at boot', () => {
  it('refresh re-copies what was imported, without a restart', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'OLD-BODY') })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await commitFiles(repo, { 'skills/alpha/SKILL.md': skill('alpha', 'NEW-BODY') }, 'change')
    const done = await refresh('core')
    expect(done.status).toBe(200)
    expect(done.json.refreshed).toEqual(['skills/alpha'])
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('NEW-BODY')
    expect(await read('.claude/skills/alpha/SKILL.md')).not.toContain('OLD-BODY')
  })

  it('refresh touches only that repository: another catalogue, a non-imported item and a local file stay as they were', async () => {
    const one = await makeRepo(root, 'one', {
      'skills/alpha/SKILL.md': skill('alpha', 'ONE-OLD'),
      'skills/gamma/SKILL.md': skill('gamma', 'GAMMA-OLD'),
    })
    const two = await makeRepo(root, 'two', { 'skills/beta/SKILL.md': skill('beta', 'TWO-OLD') })
    await boot()
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), skill('mine', 'LOCAL'))
    await declare(one, 'one')
    await declare(two, 'two')
    await importItem('one', 'skills/alpha')
    await importItem('two', 'skills/beta')
    await commitFiles(
      one,
      { 'skills/alpha/SKILL.md': skill('alpha', 'ONE-NEW'), 'skills/gamma/SKILL.md': skill('gamma', 'GAMMA-NEW') },
      'change',
    )
    await commitFiles(two, { 'skills/beta/SKILL.md': skill('beta', 'TWO-NEW') }, 'change')
    await refresh('one')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('ONE-NEW')
    expect(await read('.claude/skills/beta/SKILL.md')).toContain('TWO-OLD')
    expect(await exists(join(workspace, '.claude/skills/gamma'))).toBe(false)
    expect(await read('.claude/skills/mine/SKILL.md')).toContain('LOCAL')
  })

  it('refreshing a catalogue with nothing imported refreshes nothing; an unknown one is a 404', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await boot()
    await declare(repo, 'core')
    const done = await refresh('core')
    expect(done.status).toBe(200)
    expect(done.json.refreshed).toEqual([])
    expect((await refresh('nope')).status).toBe(404)
  })

  it('a refresh while the repository is gone leaves the copies where they were', async () => {
    // What the call answers is a gap in the need (see the report); the copies are not.
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'KEPT-BODY') })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await rm(repo, { recursive: true, force: true })
    await refresh('core')
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('KEPT-BODY')
  })

  it('at boot the imported items are still there, and carry the content the repository has by then', async () => {
    // The need: reload at boot AND by button. Fails if a restart drops the
    // copies, or leaves yesterday's content.
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'OLD-BODY'),
      'scout.agent.md': agent('scout', 'SCOUT-OLD'),
    })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await importItem('core', 'scout.agent.md')
    await commitFiles(
      repo,
      { 'skills/alpha/SKILL.md': skill('alpha', 'NEW-BODY'), 'scout.agent.md': agent('scout', 'SCOUT-NEW') },
      'change',
    )
    await reboot()
    expect(await exists(join(workspace, '.claude/skills/alpha/SKILL.md'))).toBe(true)
    expect(await exists(join(workspace, '.claude/agents/scout.md'))).toBe(true)
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('NEW-BODY')
    expect(await read('.claude/agents/scout.md')).toContain('SCOUT-NEW')
  })

  it('a restart with no upstream change keeps the imported copies in place', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'SAME-BODY') })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await reboot()
    expect(await read('.claude/skills/alpha/SKILL.md')).toContain('SAME-BODY')
  })
})

describe('B-withdraw: removing an item removes what it copied, and only that', () => {
  it('the copy goes; a local neighbour, another import and the catalogue entry stay', async () => {
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'A'),
      'skills/beta/SKILL.md': skill('beta', 'B-STAYS'),
    })
    await boot()
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), skill('mine', 'LOCAL-STAYS'))
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await importItem('core', 'skills/beta')
    expect((await withdrawItem('core', 'skills/alpha')).status).toBe(204)
    expect(await exists(join(workspace, '.claude/skills/alpha'))).toBe(false)
    expect(await read('.claude/skills/beta/SKILL.md')).toContain('B-STAYS')
    expect(await read('.claude/skills/mine/SKILL.md')).toContain('LOCAL-STAYS')
    const catalogue = (await api('GET', '/api/instruction-catalogues')).json.catalogues[0]
    expect(catalogue.imports.map((i: any) => i.itemPath)).toEqual(['skills/beta'])
    expect((await items('core')).find((i) => i.itemPath === 'skills/alpha').imported).toBe(false)
  })

  it('withdrawing an item that was never imported is a 404 and removes nothing', async () => {
    const repo = await makeRepo(root, 'core', {
      'skills/alpha/SKILL.md': skill('alpha', 'A'),
      'skills/beta/SKILL.md': skill('beta', 'B'),
    })
    await boot()
    await mkdir(join(workspace, '.claude/skills/beta'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/beta/SKILL.md'), skill('beta', 'MY-BETA'))
    await declare(repo, 'core')
    expect((await withdrawItem('core', 'skills/beta')).status).toBe(404)
    expect(await read('.claude/skills/beta/SKILL.md')).toContain('MY-BETA')
  })

  it('a withdrawn item stays withdrawn after a restart', async () => {
    const repo = await makeRepo(root, 'core', { 'skills/alpha/SKILL.md': skill('alpha', 'A') })
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await withdrawItem('core', 'skills/alpha')
    await reboot()
    expect(await exists(join(workspace, '.claude/skills/alpha'))).toBe(false)
  })
})
