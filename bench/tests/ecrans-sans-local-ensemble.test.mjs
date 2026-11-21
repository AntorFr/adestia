/**
 * Feature adestia-ecrans-sans-local, tests d'ensemble écrits depuis le besoin (fiche : message « Livre » de Monsieur),
 * sans lire le diff. Le système : les commandes déclarées dans .sdlc.yaml (`tests.ecrans`, `tests.ecrans_liste`,
 * `tests.local`, `tests.installation`, `tests.rejouer`, `tests.outillage`), jouées sur un clone jetable de HEAD avec un
 * commit posé dessus. `npm` et `npx` sont bouchonnés (un journal d'appels) : le test regarde ce que le niveau lance,
 * il ne construit ni ne joue rien.
 * Lancé à la main : node --test bench/tests/ecrans-sans-local-ensemble.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const MCP = 'packages/web/test/besoin-mcp-browser.test.ts'
const CHAT = 'packages/web/test/besoin-chat-browser.test.ts'
let tmp
let n = 0

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ecrans-sans-local-'))
})
after(() => rmSync(tmp, { recursive: true, force: true }))

/** Clone jetable de HEAD, un commit qui touche `files`, avec ou sans node_modules ; rend { dir, base, journal, env }. */
function clone(files, { modules = true } = {}) {
  const dir = join(tmp, `c${n++}`)
  sh(tmp, 'clone', '-q', '--no-hardlinks', root, dir)
  sh(dir, 'config', 'user.email', 't@example.org')
  sh(dir, 'config', 'user.name', 'test')
  sh(dir, 'checkout', '-q', '-b', 'travail')
  if (modules) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'))
  const base = sh(dir, 'rev-parse', 'HEAD')
  for (const f of files) {
    appendFileSync(join(dir, f), '\n// touché par le test\n')
    sh(dir, 'add', f)
  }
  if (files.length) sh(dir, 'commit', '-q', '-m', 'travail')
  const bin = join(tmp, `bin${n}`)
  mkdirSync(bin)
  const journal = join(tmp, `journal${n}.log`)
  writeFileSync(journal, '')
  for (const outil of ['npm', 'npx']) {
    writeFileSync(join(bin, outil), `#!/bin/sh\necho "${outil} $*" >> "${journal}"\nexit 0\n`)
    chmodSync(join(bin, outil), 0o755)
  }
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ADESTIA_JOUER_ECRANS: '', ADESTIA_EXCLURE_ECRANS: '' }
  return { dir, base, journal, env }
}
const appels = (c) => readFileSync(c.journal, 'utf8').split('\n').filter(Boolean)
const declare = () => parse(readFileSync(join(root, '.sdlc.yaml'), 'utf8')).tests
/** La commande déclarée, {base} remplacé, jouée telle quelle par un shell dans le clone. */
const joue = (c, cle) => spawnSync('sh', ['-c', declare()[cle].replaceAll('{base}', c.base)], { cwd: c.dir, env: c.env, encoding: 'utf8' })

// Panne visée : une tâche sans écran installe, construit ou joue encore quelque chose.
test('ecrans, tâche sans écran (doc et serveur seuls) : rien installé, construit ni joué, 1..0, sortie 0, rapport à zéro cas', () => {
  for (const f of ['docs/parcours.md', 'packages/server/src/index.ts']) {
    const c = clone([f], { modules: false })
    const r = joue(c, 'ecrans')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^1\.\.0$/m)
    assert.deepEqual(appels(c), [], f)
    assert.ok(!existsSync(join(c.dir, 'node_modules')), 'aucun npm ci')
    const xml = readFileSync(join(c.dir, 'resultats.xml'), 'utf8')
    assert.ok(!/<testcase/.test(xml), f)
    assert.match(xml, /tests="0"/)
  }
})

// Panne visée : ecrans rejoue le niveau local (install, typecheck, lint, plugins) ou des tests hors des écrans touchés.
test('ecrans, tâche d\'écran (McpServers.tsx) : build puis un seul vitest sur le test MCP, ni install, typecheck, lint ni plugins, pas le chat', () => {
  const c = clone(['packages/web/src/app/McpServers.tsx'])
  const r = joue(c, 'ecrans')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const l = appels(c)
  assert.ok(l.some((a) => a.startsWith('npm run build')), l.join('\n'))
  const vitest = l.filter((a) => a.startsWith('npx vitest'))
  assert.equal(vitest.length, 1)
  assert.ok(vitest[0].split(' ').includes(MCP))
  assert.ok(!vitest[0].split(' ').includes(CHAT))
  const interdits = l.filter((a) => /(^npm ci)|typecheck|lint|test:plugins/.test(a))
  assert.deepEqual(interdits, [])
  // tout fichier posé après les options de vitest est un test d'écran que ecrans_liste annonce aussi
  const liste = joue(c, 'ecrans_liste').stdout.split('\n').filter(Boolean)
  const fichiers = vitest[0].split(' ').filter((a) => /^packages\/.*\.test\.tsx?$/.test(a))
  assert.deepEqual([...fichiers].sort(), [...liste].sort())
})

