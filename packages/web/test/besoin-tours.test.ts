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
import { type ChildProcess, spawn as realSpawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execPath } from 'node:process'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { SHOTS, newBrowser, playwright } from './charte-browser.js'
import { patience } from './patience.js'

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

/** Tries in all for a boot whose port was taken between the draw and the listen. */
const ATTEMPTS = 3

/** The `spawn` the helpers use; the collision tests hand in a scripted one. */
type Spawn = (command: string, args: string[], options: { stdio: Array<'ignore' | 'pipe'> | 'ignore'; env?: NodeJS.ProcessEnv }) => ChildProcess

/** An attempt that failed on a taken port: the only failure worth another draw. */
const portTaken = (stderr: string) => /EADDRINUSE/.test(stderr)

async function bootBench(locale: string, spawn: Spawn = realSpawn) {
  const base = await mkdtemp(join(tmpdir(), 'besoin-tours-'))
  dirs.push(base)
  for (let attempt = 1; ; attempt++) {
    const child = spawn(execPath, [join(repo, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'config-writable', '--locale', locale, '--data', base], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stderr?.on('data', (c: Buffer) => { err += c })
    const outcome = await new Promise<{ url: string } | { code: number | null }>((resolve) => {
      child.stdout?.on('data', (c: Buffer) => {
        out += c
        const m = /listening on (\S+)/.exec(out)
        if (m) resolve({ url: m[1] as string })
      })
      child.once('exit', (code) => resolve({ code }))
    })
    if ('url' in outcome) {
      children.add(child)
      const stop = () => new Promise<void>((done) => { if (child.exitCode !== null) return done(); child.once('exit', () => done()); child.kill('SIGTERM') })
      return { url: outcome.url, config: join(base, 'adestia.config.yaml'), stop }
    }
    if (attempt < ATTEMPTS && portTaken(err)) continue
    throw new Error(`launcher exited ${outcome.code}${err ? `: ${err.trim()}` : ''}`)
  }
}

/**
 * How long the restarted binary may take to answer. The whole suite plays on a
 * loaded machine, where a cold server boot has outlasted 20 s; the loop returns
 * on the first answer, so a generous deadline costs nothing when the boot is fast.
 */
const RESTART_DEADLINE_MS = 90_000

/** Boot of the bench, screen (20 s), entry (15 s) and "Restart now" (10 s) come before the deadline: 90 + ~45 s, with margin. */
const RESTART_TEST_TIMEOUT_MS = patience(180_000)

/** One deadline for the waits of the first test's browser steps (the scaled 10 s of "Restart now"). */
const BROWSER_DEADLINE_MS = patience(10_000)

/** Runs a wait and, if it fails or expires, says which step it was. */
async function step<T>(name: string, wait: Promise<T>): Promise<T> {
  try {
    return await wait
  } catch (e) {
    throw new Error(`step "${name}" failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
  }
}

/** A free port, asked of the system rather than drawn in a range. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

/** The restart: the plain binary booted on the file the screen wrote. */
async function restartedMax(configPath: string, spawn: Spawn = realSpawn, pick: () => Promise<number> = freePort): Promise<number> {
  const text = await readFile(configPath, 'utf8')
  for (let attempt = 1; ; attempt++) {
    const port = await pick()
    await writeFile(configPath, text.replace(/^port:.*$/m, `port: ${port}`))
    const child = spawn(execPath, [join(repo, 'packages/server/bin/adestia.js'), '--config', configPath], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'bench-token' } })
    let err = ''
    let gone: number | null | undefined
    child.stderr?.on('data', (c: Buffer) => { err += c })
    child.once('exit', (code) => { gone = code })
    let retry = false
    try {
      const deadline = Date.now() + RESTART_DEADLINE_MS
      while (Date.now() < deadline) {
        if (gone !== undefined) {
          if (attempt < ATTEMPTS && portTaken(err)) { retry = true; break }
          throw new Error(`the restarted instance exited ${gone} before answering${err ? `: ${err.trim()}` : ''}`)
        }
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/instance`)
          if (r.ok) return ((await r.json()) as { turns: { max: number } }).turns.max
        } catch {
          // not yet listening
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!retry) throw new Error(`the restarted instance never answered within ${RESTART_DEADLINE_MS / 1000} s`)
    } finally {
      child.kill('SIGTERM')
    }
  }
}

