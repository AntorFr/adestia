/**
 * Feature adestia-niveau-fiche, tests d'ensemble écrits depuis le besoin (fiche : « Livre » de Monsieur,
 * docs/ecrans.md pour les écrans E-n et leurs fichiers), sans lire le code de scripts/niveaux.mjs.
 * Le système : `node scripts/niveaux.mjs --lister ecrans|fiche <base>` sur un clone jetable de HEAD, un commit
 * posé dessus, `<base>` = HEAD d'avant ce commit. Rien ne tourne que la liste : les durées se lisent au README.
 * Lancé à la main : node --test bench/tests/niveaux-ensemble.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
let tmp
let n = 0

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'niveaux-ensemble-'))
})
after(() => rmSync(tmp, { recursive: true, force: true }))

/** Clone jetable de HEAD ; `commits` = suite de listes de fichiers à toucher, un commit chacune ; rend { dir, base }. */
function clone(...commits) {
  const dir = join(tmp, `c${n++}`)
  sh(tmp, 'clone', '-q', '--no-hardlinks', root, dir)
  sh(dir, 'config', 'user.email', 't@example.org')
  sh(dir, 'config', 'user.name', 'test')
  sh(dir, 'checkout', '-q', '-b', 'travail')
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'))
  const base = sh(dir, 'rev-parse', 'HEAD')
  for (const files of commits) {
    for (const f of files) {
      if (existsSync(join(dir, f))) appendFileSync(join(dir, f), '\n// touché par le test\n')
      else writeFileSync(join(dir, f), 'nouveau\n')
      sh(dir, 'add', f)
    }
    sh(dir, 'commit', '-q', '-m', 'travail')
  }
  return { dir, base }
}

/** Sortie de `--lister <niveau> <base>` : écrans touchés, fichiers d'écran joués, laissés de côté. */
function lister(dir, niveau, base) {
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--lister', niveau, base], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const lignes = r.stdout.split('\n')
  const ecrans = (lignes.find((l) => l.startsWith('écrans touchés:')) ?? '').replace('écrans touchés:', '').trim()
  const section = (titre) => {
    const i = lignes.findIndex((l) => l.startsWith(titre))
    const out = []
    for (let j = i + 1; i >= 0 && j < lignes.length && /^\s+\S/.test(lignes[j]); j++) out.push(lignes[j].trim())
    return out.filter((l) => l !== 'aucun') // « aucun » dit une liste vide
  }
  return {
    touches: ecrans.split(/\s+/).filter((e) => /^E-\d+$/.test(e)),
    joues: section("fichiers d'écran joués"),
    laisses: section("fichiers d'écran laissés de côté"),
  }
}

const TOUS = Array.from({ length: 33 }, (_, i) => `E-${i + 1}`)
const MCP = 'packages/web/test/besoin-mcp-browser.test.ts'
const CHAT = 'packages/web/test/besoin-chat-browser.test.ts'
const TOURS = 'packages/web/test/besoin-tours.test.ts'

// Panne visée : le niveau ecrans choisit mal les écrans d'un fichier d'écran (carte fausse, graphe d'imports ignoré).
test('ecrans : McpServers.tsx touche E-9 et E-10 (Preferences l\'importe), joue le test MCP et laisse le chat de côté', () => {
  const { dir, base } = clone(['packages/web/src/app/McpServers.tsx'])
  const r = lister(dir, 'ecrans', base)
  for (const e of ['E-9', 'E-10']) assert.ok(r.touches.includes(e), `${e} manque : ${r.touches}`)
  for (const e of ['E-1', 'E-2', 'E-3', 'E-15', 'E-16', 'E-22']) assert.ok(!r.touches.includes(e), `${e} touché à tort`)
  assert.ok(r.joues.includes(MCP))
  assert.ok(r.laisses.includes(CHAT))
  assert.ok(!r.joues.includes(CHAT))
})

// Panne visée : un écran dont la page (docs/ecrans.md « Component file(s) ») importe le fichier, même transitivement, est omis.
// E-20 liste app/Canvas.tsx et E-32 app/App.tsx ; Canvas.tsx importe Preferences.tsx, qui importe McpServers.tsx.
test('ecrans : McpServers.tsx touche aussi E-20 (Canvas.tsx) et E-32 (App.tsx), pages qui l\'importent transitivement', () => {
  const { dir, base } = clone(['packages/web/src/app/McpServers.tsx'])
  const r = lister(dir, 'ecrans', base)
  assert.deepEqual(r.touches.filter((e) => ['E-20', 'E-32'].includes(e)), ['E-20', 'E-32'])
})

