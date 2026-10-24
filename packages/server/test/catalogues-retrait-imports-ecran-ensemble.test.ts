/**
 * (Revérification pass 2: removing a catalogue from the pop-in withdraws what was imported from it, and only that.)
 * (Second pass, written from the functional need only.) Instruction catalogues as a person meets them: a REAL instance, the built
 * web shell, a driven Chromium. What the screen shows and what a click does
 * on disk — the need's gestures: declare a repository, browse it, import an
 * item, see where it came from, refresh, remove.
 *
 * Needs: `git`, the built shell (`npm run build:web --workspace
 * @antorfr/adestia-web`), and Playwright with Chromium (global install, or
 * NODE_PATH). When either browser piece is missing the file SKIPS and says so
 * in the skip reason — a skipped run is not a seen screen.
 *
 * Screenshots go to $ADESTIA_SHOTS or the OS temp directory, never the tree.
 */

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// A real browser against a real server: slower than a unit, and a failed
// wait should name its selector (Playwright's own 8 s) before the test dies.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

import { type StartedInstance, start } from '../src/start.js'
import { git } from './support/git.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const requireFrom = createRequire(import.meta.url)

function loadPlaywright(): any {
  for (const base of [undefined, '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try {
      return base === undefined ? requireFrom('playwright') : createRequire(`${base}/`)('playwright')
    } catch {
      /* try the next place */
    }
  }
  return undefined
}
const playwright = loadPlaywright()
const shellBuilt = existsSync(new URL('../../web/dist-web/index.html', import.meta.url))
const canDrive = playwright !== undefined && shellBuilt
const SKIP_REASON = `${playwright === undefined ? 'no playwright ' : ''}${shellBuilt ? '' : 'no built web shell'}`

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
let workspace: string
let repo: string
let instance: StartedInstance
let browser: any
let page: any
let driverId = 'claude-code'
const shots = process.env.ADESTIA_SHOTS ?? join(tmpdir(), 'adestia-catalogue-shots')

async function boot(): Promise<void> {
  // An engine binary that stays up and says nothing: the driver spawns it at
  // boot (codex-cli), and a process that exits at once breaks its pipe.
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${workspace}\ndriver:\n  id: ${driverId}\n  command: ${idle}\n`,
  )
  instance = await start({
    cwd: root,
    configPath: 'adestia.config.yaml',
    // From sources the server cannot find the shell by itself.
    webRoot: fileURLToPath(new URL('../../web/dist-web/', import.meta.url)),
    log: () => undefined,
  })
}

/** Instructions › Catalogues, with the pop-in open. */
async function openCatalogues(): Promise<void> {
  await page.goto(`${instance.url}#/settings/instructions`)
  await page.getByRole('button', { name: 'Catalogues' }).click()
  await page.getByRole('dialog').waitFor()
}
async function shot(name: string): Promise<void> {
  await mkdir(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

beforeAll(async () => {
  if (!canDrive) return
  browser = await playwright.chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})
beforeEach(async () => {
  root = await tmpDir('adestia-cat-ui-')
  workspace = join(root, 'workspace')
  driverId = 'claude-code'
  repo = join(root, 'core')
  await mkdir(repo, { recursive: true })
  await git(repo, 'init', '--quiet', '-b', 'main')
  await commitFiles(
    repo,
    {
      'skills/alpha/SKILL.md': skill('alpha', 'ALPHA-OLD'),
      'skills/beta/SKILL.md': skill('beta', 'BETA-OLD'),
      'scout.agent.md': agent('scout', 'SCOUT-OLD'),
    },
    'init',
  )
})
afterEach(async () => {
  await page?.close()
  await instance?.close()
  await cleanTmp()
})

async function newPage(): Promise<void> {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(8000)
}


/** Every file under a directory, as paths relative to it, with content. */
async function tree(dir: string, base = dir): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) Object.assign(out, await tree(full, base))
    else out[full.slice(base.length + 1)] = await readFile(full, 'utf8')
  }
  return out
}
const joined = (files: Record<string, string>) => Object.values(files).join('\n')

