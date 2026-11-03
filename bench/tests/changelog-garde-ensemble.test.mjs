/**
 * Besoin (adestia-correctif-garde-changelog): the guard packages/web/test/besoin-pages-statique.test.ts
 * reads the "## v0.96.0" section of the CHANGELOG, not the section of the highest version, so a later
 * release written into main does not turn its four changelog_dit_* tests red.
 *
 * The guard is run (vitest) in a throw-away repository tree holding variants of the CHANGELOG.
 * Set GUARD_FILE to run another version of the guard (used to see these tests red on main's guard).
 *
 *   node --test bench/tests/changelog-garde-ensemble.test.mjs
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const guard = process.env.GUARD_FILE ?? join(repo, 'packages/web/test/besoin-pages-statique.test.ts')
const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8')

const FOUR = [
  'changelog_dit_la_lecture_des_fins_de_ligne_crlf',
  'changelog_dit_le_fil_ariane_de_la_racine',
  'changelog_dit_les_reglages_de_bloc_et_le_bandeau',
  'changelog_dit_le_diagnostic_traduit',
]
// Every keyword the four expectations look for, in one section.
const ALL_WORDS = '- CRLF frontmatter, breadcrumb, popover, block settings, diagnostic.'

/** Runs the guard against a CHANGELOG text; returns { name: 'passed' | 'failed' }. */
function runGuard(text) {
  const dir = mkdtempSync(join(tmpdir(), 'garde-changelog-'))
  try {
    mkdirSync(join(dir, 'packages/web/test'), { recursive: true })
    mkdirSync(join(dir, 'docs'))
    cpSync(guard, join(dir, 'packages/web/test/garde.test.ts'))
    cpSync(join(repo, 'docs/parcours.md'), join(dir, 'docs/parcours.md'))
    writeFileSync(join(dir, 'CHANGELOG.md'), text)
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'))
    const out = join(dir, 'out.json')
    spawnSync(process.execPath, [join(repo, 'node_modules/vitest/vitest.mjs'), 'run', '--root', dir,
      '--reporter=json', `--outputFile=${out}`], { cwd: dir, encoding: 'utf8', timeout: 120000 })
    const json = JSON.parse(readFileSync(out, 'utf8'))
    const res = {}
    for (const f of json.testResults) for (const t of f.assertionResults) res[t.title] = t.status
    return res
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const only = (res, names) => names.map((n) => res[n])
const allPassed = (res) => Object.keys(res).length === 6 && Object.values(res).every((s) => s === 'passed')
const v096 = /\n## v0\.96\.0\n[\s\S]*$/
const emptied = (text) => text.replace(v096, '\n## v0.96.0\n\nNothing relevant here.\n')

describe('garde du CHANGELOG ancrée sur la section v0.96.0', () => {
  test('le CHANGELOG tel quel : les six tests de la garde passent', () => {
    assert.ok(allPassed(runGuard(changelog)))
  })
  test('une section v0.97.0 ajoutée après v0.96.0 : les quatre changelog_dit_* restent verts', () => {
    const res = runGuard(`${changelog}\n## v0.97.0\n\n- Something unrelated to the pages tranche.\n`)
    assert.deepEqual(only(res, FOUR), Array(4).fill('passed'))
    assert.ok(allPassed(res))
  })
  test('une section v0.97.0 ajoutée en tête du CHANGELOG : les quatre changelog_dit_* restent verts', () => {
    const res = runGuard(changelog.replace('## Earlier than', '## v0.97.0\n\n- Something unrelated.\n\n## Earlier than'))
    assert.deepEqual(only(res, FOUR), Array(4).fill('passed'))
  })
  test('plusieurs versions plus hautes (v0.97.0, v1.0.0) : les quatre restent verts', () => {
    const res = runGuard(`${changelog}\n## v0.97.0\n\n- Other.\n\n## v1.0.0\n\n- Other again.\n`)
    assert.deepEqual(only(res, FOUR), Array(4).fill('passed'))
  })
  test('les mots de la tranche seulement dans v0.97.0, pas dans v0.96.0 : les quatre sont rouges', () => {
    const res = runGuard(`${emptied(changelog)}\n## v0.97.0\n\n${ALL_WORDS}\n`)
    assert.deepEqual(only(res, FOUR), Array(4).fill('failed'))
  })
  test('v0.96.0 sans mot de la tranche, malgré les sections v0.96.0-adestia-correctifs.N qui les portent : rouges', () => {
    assert.match(changelog, /## v0\.96\.0-adestia-correctifs\.\d+/)
    const res = runGuard(emptied(changelog))
    assert.deepEqual(only(res, FOUR), Array(4).fill('failed'))
  })
  test('section v0.96.0 absente (restent les pré-versions .N) : les quatre sont rouges', () => {
    const res = runGuard(changelog.replace(v096, '\n'))
    assert.deepEqual(only(res, FOUR), Array(4).fill('failed'))
  })
})
