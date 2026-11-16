// Measures the duration of each screen file, alone, one after the other (no contention between files).
//   node scripts/mesurer-tests-ecran.mjs [--grappe <nom>] [--sortie <dossier>]
// Plays what the suite plays: vitest files with the attested suite's flags, bench files with `node --test`.
// Prints a Markdown table (file, seconds, tests, skipped) and writes the test names, as the JUnit
// report gives them, to <sortie>/existants.txt. Exits 1 on a red or skipped test: no partial measure.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'
import { lireCadre } from './tests-ecran.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (nom) => { const i = process.argv.indexOf(nom); return i < 0 ? null : process.argv[i + 1] }
const sortie = arg('--sortie') ?? '/tmp/mesure-tests-ecran'
const seule = arg('--grappe')
mkdirSync(sortie, { recursive: true })

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&')

function cas(xml, fichier) {
  const sortieCas = []
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attr = (n) => { const a = new RegExp(`\\b${n}="([^"]*)"`).exec(m[1]); return a ? decode(a[1]) : '' }
    sortieCas.push({ nom: attr('name'), classe: attr('classname'), saute: /<skipped/.test(m[3] ?? ''), rouge: /<(failure|error)/.test(m[3] ?? '') })
  }
  return sortieCas.map((c) => ({ ...c, fichier }))
}

const { grappes } = lireCadre(root)
const lignes = []
const existants = []
let total = 0
let rouge = false
for (const [grappe, fichiers] of grappes) {
  if (seule && grappe !== seule) continue
  for (const f of fichiers) {
    const rapport = `${sortie}/${f.replace(/\//g, '__')}.xml`
    const t0 = Date.now()
    const run = f.endsWith('.mjs')
      ? spawnSync('node', ['--test', '--test-reporter=junit', `--test-reporter-destination=${rapport}`, f], { cwd: root, encoding: 'utf8' })
      : spawnSync('npx', ['vitest', 'run', '--maxWorkers=1', '--testTimeout=30000', '--hookTimeout=60000', '--reporter=junit', `--outputFile=${rapport}`, f], { cwd: root, encoding: 'utf8', env: { ...process.env, BENCH_FULL_SWEEP: '1', ADESTIA_PATIENCE: '4' } })
    const secondes = (Date.now() - t0) / 1000
    let cs = []
    try { cs = cas(readFileSync(rapport, 'utf8'), f) } catch { /* no report: red below */ }
    const saute = cs.filter((c) => c.saute).length
    if (run.status !== 0 || !cs.length || saute || cs.some((c) => c.rouge)) { rouge = true; console.error(`ROUGE ${f} (status ${run.status}, ${cs.length} tests, ${saute} sautés)`) }
    total += secondes
    lignes.push(`| ${grappe} | \`${f}\` | ${secondes.toFixed(1)} | ${cs.length} | ${saute} |`)
    for (const c of cs) existants.push(`${f} > ${c.nom}`)
    console.error(`${f}: ${secondes.toFixed(1)} s, ${cs.length} tests`)
  }
}
const machine = `${process.env.HOSTNAME ?? ''}, ${cpus().length} cœurs (nproc)`
console.log(lignes.join('\n'))
console.log(`\ntotal ${total.toFixed(1)} s ; machine ${machine}`)
writeFileSync(`${sortie}/existants.txt`, existants.join('\n') + '\n')
process.exit(rouge ? 1 : 0)
