// Helper of scripts/rejouer.sh: `plan <dir> <names…>` writes what to play, `report <dir> <out> <names…>`
// keeps the cases that were asked for and fails on a name that matched no test or on a red case.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fichiersDEcran } from './niveaux.mjs'

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

// Test files by kind, read from the tree (a bare name is looked up in their source).
const ls = (d) => (existsSync(d) ? readdirSync(d).map((f) => `${d}/${f}`) : [])
const vitestFiles = () => ['packages/content', 'packages/drivers', 'packages/schemas', 'packages/server', 'packages/web']
  .flatMap((p) => ls(`${p}/test`)).filter((f) => /\.test\.tsx?$/.test(f) && !/\.real\.test\.ts$/.test(f))
const pluginFiles = () => [...ls('plugins/test'), ...ls('plugins').flatMap((p) => ls(`${p}/test`))].filter((f) => /\.test\.js$/.test(f))
// Files whose source carries the last segment of the name (a title may be built, then none match).
const holding = (files, name) => {
  const last = name.split(' > ').pop()
  return files.filter((f) => readFileSync(f, 'utf8').includes(last))
}

if (mode === 'plan') {
  // A named test is replayed with its WHOLE file (no -t): the neighbour that leaves a state behind
  // is played too. The report keeps only the named cases.
  const files = new Set()
  const plug = new Set()
  const steps = new Set()
  let all = false      // a bare name found in no file source: play every vitest file
  let allPlug = false
  for (const w of wanted) {
    if (w.cls === 'etape') {
      if (!['typecheck', 'lint'].includes(w.name)) { console.error(`rejouer.sh: step "${w.name}" cannot be replayed alone (typecheck, lint)`); process.exit(2) }
      steps.add(w.name)
      continue
    }
    if (w.cls === null) {
      // A bare name: the files whose source holds it; found nowhere (a built title), play both kinds.
      const v = holding(vitestFiles(), w.name)
      const p = holding(pluginFiles(), w.name)
      v.forEach((x) => files.add(x))
      p.forEach((x) => plug.add(x))
      if (!v.length && !p.length) { all = true; allPlug = true }
    } else if (w.cls.startsWith('plugins/') || w.cls === 'test') {
      if (w.cls !== 'test') plug.add(w.cls); else allPlug = true
    } else files.add(w.cls)
  }
  const ecrans = new Set(fichiersDEcran())
  const screen = [...files].filter((f) => ecrans.has(f))
  const wr = (f, v) => writeFileSync(join(dir, f), v)
  wr('vitest.files', all ? 'ALL\n' : [...files].join('\n') + (files.size ? '\n' : ''))
  wr('plugins.files', allPlug ? 'ALL\n' : [...plug].join('\n') + (plug.size ? '\n' : ''))
  wr('screens.files', screen.join('\n') + (screen.length ? '\n' : ''))
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
