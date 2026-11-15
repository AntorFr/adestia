// Helper of scripts/rejouer.sh: `plan <dir> <names…>` writes what to play, `report <dir> <out> <names…>`
// keeps the cases that were asked for and fails on a name that matched no test or on a red case.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [mode, dir, ...rest] = process.argv.slice(2)
const esc = (s) => String(s).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&')
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "<classname> > <name>" when the first segment is a file path or `etape`; else the bare name.
function parse(arg) {
  const t = arg.trim().replace(/^(['"])(.*)\1$/, '$2')
  const m = /^(\S+\.(?:test\.)?(?:tsx?|m?js)|etape) > ([\s\S]+)$/.exec(t)
  return m ? { cls: m[1], name: m[2] } : { cls: null, name: t }
}

function cases(file) {
  if (!existsSync(file)) return []
  const xml = readFileSync(file, 'utf8')
  return (xml.match(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g) ?? []).map((raw) => {
    const attr = (n) => unesc(new RegExp(`\\b${n}="([^"]*)"`).exec(raw.split('>')[0])?.[1] ?? '')
    return { raw, cls: attr('classname'), name: attr('name') }
  })
}

const wanted = rest.map(parse)

if (mode === 'plan') {
  const files = new Set()
  const pats = []
  const plug = []
  const steps = new Set()
  for (const w of wanted) {
    if (w.cls === 'etape') {
      if (!['typecheck', 'lint'].includes(w.name)) { console.error(`rejouer.sh: step "${w.name}" cannot be replayed alone (typecheck, lint)`); process.exit(2) }
      steps.add(w.name)
      continue
    }
    const inPlugins = w.cls === null || w.cls.startsWith('plugins/') || w.cls === 'test'
    const inVitest = w.cls === null || !inPlugins
    if (inVitest) {
      if (w.cls) files.add(w.cls)
      // vitest -t matches the full name, the suites and the test joined by a space.
      pats.push('^' + rx(w.name).replace(/ > /g, ' ') + '$')
    }
    if (inPlugins) plug.push('^' + rx(w.name) + '$')
  }
  const wr = (f, v) => writeFileSync(join(dir, f), v)
  wr('vitest.files', [...files].join('\n') + (files.size ? '\n' : ''))
  wr('vitest.args', pats.join('|'))
  wr('plugins.args', plug.join('|'))
  wr('steps.args', [...steps].join('\n'))
  process.exit(0)
}

// report
const out = rest[0]
const asked = rest.slice(1).map(parse)
const played = [
  ...cases(join(dir, 'vitest.xml')),
  ...cases(join(dir, 'plugins.xml')),
]
const kept = []
let missing = 0
const stepsTsv = existsSync(join(dir, 'steps.tsv')) ? readFileSync(join(dir, 'steps.tsv'), 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split('\t')) : []
for (const w of asked) {
  if (w.cls === 'etape') {
    const s = stepsTsv.find(([n]) => n === w.name)
    if (!s) { missing++; console.error(`rejouer.sh: step not played: ${w.name}`); continue }
    const log = existsSync(join(dir, `${w.name}.log`)) ? readFileSync(join(dir, `${w.name}.log`), 'utf8').slice(-4000) : ''
    kept.push(`<testcase classname="etape" name="${esc(w.name)}" time="${s[2]}">${s[1] === 'ok' ? '' : `<failure message="step ${esc(w.name)} failed">${esc(log)}</failure>`}</testcase>`)
    continue
  }
  const hit = played.filter((c) => c.name === w.name && (w.cls === null || c.cls === w.cls))
  if (!hit.length) { missing++; console.error(`rejouer.sh: no test matches: ${w.cls ? w.cls + ' > ' : ''}${w.name}`); continue }
  for (const h of hit) if (!kept.includes(h.raw)) kept.push(h.raw)
}
const bad = kept.filter((c) => /<failure|<error/.test(c)).length
const skipped = kept.filter((c) => /<skipped/.test(c)).length
writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="adestia" tests="${kept.length}" failures="${bad}" skipped="${skipped}">\n${kept.join('\n')}\n</testsuite>\n</testsuites>\n`)
console.log(`rejouer.sh: ${kept.length} played, ${bad} red, ${skipped} skipped, ${missing} name(s) matching no test`)
process.exit(missing || bad || skipped || !kept.length ? 1 : 0)
