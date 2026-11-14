/**
 * B-5 — .agent/status.md says the state: one working branch, not two contradictory lines.
 *
 *   node --test bench/tests/doc-status-branche.test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lines = readFileSync(join(root, '.agent/status.md'), 'utf8').split('\n')

describe('B-5 — status.md names one working branch', () => {
  test('exactly one "Branche de travail" line', () => {
    const found = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*-\s*Branche de travail\s*:/.test(l))
    assert.equal(found.length, 1, `lines ${found.map(([n]) => n).join(', ')}`)
  })

  test('no "Branche de travail" mention outside the list item that opens with it', () => {
    const stray = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /Branche de travail\s*:/.test(l) && !/^\s*-\s*Branche de travail\s*:/.test(l))
    assert.deepEqual(stray.map(([n]) => n), [])
  })

  test('it stays under 150 lines (B-5)', () => {
    assert.ok(lines.length < 150, `${lines.length} lines`)
  })
})
