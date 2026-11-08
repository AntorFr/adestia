// Merges the step results and the vitest / node --test JUnit files of
// scripts/suite-attestee.sh into one resultats.xml. Usage: <dir> <out>.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, out] = process.argv.slice(2)
const esc = (s) => String(s).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const steps = readFileSync(join(dir, 'steps.tsv'), 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t'))
const cases = []
for (const [name, st, secs] of steps) {
  const log = existsSync(join(dir, `${name}.log`)) ? readFileSync(join(dir, `${name}.log`), 'utf8').slice(-4000) : ''
  cases.push(`<testcase classname="etape" name="${esc(name)}" time="${secs}">${st === 'ok' ? '' : `<failure message="step ${esc(name)} failed">${esc(log)}</failure>`}</testcase>`)
}
// Steps that never ran (install failed) are reported red, not absent.
for (const n of ['install', 'typecheck', 'lint', 'build', 'boot'])
  if (!steps.some(([s]) => s === n)) cases.push(`<testcase classname="etape" name="${n}"><failure message="step ${n} not run"/></testcase>`)

// Pull the <testcase> elements (with their children) out of each tool report.
for (const f of ['vitest.xml', 'plugins.xml', 'guards.xml']) {
  const p = join(dir, f)
  if (!existsSync(p)) continue
  const xml = readFileSync(p, 'utf8')
  const re = /<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g
  for (const m of xml.match(re) ?? []) {
    // Prefix the class with its source so the name stays unique and readable.
    cases.push(m)
  }
}
const bad = cases.filter((c) => /<failure|<error/.test(c)).length
const skipped = cases.filter((c) => /<skipped/.test(c)).length
writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="adestia" tests="${cases.length}" failures="${bad}" skipped="${skipped}">\n${cases.join('\n')}\n</testsuite>\n</testsuites>\n`)
