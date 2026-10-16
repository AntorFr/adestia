import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The exit criterion of the "shared test support" feature, read as a test:
// the server tests share ONE fake driver, ONE git helper and ONE temp-dir
// helper (packages/server/test/support/), and they wait on signals the test
// owns, never on turns or fixed sleeps (CLAUDE.md: "A handshake waits for a
// SIGNAL"). packages/drivers/test keeps its own fakes and is not scanned.
const testDir = dirname(fileURLToPath(import.meta.url))

const sources = (): Array<{ name: string; text: string }> =>
  readdirSync(testDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !f.split(/[\\/]/).includes('support'))
    .filter((f) => f !== 'test-discipline.test.ts')
    .map((name) => ({ name, text: readFileSync(join(testDir, name), 'utf8') }))

const offenders = (re: RegExp, only?: string[]): string[] =>
  sources()
    .filter((s) => (only ? only.includes(s.name) : true))
    .filter((s) => re.test(s.text))
    .map((s) => s.name)
    .sort()

describe('server test support (R-9)', () => {
  it('no test file declares a fake Driver class of its own', () => {
    // Fails if a test re-declares `class XDriver …` instead of using ScriptedDriver's options.
    expect(offenders(/\bclass\s+\w*Driver\b/)).toEqual([])
  })

  it('no test file casts or types a literal as Driver', () => {
    // Fails if a file builds its own `{ … } as unknown as Driver` instead of driverWith().
    expect(offenders(/(as unknown as Driver\b|:\s*Driver\s*=\s*\{|\):\s*Driver\s*\{)/)).toEqual([])
  })

  it('no test file hands a bare { runTurn } object to the code under test', () => {
    // Fails if a literal driver replaces driverWith({ runTurn }).
    expect(offenders(/(?<!driverWith\()\{\s*runTurn\s*:/)).toEqual([])
  })

  it('no test file defines its own git() helper', () => {
    // Fails if `function git(` or `const git =` comes back outside support/git.ts.
    expect(offenders(/(function\s+git\s*\(|(const|let)\s+git\s*=)/)).toEqual([])
  })

  it('no test file calls mkdtemp itself', () => {
    // Fails if a test creates its temp directory without support/tmp.ts's tmpDir.
    expect(offenders(/\bmkdtemp(Sync)?\b/)).toEqual([])
  })
})

describe('waits on signals, not on turns or delays (R-10)', () => {
  it('callback, mcp and restart tests do not spin the event loop to wait', () => {
    // Fails if a bare setImmediate (or a counted loop of them) returns as a handshake.
    const three = ['callback.test.ts', 'mcp.test.ts', 'restart.test.ts']
    expect(offenders(/\bsetImmediate\b/, three)).toEqual([])
  })

  it('watch, pages, shell-tools and background tests sleep for no fixed duration', () => {
    // Fails if a literal-duration setTimeout, or a sleep/wait helper, is used as a wait.
    const four = sources()
      .map((s) => s.name)
      .filter((n) => /^(watch|pages|shell-tools|background)[\w.-]*\.test\.ts$/.test(n))
    expect(four.length).toBeGreaterThanOrEqual(4)
    expect(offenders(/setTimeout\([^)]*,\s*\d+\s*\)/, four)).toEqual([])
    expect(offenders(/\b(sleep|wait|delay|pause)\(\s*\d+\s*\)/, four)).toEqual([])
  })
})
