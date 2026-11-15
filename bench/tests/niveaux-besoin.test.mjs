/**
 * Tâche adestia-niveau-fiche-niveaux, tests écrits depuis le critère de sortie : sur un dépôt
 * temporaire cloné, `scripts/niveaux.mjs` nomme les écrans qu'un commit touche (imports, transitifs),
 * les fichiers d'écran joués et laissés de côté, et sa garde échoue sur une carte fausse.
 * Lancé à la main : node --test bench/tests/niveaux-besoin.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let tmp, repo, base
const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' })
const niveaux = (...a) => spawnSync('node', ['scripts/niveaux.mjs', ...a], { cwd: repo, encoding: 'utf8' })
const commit = (msg) => { git('add', '-A', '--', '.'); git('commit', '-qm', msg) }
const reset = () => git('reset', '-q', '--hard', base)
const lignes = (out, titre) => {
  const l = out.split('\n')
  const i = l.findIndex((x) => x.startsWith(titre))
  const r = []
  for (let k = i + 1; k < l.length && l[k].startsWith('  '); k++) r.push(l[k].trim())
  return r.filter((x) => x !== 'aucun')
}
const touches = (out) => out.split('\n').find((x) => x.startsWith('écrans touchés:')).slice('écrans touchés:'.length).trim()

const TOUJOURS = [
  'packages/server/test/bench-besoin.test.ts', 'packages/server/test/bench-ensemble.test.ts',
  'packages/server/test/bench-launcher.test.ts', 'packages/server/test/bench-sweep.test.ts',
]
const E9_E10 = [
  ...TOUJOURS,
  'packages/server/test/catalogues-ui-ensemble.test.ts',
  'packages/web/test/besoin-chargements-browser.test.ts',
  'packages/web/test/besoin-charte-browser.test.ts',
  'packages/web/test/besoin-charte-comportement.test.ts',
  'packages/web/test/besoin-hors-ligne-browser.test.ts',
  'packages/web/test/besoin-mcp-browser.test.ts',
  'packages/web/test/ensemble-hors-ligne-browser.test.ts',
].sort()

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'niveaux-'))
  repo = join(tmp, 'r')
  execFileSync('git', ['clone', '-q', '--no-hardlinks', source, repo])
  // The clone carries the committed HEAD; the working tree of `source` may hold nothing else (clean).
  symlinkSync(join(source, 'node_modules'), join(repo, 'node_modules'))
  appendFileSync(join(repo, '.git/info/exclude'), 'node_modules\n')
  base = git('rev-parse', 'HEAD').trim()
})
after(() => rmSync(tmp, { recursive: true, force: true }))

test('McpServers.tsx seul : exactement E-9 et E-10, et les fichiers d\'écran de ces écrans', () => {
  // Casserait si le parcours des imports n'était pas transitif (E-9 importe McpServers via Preferences),
  // ou s'il remontait à Settings.tsx (que McpServers importe, pas l'inverse), ou s'il jouait tout.
  reset()
  appendFileSync(join(repo, 'packages/web/src/app/McpServers.tsx'), '\n// touched\n')
  commit('mcp')
  const r = niveaux('--lister', 'ecrans', base)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(touches(r.stdout), 'E-9 E-10')
  assert.deepEqual(lignes(r.stdout, 'fichiers d\'écran joués').sort(), E9_E10)
  const laisses = lignes(r.stdout, 'fichiers d\'écran laissés de côté')
  assert.ok(laisses.includes('packages/web/test/besoin-chat-browser.test.ts'))
  assert.ok(!laisses.includes('packages/web/test/besoin-mcp-browser.test.ts'))
  assert.equal(laisses.length + E9_E10.length, 23)
})

test('Settings.tsx seul ne touche pas E-10 (McpServers importe Settings, pas l\'inverse)', () => {
  // Casserait si le graphe était pris à l'envers ou non orienté.
  reset()
  appendFileSync(join(repo, 'packages/web/src/app/Settings.tsx'), '\n// touched\n')
  commit('settings')
  const t = touches(niveaux('--lister', 'ecrans', base).stdout).split(' ')
  assert.ok(t.includes('E-10'), 'E-10 importe Settings.js: il est touché')
  // Preferences (E-9) importe seulement le type de Settings : touché aussi ; Settings n'importe pas McpServers.
  assert.ok(!/from '\.\/McpServers/.test(readFileSync(join(repo, 'packages/web/src/app/Settings.tsx'), 'utf8')))
})

test('un fichier partagé (useRoute.ts) touche les 33 écrans et joue tous les fichiers d\'écran', () => {
  // Casserait si un fichier que nul écran n'importe directement n'était pas traité « dans le doute ».
  reset()
  appendFileSync(join(repo, 'packages/web/src/app/useRoute.ts'), '\n// touched\n')
  commit('route')
  const r = niveaux('--lister', 'ecrans', base)
  const e = touches(r.stdout).split(' ')
  assert.equal(e.length, 33)
  assert.equal(e[0], 'E-1')
  assert.equal(e[32], 'E-33')
  assert.equal(lignes(r.stdout, 'fichiers d\'écran joués').length, 23)
  assert.deepEqual(lignes(r.stdout, 'fichiers d\'écran laissés de côté'), [])
})

test('packages/server/src seul : aucun écran, aucun fichier d\'écran joué en ecrans', () => {
  // Casserait si le serveur était compté comme touchant les écrans qu'il alimente (exclu par la conception).
  reset()
  appendFileSync(join(repo, 'packages/server/src/index.ts'), '\n// touched\n')
  commit('server')
  const r = niveaux('--lister', 'ecrans', base)
  assert.equal(touches(r.stdout), 'aucun')
  assert.deepEqual(lignes(r.stdout, 'fichiers d\'écran joués'), [])
  assert.equal(lignes(r.stdout, 'fichiers d\'écran laissés de côté').length, 23)
})

test('fiche, serveur seul : laisse de côté les écrans non touchés mais jamais un fichier « toujours »', () => {
  // Casserait si fiche excluait aussi les fichiers qui pilotent tout le shell (« ne saute aucun test »).
  reset()
  appendFileSync(join(repo, 'packages/server/src/index.ts'), '\n// touched\n')
  commit('server')
  const r = niveaux('--lister', 'fiche', base)
  const laisses = lignes(r.stdout, 'fichiers d\'écran laissés de côté')
  const joues = lignes(r.stdout, 'fichiers d\'écran joués')
  assert.deepEqual(joues.sort(), TOUJOURS)
  assert.equal(laisses.length, 19)
  for (const t of TOUJOURS) assert.ok(!laisses.includes(t), t)
})

test('fiche : la suite attestée reçoit exactement les fichiers laissés de côté, ecrans : exactement les joués', () => {
  // Casserait si la liste annoncée par --lister différait de celle passée au script de suite.
  reset()
  for (const s of ['suite-attestee.sh', 'suite-locale.sh']) {
    writeFileSync(join(repo, 'scripts', s), '#!/bin/sh\necho "EXCLURE=[$ADESTIA_EXCLURE_ECRANS] JOUER=[$ADESTIA_JOUER_ECRANS] BUILD=[$ADESTIA_ECRANS_AVEC_BUILD]"\n')
  }
  commit('stubs')
  const base = git('rev-parse', 'HEAD').trim() // the stubs are the start: changing a script would touch every screen
  appendFileSync(join(repo, 'packages/web/src/app/McpServers.tsx'), '\n// touched\n')
  commit('mcp')
  const f = niveaux('fiche', base)
  const lf = lignes(niveaux('--lister', 'fiche', base).stdout, 'fichiers d\'écran laissés de côté')
  const ex = /EXCLURE=\[([^\]]*)\]/.exec(f.stdout)[1].split(' ').filter(Boolean)
  assert.deepEqual(ex.sort(), [...lf].sort())
  assert.equal(ex.length, 12)
  assert.ok(!ex.includes('packages/web/test/besoin-mcp-browser.test.ts'))
  const e = niveaux('ecrans', base)
  const jo = /JOUER=\[([^\]]*)\]/.exec(e.stdout)[1].split(' ').filter(Boolean)
  assert.deepEqual(jo.sort(), E9_E10)
  assert.match(e.stdout, /BUILD=\[1\]/)
})

test('un fichier de test d\'écran modifié touche les écrans qu\'il déclare', () => {
  // Casserait si seul le code des écrans comptait.
  reset()
  appendFileSync(join(repo, 'packages/web/test/besoin-mcp-browser.test.ts'), '\n// touched\n')
  commit('test')
  assert.equal(touches(niveaux('--lister', 'ecrans', base).stdout), 'E-10 E-33')
})

test('un fichier supprimé ou renommé compte sous ses deux noms, sans jamais ne rien toucher', () => {
  // Casserait si un fichier absent de HEAD était ignoré : sa disparition change des écrans.
  reset()
  renameSync(join(repo, 'packages/web/src/app/McpServers.tsx'), join(repo, 'packages/web/src/app/McpServers2.tsx'))
  commit('rename')
  const r = niveaux('--lister', 'ecrans', base)
  assert.notEqual(touches(r.stdout), 'aucun')
})

test('un fichier de plugin touche l\'écran de son dossier', () => {
  reset()
  appendFileSync(join(repo, 'plugins/todo/web/' + readdirSync(join(repo, 'plugins/todo/web')).find((f) => statSync(join(repo, 'plugins/todo/web', f)).isFile())), '\n// touched\n')
  commit('todo')
  assert.equal(touches(niveaux('--lister', 'ecrans', base).stdout), 'E-22')
})

test('un changement de doc seul ne touche aucun écran', () => {
  reset()
  appendFileSync(join(repo, 'README.md'), '\ntouched\n')
  commit('doc')
  assert.equal(touches(niveaux('--lister', 'ecrans', base).stdout), 'aucun')
})

// Independent oracle: a regex over import specifiers, reverse closure from every screen entry.
function oracle(root, map) {
  const isF = (p) => existsSync(join(root, p)) && statSync(join(root, p)).isFile()
  const res = (from, s) => {
    if (s.startsWith('@antorfr/adestia-')) return `packages/${s.slice(17)}/src/index.ts`
    if (!s.startsWith('.')) return null
    const b = posix.normalize(posix.join(posix.dirname(from), s))
    const st = b.replace(/\.(js|mjs)$/, '')
    return [b, `${st}.ts`, `${st}.tsx`, `${b}.ts`, `${b}.tsx`, `${b}/index.ts`, `${b}/index.tsx`].find(isF) ?? null
  }
  const reach = (entries) => {
    const seen = new Set(); const st = [...entries]
    while (st.length) {
      const f = st.pop()
      if (seen.has(f) || !isF(f)) continue
      seen.add(f)
      if (!/\.(ts|tsx)$/.test(f)) continue
      for (const m of readFileSync(join(root, f), 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const r = res(f, m[1]); if (r) st.push(r)
      }
    }
    return seen
  }
  const out = {}
  for (const [id, e] of Object.entries(map.ecrans)) if (e.entrees) out[id] = reach(e.entrees)
  return out
}

test('aucun écran qu\'un grep des imports retrouve n\'est omis, pour chaque fichier de packages/web/src', async () => {
  // Casserait si le résolveur manquait un type d'import (dynamique, CSS, alias de paquet, .js→.tsx).
  const mod = await import(pathToFileURL(join(repo, 'scripts/niveaux.mjs')).href)
  const map = mod.carte()
  const orac = oracle(repo, map)
  const walk = (d, o = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, o) : o.push(p) } return o }
  const files = walk(join(repo, 'packages/web/src')).map((p) => p.slice(repo.length + 1)).filter((f) => /\.(tsx?|css)$/.test(f))
  const manques = []
  for (const f of files) {
    const attendus = Object.keys(orac).filter((id) => orac[id].has(f))
    const { touches: t } = mod.calcul([f], map, mod.fichiersDEcran())
    for (const id of attendus) if (!t.has(id)) manques.push(`${f} omet ${id}`)
  }
  assert.deepEqual(manques, [])
})

test('garde : --verifier est vert sur la carte livrée', () => {
  reset()
  const r = niveaux('--verifier')
  assert.equal(r.status, 0, r.stderr)
})

test('garde : un fichier de test d\'écran absent de la carte la fait échouer en le nommant', () => {
  // Casserait si la garde ne comparait pas la grep de suite-locale.sh à la carte.
  reset()
  writeFileSync(join(repo, 'packages/web/test/zz-nouveau-browser.test.ts'), "import { chromium } from 'playwright'\n")
  commit('new browser test')
  const r = niveaux('--verifier')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /zz-nouveau-browser\.test\.ts/)
  // …et il est joué, pas laissé de côté (dans le doute).
  const l = niveaux('--lister', 'fiche', base)
  assert.ok(lignes(l.stdout, 'fichiers d\'écran joués').includes('packages/web/test/zz-nouveau-browser.test.ts'))
})

test('garde : un chemin de la carte qui n\'existe pas la fait échouer en le nommant', () => {
  reset()
  const p = join(repo, 'scripts/ecrans.json')
  const map = JSON.parse(readFileSync(p, 'utf8'))
  map.tests['packages/web/test/fantome.test.ts'] = ['E-1']
  writeFileSync(p, JSON.stringify(map))
  commit('ghost')
  const r = niveaux('--verifier')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /fantome\.test\.ts/)
})

test('garde : une entrée d\'écran qui n\'existe pas la fait échouer', () => {
  reset()
  const p = join(repo, 'scripts/ecrans.json')
  const map = JSON.parse(readFileSync(p, 'utf8'))
  map.ecrans['E-1'].entrees.push('packages/web/src/app/Fantome.tsx')
  writeFileSync(p, JSON.stringify(map))
  commit('ghost entry')
  const r = niveaux('--verifier')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /Fantome\.tsx/)
})

test('la carte déclare E-1 à E-33 et 23 fichiers d\'écran, chacun connu', () => {
  reset()
  const map = JSON.parse(readFileSync(join(repo, 'scripts/ecrans.json'), 'utf8'))
  assert.deepEqual(Object.keys(map.ecrans), Array.from({ length: 33 }, (_, i) => `E-${i + 1}`))
  assert.equal(Object.keys(map.tests).length, 23)
})

test('suite-attestee.sh sans ADESTIA_EXCLURE_ECRANS garde la commande vitest d\'origine', () => {
  // Casserait si une variable vide ajoutait un --exclude (la suite entière perdrait des tests).
  const s = readFileSync(join(source, 'scripts/suite-attestee.sh'), 'utf8')
  assert.match(s, /for f in \$\{ADESTIA_EXCLURE_ECRANS:-\}; do/)
  assert.match(s, /exclusions="\$exclusions --exclude \$f"/)
})

void mkdirSync
