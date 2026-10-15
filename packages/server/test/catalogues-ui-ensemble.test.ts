/**
 * Instruction catalogues as a person meets them: a REAL instance, the built
 * web shell, a driven Chromium. What the screen shows and what a click does
 * on disk — the need's gestures: declare a repository, browse it, import an
 * item, see where it came from, refresh, remove.
 *
 * Needs: `git` and Playwright with Chromium (local, global — `npm root -g`
 * included — or NODE_PATH). The web shell is built here, once, when
 * `packages/web/dist-web/index.html` is absent. Without Playwright the file
 * SKIPS and says so twice (title and a console.warn) — a skipped run is not
 * a seen screen.
 *
 * Screenshots go to $ADESTIA_SHOTS or the OS temp directory, never the tree.
 */

import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// A real browser against a real server: slower than a unit, and a failed
// wait should name its selector (Playwright's own 8 s) before the test dies.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

import { type StartedInstance, start } from '../src/start.js'
import { git } from './support/git.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const requireFrom = createRequire(import.meta.url)

/** Where `npm root -g` says global packages live ('' when npm is not there). */
function npmGlobalRoot(): string {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/**
 * Playwright from the packages' own node_modules or NODE_PATH (what a plain
 * `require` sees), then from where npm keeps global installs. No place is
 * hard-coded: a PATH and a NODE_PATH that hide it must be able to hide it.
 */
function loadPlaywright(): any {
  try {
    return requireFrom('playwright')
  } catch {
    /* try the global root */
  }
  const global = npmGlobalRoot()
  if (global === '') return undefined
  try {
    return createRequire(`${global}/`)('playwright')
  } catch {
    return undefined
  }
}
const playwright = loadPlaywright()
const shellIndex = new URL('../../web/dist-web/index.html', import.meta.url)
// A missing shell is built in beforeAll; only a missing Playwright skips.
const canDrive = playwright !== undefined
const SKIP_REASON = 'no playwright'
if (!canDrive) console.warn(`catalogues-ui-ensemble: SKIPPED (${SKIP_REASON}): the screens were not driven`)

async function buildShell(): Promise<void> {
  if (existsSync(shellIndex)) return
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
  await promisify(execFile)('npm', ['run', 'build:web', '--workspace', '@antorfr/adestia-web'], {
    cwd: repoRoot,
    // Vitest runs with NODE_ENV=test, and the child would inherit it: vite then
    // compiles JSX to react/jsx-dev-runtime, which is not one of the shell's
    // external specifiers, so React lands in the bundle as a CJS `require`
    // that throws in the page. The shell is a production build.
    env: { ...process.env, NODE_ENV: 'production' },
    maxBuffer: 64 * 1024 * 1024,
  })
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
const exists = (path: string) => stat(path).then(() => true, () => false)

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

/** Settings › Instructions › Catalogues, with the pop-in open. */
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
const itemOf = (name: string) => dialogOf().getByText(name, { exact: true })
async function shot(name: string): Promise<void> {
  await mkdir(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

beforeAll(async () => {
  if (!canDrive) return
  await buildShell()
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
})

async function newPage(): Promise<void> {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(8000)
}

describe.skipIf(!canDrive)(`catalogues on screen${canDrive ? '' : ` (SKIPPED: ${SKIP_REASON})`}`, () => {
  it('Catalogues is a button of the Instructions page (P-9, E-11), beside the other Settings sections', async () => {
    // The product moved Catalogues from a Settings tile into E-11 (E-12 opens over it).
    await boot()
    await newPage()
    await page.goto(`${instance.url}#/settings`)
    await page.getByText('Delegations').first().waitFor({ timeout: 8000 })
    await shot('settings-home')
    for (const section of ['MCP servers', 'Instructions', 'Configuration', 'Delegations']) {
      expect(await page.getByText(section, { exact: true }).count(), `section ${section}`).toBeGreaterThan(0)
    }
    // Not a tile of the Settings home any more.
    expect(await page.getByRole('button', { name: 'Catalogues' }).count()).toBe(0)
    await page.goto(`${instance.url}#/settings/instructions`)
    await page.getByRole('button', { name: 'Catalogues' }).waitFor({ timeout: 8000 })
    await shot('instructions-catalogues-button')
  })

  it('a first visit shows an empty list and the form to add a repository with its ref', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('No catalogue yet').waitFor()
    expect(await dialog.getByPlaceholder('Repository address').count()).toBe(1)
    expect(await dialog.getByRole('button', { name: 'Add', exact: true }).count()).toBe(1)
    await shot('catalogues-empty')
  })

  it('declaring, browsing and importing an item copies it and shows it delivered, with its repository and ref', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    expect(await page.getByRole('dialog').getByText('0 imported').count()).toBe(1)
    await openCatalogue()
    const dialog = page.getByRole('dialog')
    for (const name of ['alpha', 'beta', 'scout']) {
      await itemOf(name).waitFor()
    }
    await importOf('alpha').click()
    await removeOf('alpha').waitFor()
    await shot('catalogues-imported')
    expect(await readFile(join(workspace, '.claude/skills/alpha/SKILL.md'), 'utf8')).toContain('ALPHA-OLD')
    expect(await exists(join(workspace, '.claude/skills/beta'))).toBe(false)
    expect(await importOf('beta').count()).toBe(1)
    await dialog.getByRole('button', { name: 'Close' }).click().catch(() => page.keyboard.press('Escape'))
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    // The card on the Instructions screen carries the provenance.
    const card = page.getByRole('button', { name: /^alpha/ })
    await card.waitFor()
    const text = await card.innerText()
    expect(text).toContain('delivered')
    expect(text).toContain('core @ main')
    await shot('instructions-with-import')
  })

  it('Refresh re-copies the imported items of that repository', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    await openCatalogue()
    await importOf('alpha').click()
    await removeOf('alpha').waitFor()
    await commitFiles(repo, { 'skills/alpha/SKILL.md': skill('alpha', 'ALPHA-NEW') }, 'change')
    await page.getByRole('dialog').getByRole('button', { name: 'Refresh' }).click()
    await expect
      .poll(() => readFile(join(workspace, '.claude/skills/alpha/SKILL.md'), 'utf8'), { timeout: 10_000 })
      .toContain('ALPHA-NEW')
    await shot('catalogues-refreshed')
  })

  it('Remove deletes the copy and offers Import again', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    await openCatalogue()
    await importOf('alpha').click()
    await removeOf('alpha').click()
    await importOf('alpha').waitFor()
    expect(await exists(join(workspace, '.claude/skills/alpha'))).toBe(false)
  })

  it('on a codex-cli instance the agent is listed but its Import is not offered', async () => {
    driverId = 'codex-cli'
    await boot()
    await newPage()
    await openCatalogues()
    await declareThroughScreen()
    await openCatalogue()
    await itemOf('scout').waitFor()
    const button = importOf('scout')
    const offered = (await button.count()) > 0 && (await button.isEnabled())
    await shot('catalogues-codex-agent')
    expect(offered).toBe(false)
    expect(await importOf('alpha').isEnabled()).toBe(true)
  })

  it('a repository that cannot be reached shows no items to import', async () => {
    await boot()
    await newPage()
    await openCatalogues()
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('Repository address').fill(`file://${join(root, 'gone')}`)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await dialog.getByText(`file://${join(root, 'gone')} @ main`).click()
    await dialog.getByRole('button', { name: 'Refresh' }).waitFor({ timeout: 5000 }).catch(() => undefined)
    await shot('catalogues-unreachable')
    expect(await dialog.getByRole('button', { name: 'Import' }).count()).toBe(0)
  })
})
