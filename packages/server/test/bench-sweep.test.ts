import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const bench = fileURLToPath(new URL('../../../bench/', import.meta.url))
const sweep = join(bench, 'sweep.mjs')
const built = existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url)))
const playwright = existsSync('/usr/lib/node_modules/playwright') || existsSync('/usr/lib/node_modules/playwright-core')

const run = (file: string, args: string[]) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' })
// A browser run is long: async, or the worker cannot answer vitest while it waits.
const runAsync = (file: string, args: string[]) =>
  new Promise<{ status: number | null; stderr: string }>((done) => {
    execFile(process.execPath, [file, ...args], { encoding: 'utf8' }, (error, _stdout, stderr) => {
      done({ status: error ? ((error as { code?: number }).code ?? 1) : 0, stderr })
    })
  })

describe('bench sweep refusals', () => {
  it.each([
    [['--bogus', 'x']],
    [['--skin']],
    [['--skin', '../x']],
    [['--locale', 'de']],
    [['--only', 'E-99']],
    [['--only', 'E-0']],
    [['--out']],
  ])('rejects %j with a non-zero exit, naming the cause', (args) => {
    const r = run(sweep, args)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('sweep:')
  })
})

describe.skipIf(!built || !playwright)('bench sweep, real browser', () => {
  it('writes 4 non-empty captures for one screen, under the skin directory', async () => {
    const out = mkdtempSync(join(tmpdir(), 'sweep-test-'))
    try {
      const r = await runAsync(sweep, ['--only', 'E-8', '--skin', 'skippy', '--out', out])
      expect(r.status, r.stderr).toBe(0)
      const files = readdirSync(join(out, 'skippy')).sort()
      expect(files).toEqual(['light-desk', 'light-phone', 'dark-desk', 'dark-phone'].map((v) => `E-8-missing-page-${v}.png`).sort())
      for (const f of files) expect(statSync(join(out, 'skippy', f)).size).toBeGreaterThan(500)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 120_000)

  it('exits non-zero and names the screen when its proof selector is broken', async () => {
    const out = mkdtempSync(join(tmpdir(), 'sweep-test-'))
    const broken = join(bench, `sweep-broken-${process.pid}.mjs`)
    try {
      const source = readFileSync(sweep, 'utf8')
      const mutated = source.replace(".adestia-prefs .adestia-tiles .adestia-tile'", ".adestia-no-such-thing'")
      expect(mutated).not.toBe(source)
      writeFileSync(broken, mutated)
      const r = await runAsync(broken, ['--only', 'E-9', '--out', out])
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('E-9 settings')
      expect(r.stderr).toContain('proves the screen')
    } finally {
      rmSync(broken, { force: true })
      rmSync(out, { recursive: true, force: true })
    }
  }, 180_000)
})
