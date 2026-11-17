// The test levels a piece of work owes (AD-niveaux-1 to 3), computed from what it changed.
//
//   node scripts/niveaux.mjs ecrans <base>            play the local level + the screen tests of touched screens
//   node scripts/niveaux.mjs fiche <base>             play the whole suite minus the screen tests of untouched screens
//   node scripts/niveaux.mjs --lister ecrans|fiche <base>   print what that would play, play nothing
//   node scripts/niveaux.mjs --liste ecrans <base>    print only the screen-test files `ecrans` would play, sorted, one per line
//   node scripts/niveaux.mjs --verifier               guard: scripts/ecrans.json against the repository
//
// <base> is a commit; the changed files are those of `git diff <base> HEAD`. The map of
// screens and screen tests is scripts/ecrans.json. Nothing here depends on the repository
// beyond Node: import specifiers are read by the scanner below, so no `npm ci` is needed.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const carte = () => JSON.parse(readFileSync(join(root, 'scripts', 'ecrans.json'), 'utf8'))

// --- the screen-test files: what scripts/suite-locale.sh finds by grep ------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

export function fichiersDEcran() {
  const found = []
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const dir = join(root, 'packages', pkg, 'test')
    if (!existsSync(dir)) continue
    for (const f of walk(dir)) {
      if (!/\.test\.tsx?$/.test(f)) continue
      if (/playwright|chromium|launch\.mjs/.test(readFileSync(f, 'utf8'))) found.push(relative(root, f).split('\\').join('/'))
    }
  }
  return found.sort()
}

// --- the import graph -------------------------------------------------------------------------
const pkgSrc = {
  '@antorfr/adestia-schemas': 'packages/schemas/src/index.ts',
  '@antorfr/adestia-content': 'packages/content/src/index.ts',
  '@antorfr/adestia-drivers': 'packages/drivers/src/index.ts',
  '@antorfr/adestia-server': 'packages/server/src/index.ts',
  '@antorfr/adestia-web': 'packages/web/src/index.ts',
}
const isFile = (rel) => existsSync(join(root, rel)) && statSync(join(root, rel)).isFile()

function resolveSpec(from, spec) {
  spec = spec.replace(/[?#].*$/, '')
  if (pkgSrc[spec]) return pkgSrc[spec]
  if (!spec.startsWith('.')) return null // an external package
  const base = posix.normalize(posix.join(posix.dirname(from), spec))
  const stem = base.replace(/\.(js|mjs|jsx)$/, '')
  for (const c of [base, `${stem}.ts`, `${stem}.tsx`, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`]) {
    if (isFile(c)) return c
  }
  return null
}


// Import specifiers of a JS/TS source: `import … from 'x'`, `export … from 'x'`, `import 'x'`,
// `import('x')` and `require('x')` with a literal. Comments, strings and templates are skipped, so a
// specifier quoted in a comment or a fixture is not one.
function tokens(src) {
  const out = []
  const n = src.length
  let i = 0
  const regexAfter = () => {
    const p = out[out.length - 1]
    if (!p) return true
    if (p.t === 'id') return /^(return|typeof|case|in|of|delete|void|throw|new|else|do|instanceof|yield|await)$/.test(p.v)
    if (p.t === 'str' || p.t === 'num') return false
    return !/^[)\]}]$/.test(p.v) || p.v === '}'
  }
  const skipTemplate = () => { // i is just after the opening backtick
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') i += 2
      else if (src[i] === '$' && src[i + 1] === '{') {
        i += 2
        let depth = 1
        while (i < n && depth) {
          const c = src[i]
          if (c === '{') { depth++; i++ }
          else if (c === '}') { depth--; i++ }
          else if (c === '`') { i++; skipTemplate() }
          else if (c === '"' || c === "'") { i++; while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1; i++ }
          else i++
        }
      } else i++
    }
    i++
  }
  while (i < n) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      let v = ''
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2 } else v += src[j++] }
      out.push({ t: 'str', v })
      i = j + 1
      continue
    }
    if (c === '`') { i++; skipTemplate(); out.push({ t: 'str', v: null }); continue }
    if (c === '/' && regexAfter()) {
      let j = i + 1
      let cls = false
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) {
        if (src[j] === '\\') j++
        else if (src[j] === '[') cls = true
        else if (src[j] === ']') cls = false
        j++
      }
      i = j + 1
      while (/[a-z]/i.test(src[i] ?? '')) i++
      out.push({ t: 'str', v: null })
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1
      while (/[\w$]/.test(src[j] ?? '')) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    if (/\d/.test(c)) { let j = i + 1; while (/[\w.]/.test(src[j] ?? '')) j++; out.push({ t: 'num', v: '' }); i = j; continue }
    out.push({ t: 'p', v: c })
    i++
  }
  return out
}

