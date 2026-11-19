/**
 * Feature adestia-version-hors-image, screen E-15 (⚙ menu, last line) seen from its need alone
 * (docs/parcours.md P-7 step 6; the fiche's « Livre » and critère de sortie): the last line says
 * "Adestia" followed by the published version number, for an installation from the sources as for
 * the image; "Adestia" alone when no number is available.
 *
 * The built server and shell are copied into a throwaway tree with a checkout's layout and a
 * CHANGELOG.md written here, then started like `npm run build` + start does; every expected number
 * is a literal of this file. Needs `npm run build` first, and Playwright from the environment.
 * Captures: VERSION_SHOTS=<dossier hors de l'arbre>.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { newBrowser, playwright } from './charte-browser.js'

interface Loc {
  click(o?: { timeout?: number }): Promise<void>
  waitFor(o?: { state?: 'visible' | 'hidden'; timeout?: number }): Promise<void>
  textContent(o?: { timeout?: number }): Promise<string | null>
}
interface Page {
  goto(url: string, o?: { waitUntil?: string }): Promise<unknown>
  waitForResponse(match: (r: { url(): string; status(): number }) => boolean, o?: { timeout?: number }): Promise<unknown>
  getByRole(role: string, o?: { name?: string | RegExp }): Loc
  locator(s: string): Loc
  screenshot(o: { path: string }): Promise<unknown>
}
interface Ctx {
  newPage(): Promise<Page>
}
interface Br {
  newContext(o: Record<string, unknown>): Promise<Ctx & { close(): Promise<void> }>
  close(): Promise<void>
}

vi.setConfig({ testTimeout: 60_000 })
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SHOTS = process.env['VERSION_SHOTS']
const T = 20_000
const children = new Set<ChildProcess>()
const trees: string[] = []
let browser: Br

beforeAll(async () => {
  if (!playwright) throw new Error('Playwright absent: ces tests ne se passent pas de navigateur')
  browser = (await newBrowser()) as unknown as Br
}, 60_000)
afterAll(async () => {
  await browser?.close()
  for (const c of children) c.kill('SIGKILL')
  await Promise.all(trees.map((t) => rm(t, { recursive: true, force: true })))
})

/** A source install: the built server and shell in a checkout layout, `changelog` at its root, `stamp` as ADESTIA_VERSION. */
async function install(changelog: string | undefined, stamp?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'adestia-version-ecran-'))
  trees.push(root)
  await mkdir(join(root, 'packages', 'server'), { recursive: true })
  await mkdir(join(root, 'packages', 'web'), { recursive: true })
  for (const part of ['dist', 'bin', 'package.json']) await cp(join(repo, 'packages', 'server', part), join(root, 'packages', 'server', part), { recursive: true })
  await cp(join(repo, 'packages', 'web', 'dist-web'), join(root, 'packages', 'web', 'dist-web'), { recursive: true })
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'))
  if (changelog !== undefined) await writeFile(join(root, 'CHANGELOG.md'), changelog)
  await writeFile(join(root, 'adestia.config.yaml'), `port: 0\ndataDir: ${join(root, 'data')}\nlocale: en\n`)
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env['ADESTIA_VERSION']
  if (stamp !== undefined) env['ADESTIA_VERSION'] = stamp
  const child = spawn(process.execPath, [join(root, 'packages', 'server', 'bin', 'adestia.js'), '--config', 'adestia.config.yaml'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  let out = ''
  return new Promise<string>((resolve, reject) => {
    const seen = (d: Buffer) => {
      out += d
      const m = /listening on (http:\/\/\S+)/.exec(out)
      if (m) resolve(m[1] as string)
    }
    child.stdout!.on('data', seen)
    child.stderr!.on('data', seen)
    child.once('exit', (code) => reject(new Error(`server exited (${code}): ${out.slice(-400)}`)))
  })
}

/** Opens the ⚙ menu on E-15 once the instance has been read, and returns the text of its last line. */
async function lastLine(url: string, shot: string): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  try {
    const page = await context.newPage()
    const instance = page.waitForResponse((r) => r.url().endsWith('/api/instance') && r.status() === 200, { timeout: T })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await instance
    await page.locator('button[aria-haspopup="menu"][aria-label="Settings"]').click({ timeout: T })
    await page.locator('.adestia-cog__panel').waitFor({ state: 'visible', timeout: T })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${shot}.png`) })
    return ((await page.locator('.adestia-cog__build').textContent({ timeout: T })) ?? '').trim()
  } finally {
    await context.close()
  }
}

describe('E-15 ⚙ menu, last line: the published version, whatever the installation', () => {
  it('a source install without ADESTIA_VERSION shows "Adestia 7.7.7", the last release heading of its CHANGELOG', async () => {
    const url = await install('# Changelog\n\n## v1.0.0 — 2026-01-01\n\n## v7.7.7 — 2026-02-02\n')
    expect(await lastLine(url, 'sources')).toBe('Adestia 7.7.7')
  })

  it('an image keeps showing its own number, whatever the changelog says', async () => {
    const url = await install('## v7.7.7\n', '0.98.5')
    expect(await lastLine(url, 'image')).toBe('Adestia 0.98.5')
  })

  it('the dev image shows "Adestia main"', async () => {
    const url = await install(undefined, 'main')
    expect(await lastLine(url, 'image-dev')).toBe('Adestia main')
  })

  it('with no stamp and no release heading the line says "Adestia" alone', async () => {
    const url = await install('# Changelog\n\n## Unreleased\n')
    expect(await lastLine(url, 'sans-numero')).toBe('Adestia')
  })
})
