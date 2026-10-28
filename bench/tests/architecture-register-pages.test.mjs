/**
 * The pages row of the AD-17 register in ARCHITECTURE.md leads to the decision that built the
 * pages repairs, AD-25, and not to the shell/chat decisions (AD-20, AD-23).
 *
 *   node --test bench/tests/architecture-register-pages.test.mjs
 *
 * Fails if the row points to AD-20/AD-23 instead of AD-25, or if AD-25 is not a decision heading.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lines = readFileSync(resolve(root, 'ARCHITECTURE.md'), 'utf8').split('\n')
const pagesRow = lines.find((l) => l.startsWith('| pages |'))

test('the AD-17 pages row exists', () => {
  assert.ok(pagesRow, 'no "| pages |" row in ARCHITECTURE.md')
})

test('the AD-17 pages row says the repairs are built by AD-25', () => {
  assert.match(pagesRow, /built by AD-25:/)
})

test('the AD-17 pages row does not send to AD-20 or AD-23', () => {
  assert.doesNotMatch(pagesRow, /AD-20/)
  assert.doesNotMatch(pagesRow, /AD-23/)
})

test('AD-25 is a decision of ARCHITECTURE.md on the pages tranche', () => {
  assert.ok(lines.some((l) => l.startsWith('### AD-25 — Pages tranche')))
})
