/**
 * Re-verification of `adestia-preuve-tests`: the two statements of the attested suite that
 * were wrong once must stay true. (1) The header of scripts/suite-attestee.sh names the
 * steps in the order the script plays them (the builds come before the tests). (2) The
 * delay AD-preuve-1 documents is the one `.sdlc.yaml` declares (100m). Read from the files
 * by path, so the test never finds itself.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('the attested suite says what it plays', () => {
  const script = read('scripts/suite-attestee.sh')

  it('the script plays install, typecheck, lint, build, vitest, plugins, guards, boot, in that order', () => {
    // red if a step is moved, added or dropped without the contract below being revised
    const played = [...script.matchAll(/^step (\w+) /gm)].map((m) => m[1])
    expect(played).toEqual(['install', 'typecheck', 'lint', 'build', 'vitest', 'plugins', 'guards', 'boot'])
  })

  it('the header lists the steps in the order they are played: builds before tests', () => {
    // red if the header claims an order the script does not follow (builds listed after tests)
    const header = script.split('\n').filter((l) => l.startsWith('#')).join(' ').replace(/#\s*/g, ' ')
    const m = /in this order:\s*(.+?)\.\s/.exec(header)
    expect(m, 'header names an order').toBeTruthy()
    const words = (m?.[1] ?? '').split(',').map((w) => w.trim())
    expect(words).toEqual([
      'install', 'typecheck', 'lint', 'builds', 'tests', 'plugins', 'documentation/bench guards', 'boot',
    ])
  })

  it('the header does not claim the order of the old ci.yml', () => {
    // red if the header says "in the same order" as ci.yml, which built last
    expect(script).not.toMatch(/same order/)
  })
})

describe('AD-preuve-1 documents the delay .sdlc.yaml declares', () => {
  it('.sdlc.yaml declares 100m', () => {
    // red if the declared delay changes without the documentation following
    expect(parse(read('.sdlc.yaml')).tests.delai).toBe('100m')
  })

  it('ARCHITECTURE.md AD-preuve-1 states `delai: 100m` as the current value', () => {
    // red if the section keeps the first guess of 45m as the delay
    const arch = read('ARCHITECTURE.md')
    const start = arch.indexOf('### AD-preuve-1')
    const end = arch.indexOf('### AD-preuve-2')
    expect(start).toBeGreaterThan(-1)
    const section = arch.slice(start, end)
    expect(section).toMatch(/`delai: 100m`/)
    expect(section).not.toMatch(/`delai: 45m`/)
  })
})
