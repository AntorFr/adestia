/**
 * The one piece of operator input this plugin parses: where to look.
 *
 * Small, and worth pinning anyway — it is the single string standing between
 * a configured instance and a screen that says "no repository is configured".
 * A trailing separator or a stray newline in a YAML value must not turn into
 * an empty path the scan then reports as "not a git repository".
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { kindOf, nameOf, readRepos } from '../api.mjs'

test('colons, commas and newlines all separate; blanks are dropped', () => {
  assert.deepEqual(readRepos('/repos/tessera:/repos/ostia'), ['/repos/tessera', '/repos/ostia'])
  assert.deepEqual(readRepos('/repos/tessera, /repos/ostia'), ['/repos/tessera', '/repos/ostia'])
  assert.deepEqual(readRepos('/repos/tessera:\n/repos/ostia:'), ['/repos/tessera', '/repos/ostia'])
})

test('an unset value is no repositories, not one empty one', () => {
  assert.deepEqual(readRepos(undefined), [])
  assert.deepEqual(readRepos(''), [])
  assert.deepEqual(readRepos('  '), [])
})

test('a repository goes by its folder on screen, not by its whole path', () => {
  assert.equal(nameOf('/home/berard/Dev/tessera'), 'tessera')
  assert.equal(nameOf('/repos/ostia/'), 'ostia')
})

test('an entry says which reader it wants by its shape alone', () => {
  assert.equal(kindOf('/repos/tessera'), 'local')
  assert.equal(kindOf('./tessera'), 'local')
  assert.equal(kindOf('~/Dev/tessera'), 'local')
  assert.equal(kindOf('AntorFr/tessera'), 'forge')
  // Refused by name rather than guessed at: an entry nobody can classify is a
  // line somebody meant something by, and picking a reader for it would answer
  // the wrong question quietly.
  assert.equal(kindOf('https://github.com/AntorFr/tessera'), 'unknown')
  assert.equal(kindOf('tessera'), 'unknown')
})
