/**
 * B-21 (P-16 step 6, E-14): the owner sets "Simultaneous turns" from the settings screen.
 * Seen from the need, through a driven browser on the bench instance (`bench/launch.mjs`),
 * then through the plain server binary booted on the file the screen wrote (the restart).
 * Expectations come from docs/parcours.md, docs/ecrans.md and the feature's criterion:
 * 5 is saved and shown as needing a restart, the restarted limiter carries 5,
 * 1 and 16 are accepted, 0 and 17 are refused in the field and write nothing.
 *
 * Playwright and Chromium come from the environment; without them the file is skipped.
 * Needs `npm run build` first.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { SHOTS, newBrowser, playwright } from './charte-browser.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LABEL = { en: 'Simultaneous turns', fr: 'Tours simultanés' } as const
const SAVE = { en: /^Save$/, fr: /^Enregistrer$/ } as const
const MARK = { en: 'applies after a restart', fr: 'effectif après redémarrage' } as const

const children = new Set<ChildProcess>()
const dirs: string[] = []
afterAll(async () => {
  for (const c of children) c.kill('SIGTERM')
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

async function bootBench(locale: string) {
  const base = await mkdtemp(join(tmpdir(), 'besoin-tours-'))
  dirs.push(base)
  const child = spawn(execPath, [join(repo, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'config-writable', '--locale', locale, '--data', base], { stdio: ['ignore', 'pipe', 'ignore'] })
  children.add(child)
  let out = ''
  const url = await new Promise<string>((resolve, reject) => {
    child.stdout?.on('data', (c: Buffer) => {
      out += c
      const m = /listening on (\S+)/.exec(out)
      if (m) resolve(m[1] as string)
    })
    child.once('exit', (code) => reject(new Error(`launcher exited ${code}`)))
  })
  const stop = () => new Promise<void>((done) => { if (child.exitCode !== null) return done(); child.once('exit', () => done()); child.kill('SIGTERM') })
  return { url, config: join(base, 'adestia.config.yaml'), stop }
}

/** The restart: the plain binary booted on the file the screen wrote. */
async function restartedMax(configPath: string): Promise<number> {
  const text = await readFile(configPath, 'utf8')
  const port = 20000 + Math.floor(Math.random() * 20000)
  await writeFile(configPath, text.replace(/^port:.*$/m, `port: ${port}`))
  const child = spawn(execPath, [join(repo, 'packages/server/bin/adestia.js'), '--config', configPath], { stdio: 'ignore', env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'bench-token' } })
  children.add(child)
  try {
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/instance`)
        if (r.ok) return ((await r.json()) as { turns: { max: number } }).turns.max
      } catch {
        // not yet listening
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('the restarted instance never answered')
  } finally {
    child.kill('SIGTERM')
  }
}

const maxInFile = async (path: string) => /^maxConcurrentTurns:\s*(\d+)/m.exec(await readFile(path, 'utf8'))?.[1]

async function screen(url: string, locale: 'en' | 'fr') {
  const browser = await newBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: locale === 'fr' ? 'fr-FR' : 'en-US' })
  const page = await context.newPage()
  await page.goto(`${url}/#/settings/config`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`text=${LABEL[locale]}`, { timeout: 20_000 })
  return { browser, page: page as unknown as PW }
}

// The few Playwright members used here, beyond the shared minimal typing.
interface Loc {
  fill(v: string): Promise<void>
  click(): Promise<void>
  waitFor(o?: { timeout?: number }): Promise<void>
  innerText(): Promise<string>
  last(): Loc
  locator(s: string): Loc
  isVisible(): Promise<boolean>
  count(): Promise<number>
}
interface PW {
  getByRole(role: string, o: { name: RegExp | string }): Loc
  getByText(t: string, o?: { exact?: boolean }): Loc
  locator(s: string): Loc
  waitForResponse(p: (r: { url(): string; request(): { method(): string }; status(): number }) => boolean, o?: { timeout?: number }): Promise<{ status(): number }>
  screenshot(o: { path: string }): Promise<unknown>
}

async function enter(page: PW, locale: 'en' | 'fr', value: string) {
  await page.locator('input[type=number]').last().fill(value)
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings') && r.request().method() === 'PUT', { timeout: 15_000 })
  await page.getByRole('button', { name: SAVE[locale] }).click()
  return (await saved).status()
}

const fieldText = (page: PW) => page.locator('.adestia-config__field').last().innerText()

describe.skipIf(!playwright)('B-21 — the owner sets the simultaneous turns (E-14)', () => {
  it('owner saves 5: the restart is announced, the file holds 5, the restarted limiter carries 5', async () => {
    const inst = await bootBench('en')
    const { browser, page } = await screen(inst.url, 'en')
    expect(await fieldText(page)).toContain(MARK.en)
    expect(await enter(page, 'en', '5')).toBe(200)
    await page.getByText('Restart now').waitFor({ timeout: 10_000 })
    expect(await page.getByText('Saved, and waiting for a restart', { exact: false }).isVisible()).toBe(true)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'tours-en-5.png') })
    expect(await maxInFile(inst.config)).toBe('5')
    // not live: the running limiter keeps its boot value
    expect(((await (await fetch(`${inst.url}/api/instance`)).json()) as { turns: { max: number } }).turns.max).toBe(3)
    await inst.stop()
    expect(await restartedMax(inst.config)).toBe(5)
    await browser.close()
  }, 120_000)

  it('owner saves 5 in French: same outcome, French words', async () => {
    const inst = await bootBench('fr')
    const { browser, page } = await screen(inst.url, 'fr')
    expect(await fieldText(page)).toContain(MARK.fr)
    expect(await enter(page, 'fr', '5')).toBe(200)
    await page.getByText('Redémarrer', { exact: true }).waitFor({ timeout: 10_000 })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'tours-fr-5.png') })
    expect(await maxInFile(inst.config)).toBe('5')
    await inst.stop()
    expect(await restartedMax(inst.config)).toBe(5)
    await browser.close()
  }, 120_000)

  it('the two bounds, 1 and 16, are accepted and written', async () => {
    const inst = await bootBench('en')
    const { browser, page } = await screen(inst.url, 'en')
    expect(await enter(page, 'en', '16')).toBe(200)
    expect(await maxInFile(inst.config)).toBe('16')
    expect(await enter(page, 'en', '1')).toBe(200)
    expect(await maxInFile(inst.config)).toBe('1')
    await browser.close()
    await inst.stop()
  }, 120_000)

  it.each([
    ['17', 'must be at most 16'],
    ['0', 'must be at least 1'],
  ])('%s is refused in the field, and nothing is written', async (value, words) => {
    const inst = await bootBench('en')
    const before = await readFile(inst.config, 'utf8')
    const { browser, page } = await screen(inst.url, 'en')
    const status = await enter(page, 'en', value)
    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
    await page.getByText(words).waitFor({ timeout: 10_000 })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `tours-en-refus-${value}.png`) })
    expect(await readFile(inst.config, 'utf8')).toBe(before)
    expect(await page.getByText('Restart now').count()).toBe(0)
    await browser.close()
    await inst.stop()
  }, 120_000)

  it('17 is refused in French as well, the field showing an error', async () => {
    const inst = await bootBench('fr')
    const before = await readFile(inst.config, 'utf8')
    const { browser, page } = await screen(inst.url, 'fr')
    expect(await enter(page, 'fr', '17')).toBeGreaterThanOrEqual(400)
    await page.getByText('must be at most 16').waitFor({ timeout: 10_000 })
    expect(await readFile(inst.config, 'utf8')).toBe(before)
    await browser.close()
    await inst.stop()
  }, 120_000)
})
