import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// AD-26: the typed promise rules are on where the repository passes them.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const lint = (code: string) =>
  spawnSync(
    process.execPath,
    [resolve(root, 'node_modules/eslint/bin/eslint.js'), '--stdin', '--stdin-filename', 'packages/server/src/_probe.ts'],
    { cwd: root, input: code, encoding: 'utf8' },
  )

describe('AD-26 · typed promise lint', () => {
  it('an async callback handed to a void-returning slot is an error (no-misused-promises)', () => {
    const run = lint('export const f = (cb: () => void) => cb\nexport const g = f(async () => { await 1 })\n')
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('no-misused-promises')
  }, 30_000)
  it('awaiting a value that is not a promise is an error (await-thenable)', () => {
    const run = lint('export async function h() { await 1 }\n')
    expect(run.status).toBe(1)
    expect(run.stdout).toContain('await-thenable')
  }, 30_000)
})
