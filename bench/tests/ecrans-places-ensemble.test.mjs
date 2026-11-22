/**
 * Feature adestia-ecrans-places, tests d'ensemble écrits depuis le « Livre » de la fiche : le choix des
 * écrans touchés (scripts/niveaux.mjs --lister, la porte de `tests.ecrans_liste`) place les chemins qui
 * jouaient tous les écrans faute de place : components.css, plugins/web, plugins/README.md, bench/*.md,
 * scripts/ecrans.json, Dockerfile, package.json, i18n.ts. Chacun : hors écran, ou sur les seuls écrans
 * qu'il touche ; un chemin inconnu joue toujours tous les écrans (dans le doute, on joue).
 * Sur un dépôt temporaire cloné, un commit de base, un commit de changement, la commande `--lister ecrans <base>`.
 * Lancé à la main : node --test bench/tests/ecrans-places-ensemble.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let tmp, repo, racine

const TOUS = 'E-1 E-2 E-3 E-4 E-5 E-6 E-7 E-8 E-9 E-10 E-11 E-12 E-13 E-14 E-15 E-16 E-17 E-18 E-19 E-20 E-21 E-22 E-23 E-24 E-25 E-26 E-27 E-28 E-29 E-30 E-31 E-32 E-33 E-36 E-37'
const AUCUN = 'aucun'

const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' })
const p = (...a) => join(repo, ...a)
const lire = (f) => readFileSync(p(f), 'utf8')
const ecrire = (f, s) => { mkdirSync(dirname(p(f)), { recursive: true }); writeFileSync(p(f), s) }
const remplacer = (f, de, vers) => {
  const s = lire(f)
  assert.ok(s.includes(de), `${f} ne contient pas « ${de} »`)
  ecrire(f, s.replace(de, vers))
}
const json = (f, fn) => { const o = JSON.parse(lire(f)); fn(o); ecrire(f, JSON.stringify(o, null, 2) + '\n') }
const commit = (msg) => { git('add', '-A', '--', '.'); git('commit', '-qm', msg) }

/** Les écrans touchés par `changement`, depuis le commit de base obtenu après `preparation` (les deux sont des commits). */
function touches(changement, preparation) {
  git('reset', '-q', '--hard', racine)
  if (preparation) { preparation(); commit('base') }
  const base = git('rev-parse', 'HEAD').trim()
  changement()
  commit('changement')
  const r = spawnSync('node', ['scripts/niveaux.mjs', '--lister', 'ecrans', base], { cwd: repo, encoding: 'utf8' })
  const l = r.stdout.split('\n').find((x) => x.startsWith('écrans touchés:'))
  assert.ok(l, `pas de ligne « écrans touchés » (sortie ${r.status}) : ${r.stdout}${r.stderr}`)
  return l.slice('écrans touchés:'.length).trim()
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'places-'))
  repo = join(tmp, 'r')
  execFileSync('git', ['clone', '-q', '--no-hardlinks', source, repo])
  if (existsSync(join(source, 'node_modules'))) symlinkSync(join(source, 'node_modules'), join(repo, 'node_modules'))
  appendFileSync(join(repo, '.git/info/exclude'), 'node_modules\n')
  racine = git('rev-parse', 'HEAD').trim()
})
after(() => rmSync(tmp, { recursive: true, force: true }))

// ---------------------------------------------------------------------------------------------
// Chemins hors écran : plugins/web, plugins/README.md, bench/*.md, Dockerfile, scénarios, bench/tests, bench/*.sh
// Casserait si l'un de ces chemins retombait dans « chemin sans place : tous les écrans ».

const horsEcran = [
  ['plugins/web/mcp/relais.mjs', () => appendFileSync(p('plugins/web/mcp/relais.mjs'), '\n// touché\n')],
  ['plugins/web/adestia-plugin.json', () => json('plugins/web/adestia-plugin.json', (o) => { o.zz = 1 })],
  ['plugins/web/package-lock.json', () => json('plugins/web/package-lock.json', (o) => { o.zz = 1 })],
  ['plugins/web/package.json', () => json('plugins/web/package.json', (o) => { o.zz = 1 })],
  ['plugins/README.md', () => appendFileSync(p('plugins/README.md'), '\nUne ligne de plus.\n')],
  ['bench/README.md', () => appendFileSync(p('bench/README.md'), '\nUne ligne de plus.\n')],
  ['bench/shell-proof.md', () => appendFileSync(p('bench/shell-proof.md'), '\nUne ligne de plus.\n')],
  ['bench/scenarios/acces-refuse.mjs', () => appendFileSync(p('bench/scenarios/acces-refuse.mjs'), '\n// touché\n')],
  ['bench/tests/niveaux-ensemble.test.mjs', () => appendFileSync(p('bench/tests/niveaux-ensemble.test.mjs'), '\n// touché\n')],
  ['bench/run.sh', () => appendFileSync(p('bench/run.sh'), '\n# touché\n')],
  ['Dockerfile', () => appendFileSync(p('Dockerfile'), '\n# touché\n')],
]
for (const [chemin, geste] of horsEcran) {
  test(`${chemin} change : aucun écran touché`, () => {
    assert.equal(touches(geste), AUCUN)
  })
}