// Panne visée : le sens de l'import inversé (Settings.tsx, importé par McpServers.tsx, touche E-10 ; l'inverse n'est pas vrai).
test('ecrans : Settings.tsx touche E-10 (McpServers l\'importe) et E-15 (SettingsMenu), pas E-11', () => {
  const { dir, base } = clone(['packages/web/src/app/Settings.tsx'])
  const r = lister(dir, 'ecrans', base)
  for (const e of ['E-10', 'E-15']) assert.ok(r.touches.includes(e), `${e} manque : ${r.touches}`)
  assert.ok(!r.touches.includes('E-11'))
  assert.ok(!r.touches.includes('E-16'))
})

// Panne visée : un fichier partagé ne touche pas tous les écrans.
test('ecrans : useRoute.ts, fichier partagé, touche les 33 écrans et ne laisse aucun test d\'écran de côté', () => {
  const { dir, base } = clone(['packages/web/src/app/useRoute.ts'])
  const r = lister(dir, 'ecrans', base)
  assert.deepEqual(r.touches, TOUS)
  assert.deepEqual(r.laisses, [])
  for (const f of [MCP, CHAT, TOURS]) assert.ok(r.joues.includes(f), f)
})

// Panne visée : un changement serveur seul fait jouer des écrans.
test('ecrans : un changement de packages/server/src seul ne touche aucun écran et ne joue aucun test d\'un écran nommé', () => {
  const { dir, base } = clone(['packages/server/src/app.ts'])
  const r = lister(dir, 'ecrans', base)
  assert.deepEqual(r.touches, [])
  for (const f of [MCP, CHAT, TOURS]) assert.ok(!r.joues.includes(f), `${f} joué`)
  assert.ok(r.laisses.includes(MCP))
})

// Bords : tout ce que le produit déclare hors écran ne touche aucun écran.
for (const f of ['docs/parcours.md', 'README.md', 'packages/server/test/app.test.ts']) {
  test(`ecrans : ${f}, hors écran, ne touche aucun écran`, () => {
    if (!existsSync(join(root, f))) return assert.fail(`${f} absent du dépôt : le test doit changer de fichier`)
    const { dir, base } = clone([f])
    assert.deepEqual(lister(dir, 'ecrans', base).touches, [])
  })
}

// Panne visée : un fichier qu'aucune page n'importe et qu'aucune règle ne déclare hors écran ne touche que certains écrans.
test('ecrans : un fichier neuf à la racine, importé par rien et déclaré hors écran nulle part, touche tous les écrans', () => {
  const { dir, base } = clone(['zz-orphelin.txt'])
  assert.deepEqual(lister(dir, 'ecrans', base).touches, TOUS)
})

// Bord : un écran de plugin chargé à l'exécution n'est importé par personne ; son dossier le touche, lui seul.
test('ecrans : plugins/journal/web/app.js touche E-24 seul', () => {
  const { dir, base } = clone(['plugins/journal/web/app.js'])
  assert.deepEqual(lister(dir, 'ecrans', base).touches, ['E-24'])
})

// Bord : le fichier de test d'un écran touche cet écran et le fichier est joué.
test('ecrans : modifier le test du chat touche E-16 à E-18 et le joue, sans jouer le test MCP', () => {
  const { dir, base } = clone([CHAT])
  const r = lister(dir, 'ecrans', base)
  for (const e of ['E-16', 'E-17', 'E-18']) assert.ok(r.touches.includes(e), e)
  assert.ok(r.joues.includes(CHAT))
  assert.ok(r.laisses.includes(MCP))
})

// Bord : {base}..HEAD s'étend à plusieurs commits ; les écrans s'additionnent.
test('ecrans : deux commits, l\'un sur McpServers.tsx, l\'autre sur Home.tsx, touchent E-10 et E-2', () => {
  const { dir, base } = clone(['packages/web/src/app/McpServers.tsx'], ['packages/web/src/app/Home.tsx'])
  const r = lister(dir, 'ecrans', base)
  for (const e of ['E-2', 'E-10']) assert.ok(r.touches.includes(e), e)
})

