// Feature adestia-version-hors-image, seen from its need alone (docs/parcours.md P-7 step 6,
// the fiche's « Livre » and critère de sortie): the last line of the ⚙ menu (E-15) says the
// published version number whatever the installation; its door is `GET /api/instance` → `version`.
//
// The system runs as an installation from the sources does: the compiled server (`bin/adestia.js`
// over `dist/`) is copied into a throwaway tree that has the layout of a checkout
// (<root>/packages/server/{bin,dist}, <root>/node_modules, <root>/CHANGELOG.md) and started as a
// process, with the environment a source install has (no ADESTIA_VERSION) or an image has. The
// CHANGELOG of that tree is written here, so every expected number is a literal of this file.
import { type ChildProcess, spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const server = join(repo, 'packages', 'server')
const trees: string[] = []
const children = new Set<ChildProcess>()

beforeAll(() => {
  if (!existsSync(join(server, 'dist', 'src', 'start.js'))) throw new Error('packages/server/dist absent: run the workspace tsc build first')
})
afterAll(async () => {
  for (const c of children) c.kill('SIGKILL')
  await Promise.all(trees.map((t) => rm(t, { recursive: true, force: true })))
})

interface Reply {
  has: boolean
  version: unknown
}

/**
 * Starts the server of a source install whose root holds `changelog` (undefined: no CHANGELOG.md at all)
 * with `stamp` as ADESTIA_VERSION (undefined: not set), and reads what /api/instance says of the version.
 */
async function versionOf(changelog: string | undefined, stamp?: string): Promise<Reply> {
  const root = await mkdtemp(join(tmpdir(), 'adestia-version-'))
  trees.push(root)
  await mkdir(join(root, 'packages', 'server'), { recursive: true })
  for (const part of ['dist', 'bin', 'package.json']) await cp(join(server, part), join(root, 'packages', 'server', part), { recursive: true })
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'))
  if (changelog !== undefined) await writeFile(join(root, 'CHANGELOG.md'), changelog)
  await writeFile(join(root, 'adestia.config.yaml'), `port: 0\ndataDir: ${join(root, 'data')}\n`)
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env['ADESTIA_VERSION']
  if (stamp !== undefined) env['ADESTIA_VERSION'] = stamp
  const child = spawn(process.execPath, [join(root, 'packages', 'server', 'bin', 'adestia.js'), '--config', 'adestia.config.yaml'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let out = ''
  const url = await new Promise<string>((resolve, reject) => {
    const seen = (d: Buffer) => {
      out += d
      const m = /listening on (http:\/\/\S+)/.exec(out)
      if (m) resolve(m[1] as string)
    }
    child.stdout!.on('data', seen)
    child.stderr!.on('data', seen)
    child.once('exit', (code) => reject(new Error(`server exited (${code}): ${out.slice(-400)}`)))
  })
  try {
    const body = (await (await fetch(`${url}/api/instance`)).json()) as Record<string, unknown>
    return { has: 'version' in body, version: body['version'] }
  } finally {
    child.kill('SIGKILL')
    children.delete(child)
  }
}

describe('adestia-version-hors-image: the version line of the ⚙ menu, from the instance route', () => {
  it('source install without ADESTIA_VERSION serves the last release heading of CHANGELOG.md, without its v', async () => {
    const log = '# Changelog\n\n## Earlier than v0.61.0\n\n## v1.0.0 — 2026-01-01\n\n- a\n\n## v7.7.7 — 2026-02-02\n\n- b\n'
    expect(await versionOf(log)).toEqual({ has: true, version: '7.7.7' })
  }, 30_000)

  it('a changelog with one single release heading serves that number, with no suffix invented', async () => {
    expect(await versionOf('# C\n\n## v2.3.4\n')).toEqual({ has: true, version: '2.3.4' })
  }, 30_000)

  it('a series heading keeps its series tag', async () => {
    expect(await versionOf('## v0.11.0-serie.3 — d\n')).toEqual({ has: true, version: '0.11.0-serie.3' })
  }, 30_000)

  it('an image stamp wins over the changelog, and says the number it always said', async () => {
    expect(await versionOf('## v7.7.7\n', '0.98.5')).toEqual({ has: true, version: '0.98.5' })
  }, 30_000)

  it('the dev image stamp is served as is', async () => {
    expect(await versionOf('## v7.7.7\n', 'main')).toEqual({ has: true, version: 'main' })
  }, 30_000)

  it('an image without changelog still serves its stamp', async () => {
    expect(await versionOf(undefined, '0.98.5')).toEqual({ has: true, version: '0.98.5' })
  }, 30_000)

  it('a blank ADESTIA_VERSION counts as unset', async () => {
    expect(await versionOf('## v7.7.7\n', '  ')).toEqual({ has: true, version: '7.7.7' })
  }, 30_000)

  it('no stamp and no CHANGELOG.md: no version at all, the server still answers', async () => {
    expect(await versionOf(undefined)).toEqual({ has: false, version: undefined })
  }, 30_000)

  it('no stamp and no release heading: no version at all', async () => {
    expect(await versionOf('# C\n\n## Earlier than v0.61.0\n\n## Unreleased\n')).toEqual({ has: false, version: undefined })
  }, 30_000)

  it('only a heading of level 2 counts: list items, level-3 titles and non-numbers are not versions', async () => {
    const log = '## v1.2.3\n\n- **v9.9.9** — not a heading\n\n### v8.8.8\n\n## vNext\n\n## v1.2 — short\n'
    expect(await versionOf(log)).toEqual({ has: true, version: '1.2.3' })
  }, 30_000)
})