const maxInFile = async (path: string) => /^maxConcurrentTurns:\s*(\d+)/m.exec(await readFile(path, 'utf8'))?.[1]

async function screen(url: string, locale: 'en' | 'fr') {
  const browser = await newBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: locale === 'fr' ? 'fr-FR' : 'en-US' })
  const page = await context.newPage()
  await page.goto(`${url}/#/settings/config`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(`text=${LABEL[locale]}`, { timeout: patience(20_000) })
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
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/settings') && r.request().method() === 'PUT', { timeout: patience(15_000) })
  await page.getByRole('button', { name: SAVE[locale] }).click()
  return (await saved).status()
}

const fieldText = (page: PW) => page.locator('.adestia-config__field').last().innerText()

describe.skipIf(!playwright)('B-21 — the owner sets the simultaneous turns (E-14)', () => {
  it('owner saves 5: the restart is announced, the file holds 5, the restarted limiter carries 5', async () => {
    const inst = await bootBench('en')
    const { browser, page } = await step('screen', screen(inst.url, 'en'))
    expect(await fieldText(page)).toContain(MARK.en)
    expect(await step('save (PUT /api/settings)', enter(page, 'en', '5'))).toBe(200)
    await step('Restart now', page.getByText('Restart now').waitFor({ timeout: BROWSER_DEADLINE_MS }))
    const savedText = page.getByText('Saved, and waiting for a restart', { exact: false })
    await step('saved text', savedText.waitFor({ timeout: BROWSER_DEADLINE_MS }))
    expect(await savedText.isVisible(), 'saved text visible').toBe(true)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'tours-en-5.png') })
    expect(await maxInFile(inst.config)).toBe('5')
    // not live: the running limiter keeps its boot value
    expect(((await (await fetch(`${inst.url}/api/instance`)).json()) as { turns: { max: number } }).turns.max, 'limiteur non redémarré').toBe(3)
    await inst.stop()
    expect(await step('restart', restartedMax(inst.config))).toBe(5)
    await browser.close()
  }, RESTART_TEST_TIMEOUT_MS)

  it('owner saves 5 in French: same outcome, French words', async () => {
    const inst = await bootBench('fr')
    const { browser, page } = await screen(inst.url, 'fr')
    expect(await fieldText(page)).toContain(MARK.fr)
    expect(await enter(page, 'fr', '5')).toBe(200)
    await page.getByText('Redémarrer', { exact: true }).waitFor({ timeout: patience(10_000) })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'tours-fr-5.png') })
    expect(await maxInFile(inst.config)).toBe('5')
    await inst.stop()
    expect(await restartedMax(inst.config)).toBe(5)
    await browser.close()
  }, RESTART_TEST_TIMEOUT_MS)

  it('the two bounds, 1 and 16, are accepted and written', async () => {
    const inst = await bootBench('en')
    const { browser, page } = await screen(inst.url, 'en')
    expect(await enter(page, 'en', '16')).toBe(200)
    expect(await maxInFile(inst.config)).toBe('16')
    expect(await enter(page, 'en', '1')).toBe(200)
    expect(await maxInFile(inst.config)).toBe('1')
    await browser.close()
    await inst.stop()
  }, patience(120_000))

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
    await page.getByText(words).waitFor({ timeout: patience(10_000) })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `tours-en-refus-${value}.png`) })
    expect(await readFile(inst.config, 'utf8')).toBe(before)
    expect(await page.getByText('Restart now').count()).toBe(0)
    await browser.close()
    await inst.stop()
  }, patience(120_000))

  it('17 is refused in French as well, the field showing an error', async () => {
    const inst = await bootBench('fr')
    const before = await readFile(inst.config, 'utf8')
    const { browser, page } = await screen(inst.url, 'fr')
    expect(await enter(page, 'fr', '17')).toBeGreaterThanOrEqual(400)
    await page.getByText('must be at most 16').waitFor({ timeout: patience(10_000) })
    expect(await readFile(inst.config, 'utf8')).toBe(before)
    await browser.close()
    await inst.stop()
  }, patience(120_000))
})

