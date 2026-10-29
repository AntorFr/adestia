/**
 * Whole-feature checks of `adestia-correctifs-dette` (B-13, AD-16, P-15, AD-17 debt),
 * written from the exit criterion alone. Plain text and process checks, no browser:
 *   node --test bench/tests/dette-ensemble.test.mjs
 *
 * Each test names the change that turns it red.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const tracked = (...globs) =>
  execFileSync('git', ['ls-files', '--', ...globs], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && existsSync(join(root, f)))

// ---- R-2: no one-line alias in packages/drivers -------------------------------------
test('drivers: no module-level line binds a name to another identifier alone', () => {
  // red if someone re-adds `const usageOf = quotaReportOf` (or with `export`, or a `;`)
  const files = tracked('packages/drivers/src/*.ts', 'packages/drivers/src/**/*.ts')
  assert.ok(files.length > 10, `${files.length} driver sources found`)
  const found = []
  for (const f of files) for (const [i, line] of read(f).split(/\r?\n/).entries()) {
    const m = /^(?:export\s+)?(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*([A-Za-z_$][\w$.]*)\s*;?\s*$/.exec(line)
    if (m && !/^(true|false|null|undefined|Infinity|NaN)$/.test(m[1])) found.push(`${f}:${i + 1}: ${line.trim()}`)
  }
  assert.deepEqual(found, [])
})

test('drivers: no re-export under another name of a symbol from the same package', () => {
  // red if `export { checkAuthError as classifyAuthError } from ...` style aliases come back
  const found = []
  for (const f of tracked('packages/drivers/src/*.ts', 'packages/drivers/src/**/*.ts')) {
    for (const [i, line] of read(f).split(/\r?\n/).entries()) {
      if (/^\s*export\s*\{[^}]*\bas\b[^}]*\}/.test(line) && !/\bas default\b/.test(line)) found.push(`${f}:${i + 1}: ${line.trim()}`)
    }
  }
  assert.deepEqual(found, [])
})

// ---- R-6: the table of exports kept for their tests ----------------------------------
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const keptTable = () => {
  const lines = read('ARCHITECTURE.md').split('\n')
  const intro = lines.findIndex((l) => /Internal exports kept for their tests, one reason per row/.test(l))
  assert.ok(intro >= 0, 'the table is still documented')
  const head = lines.findIndex((l, i) => i > intro && /^\s*\|\s*Module\s*\|/.test(l))
  assert.ok(head >= 0, 'the table has a header')
  const rows = []
  for (let i = head + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]))
  return { header: cells(lines[head]), rows }
}
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1])

test('kept exports: every row says why, in a sentence', () => {
  // red if a row is left with an empty or one-word reason
  const { header, rows } = keptTable()
  assert.match(header.join('|').toLowerCase(), /reason/)
  const bad = rows.filter((r) => (r[3] ?? '').split(/\s+/).filter(Boolean).length < 4).map((r) => r[0])
  assert.deepEqual(bad, [])
})

test('kept exports: each row is really imported by the test it names, and is exported by its module', () => {
  // red if the table lists an export no named test imports, or one the module no longer exports
  const { rows } = keptTable()
  const problems = []
  for (const r of rows) {
    const mod = ticks(r[0])[0]
    const names = ticks(r[1])
    const tests = ticks(r[2])
    if (!mod || !names.length || !tests.length) { problems.push(`malformed row ${r[0]}`); continue }
    const src = existsSync(join(root, mod)) ? read(mod) : ''
    for (const n of names) {
      if (!new RegExp(`\\b${n}\\b`).test(src)) problems.push(`${mod} no longer mentions ${n}`)
      const imported = tests.some((t) => existsSync(join(root, t)) && new RegExp(`\\b${n}\\b`).test(read(t)))
      if (!imported) problems.push(`${n}: none of ${tests.join(', ')} uses it`)
    }
  }
  assert.deepEqual(problems, [])
})

test('kept exports: a re-export outside an index is used by production code, not only by tests', () => {
  // red if a module keeps `export { x } from './owner.js'` so that tests can import x from it
  const prod = tracked('packages/*/src/*.ts', 'packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx')
  const tests = tracked('packages/*/test/*.ts', 'packages/*/test/*.tsx', 'packages/*/test/**/*.ts', 'packages/*/test/**/*.tsx')
  const importsFromTest = (t, n, target) => {
    for (const im of read(t).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g)) {
      const names = im[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
      if (names.includes(n) && join(dirname(t), im[2]).replace(/\.js$/, '') === target) return true
    }
    return false
  }
  const problems = []
  for (const f of prod.filter((p) => !/\/index\.ts$/.test(p))) {
    for (const m of read(f).matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gm)) {
      const target = f.replace(/\.tsx?$/, '')
      const importsFrom = (g, n) => {
        for (const im of read(g).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g)) {
          const names = im[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
          if (names.includes(n) && join(dirname(g), im[2]).replace(/\.js$/, '') === target) return true
        }
        return false
      }
      for (const n of m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()).filter(Boolean)) {
        const users = prod.filter((g) => g !== f && importsFrom(g, n))
        const testers = tests.filter((t) => importsFrom(t, n) || importsFromTest(t, n, target))
        if (!users.length && testers.length) problems.push(`${f} re-exports ${n}; only ${testers.join(', ')} import it from there`)
      }
    }
  }
  assert.deepEqual(problems, [])
})

