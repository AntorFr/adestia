// Guard: a test file that reaches the browser through the shared helper (./charte-browser: launch,
// open, newBrowser — by name or `h.launch`) must be detected as a screen test by the one rule of
// scripts/niveaux.mjs, which scripts/suite-locale.sh also uses. A file that only imports `awaitShell`
// stays a plain test.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { fichiersDEcran } from '../../scripts/niveaux.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = join(root, 'packages', 'web', 'test')
const atteintLeNavigateur = (src) => {
  const imp = /from\s+['"]\.\/charte-browser(?:\.js)?['"]/.test(src)
  return imp && /\b(launch|open|newBrowser)\b/.test(src.replace(/^[^\n]*from\s+['"]\.\/charte-browser[^\n]*$/gm, '').replace(/import\s*\{[^}]*\}\s*from[^\n]*/g, (m) => m))
}

test('every web test reaching the browser through charte-browser is detected as a screen test', () => {
  const detectes = new Set(fichiersDEcran())
  const manques = readdirSync(dir)
    .filter((f) => /\.test\.tsx?$/.test(f))
    .filter((f) => atteintLeNavigateur(readFileSync(join(dir, f), 'utf8')))
    .map((f) => `packages/web/test/${f}`)
    .filter((f) => !detectes.has(f))
  assert.deepEqual(manques, [])
})

test('besoin-etat-projet-browser is a screen test, attente-coque-helper is not', () => {
  const detectes = new Set(fichiersDEcran())
  assert.ok(detectes.has('packages/web/test/besoin-etat-projet-browser.test.ts'))
  assert.ok(!detectes.has('packages/web/test/attente-coque-helper.test.ts'))
})