/** A scripted process: says what it writes and how it ends, the moment the helper has attached its listeners. */
function scripted(steps: { stdout?: string; stderr?: string; exit?: number }): ChildProcess {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; exitCode: number | null; kill: () => boolean }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.exitCode = null
  child.kill = () => true
  queueMicrotask(() => {
    if (steps.stdout) child.stdout.write(steps.stdout)
    if (steps.stderr) child.stderr.write(steps.stderr)
    if (steps.exit !== undefined) setImmediate(() => { child.exitCode = steps.exit as number; child.emit('exit', steps.exit) })
  })
  return child as unknown as ChildProcess
}

const sequence = (...attempts: Array<Parameters<typeof scripted>[0]>) => {
  const calls: string[][] = []
  const spawn: Spawn = (_command, args) => {
    calls.push(args)
    return scripted(attempts[Math.min(calls.length, attempts.length) - 1] as Parameters<typeof scripted>[0])
  }
  return { spawn, calls }
}

const TAKEN = { stderr: 'launch: the server exited (1)\nError: listen EADDRINUSE: address already in use 127.0.0.1:1234\n', exit: 1 }

describe('B-21 — a taken port is drawn again, any other failure is not', () => {
  it('the bench launcher that exits on EADDRINUSE is run again, and the next attempt is returned', async () => {
    const { spawn, calls } = sequence(TAKEN, { stdout: 'listening on http://127.0.0.1:4321\n' })
    const inst = await bootBench('en', spawn)
    expect(inst.url).toBe('http://127.0.0.1:4321')
    expect(calls).toHaveLength(2)
  })

  it('a bench launcher failing otherwise is rejected at once with its message', async () => {
    const { spawn, calls } = sequence({ stderr: 'launch: no build\n', exit: 1 }, { stdout: 'listening on http://127.0.0.1:1\n' })
    await expect(bootBench('en', spawn)).rejects.toThrow(/launcher exited 1: launch: no build/)
    expect(calls).toHaveLength(1)
  })

  it('the bench launcher gives up after three taken ports', async () => {
    const { spawn, calls } = sequence(TAKEN)
    await expect(bootBench('en', spawn)).rejects.toThrow(/EADDRINUSE/)
    expect(calls).toHaveLength(3)
  })

  it('the restarted binary that exits on EADDRINUSE is run again on another port, the file rewritten each time', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'besoin-tours-'))
    dirs.push(dir)
    const config = join(dir, 'adestia.config.yaml')
    await writeFile(config, 'port: 1\nmaxConcurrentTurns: 5\n')
    const answering = createHttp((_req, res) => { res.setHeader('content-type', 'application/json'); res.end('{"turns":{"max":5}}') })
    await new Promise<void>((done) => answering.listen(0, '127.0.0.1', done))
    const good = (answering.address() as { port: number }).port
    const ports = [good + 1, good]
    const seen: string[] = []
    const { spawn, calls } = sequence(TAKEN, {})
    const wrapped: Spawn = onSpawn(spawn, () => { seen.push(/^port: (\d+)$/m.exec(readFileSync(config, 'utf8'))?.[1] ?? '') })
    try {
      expect(await restartedMax(config, wrapped, async () => ports.shift() as number)).toBe(5)
    } finally {
      await new Promise((done) => answering.close(done))
    }
    expect(calls).toHaveLength(2)
    expect(seen).toEqual([String(good + 1), String(good)])
  })

  it('the restarted binary failing otherwise is rejected at once with its message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'besoin-tours-'))
    dirs.push(dir)
    const config = join(dir, 'adestia.config.yaml')
    await writeFile(config, 'port: 1\n')
    const { spawn, calls } = sequence({ stderr: 'config invalid\n', exit: 2 }, TAKEN)
    await expect(restartedMax(config, spawn, async () => 40000)).rejects.toThrow(/exited 2 before answering: config invalid/)
    expect(calls).toHaveLength(1)
  })
})

/** Runs a hook when the helper spawns. */
function onSpawn(spawn: Spawn, hook: () => void): Spawn {
  return (command, args, options) => {
    hook()
    return spawn(command, args, options)
  }
}
