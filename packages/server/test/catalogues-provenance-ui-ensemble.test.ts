/**
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
import { mkdir, writeFile } from 'node:fs/promises'
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
async function declareThroughScreen(): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Repository address').fill(`file://${repo}`)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await dialog.getByText(`file://${repo} @ main`).waitFor()
}
async function openCatalogue(): Promise<void> {
  await page.getByRole('dialog').getByText(`file://${repo} @ main`).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Refresh' }).waitFor()
}
const dialogOf = () => page.getByRole('dialog')
const importOf = (name: string) => dialogOf().getByRole('button', { name: `Import ${name}`, exact: true })
const removeOf = (name: string) => dialogOf().getByRole('button', { name: `Remove ${name}`, exact: true })
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

describe.skipIf(!canDrive)(`catalogues on screen, provenance and retrieval${canDrive ? '' : ` (SKIPPED: ${SKIP_REASON})`}`, () => {
  it('an imported skill is marked delivered with its source and opens read-only; a hand-written one is neither marked nor locked', async () => {
    await mkdir(join(workspace, '.claude/skills/mine'), { recursive: true })
    await writeFile(join(workspace, '.claude/skills/mine/SKILL.md'), skill('mine', 'MINE-LOCAL'))
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    await openCatalogue()
    await importOf('alpha').click()
    await removeOf('alpha').waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(async () => {
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    })
    const imported = page.getByRole('button', { name: /^alpha/ })
    const local = page.getByRole('button', { name: /^mine/ })
    await imported.waitFor()
    await local.waitFor()
    expect(await imported.innerText()).toContain('delivered')
    expect(await imported.innerText()).toContain('core @ main')
    expect(await local.innerText()).not.toContain('delivered')
    expect(await local.innerText()).not.toContain('core @ main')
    await imported.click()
    await page.getByText('.claude/skills/alpha/SKILL.md').first().waitFor()
    await page.waitForTimeout(1000)
    await shot('instructions-imported-readonly')
    expect(await page.getByRole('button', { name: 'Save' }).count()).toBe(0)
    expect(await page.locator('textarea[readonly]').count()).toBeGreaterThan(0)
    await page.goto(`${instance.url}#/settings/instructions`)
    await local.click()
    await page.getByRole('button', { name: 'Save' }).waitFor()
    expect(await page.locator('textarea[readonly]').count()).toBe(0)
  })

  it('a declared catalogue can be removed from the screen, not only through the API', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    const dialog = page.getByRole('dialog')
    // The need: repositories are added AND removed from Settings. Any control
    // naming the catalogue and a removal will do.
    const removal = dialog.getByRole('button', { name: /remove|delete|forget|retirer|supprimer/i })
    expect(await removal.count()).toBeGreaterThan(0)
    await removal.first().click()
    await dialog.getByText('No catalogue yet').waitFor()
  })
})