test('un fichier neuf sous plugins/web/ ou bench/scenarios/ ne touche aucun écran', () => {
  assert.equal(touches(() => ecrire('plugins/web/mcp/nouveau.mjs', 'export const x = 1\n')), AUCUN)
  assert.equal(touches(() => ecrire('bench/scenarios/zz-nouveau.mjs', 'export const x = 1\n')), AUCUN)
})

test('un fichier hors écran qui part avec un fichier d\'écran : seuls les écrans du fichier d\'écran (plugins/todo/web = E-22)', () => {
  // Casserait si la place hors écran masquait le reste du commit, ou si elle le gonflait à tous.
  const r = touches(() => {
    appendFileSync(p('Dockerfile'), '\n# touché\n')
    appendFileSync(p('plugins/README.md'), '\nUne ligne.\n')
    appendFileSync(p('plugins/todo/web/app.js'), '\n// touché\n')
  })
  assert.equal(r, 'E-22')
})

// ---------------------------------------------------------------------------------------------
// Dans le doute, on joue : un chemin inconnu joue tous les écrans.

test('un chemin inconnu (unknown/x.bin, zz-inconnu.cfg à la racine) joue tous les écrans', () => {
  assert.equal(touches(() => ecrire('unknown/x.bin', 'x\n')), TOUS)
  assert.equal(touches(() => ecrire('zz-inconnu.cfg', 'x\n')), TOUS)
})

test('un chemin inconnu avec des chemins hors écran joue tous les écrans', () => {
  const r = touches(() => {
    appendFileSync(p('Dockerfile'), '\n# touché\n')
    ecrire('unknown/x.bin', 'x\n')
  })
  assert.equal(r, TOUS)
})

// ---------------------------------------------------------------------------------------------
// package.json

test('package.json : ajout d\'un champ version : E-15 seul (le menu de réglages affiche la version)', () => {
  assert.equal(touches(() => json('package.json', (o) => { o.version = '9.9.9' })), 'E-15')
})

test('package.json : un champ version qui change : E-15 seul', () => {
  const r = touches(() => json('package.json', (o) => { o.version = '9.9.10' }), () => json('package.json', (o) => { o.version = '9.9.9' }))
  assert.equal(r, 'E-15')
})

test('package.json : une description ajoutée ne touche aucun écran', () => {
  assert.equal(touches(() => json('package.json', (o) => { o.description = 'Adestia' })), AUCUN)
})

test('package.json : une dépendance ajoutée joue tous les écrans', () => {
  assert.equal(touches(() => json('package.json', (o) => { o.devDependencies['zz-paquet'] = '1.0.0' })), TOUS)
})

test('package.json : version et dépendance dans le même commit jouent tous les écrans', () => {
  assert.equal(touches(() => json('package.json', (o) => { o.version = '9.9.9'; o.devDependencies['zz-paquet'] = '1.0.0' })), TOUS)
})

test('package.json : un package.json illisible joue tous les écrans', () => {
  assert.equal(touches(() => ecrire('package.json', '{ pas du json')), TOUS)
})

// ---------------------------------------------------------------------------------------------
// scripts/ecrans.json

test('scripts/ecrans.json : une entrée de E-8 qui change touche E-8 seul', () => {
  const r = touches(() => json('scripts/ecrans.json', (o) => { o.ecrans['E-8'].entrees.push('packages/web/src/app/styles/missing-page.css.zz') }))
  assert.equal(r, 'E-8')
})

test('scripts/ecrans.json : seule la note « _ » change : aucun écran', () => {
  assert.equal(touches(() => json('scripts/ecrans.json', (o) => { o._ += ' (relu)' })), AUCUN)
})