// ---- P-15: the bench defines its helpers once ---------------------------------------
const benchFiles = () => tracked('bench/*.mjs', 'bench/**/*.mjs').filter((f) => !f.startsWith('bench/tests/'))
const defs = (name, paramRe) => {
  const found = []
  const re = new RegExp(`(?:function\\s*\\*?\\s*${name}\\s*\\(\\s*${paramRe}|(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\(\\s*${paramRe}|\\(\\s*${paramRe}))`, 'g')
  for (const f of benchFiles()) for (const m of read(f).matchAll(re)) found.push(f)
  return found
}
test('bench: loadPlaywright is defined once', () => {
  // red if a script re-declares its own loader beside bench/lib/playwright.mjs
  assert.equal(defs('loadPlaywright', '').length, 1, defs('loadPlaywright', '').join(', '))
})
test('bench: launch(seed) is defined once', () => {
  // red if a scenario or seed re-declares launch(seed, ...) instead of importing it
  assert.equal(defs('launch', 'seed\\b').length, 1, defs('launch', 'seed\\b').join(', '))
})
test('bench: the one definitions are importable and used by more than one caller', () => {
  // red if the shared helpers are deleted and callers each inline their own
  const users = (name) => benchFiles().filter((f) => new RegExp(`import[^;]*\\b${name}\\b`).test(read(f)))
  assert.ok(users('loadPlaywright').length >= 2, users('loadPlaywright').join(','))
  assert.ok(users('launch').length >= 1, users('launch').join(','))
})

test('fake engine: every option beyond scripts is set by some seed', () => {
  // red if an option (mcp, auth, models, ...) is kept in createFakeEngine with no seed passing it
  const src = read('bench/fake-engine.mjs')
  const head = src.slice(src.indexOf('export function createFakeEngine({'))
  const params = head.slice(head.indexOf('({') + 2, head.indexOf('} = {})'))
  const options = [...params.matchAll(/^  (\w+)\s*=/gm)].map((m) => m[1])
  assert.ok(options.includes('scripts'), `options read: ${options.join(',')}`)
  const supplied = new Set(['scripts'])
  for (const f of tracked('bench/seed/*.mjs', 'bench/scenarios/*.mjs', 'bench/*.mjs')) {
    const text = read(f)
    const at = text.search(/export const engine\s*=\s*\{|createFakeEngine\(\{/)
    if (at < 0) continue
    const block = text.slice(at, text.indexOf('\n}', at) + 2)
    for (const o of options) if (new RegExp(`(^|[\\s{,])${o}\\s*[:,]`, 'm').test(block)) supplied.add(o)
  }
  assert.deepEqual(options.filter((o) => !supplied.has(o)), [])
})

// ---- CI and DESIGN.md ---------------------------------------------------------------
test('CI plays doc-besoin.test.mjs', () => {
  // red if the workflow step that runs the documentation guard is removed
  const ci = tracked('.github/workflows/*.yml').map(read).join('\n')
  assert.match(ci, /^\s*(-\s+)?run:.*node\s+--test\b.*bench\/tests\/doc-besoin\.test\.mjs/m)
})

test('DESIGN.md: each rule is guarded in one place only', () => {
  // red if a vitest or node test re-asserts the decision-log order or the delivery-state rule
  const tests = tracked('packages/*/test/*.ts', 'packages/*/test/**/*.ts', 'bench/tests/*.mjs', 'plugins/**/*.test.js', 'plugins/**/*.test.mjs')
    .filter((f) => f !== 'bench/tests/dette-ensemble.test.mjs')
  const reading = tests.filter((f) => /['"`][^'"`\n]*DESIGN\.md['"`]/.test(read(f)) && /readFile|read\(/.test(read(f)))
  const order = reading.filter((f) => /oldest first|sort\(\)/i.test(read(f)) && /DESIGN/.test(read(f)))
  const state = reading.filter((f) => /not built|delivery state|unless marked/i.test(read(f)))
  assert.deepEqual(order.filter((f) => !f.endsWith('shell-tools-find.test.ts')), ['bench/tests/doc-besoin.test.mjs'])
  assert.deepEqual(state, ['bench/tests/doc-besoin.test.mjs'])
  const titles = read('bench/tests/doc-besoin.test.mjs').split('\n').filter((l) => /^\s*test\(.*DESIGN\.md/.test(l))
  assert.equal(titles.length, 2, titles.join('\n'))
})

// ---- Lint ---------------------------------------------------------------------------
const lint = (file, code) => spawnSync(process.execPath, [join(root, 'node_modules/eslint/bin/eslint.js'), '--stdin', '--stdin-filename', file], {
  cwd: root, input: code, encoding: 'utf8',
})
test('lint: a typed promise rule is an error in packages', { timeout: 60_000 }, () => {
  // red if no-misused-promises is turned off for packages/**
  const run = lint('packages/server/src/_probe.ts', 'export const f = (cb: () => void) => cb\nexport const g = f(async () => { await Promise.resolve(1) })\n')
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /no-misused-promises/)
})
test('lint: a typed promise rule is an error in plugins', { timeout: 60_000 }, () => {
  // red if the typed rules stop covering plugins/**
  const run = lint('plugins/atelier/api.mjs', 'export async function h() { await 1 }\n')
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /await-thenable/)
})
test('lint: a rule left off is explained under Known defects', () => {
  // red if no-floating-promises is off (as the config says) while status.md no longer names it
  const cfg = read('eslint.config.js')
  const on = /['"]@typescript-eslint\/no-floating-promises['"]\s*:\s*(\[\s*)?['"]error['"]/.test(cfg)
  if (!on) assert.match(read('.agent/status.md'), /no-floating-promises/)
})
test('lint: .agent/migrate-frame.mjs is gone or clean', { timeout: 60_000 }, () => {
  // red if the file exists with lint errors
  if (!existsSync(join(root, '.agent/migrate-frame.mjs'))) return
  const r = spawnSync(process.execPath, [join(root, 'node_modules/eslint/bin/eslint.js'), '.agent/migrate-frame.mjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout)
})
