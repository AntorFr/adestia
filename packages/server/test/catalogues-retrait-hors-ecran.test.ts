/**
 * What the catalogue-removal screen tests proved through a driven page, and that the server owns:
 * removing a catalogue by its route leaves the other one, persists across a restart, withdraws the
 * copies imported from it (and only those), takes the withdrawn items out of the instructions
 * list, and starts a re-declared address with nothing imported. The pop-in, its row and its
 * wording stay on screen. See docs/tests-ecran/serveur.md.
 *
 * A real instance over HTTP and real git repositories; no engine binary, no credential.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type StartedInstance, start } from '../src/start.js'
import { git } from './support/git.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const skill = (name: string, body: string) => `---\nname: ${name}\ndescription: The ${name} skill\n---\n${body}\n`
const agent = (name: string, body: string) => `---\nname: ${name}\ndescription: The ${name} agent\n---\n${body}\n`
const exists = (path: string) => stat(path).then(() => true, () => false)

let root: string
let workspace: string
let instance: StartedInstance | undefined

async function makeRepo(name: string, files: Record<string, string>): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await git(dir, 'init', '--quiet', '-b', 'main')
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  await git(dir, 'add', '--', '.')
  await git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', 'init')
  return dir
}

async function boot(): Promise<void> {
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${workspace}\ndriver:\n  id: claude-code\n  command: ${idle}\n`,
  )
  instance = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
}
async function reboot(): Promise<void> {
  await instance?.close()
  instance = undefined
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
const declare = (repo: string, id: string) => api('POST', '/api/instruction-catalogues', { repo: `file://${repo}`, ref: 'main', id })
const importItem = (id: string, itemPath: string) => api('PUT', `/api/instruction-catalogues/${id}/items/${itemPath}`)
const removeCatalogue = (id: string) => api('DELETE', `/api/instruction-catalogues/${id}`)
const declaredIds = async () => ((await api('GET', '/api/instruction-catalogues')).json.catalogues as { id: string }[]).map((c) => c.id)

/** Every file under a directory, as one text. */
async function joinedTree(dir: string): Promise<string> {
  const parts: string[] = []
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(join(d, e.name))
      else parts.push(await readFile(join(d, e.name), 'utf8'))
    }
  }
  await walk(dir)
  return parts.join('\n')
}

let repo: string
let other: string

beforeEach(async () => {
  root = await tmpDir('adestia-cat-retrait-')
  workspace = join(root, 'workspace')
  repo = await makeRepo('core', {
    'skills/alpha/SKILL.md': skill('alpha', 'ALPHA-OLD'),
    'skills/beta/SKILL.md': skill('beta', 'BETA-OLD'),
    'scout.agent.md': agent('scout', 'SCOUT-OLD'),
  })
  other = await makeRepo('other', { 'skills/gamma/SKILL.md': skill('gamma', 'GAMMA-OLD') })
  // A skill written by hand, in the folder the engine reads.
  await mkdir(join(workspace, '.claude/skills/local'), { recursive: true })
  await writeFile(join(workspace, '.claude/skills/local/SKILL.md'), skill('local', 'LOCAL-HAND'))
})
afterEach(async () => {
  await instance?.close()
  instance = undefined
  await cleanTmp()
})

describe('catalogue removal by its route', () => {
  it('removing one of two catalogues leaves the other in the list, after a restart too', async () => {
    await boot()
    await declare(repo, 'core')
    await declare(other, 'other')
    expect((await removeCatalogue('core')).status).toBe(204)
    expect(await declaredIds()).toEqual(['other'])
    await reboot()
    expect(await declaredIds()).toEqual(['other'])
  })

  it('a removed catalogue stays removed after the instance restarts', async () => {
    await boot()
    await declare(repo, 'core')
    expect((await removeCatalogue('core')).status).toBe(204)
    await reboot()
    expect(await declaredIds()).toEqual([])
  })

  it('removing a catalogue deletes the copies imported from it and keeps the other catalogue and the hand-written skill', async () => {
    await boot()
    await declare(repo, 'core')
    await declare(other, 'other')
    await importItem('core', 'skills/alpha')
    await importItem('core', 'scout.agent.md')
    await importItem('other', 'skills/gamma')
    const before = await joinedTree(join(workspace, '.claude'))
    for (const text of ['ALPHA-OLD', 'SCOUT-OLD', 'GAMMA-OLD', 'LOCAL-HAND']) expect(before).toContain(text)
    expect((await removeCatalogue('core')).status).toBe(204)
    const after = await joinedTree(join(workspace, '.claude'))
    expect(after).not.toContain('ALPHA-OLD')
    expect(after).not.toContain('SCOUT-OLD')
    expect(after).toContain('GAMMA-OLD')
    expect(after).toContain('LOCAL-HAND')
    expect(await exists(join(workspace, '.claude/skills/alpha'))).toBe(false)
  })

  it('after the removal the instructions list no longer holds the withdrawn items, and still holds the others', async () => {
    await boot()
    await declare(repo, 'core')
    await declare(other, 'other')
    await importItem('core', 'skills/alpha')
    await importItem('other', 'skills/gamma')
    await removeCatalogue('core')
    const paths = ((await api('GET', '/api/instructions')).json.files as { path: string }[]).map((f) => f.path)
    expect(paths).not.toContain('.claude/skills/alpha/SKILL.md')
    expect(paths).toContain('.claude/skills/gamma/SKILL.md')
    expect(paths).toContain('.claude/skills/local/SKILL.md')
  })

  it('declaring the same address again after a removal starts with nothing imported', async () => {
    await boot()
    await declare(repo, 'core')
    await importItem('core', 'skills/alpha')
    await removeCatalogue('core')
    await declare(repo, 'core')
    const catalogue = (await api('GET', '/api/instruction-catalogues')).json.catalogues[0]
    expect(catalogue.imports).toEqual([])
    expect(await joinedTree(join(workspace, '.claude'))).not.toContain('ALPHA-OLD')
  })
})
