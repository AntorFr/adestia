// Black-box tests of the exit criterion of `adestia-correctifs-dette-exports`
// (R-6, AD-26): every row of the "Internal exports kept for their tests" table
// of ARCHITECTURE.md carries a reason and names an export that still exists in
// its module; the R-6 outcome states the count `unused-exports.mjs` prints.
//
// Each test states the change that would turn it red:
//   - a table without a Reason column, or a row with an empty reason
//   - a row naming an export removed or renamed in its module
//   - an R-6 outcome whose count differs from the script's
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p: string) => readFileSync(join(root, p), 'utf8')

interface Row { module: string; exports: string[]; tests: string; reason: string }

const cells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

function table(): { header: string[]; rows: Row[] } {
  const lines = read('ARCHITECTURE.md').split('\n')
  const intro = lines.findIndex((l) => /^\s*Internal exports kept for their tests/.test(l))
  expect(intro, 'the table intro exists').toBeGreaterThan(-1)
  const first = lines.findIndex((l, i) => i > intro && /^\s*\|\s*Module\s*\|/.test(l))
  expect(first, 'the table exists').toBeGreaterThan(-1)
  const header = cells(lines[first] ?? '')
  const rows: Row[] = []
  for (let i = first + 2; i < lines.length && (lines[i] ?? '').trim().startsWith('|'); i++) {
    const c = cells(lines[i] as string)
    rows.push({
      module: (c[0] ?? '').replace(/`/g, ''),
      exports: [...(c[1] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] as string),
      tests: c[2] ?? '',
      reason: c[3] ?? '',
    })
  }
  return { header, rows }
}

function exported(source: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const decl = new RegExp(
    `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:const|let|function\\*?|class|type|interface|enum)\\s+${esc}\\b`,
  )
  if (decl.test(source)) return true
  for (const m of source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)) {
    const names = (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop()?.trim())
    if (names.includes(name)) return true
  }
  return false
}

describe('R-6 table of exports kept for their tests', () => {
  const { header, rows } = table()

  it('has a Reason column and rows', () => {
    expect(header.map((h) => h.toLowerCase())).toContain('reason')
    expect(rows.length).toBeGreaterThan(0)
  })

  it('every row has a one-line reason of substance', () => {
    const bad = rows.filter((r) => r.reason.length < 15).map((r) => r.module)
    expect(bad).toEqual([])
  })

  it('every row names at least one export and one importing test that exists', () => {
    for (const r of rows) {
      expect(r.exports.length, r.module).toBeGreaterThan(0)
      const tests = [...r.tests.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)
      expect(tests.length, r.module).toBeGreaterThan(0)
      for (const t of tests) expect(() => read(t), `${r.module} -> ${t}`).not.toThrow()
    }
  })

  it('every named export still exists in its module', () => {
    const missing: string[] = []
    for (const r of rows) {
      const src = read(r.module)
      for (const name of r.exports) if (!exported(src, name)) missing.push(`${r.module}:${name}`)
    }
    expect(missing).toEqual([])
  })

  it('the R-6 outcome states the count that unused-exports.mjs prints', () => {
    const run = spawnSync('node', ['scripts/unused-exports.mjs'], { cwd: root, encoding: 'utf8' })
    const count = Number(/(\d+) named exports/.exec(run.stderr + run.stdout)?.[1])
    expect(count).toBeGreaterThan(0)
    const r6 = read('ARCHITECTURE.md').split('\n').find((l) => l.startsWith('| R-6 |')) ?? ''
    expect(r6).toMatch(new RegExp(`\\b${count} entries`))
    const final = /The final inventory is \*\*(\d+)\*\*/.exec(read('ARCHITECTURE.md'))
    expect(Number(final?.[1])).toBe(count)
  })
})