test('scripts/ecrans.json : un écran retiré de la carte touche cet écran, pas les autres', () => {
  assert.equal(touches(() => json('scripts/ecrans.json', (o) => { delete o.ecrans['E-8'] })), 'E-8')
})

test('scripts/ecrans.json : la ligne d\'un test qui gagne E-17 touche E-17', () => {
  // besoin-chat-narrow-browser.test.ts joue E-16 seul ; il joue désormais aussi E-17 : E-17 est touché, pas tous les écrans.
  const r = touches(() => json('scripts/ecrans.json', (o) => { o.tests['packages/web/test/besoin-chat-narrow-browser.test.ts'] = ['E-16', 'E-17'] }))
  assert.ok(r.split(' ').includes('E-17'), r)
  assert.notEqual(r, TOUS)
})

test('scripts/ecrans.json : une carte de base illisible, réparée par le commit, joue tous les écrans (dans le doute, on joue)', () => {
  const bonne = execFileSync('git', ['show', `${racine}:scripts/ecrans.json`], { cwd: repo, encoding: 'utf8' })
  assert.equal(touches(() => ecrire('scripts/ecrans.json', bonne), () => ecrire('scripts/ecrans.json', '{ pas du json')), TOUS)
})

// ---------------------------------------------------------------------------------------------
// components.css : un écran n'est touché que si ses fichiers citent une classe changée.
// Le décor : un fichier du dossier de E-22 (plugins/todo/web) cite « zorg-box » ; aucun autre écran ne le cite.

const CSS = 'packages/web/src/app/styles/components.css'
const CITE = 'plugins/todo/web/zz-places.js'
const decorCss = () => {
  appendFileSync(p(CSS), '\n.zorg-box { color: red; }\n.zorg-box--big { font-size: 20px; }\n:root { --zorg: 1; }\n.zorg-ghost { color: red; }\n@media (max-width: 500px) {\n  .zorg-box { color: blue; }\n}\n@keyframes zorg-spin { to { opacity: 0; } }\n')
  ecrire(CITE, "export const classe = 'zorg-box'\n")
}

test('components.css : une règle d\'une classe citée par le seul E-22 ne touche que E-22', () => {
  assert.equal(touches(() => remplacer(CSS, '.zorg-box--big { font-size: 20px; }', '.zorg-box--big { font-size: 22px; }'), decorCss), 'E-22')
})

test('components.css : une règle ajoutée pour une classe citée par le seul E-22 ne touche que E-22', () => {
  assert.equal(touches(() => appendFileSync(p(CSS), '.zorg-box__icon { width: 4px; }\n'), decorCss), 'E-22')
})

test('components.css : une règle retirée pour une classe citée par le seul E-22 ne touche que E-22', () => {
  assert.equal(touches(() => remplacer(CSS, '.zorg-box--big { font-size: 20px; }\n', ''), decorCss), 'E-22')
})

test('components.css : une règle dans @media pour une classe citée par le seul E-22 ne touche que E-22', () => {
  assert.equal(touches(() => remplacer(CSS, '  .zorg-box { color: blue; }', '  .zorg-box { color: green; }'), decorCss), 'E-22')
})

test('components.css : la classe réelle adestia-meter, citée par le seul E-31 : E-31 seul', () => {
  assert.equal(touches(() => remplacer(CSS, '.adestia-meter__fill { display: block; height: 100%;', '.adestia-meter__fill { display: block; height: 90%;')), 'E-31')
})

test('components.css : seuls des commentaires changent : aucun écran', () => {
  assert.equal(touches(() => appendFileSync(p(CSS), '\n/* un commentaire de plus */\n'), decorCss), AUCUN)
  assert.equal(touches(() => remplacer(CSS, '/* Button ----', '/* Bouton ----')), AUCUN)
})

test('components.css : une règle :root qui change joue tous les écrans', () => {
  assert.equal(touches(() => remplacer(CSS, ':root { --zorg: 1; }', ':root { --zorg: 2; }'), decorCss), TOUS)
})

test('components.css : une classe citée par aucun écran joue tous les écrans', () => {
  assert.equal(touches(() => remplacer(CSS, '.zorg-ghost { color: red; }', '.zorg-ghost { color: blue; }'), decorCss), TOUS)
})

test('components.css : une règle @keyframes qui change joue tous les écrans', () => {
  assert.equal(touches(() => remplacer(CSS, '@keyframes zorg-spin { to { opacity: 0; } }', '@keyframes zorg-spin { to { opacity: 1; } }'), decorCss), TOUS)
})