// Panne visée : ecrans_liste suit une autre règle que ecrans (liste des fichiers hors écran, ou bruit sur stdout).
test('ecrans_liste : sans écran touché, liste vide ; avec McpServers.tsx, des chemins de test seuls, le test MCP et pas le chat', () => {
  const vide = clone(['docs/parcours.md'], { modules: false })
  const rv = joue(vide, 'ecrans_liste')
  assert.equal(rv.status, 0, rv.stderr)
  assert.equal(rv.stdout.trim(), '')
  assert.deepEqual(appels(vide), [])
  const c = clone(['packages/web/src/app/McpServers.tsx'], { modules: false })
  const r = joue(c, 'ecrans_liste')
  assert.equal(r.status, 0, r.stderr)
  const lignes = r.stdout.split('\n').filter(Boolean)
  assert.ok(lignes.includes(MCP))
  assert.ok(!lignes.includes(CHAT))
  for (const l of lignes) assert.match(l, /^(packages\/[^/]+\/test|plugins\/[^/]+\/(web|test))\/.*\.test\.(ts|tsx|mjs|js)$/, l)
  assert.deepEqual(lignes, [...lignes].sort())
})

// Panne visée : l'installation est encore rejouée par ecrans: ou rejouer:, ou n'est plus déclarée.
test('installation déclarée une fois : tests.installation vaut npm ci, ni ecrans, ecrans_liste ni rejouer ne la jouent', () => {
  const t = declare()
  assert.equal(t.installation, 'npm ci')
  for (const cle of ['ecrans', 'ecrans_liste', 'rejouer']) assert.ok(!/npm (ci|install)/.test(t[cle]), cle)
  const rejouer = readFileSync(join(root, 'scripts/rejouer.sh'), 'utf8').replace(/^\s*#.*$/gm, '')
  assert.ok(!/npm (ci|install)/.test(rejouer))
})

test('rejouer : un nom d\'étape rejoué ne lance aucun npm ci', () => {
  const c = clone([])
  const r = spawnSync('sh', ['-c', declare().rejouer.replace('{tests}', '"etape > lint"')], { cwd: c.dir, env: c.env, encoding: 'utf8' })
  assert.ok(appels(c).some((a) => a === 'npm run lint'), r.stdout + r.stderr + appels(c).join('|'))
  assert.deepEqual(appels(c).filter((a) => /^npm (ci|install)/.test(a)), [])
})

// Panne visée : le niveau local rejoue des écrans quand l'environnement le dit, ou n'installe plus.
test('local : joue install, typecheck, lint, vitest sans le test MCP même si ADESTIA_JOUER_ECRANS le nomme, plugins ; pas de build', () => {
  const c = clone([])
  c.env.ADESTIA_JOUER_ECRANS = MCP
  const r = joue(c, 'local')
  assert.ok(r.stdout.includes('::: install'), r.stdout + r.stderr)
  const l = appels(c)
  for (const a of ['npm ci', 'npm run typecheck', 'npm run lint']) assert.ok(l.includes(a), `${a} dans\n${l.join('\n')}`)
  assert.ok(l.some((a) => a.startsWith('npm run test:plugins')))
  assert.ok(!l.some((a) => /\bbuild/.test(a)))
  const vitest = l.find((a) => a.startsWith('npx vitest'))
  assert.ok(vitest, l.join('\n'))
  assert.ok(vitest.includes(`--exclude ${MCP}`))
  assert.ok(vitest.includes(`--exclude ${CHAT}`))
  assert.ok(!new RegExp(`(^| )${MCP}( |$)`).test(vitest.replace(`--exclude ${MCP}`, '')))
})

// Panne visée : un script de sélection ne figure pas dans l'outillage lu sur main, la branche allège alors son propre niveau.
test('outillage déclare les scripts de sélection et ils existent, exécutables par sh ou node', () => {
  const o = declare().outillage
  for (const p of ['scripts/niveaux.mjs', 'scripts/ecrans.json', 'scripts/suite-ecrans.sh', 'scripts/suite-locale.sh']) {
    assert.ok(o.includes(p), p)
    assert.ok(existsSync(join(root, p)), p)
  }
})

// Panne visée : le README garde l'ancienne phrase « ecrans joue aussi le niveau local ».
test('README et CLAUDE.md : ecrans dit les écrans seuls, la durée est donnée, et aucune phrase ne dit que ecrans joue le niveau local', () => {
  for (const f of ['README.md', 'CLAUDE.md']) {
    const s = readFileSync(join(root, f), 'utf8')
    assert.ok(!/ecrans[^.\n]{0,60}(also plays|plays also|joue aussi) the local level/i.test(s), f)
    assert.ok(!/local level[^.\n]{0,40}(is|are) played (by|with) `?ecrans/i.test(s), f)
  }
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  assert.match(readme, /`ecrans` figures/)
  assert.match(readme, /\d+m\d+s/)
})
