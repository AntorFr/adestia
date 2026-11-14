/**
 * The version guard of doc-besoin (B-5), proved on synthetic repositories' facts: tags, CHANGELOG
 * headings, status.md text. Every stable tag has its entry, and status.md cites the last title.
 * After a stable tag the last title is that tag or the next version; after a series pre-release
 * vX.Y.Z-serie.K it is vX.Y.Z-serie.J with J <= K+1, or vX.Y.Z. A pre-release owes no entry.
 *
 *   node --test bench/tests/doc-version.test.mjs
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkVersions } from './lib/doc-version.mjs'

const S = (v) => `- Dernier tag : **\`${v}\`**`
const run = (tags, headings, status) => checkVersions({ tags, headings, status, since: 'v0.61.0' })
const tags5 = ['v0.61.0', 'v0.95.0', 'v0.96.0-x.1', 'v0.96.0-x.2']
const heads5 = ['v0.61.0', 'v0.95.0', 'v0.96.0-x.1', 'v0.96.0-x.2']

describe('version guard — the title is the latest tag or the next version of its series', () => {
  test('title equal to the latest tag, status citing it: no problem', () => {
    assert.deepEqual(run(tags5, heads5, S('v0.96.0-x.2')), [])
  })
  test('title one step ahead of the tag (PR carrying its entry), status citing the title: no problem', () => {
    assert.deepEqual(run(tags5, [...heads5, 'v0.96.0-x.3'], S('v0.96.0-x.3')), [])
  })
  test('numeric order: .10 follows .9, not .1', () => {
    const t = ['v0.61.0', 'v0.96.0-x.9'], h = ['v0.61.0', 'v0.96.0-x.9', 'v0.96.0-x.10']
    assert.deepEqual(run(t, h, S('v0.96.0-x.10')), [])
    assert.deepEqual(run(['v0.61.0', 'v0.96.0-x.10'], ['v0.61.0', 'v0.96.0-x.10', 'v0.96.0-x.11'], S('v0.96.0-x.11')), [])
    assert.notDeepEqual(run(t, [...h, 'v0.96.0-x.11'], S('v0.96.0-x.11')), [])
  })
  test('a title behind the latest pre-release tag is accepted, even by several numbers', () => {
    assert.deepEqual(run(tags5, heads5.slice(0, -1), S('v0.96.0-x.1')), [])
    const t = ['v0.61.0', 'v0.96.0-x.1', 'v0.96.0-x.2', 'v0.96.0-x.3', 'v0.96.0-x.4']
    assert.deepEqual(run(t, ['v0.61.0', 'v0.96.0-x.1'], S('v0.96.0-x.1')), [])
  })
  test('a title behind the latest stable tag is refused', () => {
    const t = ['v0.61.0', 'v0.95.0', 'v0.96.0']
    assert.notDeepEqual(run(t, ['v0.61.0', 'v0.95.0', 'v0.96.0'].slice(0, 2), S('v0.95.0')), [])
    // older than the latest stable tag while the latest tag is a pre-release of the next target
    const u = [...t, 'v0.97.0-x.1']
    assert.notDeepEqual(run(u, ['v0.61.0', 'v0.95.0', 'v0.96.0'], S('v0.96.0')), [])
  })
  test('a title two steps ahead is refused (a tag .3 would be skipped)', () => {
    assert.notDeepEqual(run(tags5, [...heads5, 'v0.96.0-x.4'], S('v0.96.0-x.4')), [])
  })
  test('a title ahead in another series is refused', () => {
    assert.notDeepEqual(run(tags5, [...heads5, 'v0.96.0-y.1'], S('v0.96.0-y.1')), [])
    assert.notDeepEqual(run(tags5, [...heads5, 'v0.97.0'], S('v0.97.0')), [])
  })
  test('status.md citing another version than the last title is refused, both directions', () => {
    assert.notDeepEqual(run(tags5, heads5, S('v0.96.0-x.1')), [])
    assert.notDeepEqual(run(tags5, [...heads5, 'v0.96.0-x.3'], S('v0.96.0-x.2')), [])
  })
  test('a pre-release tag without its entry is no problem', () => {
    assert.deepEqual(run([...tags5, 'v0.96.0-x.3'], heads5, S('v0.96.0-x.2')), [])
    assert.deepEqual(run(tags5, ['v0.61.0', 'v0.95.0', 'v0.96.0-x.2'], S('v0.96.0-x.2')), [])
  })
  test('a stable tag without its entry is still refused', () => {
    assert.notDeepEqual(run(['v0.61.0', 'v0.95.0', 'v0.96.0'], ['v0.61.0', 'v0.96.0'], S('v0.96.0')), [])
    assert.notDeepEqual(run(['v0.61.0', 'v0.95.0', 'v0.96.0-x.2'], ['v0.61.0', 'v0.96.0-x.2'], S('v0.96.0-x.2')), [])
  })
  test('a clone without tags fails explicitly', () => {
    assert.throws(() => run([], heads5, S('v0.96.0-x.2')), /no git tag/)
  })
})

describe('version guard — a released series', () => {
  test('after v0.96.0 the title may be v0.96.1, v0.97.0 or v1.0.0, not v0.98.0 nor v0.96.2', () => {
    const t = ['v0.61.0', 'v0.96.0'], h = ['v0.61.0', 'v0.96.0']
    for (const next of ['v0.96.1', 'v0.97.0', 'v1.0.0']) assert.deepEqual(run(t, [...h, next], S(next)), [], next)
    for (const next of ['v0.98.0', 'v0.96.2']) assert.notDeepEqual(run(t, [...h, next], S(next)), [], next)
  })
})

describe('version guard — a stable target after its pre-releases', () => {
  const t = ['v0.61.0', 'v0.96.0-x.7', 'v0.96.0-x.8'], h = ['v0.61.0', 'v0.96.0-x.7', 'v0.96.0-x.8']
  test('v0.96.0 follows the pre-release tag .8 (accepted), status citing it', () => {
    assert.deepEqual(run(t, [...h, 'v0.96.0'], S('v0.96.0')), [])
  })
  test('the next pre-release .9 is still accepted', () => {
    assert.deepEqual(run(t, [...h, 'v0.96.0-x.9'], S('v0.96.0-x.9')), [])
  })
  test('a later release, a skipped pre-release, a stale status are refused (a late title is not)', () => {
    assert.notDeepEqual(run(t, [...h, 'v0.96.1'], S('v0.96.1')), [])
    assert.notDeepEqual(run(t, [...h, 'v0.97.0'], S('v0.97.0')), [])
    assert.notDeepEqual(run(t, [...h, 'v0.96.0-x.10'], S('v0.96.0-x.10')), [])
    assert.deepEqual(run(t, h.slice(0, -1), S('v0.96.0-x.7')), [])
    assert.notDeepEqual(run(t, [...h, 'v0.96.0'], S('v0.96.0-x.8')), [])
  })
  test('a missing entry for an existing pre-release tag is no problem', () => {
    assert.deepEqual(run(t, ['v0.61.0', 'v0.96.0-x.8', 'v0.96.0'], S('v0.96.0')), [])
  })
})
