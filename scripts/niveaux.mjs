// The test levels a piece of work owes (AD-niveaux-1 to 3), computed from what it changed.
//
//   node scripts/niveaux.mjs ecrans <base>            play ONLY the screen tests of touched screens (scripts/suite-ecrans.sh: builds, then one vitest;
//                                                     nothing touched: nothing installed, built or played, `1..0`)
//   node scripts/niveaux.mjs fiche <base>             play the whole suite minus the screen tests of untouched screens
//   node scripts/niveaux.mjs --lister ecrans|fiche <base>   print what that would play, play nothing
//   node scripts/niveaux.mjs --liste ecrans <base>    print only the screen-test files `ecrans` would play, sorted, one per line
//   node scripts/niveaux.mjs --fichiers-ecran         print every screen-test file, one per line (the rule suite-locale.sh uses)
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

// The one rule that says a test file is a screen test (scripts/suite-locale.sh asks this script, it
// keeps no expression of its own): it cites playwright, chromium or launch.mjs, OR it imports the
// shared helper ./charte-browser AND uses it to start an instance or open a page (launch, open,
// newBrowser), by name or through a namespace (`h.launch`). A file that imports only `awaitShell`
// reaches no browser and stays a plain test.
export function estTestDEcran(source) {
  if (/playwright|chromium|launch\.mjs/.test(source)) return true
  if (!/from\s+['"]\.\/charte-browser(\.js)?['"]/.test(source)) return false
  return /\b(launch|open|newBrowser)\b/.test(source.replace(/^\s*import[^;]*?from\s+['"]\.\/charte-browser(\.js)?['"]/gm, '')) ||
    /import\s*\{[^}]*\b(launch|open|newBrowser)\b[^}]*\}\s*from\s+['"]\.\/charte-browser/.test(source)
}

export function fichiersDEcran() {
  const found = []
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const dir = join(root, 'packages', pkg, 'test')
    if (!existsSync(dir)) continue
    for (const f of walk(dir)) {
      if (!/\.test\.tsx?$/.test(f)) continue
      if (estTestDEcran(readFileSync(f, 'utf8'))) found.push(relative(root, f).split('\\').join('/'))
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
    if (c === '`') { const d = i; i++; skipTemplate(); out.push({ t: 'str', v: null, x: src.slice(d, i) }); continue }
    if (c === '/' && regexAfter()) {
      const d = i
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
      out.push({ t: 'str', v: null, x: src.slice(d, i) })
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1
      while (/[\w$]/.test(src[j] ?? '')) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    if (/\d/.test(c)) { let j = i + 1; while (/[\w.]/.test(src[j] ?? '')) j++; out.push({ t: 'num', v: '', x: src.slice(i, j) }); i = j; continue }
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

// --- places (AD-ecrans-places-1): a changed file decided before the import graph --------------
// A place answers a Set of screens (possibly empty) or null (not mine). One that cannot read what it
// needs answers every screen: in doubt, play.
const gitShow = (base, path) => {
  if (!base) return null
  try {
    return execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch { return null }
}
const lireActuel = (path) => (isFile(path) ? readFileSync(join(root, path), 'utf8') : null)
const lireJson = (texte) => {
  if (texte === null || texte === undefined) return undefined
  try {
    const v = JSON.parse(texte)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined
  } catch { return undefined }
}
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Metadata of the root package.json that no screen shows (AD-ecrans-places-3).
const METADONNEES = new Set(['scripts', 'description', 'repository', 'license', 'keywords', 'author', 'homepage', 'bugs'])

// Off-screen paths (AD-ecrans-places-2) and the bench runtime that keeps playing every screen.
const PLACES_FIXES = [
  { nom: 'hors écran', test: (f) => /^plugins\/README\.md$/.test(f) || /^bench\/.*\.md$/.test(f) || /^bench\/(scenarios|tests)\//.test(f) ||
    /^bench\/[^/]+\.sh$/.test(f) || /^plugins\/web\//.test(f) || f === 'Dockerfile', ecrans: () => new Set() },
  { nom: 'banc (tous)', test: (f) => /^bench\/(launch|fake-engine|oidc-stub|sweep|bench)\.mjs$/.test(f) || /^bench\/(seed|lib)\//.test(f) ||
    f === 'scripts/suite-ecrans.sh', ecrans: (tous) => new Set(tous) },
]

function placePackageJson(f, { tous, ancien, actuel }) {
  if (f !== 'package.json') return null
  const a = lireJson(ancien(f))
  const n = lireJson(actuel(f))
  if (!a || !n) return new Set(tous)
  const touches = new Set()
  for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) {
    if (sameJson(a[k], n[k])) continue
    if (METADONNEES.has(k)) continue
    if (k === 'version') { if (tous.includes('E-15')) touches.add('E-15'); else return new Set(tous); continue }
    return new Set(tous)
  }
  return touches
}

function placeCarte(f, { tous, ancien, actuel }) {
  if (f !== 'scripts/ecrans.json') return null
  const a = lireJson(ancien(f))
  const n = lireJson(actuel(f))
  if (!a || !n || typeof a.ecrans !== 'object' || typeof n.ecrans !== 'object' || typeof a.tests !== 'object' || typeof n.tests !== 'object') return new Set(tous)
  const touches = new Set()
  const ids = new Set([...Object.keys(a.ecrans), ...Object.keys(n.ecrans)])
  for (const id of ids) {
    const x = a.ecrans[id]
    const y = n.ecrans[id]
    if (!x || !y || !sameJson(x.entrees, y.entrees) || !sameJson(x.dossiers, y.dossiers)) touches.add(id)
  }
  for (const t of new Set([...Object.keys(a.tests), ...Object.keys(n.tests)])) {
    const x = a.tests[t]
    const y = n.tests[t]
    const tri = (v) => (Array.isArray(v) ? [...v].sort() : v)
    if (sameJson(tri(x), tri(y))) continue
    if (x === 'toujours' || y === 'toujours') return new Set(tous)
    for (const e of [...(x ?? []), ...(y ?? [])]) touches.add(e)
  }
  return touches
}

// components.css (AD-ecrans-places-5): the two versions are cut into rules, the class blocks of the
// changed rules are looked for, as plain text, in the sources each screen reaches.
const CSS = 'packages/web/src/app/styles/components.css'
const sansCommentaires = (css) => {
  let out = ''
  for (let i = 0; i < css.length;) {
    const c = css[i]
    if (c === '"' || c === "'") { // a string may hold a slash-star
      let j = i + 1
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1
      out += css.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      if (e < 0) throw new Error('comment never closed')
      out += ' '
      i = e + 2
    } else { out += c; i++ }
  }
  return out
}
const blanc = (t) => t.replace(/\s+/g, ' ').trim()
// The end of the block opened at `open` (the index of its `{`), strings skipped.
function fermant(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    const c = css[i]
    if (c === '"' || c === "'") { i++; while (i < css.length && css[i] !== c) i += css[i] === '\\' ? 2 : 1 }
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  throw new Error('block never closed')
}
// → [{ cle, corps, selecteur }] in file order; `selecteur` is null for what has no class to read.
// Throws on what is not understood (the place then answers every screen).
function regles(css, condition = '') {
  const out = []
  let i = 0
  const n = css.length
  while (i < n) {
    const o = css.indexOf('{', i)
    const pv = css.indexOf(';', i)
    if (o < 0) { if (blanc(css.slice(i))) throw new Error('stray text'); break }
    if (pv >= 0 && pv < o) { // a statement (@import, @charset…)
      if (blanc(css.slice(i, pv))) out.push({ cle: `${condition}${blanc(css.slice(i, pv))};`, corps: '', selecteur: null })
      i = pv + 1
      continue
    }
    const tete = blanc(css.slice(i, o))
    const f = fermant(css, o)
    const corps = css.slice(o + 1, f)
    i = f + 1
    if (!tete) throw new Error('rule without selector')
    if (/^@(media|supports)\b/i.test(tete)) {
      if (condition) throw new Error('nested at-rule')
      out.push(...regles(corps, `${tete} > `))
    } else if (tete.startsWith('@')) out.push({ cle: `${condition}${tete}`, corps: blanc(corps), selecteur: null })
    else out.push({ cle: `${condition}${tete}`, corps: blanc(corps), selecteur: tete })
  }
  return out
}
// The class blocks of a selector: `adestia-btn--danger` and `adestia-btn__icon` give `adestia-btn`.
// null when a part of the list has no class at all (`:root`, `*`, `body`).
function blocsDe(selecteur) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const c of selecteur) {
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += c
  }
  parts.push(cur)
  const blocs = new Set()
  for (const part of parts) {
    const classes = [...part.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
    if (!classes.length) return null
    for (const k of classes) blocs.add(k.split(/--|__/)[0])
  }
  return blocs
}
const empreinte = (r) => `${r.cle}\u0000${r.corps}`
const compte = (liste) => {
  const m = new Map()
  for (const r of liste) m.set(empreinte(r), (m.get(empreinte(r)) ?? 0) + 1)
  return m
}

function textesAtteints(map, id) {
  const e = map.ecrans[id]
  const fichiers = closure(e.entrees ?? [])
  for (const d of e.dossiers ?? []) {
    const abs = join(root, d)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) for (const f of walk(abs)) fichiers.add(relative(root, f).split('\\').join('/'))
    else fichiers.add(d)
  }
  fichiers.delete(CSS)
  fichiers.delete(I18N) // it holds every key as a literal: it would make every screen cite every key
  return [...fichiers].map((f) => { try { return readFileSync(join(root, f), 'utf8') } catch { return '' } })
}

function placeComponentsCss(f, { tous, ancien, actuel, carte: map, textes }) {
  if (f !== CSS) return null
  const a = ancien(f)
  const n = actuel(f)
  if (typeof a !== 'string' || typeof n !== 'string') return new Set(tous)
  const avant = regles(sansCommentaires(a))
  const apres = regles(sansCommentaires(n))
  const ca = compte(avant)
  const cn = compte(apres)
  const changees = [...avant.filter((r) => cn.get(empreinte(r)) !== ca.get(empreinte(r))), ...apres.filter((r) => cn.get(empreinte(r)) !== ca.get(empreinte(r)))]
  if (!changees.length) { // same rules: a reordering moves the cascade, in doubt every screen
    return avant.map(empreinte).join('\n') === apres.map(empreinte).join('\n') ? new Set() : new Set(tous)
  }
  const blocs = new Set()
  for (const r of changees) {
    const b = r.selecteur === null ? null : blocsDe(r.selecteur)
    if (!b) return new Set(tous)
    b.forEach((x) => blocs.add(x))
  }
  const lus = new Map(tous.map((id) => [id, textes(id, map.ecrans[id])]))
  const touches = new Set()
  for (const b of blocs) {
    const citants = tous.filter((id) => lus.get(id).some((t) => t.includes(b)))
    if (!citants.length) return new Set(tous) // a skin or a plugin may use it
    citants.forEach((id) => touches.add(id))
  }
  return touches
}

// i18n.ts (AD-ecrans-places-6): the entries of the FR and en tables, read on the `tokens` scanner, are
// compared as a table; what is outside them must be the same tokens (comments are not tokens).
const I18N = 'packages/web/src/app/i18n.ts'
// → { entrees: Map('table\u0000key' → [values]), reste: string }; throws on an entry that is not `key: 'value',`.
function lireI18n(src) {
  const tk = tokens(src)
  const entrees = new Map()
  const reste = []
  for (let k = 0; k < tk.length; k++) {
    const t = tk[k]
    const a = tk[k - 1]
    const b = tk[k - 2]
    let table = null
    if (t.t === 'p' && t.v === '{' && a) {
      if (a.v === ':' && b && b.v === 'en') table = 'en'
      else if (a.v === '=') { // `const FR: Readonly<…> = {`: the name sits right after `const`
        let m = k - 2
        while (m > 0 && !(tk[m].t === 'id' && tk[m].v === 'const')) m--
        if (tk[m + 1]?.v === 'FR') table = 'fr'
      }
    }
    reste.push(t.x !== undefined ? `x${JSON.stringify(t.x)}` : t.t === 'str' ? `s${JSON.stringify(t.v)}` : `${t.t}${t.v}`)
    if (!table) continue
    k++
    while (!(tk[k].t === 'p' && tk[k].v === '}')) {
      const [c, d, e, f] = [tk[k], tk[k + 1], tk[k + 2], tk[k + 3]]
      const cleOk = (c.t === 'str' && c.v !== null) || c.t === 'id'
      if (!cleOk || d.t !== 'p' || d.v !== ':' || e.t !== 'str' || e.v === null) throw new Error('entry not understood')
      const id = `${table}\u0000${c.v}`
      entrees.set(id, [...(entrees.get(id) ?? []), e.v])
      k += 3
      if (f.t === 'p' && f.v === ',') k++
      else if (!(f.t === 'p' && f.v === '}')) throw new Error('entry not understood')
    }
    reste.push('{}')
  }
  return { entrees, reste: reste.join(' ') }
}
const citeCles = (texte, cles) => {
  const lits = new Set(tokens(texte).filter((t) => t.t === 'str' && t.v !== null).map((t) => t.v))
  return cles.filter((c) => lits.has(c))
}

function placeI18n(f, { tous, ancien, actuel, carte: map, textes }) {
  if (f !== I18N) return null
  const a = ancien(f)
  const n = actuel(f)
  if (typeof a !== 'string' || typeof n !== 'string') return new Set(tous)
  const x = lireI18n(a)
  const y = lireI18n(n)
  if (x.reste !== y.reste) return new Set(tous) // a change outside the entries
  const cles = new Set()
  for (const id of new Set([...x.entrees.keys(), ...y.entrees.keys()])) {
    if (JSON.stringify(x.entrees.get(id) ?? null) !== JSON.stringify(y.entrees.get(id) ?? null)) cles.add(id.split('\u0000')[1])
  }
  if (!cles.size) return new Set()
  const liste = [...cles]
  const lus = new Map(tous.map((id) => [id, textes(id, map.ecrans[id]).flatMap((t) => citeCles(t, liste))]))
  const touches = new Set()
  for (const c of liste) {
    const citants = tous.filter((id) => lus.get(id).includes(c))
    if (!citants.length) return new Set(tous) // a server or content message, a plugin sentence
    citants.forEach((id) => touches.add(id))
  }
  return touches
}

const PLACES = [
  ...PLACES_FIXES.map((p) => (f, c) => (p.test(f) ? { nom: p.nom, ecrans: p.ecrans(c.tous) } : null)),
  (f, c) => { const r = placePackageJson(f, c); return r && { nom: 'package.json', ecrans: r } },
  (f, c) => { const r = placeCarte(f, c); return r && { nom: 'scripts/ecrans.json', ecrans: r } },
  (f, c) => { const r = placeComponentsCss(f, c); return r && { nom: 'components.css', ecrans: r } },
  (f, c) => { const r = placeI18n(f, c); return r && { nom: 'i18n.ts', ecrans: r } },
]

function placer(f, contexte) {
  for (const place of PLACES) {
    let r
    try { r = place(f, contexte) } catch { r = { nom: 'illisible', ecrans: new Set(contexte.tous) } }
    if (r) return r
  }
  return null
}

// `contexte`: { base, ancien(path), actuel(path), textes(id, entry) } — the two versions of a file read by the
// places and the texts a screen reaches; tests inject them, the default reads `git show <base>:<path>` and the working tree.
export function calcul(changes, map = carte(), contexte = {}) {
  const tous = Object.keys(map.ecrans)
  const lecture = { tous, ancien: contexte.ancien ?? ((p) => gitShow(contexte.base, p)), actuel: contexte.actuel ?? lireActuel,
    carte: map, textes: contexte.textes ?? ((id) => textesAtteints(map, id)) }
  const places = []
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
    const place = placer(f, lecture)
    if (place) { place.ecrans.forEach((e) => touches.add(e)); places.push(`${f} (${place.nom})`); continue }
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
  return { touches, partout: note, places }
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
  const { touches, partout, places } = calcul(ch, carte(), { base })
  const { joues, laisses } = niveau(mode, touches)
  const lines = [
    `niveau: ${mode}`,
    `base: ${base}`,
    `fichiers changés: ${ch.length}`,
    `écrans touchés: ${touches.size ? [...touches].sort(num).join(' ') : 'aucun'}`,
    ...(places.length ? [`places: ${places.join(' ')}`] : []),
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
  if (a === '--fichiers-ecran') { // every screen-test file, one per line: what suite-locale.sh excludes
    for (const f of fichiersDEcran()) console.log(f)
    return 0
  }
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
    script = 'scripts/suite-ecrans.sh'
    env.ADESTIA_JOUER_ECRANS = joues.join(' ')
  }
  return spawnSync('sh', [join(root, script)], { cwd: root, env, stdio: 'inherit' }).status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