export function specifiers(src) {
  const tk = tokens(src)
  const found = []
  const isStr = (t) => t && t.t === 'str' && t.v !== null
  for (let k = 0; k < tk.length; k++) {
    const t = tk[k]
    if (t.t !== 'id') continue
    const prev = tk[k - 1]
    if (prev && prev.t === 'p' && prev.v === '.') continue
    if (t.v === 'require' && tk[k + 1]?.v === '(' && isStr(tk[k + 2])) found.push(tk[k + 2].v)
    else if (t.v === 'import' && isStr(tk[k + 1])) found.push(tk[k + 1].v)
    else if (t.v === 'import' && tk[k + 1]?.v === '(' && isStr(tk[k + 2])) found.push(tk[k + 2].v)
    else if (t.v === 'import' || t.v === 'export') {
      for (let m = k + 1; m < tk.length; m++) {
        const u = tk[m]
        if (u.t === 'id' && u.v === 'from' && isStr(tk[m + 1])) { found.push(tk[m + 1].v); break }
        if (u.t === 'id' || (u.t === 'p' && /^[*,{}]$/.test(u.v))) continue
        break
      }
    }
  }
  return found
}

const cacheImports = new Map()
function importsOf(rel) {
  if (cacheImports.has(rel)) return cacheImports.get(rel)
  let specs = []
  const text = readFileSync(join(root, rel), 'utf8')
  if (/\.css$/.test(rel)) {
    specs = [...text.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map((m) => m[1])
  } else if (/\.(ts|tsx|js|mjs|jsx)$/.test(rel)) {
    specs = specifiers(text)
  }
  const out = []
  for (const s of specs) {
    const r = resolveSpec(rel, s)
    if (r) out.push(r)
  }
  cacheImports.set(rel, out)
  return out
}

function closure(starts, follow = () => true) {
  const seen = new Set()
  const stack = starts.filter(isFile)
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const n of importsOf(f)) if (follow(n)) stack.push(n)
  }
  return seen
}

// --- which screens a changed file touches ----------------------------------------------------
const isTestPath = (f) => /(^|\/)test\//.test(f)
const horsEcran = (f) =>
  /^packages\/(server\/src|drivers)\//.test(f) ||
  /^docs\//.test(f) ||
  /^[^/]+\.md$/.test(f) ||
  /^\.agent\//.test(f) ||
  /^plugins\/[^/]+\/test\//.test(f) ||
  /^plugins\/test\//.test(f) ||
  /^plugins\/[^/]+\/[^/]*\.md$/.test(f)
// The vitest setup runs before every test, screen tests included.
const partage = (f) => f === 'packages/web/test/setup.ts'
// The shell that mounts every screen: what it imports directly and no screen owns (useRoute.ts, the
// theme, the split) serves all of them, though only its own entry (E-32) reaches it in the graph.
const COQUE = 'packages/web/src/app/App.tsx'

export function calcul(changes, map = carte()) {
  const tous = Object.keys(map.ecrans)
  const declares = map.tests
  // Roots: a screen's entries, and each declared screen-test file; a test reaches only into test/
  // directories (its harness), never into the sources a screen is made of.
  const racines = []
  for (const [id, e] of Object.entries(map.ecrans)) {
    if (e.entrees) racines.push({ ecrans: [id], reach: closure(e.entrees) })
  }
  for (const [t, ecrans] of Object.entries(declares)) {
    if (ecrans === 'toujours' || !isFile(t)) continue
    racines.push({ ecrans, reach: closure([t], isTestPath) })
  }
  const coque = new Set(isFile(COQUE) ? importsOf(COQUE) : [])
  const entrees = new Set(Object.values(map.ecrans).flatMap((e) => e.entrees ?? []))
  const touches = new Set()
  const note = []
  for (const f of changes) {
    if (declares[f] === 'toujours') { tous.forEach((e) => touches.add(e)); continue }
    if (Array.isArray(declares[f])) { declares[f].forEach((e) => touches.add(e)); continue }
    if (coque.has(f) && !entrees.has(f)) { tous.forEach((e) => touches.add(e)); continue }
    let placed = false
    for (const [id, e] of Object.entries(map.ecrans)) {
      if (e.dossiers?.some((d) => f.startsWith(d))) { touches.add(id); placed = true }
    }
    for (const r of racines) {
      if (r.reach.has(f)) { r.ecrans.forEach((e) => touches.add(e)); placed = true }
    }
    if (placed) continue
    if (partage(f)) { tous.forEach((e) => touches.add(e)); continue }
    if (horsEcran(f) || isTestPath(f)) continue
    // Anything else, or a file the resolver cannot place: in doubt, every screen.
    tous.forEach((e) => touches.add(e))
    note.push(f)
  }
  return { touches, partout: note }
}

