// Besoin adestia-ecrans-liste (fiche, message "Livre" de Monsieur du 17/11) : `tests.ecrans_liste` de .sdlc.yaml
// imprime, un fichier par ligne et rien d'autre, les fichiers de test d'ecran que `ecrans` jouerait, sans installer
// les dependances ; vide pour un changement de doc seul ; duree dite dans le README.
//
// Chaque cas vit dans un clone jetable du depot (aucun node_modules : c'est l'extraction sans installation) sur lequel
// on pose UN commit au-dessus de {base}, puis on lance la commande de .sdlc.yaml. Les attendus sont ecrits en dur
// depuis les regles de docs (ARCHITECTURE AD-niveaux-2) : un fichier d'une page touche les ecrans de cette page, un
// fichier partage de App.tsx touche tous les ecrans, un changement serveur ou de doc n'en touche aucun.
// Ecran E-n : voir docs/ecrans.md.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const depot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ref = process.env.ECRANS_LISTE_REF || 'HEAD'
let tmp
let clone
let sha

const git = (...a) => execFileSync('git', ['-C', clone, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim()

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ecrans-liste-'))
  clone = join(tmp, 'extraction')
  sha = execFileSync('git', ['-C', depot, 'rev-parse', ref], { encoding: 'utf8' }).trim()
  execFileSync('git', ['clone', '-q', '--no-checkout', depot, clone])
  git('checkout', '-q', '--detach', sha)
  assert.equal(existsSync(join(clone, 'node_modules')), false, "l'extraction ne doit pas avoir de node_modules")
})
after(() => rmSync(tmp, { recursive: true, force: true }))

function reset() { git('reset', '-q', '--hard', sha); git('clean', '-qfd') }

// Pose un commit qui ajoute une ligne a `fichier` (le cree au besoin) et rend la base.
function changer(fichiers) {
  reset()
  for (const [f, texte] of Object.entries(fichiers)) {
    const p = join(clone, f)
    if (existsSync(p)) appendFileSync(p, texte)
    else writeFileSync(p, texte)
    git('add', '--', f)
  }
  git('commit', '-q', '-m', 'changement de test', '--', ...Object.keys(fichiers))
  return sha
}