// Échec : une base qui n'existe pas ne se lit pas comme « rien n'a changé ».
test('ecrans : une base inconnue échoue (sortie non nulle) au lieu de ne rien jouer', () => {
  const { dir, base } = clone()
  const ok = spawnSync('node', ['scripts/niveaux.mjs', '--lister', 'ecrans', base], { cwd: dir, encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr) // témoin : une base réelle se lit
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--lister', 'ecrans', '0000000000000000000000000000000000000000'], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
})

// Panne visée : fiche laisse de côté autre chose que les tests d'écran des écrans non touchés, ou n'en laisse pas.
test('fiche : fichier d\'écran, laisse de côté exactement les tests des écrans non touchés, joue ceux des touchés', () => {
  const { dir, base } = clone(['packages/web/src/app/McpServers.tsx'])
  const f = lister(dir, 'fiche', base)
  assert.deepEqual(f.touches, lister(dir, 'ecrans', base).touches)
  assert.ok(f.joues.includes(MCP))
  for (const x of [CHAT, TOURS, 'packages/web/test/besoin-pages-browser.test.ts']) assert.ok(f.laisses.includes(x), x)
  // Rien n'est laissé de côté qu'un écran touché pilote.
  assert.ok(!f.laisses.includes('packages/web/test/besoin-charte-browser.test.ts'))
  assert.ok(!f.laisses.includes('packages/web/test/ensemble-hors-ligne-browser.test.ts'))
})

test('fiche : serveur seul, laisse de côté tous les tests d\'écrans nommés mais pas la suite hors écran', () => {
  const { dir, base } = clone(['packages/server/src/app.ts'])
  const f = lister(dir, 'fiche', base)
  assert.deepEqual(f.touches, [])
  for (const x of [MCP, CHAT, TOURS]) assert.ok(f.laisses.includes(x), x)
  assert.ok(f.laisses.length >= 10)
})

test('fiche : fichier partagé, ne laisse rien de côté (la suite entière)', () => {
  const { dir, base } = clone(['packages/web/src/app/useRoute.ts'])
  const f = lister(dir, 'fiche', base)
  assert.deepEqual(f.touches, TOUS)
  assert.deepEqual(f.laisses, [])
})

// Déclaration : .sdlc.yaml.
test('.sdlc.yaml déclare tests.ecrans et tests.fiche avec {base}, et rejouer autonome avec {tests}', () => {
  const t = parse(readFileSync(join(root, '.sdlc.yaml'), 'utf8')).tests
  assert.match(t.ecrans, /\{base\}/)
  assert.match(t.fiche, /\{base\}/)
  assert.match(t.rejouer, /npm ci/)
  assert.match(t.rejouer, /\{tests\}/)
  assert.equal(t.commande, 'scripts/suite-attestee.sh')
  assert.equal(t.local, 'scripts/suite-locale.sh')
})

// Critère : durée mesurée dite dans le README, à côté de celle de la suite (trois cas).
test('README dit la durée mesurée de ecrans et fiche pour un fichier d\'écran, un fichier partagé, un changement serveur', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  for (const f of ['McpServers.tsx', 'useRoute.ts', 'packages/server/src']) assert.ok(readme.includes(f), f)
  const lignes = readme.split('\n').filter((l) => /^\|.*(McpServers\.tsx|useRoute\.ts|packages\/server\/src)/.test(l))
  assert.equal(lignes.length, 3)
  for (const l of lignes) assert.ok((l.match(/\d+m\d+s/g) ?? []).length >= 2, `deux durées attendues : ${l}`)
  assert.match(readme, /35 min/)
})

