// Feature-level tests of B-2 and B-3 (docs/parcours.md, P-15), written from the
// need: a developer launches Adestia with no docker and captures EVERY screen
// (E-1 .. E-31 of docs/ecrans.md) in light and dark, at desk and phone width,
// for the default skin and for `--skin skippy`. Everything goes through the
// commands a developer types (`node bench/launch.mjs`, `node bench/sweep.mjs`);
// the browser is the one of the environment, as in the need. Expected values
// are literals taken from the need, not read back from the tool.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

const launch = fileURLToPath(new URL('../../../bench/launch.mjs', import.meta.url))
const sweep = fileURLToPath(new URL('../../../bench/sweep.mjs', import.meta.url))
const built =
  existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url))) &&
  existsSync(fileURLToPath(new URL('../../web/dist-web/index.html', import.meta.url)))
const globalRoot = (() => {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()
const hasPlaywright = globalRoot !== '' && existsSync(join(globalRoot, 'playwright'))
const ready = built && hasPlaywright

afterAll(cleanTmp)

const run = (args: string[], timeoutMs: number) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
    const child = spawn(process.execPath, [sweep, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d))
    child.stderr.on('data', (d: Buffer) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('exit', (status) => {
      clearTimeout(timer)
      done({ status, stdout, stderr })
    })
  })

interface Shot {
  file: string
  screen: number
  theme: string
  size: string
  width: number
  height: number
  bytes: number
  hash: string
}

const readShots = (dir: string): Shot[] =>
  readdirSync(dir).map((file) => {
    const m = /^E-(\d+)-.+-(light|dark)-(desk|phone)\.png$/.exec(file)
    if (!m) throw new Error(`unexpected capture name: ${file}`)
    const buf = readFileSync(join(dir, file))
    expect(buf.subarray(1, 4).toString('latin1'), file).toBe('PNG')
    return {
      file,
      screen: Number(m[1]),
      theme: m[2]!,
      size: m[3]!,
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      bytes: statSync(join(dir, file)).size,
      hash: createHash('sha256').update(buf).digest('hex'),
    }
  })

const find = (shots: Shot[], screen: number, theme: string, size: string) =>
  shots.find((s) => s.screen === screen && s.theme === theme && s.size === size)!

describe.skipIf(!ready)('B-3 · the sweep captures every screen, both themes, both sizes', () => {
  let out = ''
  let def: Shot[] = []
  let skippy: Shot[] = []
  const results: Record<string, { status: number | null; stdout: string; stderr: string }> = {}

  it('default skin: exits 0 and says 124/124', async () => {
    out = await tmpDir('sweep-ensemble-')
    results.default = await run(['--out', out], 420_000)
    expect(results.default.status, results.default.stderr).toBe(0)
    expect(results.default.stdout).toContain('124/124')
    expect(results.default.stderr).not.toContain('FAIL')
    def = readShots(join(out, 'default'))
  }, 450_000)

  it('default skin: 124 files, E-1 to E-31 each in light and dark at desk and phone', () => {
    expect(def).toHaveLength(124)
    for (let n = 1; n <= 31; n++) {
      const mine = def.filter((s) => s.screen === n)
      expect(mine.map((s) => `${s.theme}-${s.size}`).sort(), `E-${n}`).toEqual([
        'dark-desk',
        'dark-phone',
        'light-desk',
        'light-phone',
      ])
    }
  })

  it('default skin: desk captures are 1440x900, phone captures are a 390x844 portrait', () => {
    for (const s of def.filter((x) => x.size === 'desk')) {
      expect([s.width, s.height], s.file).toEqual([1440, 900])
    }
    for (const s of def.filter((x) => x.size === 'phone')) {
      expect(s.width % 390, s.file).toBe(0)
      expect(s.height / s.width, s.file).toBeCloseTo(844 / 390, 1)
    }
  })

  it('default skin: no capture is a blank page, and dark differs from light, phone from desk', () => {
    for (const s of def) expect(s.bytes, s.file).toBeGreaterThan(8_000)
    for (let n = 1; n <= 31; n++) {
      for (const size of ['desk', 'phone']) {
        expect(find(def, n, 'light', size).hash, `E-${n} ${size}: dark = light`).not.toBe(find(def, n, 'dark', size).hash)
      }
      for (const theme of ['light', 'dark']) {
        expect(find(def, n, theme, 'desk').hash, `E-${n} ${theme}: phone = desk`).not.toBe(find(def, n, theme, 'phone').hash)
      }
    }
  })

  it('default skin: the screens are not all the same error or loading page (at most one pair alike per theme and size)', () => {
    for (const theme of ['light', 'dark']) {
      for (const size of ['desk', 'phone']) {
        const distinct = new Set(def.filter((s) => s.theme === theme && s.size === size).map((s) => s.hash))
        expect(distinct.size, `${theme} ${size}`).toBeGreaterThanOrEqual(30)
      }
    }
  })

  it('--skin skippy: exits 0, 124/124, under skippy/, and E-2 and E-16 are not the default skin', async () => {
    results.skippy = await run(['--skin', 'skippy', '--out', out], 420_000)
    expect(results.skippy.status, results.skippy.stderr).toBe(0)
    expect(results.skippy.stdout).toContain('124/124')
    skippy = readShots(join(out, 'skippy'))
    expect(skippy).toHaveLength(124)
    for (const n of [2, 16]) {
      for (const theme of ['light', 'dark']) {
        for (const size of ['desk', 'phone']) {
          expect(find(skippy, n, theme, size).hash, `E-${n} ${theme} ${size}`).not.toBe(find(def, n, theme, size).hash)
        }
      }
    }
  }, 450_000)

  it('--only restricts to the screens named and still writes 4 captures per screen', async () => {
    const dir = await tmpDir('sweep-ensemble-only-')
    const r = await run(['--only', 'E-4,E-9', '--out', dir], 150_000)
    expect(r.status, r.stderr).toBe(0)
    expect(readShots(join(dir, 'default')).map((s) => s.screen).sort((a, b) => a - b)).toEqual([4, 4, 4, 4, 9, 9, 9, 9])
  }, 180_000)
})

describe.skipIf(!ready)('B-2 · a message typed in the shell on the fake engine gets the scripted answer', () => {
  const running = new Set<ChildProcess>()
  afterAll(() => {
    for (const p of running) p.kill('SIGKILL')
  })

  it('shows "pong" after the developer types "ping" and sends', async () => {
    const child = spawn(process.execPath, [launch, '--engine', 'fake'], {
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    running.add(child)
    let log = ''
    child.stdout.on('data', (d: Buffer) => (log += d))
    child.stderr.on('data', (d: Buffer) => (log += d))
    const url = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no url:\n${log}`)), 60_000)
      const i = setInterval(() => {
        const m = /^listening on (http:\/\/\S+)$/m.exec(log)
        if (m) {
          clearInterval(i)
          clearTimeout(t)
          resolve(m[1]!)
        }
      }, 50)
    })
    const pw = (await import(pathToFileURL(join(globalRoot, 'playwright', 'index.mjs')).href)) as {
      chromium: { launch: () => Promise<any> }
    }
    const browser = await pw.chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(url)
      const box = page.getByPlaceholder('Ask the agent…')
      await box.waitFor({ timeout: 30_000 })
      await box.fill('ping')
      await box.press('Enter')
      await page.getByText('pong', { exact: true }).first().waitFor({ timeout: 30_000 })
      expect(await page.getByText('pong', { exact: true }).count()).toBeGreaterThanOrEqual(1)
    } finally {
      await browser.close()
      child.kill('SIGTERM')
    }
  }, 120_000)
})
