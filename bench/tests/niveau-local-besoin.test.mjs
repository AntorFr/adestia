/**
 * Feature adestia-niveau-local, tests d'ensemble écrits depuis le besoin (fiche : « Livre » de Monsieur) :
 * `.sdlc.yaml` déclare `tests.local` et `tests.rejouer` (gabarit `{tests}`), la suite attestée
 * (`commande:`) reste inchangée, et `rejouer:` rejoue un test nommé seul.
 * Lancé à la main : node --test bench/tests/niveau-local-besoin.test.mjs
 * (le niveau local lui-même, ~10 min, se joue en entier à part : `scripts/suite-locale.sh`).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const declared = () => parse(readFileSync(resolve(root, '.sdlc.yaml'), 'utf8')).tests

test('la suite attestée reste déclarée telle quelle : commande, rapport, format, délai', () => {
  // Casserait si on retouchait la commande de la suite entière en déclarant le niveau local.
  const { commande, rapport, format, delai } = declared()
  assert.equal(commande, 'scripts/suite-attestee.sh')
  assert.equal(rapport, 'resultats.xml')
  assert.equal(format, 'junit')
  assert.equal(delai, '100m')
})

test('.sdlc.yaml déclare tests.local, une commande autre que la suite entière', () => {
  // Casserait si `local:` était absent, vide, ou égal à `commande:` (aucun gain).
  const { local, commande } = declared()
  assert.equal(typeof local, 'string')
  assert.ok(local.trim().length > 0, 'tests.local est vide')
  assert.notEqual(local, commande)
})

test('.sdlc.yaml déclare tests.rejouer avec le gabarit {tests}', () => {
  // Casserait si `rejouer:` était absent ou sans emplacement pour les noms.
  const { rejouer } = declared()
  assert.equal(typeof rejouer, 'string')
  assert.ok(rejouer.includes('{tests}'), `tests.rejouer sans {tests} : ${rejouer}`)
})

test('les commandes locale et de rejeu déclarées désignent des fichiers exécutables du dépôt', () => {
  // Casserait si la déclaration pointait un script absent ou non exécutable.
  const { local, rejouer } = declared()
  for (const cmd of [local, rejouer]) {
    const script = cmd.split(/\s+/)[0]
    assert.doesNotThrow(() => accessSync(resolve(root, script), constants.R_OK), `${script} illisible`)
    assert.ok(readFileSync(resolve(root, script), 'utf8').startsWith('#!'), `${script} sans shebang`)
  }
})

// Les noms sont ceux du rapport JUnit de la suite (`classname > name`, comme la chaîne les cite).
const file = 'packages/content/test/index-surface.test.ts'
const leaf = 'the content index (R-6) > does_not_expose_formatReference'
const replay = (arg) => {
  const { rejouer } = declared()
  const run = spawnSync('sh', ['-c', rejouer.replace('{tests}', `'${arg}'`)], { cwd: root, encoding: 'utf8', timeout: 590_000 })
  const xml = readFileSync(resolve(root, 'resultats.xml'), 'utf8')
  return { run, xml }
}
const onlyThatCase = ({ run, xml }) => {
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.equal((xml.match(/<testcase\b/g) ?? []).length, 1, xml)
  assert.match(xml, /<testcase\b[^>]* name="the content index \(R-6\) &gt; does_not_expose_formatReference"/)
  assert.doesNotMatch(xml, /<failure|<error|<skipped/)
}

test('rejouer: rejoue un test nommé par son nom de rapport, lui seul, et sort vert', { timeout: 600_000 }, () => {
  // Casserait si le rejeu jouait autre chose que le test nommé (ses deux frères du même describe), ou rien.
  onlyThatCase(replay(leaf))
})

test('rejouer: accepte le nom préfixé du fichier (classname > nom), tel que la chaîne le cite', { timeout: 600_000 }, () => {
  // Casserait si le préfixe `classname >` n'était pas reconnu.
  onlyThatCase(replay(`${file} > ${leaf}`))
})