// Garde : la carte reste honnête (un test d'écran absent de la carte, un chemin inexistant rougissent).
test('--verifier passe sur la carte livrée', () => {
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--verifier'], { cwd: root, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('--verifier échoue en nommant un fichier de test d\'écran absent de la carte', () => {
  const { dir } = clone()
  writeFileSync(join(dir, 'packages/web/test/zz-orphelin-browser.test.ts'), "import { chromium } from 'playwright'\n")
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--verifier'], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  assert.match(r.stdout + r.stderr, /zz-orphelin-browser/)
})

test('--verifier échoue quand un fichier de test d\'écran de la carte n\'existe plus', () => {
  const { dir } = clone()
  sh(dir, 'rm', '-q', MCP)
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--verifier'], { cwd: dir, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  assert.match(r.stdout + r.stderr, /besoin-mcp-browser/)
})

// ---- rejouer : un test nommé rejoué avec son fichier, depuis une extraction neuve, sans état gardé ----
// (l'installation se remplace par le lien vers node_modules du dépôt : pas de réseau dans la suite)
// NODE_TEST_CONTEXT hérité ferait taire le `node --test` interne des tests de plugin : on le retire.
const { NODE_TEST_CONTEXT: _ctx, ...envNeuf } = process.env
const rejouer = (dir, ...noms) => spawnSync('sh', ['scripts/rejouer.sh', ...noms], { cwd: dir, encoding: 'utf8', timeout: 240000, env: envNeuf })
const COLL = 'packages/web/test/collections.test.ts'
const NOM_SAIN = `${COLL} > a collection > cas sain seul`
const cas = (dir) => [...readFileSync(join(dir, 'resultats.xml'), 'utf8').matchAll(/<testcase[^>]*?\sname="([^"]*)"/g)].map((m) => m[1].replaceAll('&gt;', '>'))
const AJOUT_VOISIN = `
  it('voisin qui laisse un état', () => { (globalThis as any).__poison = 1 })
  it('cas sain seul', () => { if ((globalThis as any).__poison) throw new Error('poison') })
`
const avecVoisin = (dir) => {
  const f = join(dir, COLL)
  writeFileSync(f, readFileSync(f, 'utf8').replace("describe('a collection', () => {", `describe('a collection', () => {${AJOUT_VOISIN}`))
}

// Panne visée : le test nommé rejoué seul (-t) au lieu de tout son fichier : le voisin qui le fait échouer n'est pas joué.
test('rejouer : un test que son voisin du même fichier fait échouer est rouge, et le rapport ne garde que le nom demandé', () => {
  const { dir } = clone()
  avecVoisin(dir)
  const r = rejouer(dir, NOM_SAIN)
  assert.notEqual(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(cas(dir), ['a collection > cas sain seul'])
  assert.match(readFileSync(join(dir, 'resultats.xml'), 'utf8'), /<failure/)
})

// Panne visée : un nom qui ne correspond à aucun test sort vert (« jamais un vert à zéro test »).
test('rejouer : un nom de fichier connu mais un test inexistant échoue', () => {
  const { dir } = clone()
  const r = rejouer(dir, `${COLL} > a collection > ce test n'existe pas`)
  assert.notEqual(r.status, 0)
})

// Panne visée : un vert rejoué trois fois, sous le nom de la suite, rapport limité au nom demandé.
test('rejouer : un test hors écran et un test de plugin nommés se rejouent verts trois fois de suite, sous leurs noms', () => {
  const { dir } = clone()
  for (let i = 0; i < 3; i++) {
    const r = rejouer(dir, `${COLL} > a collection > collects by type, and nothing else`, 'a task is a page carrying type: tache')
    assert.equal(r.status, 0, `passage ${i + 1} : ${r.stdout}${r.stderr}`)
    assert.deepEqual(cas(dir).sort(), ['a collection > collects by type, and nothing else', 'a task is a page carrying type: tache'])
  }
})

// Panne visée : une passe lit ce que la précédente a laissé (rapport, cache) ; le rouge de la première contamine la seconde.
test('rejouer : après une passe rouge, la passe suivante sur un autre nom est verte et ne reprend rien de la première', () => {
  const { dir } = clone()
  avecVoisin(dir)
  assert.notEqual(rejouer(dir, NOM_SAIN).status, 0)
  const r = rejouer(dir, `${COLL} > a collection > collects by type, and nothing else`)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(cas(dir), ['a collection > collects by type, and nothing else'])
  assert.doesNotMatch(readFileSync(join(dir, 'resultats.xml'), 'utf8'), /<failure|poison/)
  // Seuls des fichiers de sortie attendus restent ignorés par git.
  const ignores = sh(dir, 'status', '--ignored', '--porcelain').split('\n').filter((l) => l.startsWith('!!')).map((l) => l.slice(3))
  for (const i of ignores) assert.match(i, /^(node_modules\/?|\.suite-attestee\/|resultats\.xml|packages\/[^/]+\/dist\/|packages\/web\/dist-web\/)$/, i)
})
