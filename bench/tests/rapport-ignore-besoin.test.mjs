/** adestia-ignore-rapport: the attestation report `rapport-tests.json`, written at the root, must not dirty a clone. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** A fresh repository holding only the repository's .gitignore: what a clone's status says about the files we drop in it. */
function withClone(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'rapport-ignore-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    git('init', '-q')
    copyFileSync(join(root, '.gitignore'), join(dir, '.gitignore'))
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.gitignore')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base')
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), body)
    }
    return run(git)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a rapport-tests.json written at the root leaves git status clean', () => {
  // red if the /rapport-tests.json entry leaves .gitignore
  withClone({ 'rapport-tests.json': '{"format":1,"resultat":"vert"}\n' }, (git) => {
    assert.equal(git('status', '--porcelain'), '')
  })
})

test('git check-ignore names .gitignore for rapport-tests.json', () => {
  // red if another file or pattern ignores it, or none does
  withClone({ 'rapport-tests.json': '{}\n' }, (git) => {
    const out = git('check-ignore', '-v', 'rapport-tests.json')
    assert.match(out, /^\.gitignore:\d+:.*rapport-tests\.json\trapport-tests\.json\n$/)
  })
})

test('an empty rapport-tests.json is ignored as well', () => {
  // red if the rule depended on the content
  withClone({ 'rapport-tests.json': '' }, (git) => {
    assert.equal(git('status', '--porcelain'), '')
  })
})

test('another untracked file at the root still shows in git status', () => {
  // red if the fix widens the ignore (e.g. a bare `*.json`) and hides more than the report
  withClone({ 'rapport-tests.json': '{}\n', 'autre-rapport.json': '{}\n' }, (git) => {
    assert.equal(git('status', '--porcelain'), '?? autre-rapport.json\n')
  })
})

test('the existing attestation outputs stay ignored', () => {
  // red if the fix replaces the neighbouring entries instead of adding to them
  withClone({ 'resultats.xml': '<x/>', '.suite-attestee/guards.xml': '<x/>' }, (git) => {
    assert.equal(git('status', '--porcelain'), '')
  })
})