export function niveau(mode, touches, map = carte(), tests = fichiersDEcran()) {
  const declares = map.tests
  const joues = []
  const laisses = []
  const aucun = touches.size === 0
  for (const f of tests) {
    const d = declares[f]
    if (d === undefined) { joues.push(f); continue } // undeclared: in doubt, play
    if (d === 'toujours') {
      if (mode === 'fiche' || !aucun) joues.push(f)
      else laisses.push(f)
      continue
    }
    if (d.some((e) => touches.has(e))) joues.push(f)
    else laisses.push(f)
  }
  return { joues, laisses }
}

export function changes(base) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', base, 'HEAD'], { cwd: root, encoding: 'utf8' })
  return out.split('\n').filter(Boolean)
}

const num = (a, b) => Number(a.slice(2)) - Number(b.slice(2))

export function verifier(map = carte(), tests = fichiersDEcran()) {
  const problems = []
  for (const t of tests) if (map.tests[t] === undefined) problems.push(`screen test absent from scripts/ecrans.json: ${t}`)
  for (const [t, v] of Object.entries(map.tests)) {
    if (!isFile(t)) problems.push(`scripts/ecrans.json names a test that does not exist: ${t}`)
    if (v !== 'toujours') for (const e of v) if (!map.ecrans[e]) problems.push(`${t} declares an unknown screen: ${e}`)
  }
  for (const [id, e] of Object.entries(map.ecrans)) {
    for (const p of e.entrees ?? []) if (!isFile(p)) problems.push(`${id}: entry does not exist: ${p}`)
    for (const p of e.dossiers ?? []) if (!existsSync(join(root, p))) problems.push(`${id}: folder does not exist: ${p}`)
    if (!e.entrees && !e.dossiers) problems.push(`${id}: neither entrees nor dossiers`)
  }
  return problems
}

function lister(mode, base) {
  const ch = changes(base)
  const { touches, partout } = calcul(ch)
  const { joues, laisses } = niveau(mode, touches)
  const lines = [
    `niveau: ${mode}`,
    `base: ${base}`,
    `fichiers changés: ${ch.length}`,
    `écrans touchés: ${touches.size ? [...touches].sort(num).join(' ') : 'aucun'}`,
    ...(partout.length ? [`non placés (tous les écrans): ${partout.join(' ')}`] : []),
    'fichiers d\'écran joués:',
    ...(joues.length ? joues.map((f) => `  ${f}`) : ['  aucun']),
    'fichiers d\'écran laissés de côté:',
    ...(laisses.length ? laisses.map((f) => `  ${f}`) : ['  aucun']),
  ]
  return { text: lines.join('\n'), joues, laisses }
}

function main(argv) {
  const [a, b, c] = argv
  if (a === '--verifier') {
    const p = verifier()
    if (p.length) { console.error(p.join('\n')); return 1 }
    console.log('scripts/ecrans.json: ok')
    return 0
  }
  if (a === '--liste') {
    if (b !== 'ecrans' || !c) {
      console.error('usage: niveaux.mjs --liste ecrans <base>')
      return 2
    }
    const p = verifier()
    if (p.length) console.error(`warning (the guard will fail): ${p.join('; ')}`)
    const { joues } = lister('ecrans', c)
    if (joues.length) console.log([...joues].sort().join('\n'))
    return 0
  }
  const listing = a === '--lister'
  const mode = listing ? b : a
  const base = listing ? c : b
  if (!['ecrans', 'fiche'].includes(mode) || !base) {
    console.error('usage: niveaux.mjs [--lister] ecrans|fiche <base> | --liste ecrans <base> | --verifier')
    return 2
  }
  const p = verifier()
  if (p.length) console.error(`warning (the guard will fail): ${p.join('; ')}`)
  const { text, joues, laisses } = lister(mode, base)
  console.log(text)
  if (listing) return 0
  const env = { ...process.env }
  let script
  if (mode === 'fiche') {
    script = 'scripts/suite-attestee.sh'
    env.ADESTIA_EXCLURE_ECRANS = laisses.join(' ')
  } else {
    script = 'scripts/suite-locale.sh'
    env.ADESTIA_JOUER_ECRANS = joues.join(' ')
    env.ADESTIA_ECRANS_AVEC_BUILD = joues.length ? '1' : ''
  }
  return spawnSync('sh', [join(root, script)], { cwd: root, env, stdio: 'inherit' }).status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