describe.skipIf(!canDrive)(`catalogue removal withdraws its imports${canDrive ? '' : ` (SKIPPED: ${SKIP_REASON})`}`, () => {
  let other: string
  const dialogOf = () => page.getByRole('dialog')
  async function declareAddress(address: string): Promise<void> {
    await dialogOf().getByPlaceholder('Repository address').fill(address)
    await dialogOf().getByRole('button', { name: 'Add', exact: true }).click()
    await dialogOf().getByText(`${address} @ main`).waitFor()
  }
  async function importFrom(address: string, names: string[]): Promise<void> {
    await dialogOf().getByText(`${address} @ main`).click()
    for (const n of names) {
      await dialogOf().getByRole('button', { name: `Import ${n}`, exact: true }).click()
      await dialogOf().getByRole('button', { name: `Remove ${n}`, exact: true }).waitFor()
    }
    // Back to the list of repositories.
    await dialogOf().getByRole('button', { name: 'Catalogues', exact: true }).click()
    await dialogOf().getByText(`${address} @ main`).waitFor()
  }
  const removalOfRow = (address: string) =>
    dialogOf().locator(
      `xpath=.//*[contains(text(),"${address}")]/ancestor::*[.//button[contains(@aria-label,"emove")]][1]//button[contains(@aria-label,"emove")]`,
    )

  beforeEach(async () => {
    other = join(root, 'other')
    await mkdir(other, { recursive: true })
    await git(other, 'init', '--quiet', '-b', 'main')
    await commitFiles(other, { 'skills/gamma/SKILL.md': skill('gamma', 'GAMMA-OLD') }, 'init')
    // A skill written by hand, in the folder the engine reads.
    await mkdir(join(workspace, '.claude/skills/local'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/local/SKILL.md'), skill('local', 'LOCAL-HAND'))
  })

  it('removing a catalogue from the pop-in deletes the copies imported from it and keeps the other catalogue and the hand-written skill', async () => {
    // Fails if the screen removes only the list entry and leaves the copies, or sweeps the neighbours.
    await boot()
    await newPage()
    await openCatalogues()
    await declareAddress(`file://${repo}`)
    await declareAddress(`file://${other}`)
    await importFrom(`file://${repo}`, ['alpha', 'scout'])
    await importFrom(`file://${other}`, ['gamma'])
    const before = joined(await tree(join(workspace, '.claude')))
    expect(before).toContain('ALPHA-OLD')
    expect(before).toContain('SCOUT-OLD')
    expect(before).toContain('GAMMA-OLD')
    await removalOfRow(`file://${repo}`).click()
    await dialogOf().getByText(`file://${repo} @ main`).waitFor({ state: 'detached' })
    await expect.poll(async () => joined(await tree(join(workspace, '.claude'))), { timeout: 10_000 }).not.toContain('ALPHA-OLD')
    const after = joined(await tree(join(workspace, '.claude')))
    expect(after).not.toContain('SCOUT-OLD')
    expect(after).toContain('GAMMA-OLD')
    expect(after).toContain('LOCAL-HAND')
    await shot('catalogue-removed-imports-withdrawn')
  })

  it('after the removal the Instructions screen no longer lists the withdrawn items, after a reload', async () => {
    // Fails if the removed catalogue's items stay listed as delivered.
    await boot()
    await newPage()
    await openCatalogues()
    await declareAddress(`file://${repo}`)
    await declareAddress(`file://${other}`)
    await importFrom(`file://${repo}`, ['alpha'])
    await importFrom(`file://${other}`, ['gamma'])
    await removalOfRow(`file://${repo}`).click()
    await dialogOf().getByText(`file://${repo} @ main`).waitFor({ state: 'detached' })
    await page.reload()
    await page.getByRole('button', { name: /^gamma/ }).waitFor()
    expect(await page.getByRole('button', { name: /^alpha/ }).count()).toBe(0)
    expect(await page.getByRole('button', { name: /^local/ }).count()).toBe(1)
    await shot('instructions-after-catalogue-removal')
  })

  it('declaring the same address again after a removal starts with nothing imported', async () => {
    // Fails if the imports of a removed catalogue come back with the address.
    await boot()
    await newPage()
    await openCatalogues()
    await declareAddress(`file://${repo}`)
    await importFrom(`file://${repo}`, ['alpha'])
    await removalOfRow(`file://${repo}`).click()
    await dialogOf().getByText('No catalogue yet').waitFor()
    await declareAddress(`file://${repo}`)
    expect(await dialogOf().getByText('0 imported').count()).toBe(1)
    expect(joined(await tree(join(workspace, '.claude')))).not.toContain('ALPHA-OLD')
  })
})
