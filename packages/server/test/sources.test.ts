/**
 * Fetching an extension from another repository.
 *
 * Against REAL git, on a repository made in a temp directory and fetched over
 * `file://`. A fake would prove the code calls a function; what has to hold
 * here is that the arguments are the ones git actually honours — a shallow
 * fetch of a ref name, a reset onto `FETCH_HEAD` — and that the failures this
 * is written for (a forge that is gone, a cache that is all there is) behave
 * the way the boot path assumes. No network: `file://` is a transport like any
 * other to git.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { discoverPlugins } from '../src/extensions.js'
import { fetchSources } from '../src/sources.js'
import type { ExtensionSource } from '../src/config/types.js'

const execFileAsync = promisify(execFile)
const silent = () => {}
const activation = { apps: ['truc'], features: [], tools: [] }

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

/** A repository whose ROOT is the plugin, which is what a plugin repo is. */
async function pluginRepo(id: string, description: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'adestia-src-repo-'))
  await git(dir, 'init', '--quiet', '-b', 'main')
  await writeFile(
    join(dir, 'adestia-plugin.json'),
    JSON.stringify({ schemaVersion: 1, id, kind: 'app', description, view: './web/app.js' }),
  )
  await git(dir, 'add', '--', 'adestia-plugin.json')
  await git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', 'the plugin')
  await git(dir, 'tag', 'v1')
  return dir
}

async function cache(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'adestia-src-cache-'))
}

function source(repo: string, ref: string): ExtensionSource {
  return { kind: 'git', name: 'plugin-repo', repo: `file://${repo}`, ref }
}

describe('fetchSources', () => {
  it('fetches a repository and hands discovery a root it can read', async () => {
    const repo = await pluginRepo('truc', 'A plugin from elsewhere.')
    const dir = await cache()

    const { roots, problems } = await fetchSources([source(repo, 'v1')], dir, silent)
    expect(problems).toEqual([])
    expect(roots).toEqual([join(dir, 'plugin-repo')])

    // The whole point: the fetched folder is an ordinary discovery root, and
    // the plugin's id comes from its manifest rather than from the folder the
    // clone landed in — which is named after a repository, not after an id.
    const { plugins, problems: refused } = await discoverPlugins(roots, activation)
    expect(refused).toEqual([])
    expect(plugins.map((plugin) => plugin.manifest.id)).toEqual(['truc'])
    expect(plugins[0]!.active).toBe(true)
  })

  it('moves an existing cache to another ref instead of cloning again', async () => {
    const repo = await pluginRepo('truc', 'First.')
    const dir = await cache()
    await fetchSources([source(repo, 'v1')], dir, silent)

    await writeFile(
      join(repo, 'adestia-plugin.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'truc',
        kind: 'app',
        description: 'Second.',
        view: './web/app.js',
      }),
    )
    await git(repo, 'commit', '--quiet', '--no-gpg-sign', '-am', 'later')
    await git(repo, 'tag', 'v2')

    const { problems } = await fetchSources([source(repo, 'v2')], dir, silent)
    expect(problems).toEqual([])
    const { plugins } = await discoverPlugins([join(dir, 'plugin-repo')], activation)
    expect(plugins[0]!.manifest.description).toBe('Second.')
  })

  it('refuses a source it cannot reach and has never had', async () => {
    const dir = await cache()
    const { roots, problems } = await fetchSources(
      [source(join(tmpdir(), 'adestia-nothing-here'), 'v1')],
      dir,
      silent,
    )

    // Nothing to read: the root is not offered, so discovery is not sent to a
    // folder that would silently hold no plugin.
    expect(roots).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('source-unreachable')
    expect(problems[0]!.severity).toBe('refused')
  })

  it('runs on the cached copy when the forge has gone, and says so', async () => {
    const repo = await pluginRepo('truc', 'Cached.')
    const dir = await cache()
    await fetchSources([source(repo, 'v1')], dir, silent)

    // The forge is unreachable — moved, down, a token that expired. The
    // instance has to boot anyway.
    await rename(repo, `${repo}-gone`)

    const { roots, problems } = await fetchSources([source(repo, 'v1')], dir, silent)
    expect(roots).toEqual([join(dir, 'plugin-repo')])
    expect(problems).toHaveLength(1)
    expect(problems[0]!.code).toBe('source-stale')
    expect(problems[0]!.severity).toBe('degraded')

    const { plugins } = await discoverPlugins(roots, activation)
    expect(plugins.map((plugin) => plugin.manifest.id)).toEqual(['truc'])
  })

  it('reads a mounted directory without touching git', async () => {
    const mounted = await mkdtemp(join(tmpdir(), 'adestia-src-dir-'))
    await mkdir(join(mounted, 'truc'), { recursive: true })
    await writeFile(
      join(mounted, 'truc', 'adestia-plugin.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'truc',
        kind: 'app',
        description: 'Mounted.',
        view: './web/app.js',
      }),
    )

    const { roots, problems } = await fetchSources(
      [{ kind: 'dir', name: 'mounted', dir: mounted }],
      await cache(),
      silent,
    )
    expect(problems).toEqual([])
    const { plugins } = await discoverPlugins(roots, activation)
    expect(plugins.map((plugin) => plugin.manifest.id)).toEqual(['truc'])
  })

  it('refuses a mounted directory that is not there', async () => {
    const { roots, problems } = await fetchSources(
      [{ kind: 'dir', name: 'absent', dir: join(tmpdir(), 'adestia-absent') }],
      await cache(),
      silent,
    )
    expect(roots).toEqual([])
    expect(problems[0]!.code).toBe('source-missing')
  })

  it('does nothing at all when no source is declared', async () => {
    expect(await fetchSources([], join(tmpdir(), 'never-created'), silent)).toEqual({
      roots: [],
      problems: [],
    })
  })
})
