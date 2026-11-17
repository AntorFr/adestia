// Besoin adestia-ecrans-liste (fiche, message "Livre" de Monsieur du 17/11) : un commit de doc, de status.md ou de charte
// ne rend aucun fichier de test d'ecran ; la commande de .sdlc.yaml `tests.ecrans_liste` tourne dans une extraction sans
// node_modules. Complete ecrans-liste-besoin.test.mjs : chaque sorte de doc nommee par le besoin, le doc melange a un
// fichier d'ecran, et le cas de jouer-ecrans (la base est la tete du dernier jeu, un commit de doc la suit).
// Attendus en dur depuis le besoin ; chaque cas vit dans un clone jetable.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const depot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ref = process.env.ECRANS_LISTE_REF || 'HEAD'
let tmp, clone, sha

const git = (...a) => execFileSync('git', ['-C', clone, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim()

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ecrans-liste-docs-'))
  clone = join(tmp, 'extraction')
  sha = execFileSync('git', ['-C', depot, 'rev-parse', ref], { encoding: 'utf8' }).trim()
  execFileSync('git', ['clone', '-q', '--no-checkout', depot, clone])
  git('checkout', '-q', '--detach', sha)
  assert.equal(existsSync(join(clone, 'node_modules')), false, 'extraction sans node_modules')
})
after(() => rmSync(tmp, { recursive: true, force: true }))

function reset() { git('reset', '-q', '--hard', sha); git('clean', '-qfd') }
function commit(fichiers, msg = 'changement de test') {
  for (const [f, texte] of Object.entries(fichiers)) {
    const p = join(clone, f)
    if (existsSync(p)) appendFileSync(p, texte); else writeFileSync(p, texte)
    git('add', '--', f)
  }
  git('commit', '-q', '-m', msg, '--', ...Object.keys(fichiers))
  return git('rev-parse', 'HEAD')
}
function lancer(base) {
  const yaml = readFileSync(join(clone, '.sdlc.yaml'), 'utf8')
  const cmd = yaml.match(/^\s*ecrans_liste:\s*(.+?)\s*(#.*)?$/m)[1]
  const r = spawnSync('sh', ['-c', cmd.replaceAll('{base}', base)], { cwd: clone, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } })
  return { code: r.status, out: r.stdout, err: r.stderr, lignes: r.stdout === '' ? [] : r.stdout.replace(/\n$/, '').split('\n') }
}

// Panne visee : une regle de selection qui compterait un fichier de doc (status.md, charte, README, DESIGN, notes d'ecran) comme code.
for (const doc of ['.agent/status.md', 'docs/charte.md', 'docs/parcours.md', 'docs/tests-ecran/web-chat-charte.md', 'README.md', 'DESIGN.md', 'CLAUDE.md', 'ARCHITECTURE.md']) {
  test(`un commit sur ${doc} seul : sortie vide, code 0`, () => {
    reset()
    const base = sha
    commit({ [doc]: '\n<!-- touche -->\n' })
    const { code, out, err } = lancer(base)
    assert.equal(code, 0, err)
    assert.equal(out, '', `sortie non vide : ${JSON.stringify(out)}`)
  })
}

// Panne visee : le doc melange a un fichier d'ecran qui annule la selection, ou s'y ajoute des fichiers.
test('doc et fichier de la page E-8 dans le meme commit : la liste de E-8 seul', () => {
  reset()
  const base = sha
  commit({ 'packages/web/src/app/styles/missing-page.css': '\n/* touche */\n', 'docs/charte.md': '\n<!-- touche -->\n', '.agent/status.md': '\n<!-- t -->\n' })
  const { code, lignes } = lancer(base)
  assert.equal(code, 0)
  assert.ok(lignes.includes('packages/web/test/besoin-pages-browser.test.ts'))
  assert.ok(!lignes.includes('packages/web/test/besoin-chat-narrow-browser.test.ts'))
  const seul = (reset(), commit({ 'packages/web/src/app/styles/missing-page.css': '\n/* touche */\n' }), lancer(sha).lignes)
  assert.deepEqual(lignes, seul)
})

// Le cas de jouer-ecrans : la base est la tete du dernier jeu ; un commit de doc apres ce jeu ne doit rien rendre.
test('apres un jeu sur un fichier d\'ecran, un commit de doc au-dessus de cette tete ne rend rien', () => {
  reset()
  const jeu = commit({ 'packages/web/src/app/useRoute.ts': '\n// touche\n' })
  assert.ok(lancer(sha).lignes.length > 10, 'le fichier partage rend une longue liste')
  commit({ 'docs/charte.md': '\n<!-- touche -->\n', '.agent/status.md': '\n<!-- t -->\n' }, 'doc')
  const { code, out } = lancer(jeu)
  assert.equal(code, 0)
  assert.equal(out, '')
})

// Le critere : la liste est vide pour un changement de doc seul PARCE QUE le fichier d'ecran verify-etat-projet-browser est declare ;
// modifier ce test, lui, le rend.
test('modifier le test verify-etat-projet-browser le rend dans la liste (et un diff de doc ne le rend pas)', () => {
  reset()
  const base = sha
  commit({ 'packages/web/test/verify-etat-projet-browser.test.ts': '\n// touche\n' })
  const { code, lignes } = lancer(base)
  assert.equal(code, 0)
  assert.ok(lignes.includes('packages/web/test/verify-etat-projet-browser.test.ts'), lignes.join('\n'))
})

test('la sortie ne contient que des chemins : pas d\'en-tete, pas de ligne vide, un saut de ligne final', () => {
  reset()
  const base = sha
  commit({ 'packages/web/src/app/useRoute.ts': '\n// touche\n' })
  const { out, lignes } = lancer(base)
  assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'))
  for (const l of lignes) assert.match(l, /^packages\/[a-z]+\/test\/[^\s]+\.test\.tsx?$/, l)
  assert.equal(new Set(lignes).size, lignes.length, 'aucun doublon')
})

test('--verifier sort 0 sur la carte livree, sans node_modules', () => {
  reset()
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--verifier'], { cwd: clone, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})