function commandeDuYaml() {
  const yaml = readFileSync(join(clone, '.sdlc.yaml'), 'utf8')
  const m = yaml.match(/^\s*ecrans_liste:\s*(.+?)\s*(#.*)?$/m)
  assert.ok(m, 'tests.ecrans_liste est declare dans .sdlc.yaml')
  return m[1]
}

function lancer(base) {
  const r = spawnSync('sh', ['-c', commandeDuYaml().replaceAll('{base}', base)], { cwd: clone, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } })
  return { code: r.status, out: r.stdout, err: r.stderr, lignes: r.stdout === '' ? [] : r.stdout.replace(/\n$/, '').split('\n') }
}

// Tous les fichiers de test d'ecran du depot (la regle du canon : grep playwright|chromium|launch.mjs dans packages/*/test).
function tousLesTestsDEcran() {
  const r = spawnSync('sh', ['-c', "grep -rlE 'playwright|chromium|launch\\.mjs' packages/*/test | grep -E '\\.test\\.tsx?$' | sort"], { cwd: clone, encoding: 'utf8' })
  return r.stdout.trim().split('\n')
}
// Les fichiers de test d'ecran que la carte ne declare pas : joues a tout niveau (« dans le doute, on joue »).
function sansCarte() {
  const carte = JSON.parse(readFileSync(join(clone, 'scripts', 'ecrans.json'), 'utf8'))
  return tousLesTestsDEcran().filter((f) => !(f in carte.tests))
}
const trie = (l) => [...l].sort()

test('E-8 : un fichier de la page touche ses tests, pas ceux du chat ni des reglages (nominal ; stdout propre)', () => {
  const base = changer({ 'packages/web/src/app/styles/missing-page.css': '\n/* touche */\n' })
  const { code, lignes, out, err } = lancer(base)
  assert.equal(code, 0, err)
  assert.deepEqual(lignes, trie(lignes), 'triees')
  assert.ok(!out.includes('\n\n') && !out.startsWith('\n'), 'aucune ligne vide')
  for (const l of lignes) assert.match(l, /^packages\/[a-z]+\/test\/.+\.test\.tsx?$/, `une ligne n'est pas un chemin de test : ${l}`)
  for (const attendu of ['packages/web/test/besoin-pages-browser.test.ts', 'packages/web/test/besoin-chargements-browser.test.ts']) {
    assert.ok(lignes.includes(attendu), `${attendu} manque`)
  }
  for (const exclu of ['packages/web/test/besoin-chat-narrow-browser.test.ts', 'packages/web/test/besoin-tours.test.ts', 'packages/web/test/besoin-rouge-25-menu-rouage-browser.test.ts', 'packages/web/test/besoin-mcp-browser.test.ts']) {
    assert.ok(!lignes.includes(exclu), `${exclu} ne devrait pas etre joue`)
  }
  assert.ok(lignes.length < tousLesTestsDEcran().length, 'pas tous les ecrans')
})

test('un fichier partage (useRoute.ts) touche tous les ecrans : tous les fichiers de test d\'ecran', () => {
  const base = changer({ 'packages/web/src/app/useRoute.ts': '\n// touche\n' })
  const { code, lignes } = lancer(base)
  assert.equal(code, 0)
  assert.deepEqual(lignes, tousLesTestsDEcran())
})

test('un changement serveur seul ne touche aucun ecran : seuls les tests hors carte sont joues', () => {
  const base = changer({ 'packages/server/src/app.ts': '\n// touche\n' })
  const { code, lignes } = lancer(base)
  assert.equal(code, 0)
  assert.deepEqual(lignes, sansCarte())
})

test('un changement de doc seul rend une sortie vide, code 0', () => {
  const base = changer({ 'docs/ecrans.md': '\n<!-- touche -->\n', 'CHANGELOG.md': '\n<!-- touche -->\n' })
  const { code, out, lignes } = lancer(base)
  assert.equal(code, 0)
  assert.deepEqual(lignes, [], `sortie non vide : ${JSON.stringify(out)}`)
  assert.equal(out, '')
})

test('aucun changement (base = HEAD) : aucun ecran touche, aucun test d\'ecran du tout hors carte', () => {
  reset()
  const { code, lignes } = lancer('HEAD')
  assert.equal(code, 0)
  assert.deepEqual(lignes, sansCarte())
})

test('meme liste que le rapport --lister ecrans (la selection de ecrans), et --lister garde son rapport', () => {
  const base = changer({ 'packages/web/src/app/styles/missing-page.css': '\n/* touche */\n' })
  const liste = lancer(base).lignes
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--lister', 'ecrans', base], { cwd: clone, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^niveau: ecrans$/m)
  assert.match(r.stdout, /fichiers d'écran joués:/)
  const joues = r.stdout.split("fichiers d'écran joués:\n")[1].split("fichiers d'écran laissés de côté:")[0].split('\n').map((l) => l.trim()).filter(Boolean)
  assert.deepEqual(liste, trie(joues))
})

test('sans node_modules : la commande sort 0, sur les memes lignes qu\'avec l\'arbre complet', () => {
  assert.equal(existsSync(join(clone, 'node_modules')), false)
  const base = changer({ 'packages/web/src/app/useRoute.ts': '\n// touche\n' })
  const { code, lignes, err } = lancer(base)
  assert.equal(code, 0, err)
  assert.ok(lignes.length > 10)
  assert.ok(!/Cannot find (module|package)|ERR_MODULE_NOT_FOUND/.test(err), err)
})

test('les avertissements vont sur stderr, jamais sur stdout', () => {
  const base = changer({ 'docs/ecrans.md': '\n<!-- touche -->\n' })
  const { out } = lancer(base)
  assert.ok(!/warning|avertissement/i.test(out), out)
})

test('l\'import par `export … from` et par import() litteral relie un fichier a l\'ecran (E-8), pas a tous', () => {
  const entree = 'packages/web/src/app/MissingPage.tsx'
  reset()
  writeFileSync(join(clone, 'packages/web/src/app/zzReexport.ts'), 'export const a = 1\n')
  writeFileSync(join(clone, 'packages/web/src/app/zzDynamique.ts'), 'export const b = 2\n')
  appendFileSync(join(clone, entree), "\nexport * from './zzReexport.js'\nexport const zzLazy = () => import('./zzDynamique.js')\n")
  git('add', '--', 'packages/web/src/app/zzReexport.ts', 'packages/web/src/app/zzDynamique.ts')
  git('commit', '-q', '-m', 'liens', '--', entree, 'packages/web/src/app/zzReexport.ts', 'packages/web/src/app/zzDynamique.ts')
  const base2 = git('rev-parse', 'HEAD')
  for (const f of ['zzReexport', 'zzDynamique']) {
    appendFileSync(join(clone, `packages/web/src/app/${f}.ts`), '\n// change\n')
    git('commit', '-q', '-am', f)
    const { lignes } = lancer(base2)
    assert.ok(lignes.includes('packages/web/test/besoin-pages-browser.test.ts'), `${f} doit toucher E-8`)
    assert.ok(!lignes.includes('packages/web/test/besoin-chat-narrow-browser.test.ts'), `${f} ne touche pas le chat (E-16)`)
    git('reset', '-q', '--hard', base2)
  }
})

test('arguments invalides : code non nul, rien sur stdout', () => {
  for (const args of [['--liste', 'ecrans'], ['--liste', 'fiche', 'HEAD'], ['--liste']]) {
    const r = spawnSync('node', ['scripts/niveaux.mjs', ...args], { cwd: clone, encoding: 'utf8' })
    assert.notEqual(r.status, 0, args.join(' '))
    assert.equal(r.stdout, '', args.join(' '))
  }
})

test('.sdlc.yaml : ecrans_liste est declare, sans npm ci devant, sur {base}', () => {
  const c = commandeDuYaml()
  assert.ok(c.includes('{base}'))
  assert.ok(!/npm (ci|install)/.test(c), c)
  assert.match(c, /--liste/)
})

test('README : la duree de ecrans_liste est dite, en secondes', () => {
  const readme = readFileSync(join(clone, 'README.md'), 'utf8')
  const m = readme.match(/`ecrans_liste`[^\n]*?(\d+(?:[.,]\d+)?\s*(?:s|ms|seconds?|secondes?|min)\b)/)
  assert.ok(m, 'une duree chiffree accompagne ecrans_liste dans le README')
})