test('components.css : une classe citée par E-22 et une classe citée par aucun écran dans le même commit : tous', () => {
  const r = touches(() => {
    remplacer(CSS, '.zorg-box--big { font-size: 20px; }', '.zorg-box--big { font-size: 22px; }')
    remplacer(CSS, '.zorg-ghost { color: red; }', '.zorg-ghost { color: blue; }')
  }, decorCss)
  assert.equal(r, TOUS)
})

// ---------------------------------------------------------------------------------------------
// i18n.ts : seuls les écrans dont un texte change. Le décor : « Zorglub phrase unique » est une entrée de la table FR
// et de la table en, citée comme chaîne littérale par un seul fichier, celui du dossier de E-22.

const I18N = 'packages/web/src/app/i18n.ts'
const decorI18n = () => {
  remplacer(I18N, 'const FR: Readonly<Record<string, string>> = {\n', "const FR: Readonly<Record<string, string>> = {\n  'Zorglub phrase unique': 'Zorglub phrase unique FR',\n  'Zorglub phrase orpheline': 'Zorglub orpheline FR',\n")
  remplacer(I18N, '  en: {\n', "  en: {\n    'Zorglub phrase unique': 'Zorglub unique EN',\n")
  ecrire(CITE, "export const phrase = 'Zorglub phrase unique'\n")
}

test('i18n.ts : la traduction française d\'une phrase citée par le seul E-22 change : E-22 seul', () => {
  assert.equal(touches(() => remplacer(I18N, 'Zorglub phrase unique FR', 'Zorglub phrase unique, révisée'), decorI18n), 'E-22')
})

test('i18n.ts : la valeur anglaise d\'une phrase citée par le seul E-22 change : E-22 seul', () => {
  assert.equal(touches(() => remplacer(I18N, 'Zorglub unique EN', 'Zorglub unique, revised'), decorI18n), 'E-22')
})

test('i18n.ts : une phrase citée par le seul E-22 est ajoutée à la table : E-22 seul', () => {
  const r = touches(
    () => remplacer(I18N, "const FR: Readonly<Record<string, string>> = {\n", "const FR: Readonly<Record<string, string>> = {\n  'Zorglub neuve': 'Zorglub neuve FR',\n"),
    () => { decorI18n(); appendFileSync(p(CITE), "export const neuve = 'Zorglub neuve'\n") },
  )
  assert.equal(r, 'E-22')
})

test('i18n.ts : une phrase citée par le seul E-22 est retirée de la table : E-22 seul', () => {
  assert.equal(touches(() => remplacer(I18N, "  'Zorglub phrase unique': 'Zorglub phrase unique FR',\n", ''), decorI18n), 'E-22')
})

test('i18n.ts : seuls des commentaires changent : aucun écran', () => {
  assert.equal(touches(() => remplacer(I18N, 'The shell\'s words, in the reader\'s language.', 'The shell\'s words, in the reader\'s tongue.'), decorI18n), AUCUN)
})

test('i18n.ts : une phrase citée par aucun écran change : tous les écrans', () => {
  assert.equal(touches(() => remplacer(I18N, 'Zorglub orpheline FR', 'Zorglub orpheline, révisée'), decorI18n), TOUS)
})

test('i18n.ts : une phrase citée par E-22 et une phrase citée par aucun écran changent ensemble : tous', () => {
  const r = touches(() => {
    remplacer(I18N, 'Zorglub phrase unique FR', 'Zorglub phrase unique, révisée')
    remplacer(I18N, 'Zorglub orpheline FR', 'Zorglub orpheline, révisée')
  }, decorI18n)
  assert.equal(r, TOUS)
})

test('i18n.ts : une ligne de code hors des tables change : tous les écrans', () => {
  assert.equal(touches(() => appendFileSync(p(I18N), '\nexport const zzCode = 1\n'), decorI18n), TOUS)
})

test('i18n.ts : une phrase réelle du shell change : ses écrans sont choisis, pas aucun écran', () => {
  // Une vraie phrase de la table (« found in the plugins folder », écran des plugins) : la sélection joue au moins un écran.
  const r = touches(() => remplacer(I18N, "'found in the plugins folder': 'trouvé dans le dossier des plugins'", "'found in the plugins folder': 'trouvé dans le dossier plugins'"))
  assert.notEqual(r, AUCUN)
  assert.ok(r.split(' ').includes('E-37'), `E-37 (liste des plugins) devrait être touché : ${r}`)
})
