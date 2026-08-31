/**
 * The derivations — the half of this plugin that has an opinion.
 *
 * Everything tested here is something the scanned repositories deliberately do
 * NOT record: who has the hand, what is blocked, what a decision would
 * unfreeze, what order to work in. Their README says so in as many words, so
 * these tests are the executable form of that contract. If one of them ever
 * has to be relaxed, the fiche schema grew a field it should not have.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { buildGraph, isFinished, ownerOf } from '../graph.mjs'

/** A fiche as `read.mjs` hands it over. */
const fiche = (id, over = {}) => ({
  id,
  repo: '/repos/tessera',
  path: `.agent/lots/${id}.md`,
  source: 'main',
  type: 'lot',
  title: id,
  status: 'idea',
  priority: null,
  dependsOn: [],
  spec: null,
  branch: null,
  updated: '2026-08-29',
  ...over,
})

const byId = (graph) => new Map(graph.items.map((item) => [item.id, item]))

test('who has the hand comes from the status, and from nothing else', () => {
  assert.equal(ownerOf(fiche('a', { status: 'idea' })), 'monsieur')
  assert.equal(ownerOf(fiche('a', { status: 'design' })), 'monsieur')
  assert.equal(ownerOf(fiche('a', { status: 'code' })), 'coder')
  assert.equal(ownerOf(fiche('a', { status: 'integrate' })), 'integrateur')
  assert.equal(ownerOf(fiche('a', { status: 'done' })), null)
  assert.equal(ownerOf(fiche('q', { type: 'question', status: 'open' })), 'monsieur')
  assert.equal(ownerOf(fiche('q', { type: 'question', status: 'decided' })), null)
  // Undefined, not null: a fiche with a typo for a status is somebody's
  // business urgently, and a finished one is nobody's at all.
  assert.equal(ownerOf(fiche('a', { status: 'en-cours' })), undefined)
})

test('a lot ends at done, a question ends at decided', () => {
  assert.equal(isFinished(fiche('a', { status: 'done' })), true)
  assert.equal(isFinished(fiche('a', { status: 'integrate' })), false)
  assert.equal(isFinished(fiche('q', { type: 'question', status: 'decided' })), true)
  assert.equal(isFinished(fiche('q', { type: 'question', status: 'open' })), false)
})

test('blocked means one dependency has not finished; actionable means none is left', () => {
  const graph = buildGraph([
    fiche('t-0', { status: 'done' }),
    fiche('t-1', { dependsOn: ['t-0'] }),
    fiche('t-2', { dependsOn: ['t-1'] }),
  ])
  const items = byId(graph)
  assert.equal(items.get('t-1').blocked, false)
  assert.equal(items.get('t-1').actionable, true)
  assert.equal(items.get('t-2').blocked, true)
  assert.deepEqual(items.get('t-2').blockers, ['t-1'])
  assert.equal(items.get('t-2').actionable, false)
  // A finished lot is not "actionable" — there is nothing left to do to it.
  assert.equal(items.get('t-0').actionable, false)
})

test('an open question upstream is what the whole chain is blocked BY', () => {
  // The signal this plugin exists for: three lots waiting, and the thing to
  // act on is the question at the head, not the lot immediately in front.
  const graph = buildGraph([
    fiche('o-q', { type: 'question', status: 'open' }),
    fiche('t-3', { dependsOn: ['o-q'] }),
    fiche('t-4', { dependsOn: ['t-3'] }),
    fiche('t-5', { dependsOn: ['t-4'] }),
  ])
  const items = byId(graph)
  for (const id of ['t-3', 't-4', 't-5']) {
    assert.equal(items.get(id).blocked, true, id)
    assert.deepEqual(items.get(id).rootBlockers, ['o-q'], id)
  }
  // And the question knows what it is holding up, which is the number that
  // makes it worth deciding first.
  assert.equal(items.get('o-q').blocks, 3)
})

test('a dependency no scanned repository holds blocks, and is reported', () => {
  const graph = buildGraph([fiche('t-5', { dependsOn: ['ostia-q-selectors'] })])
  const item = byId(graph).get('t-5')
  assert.equal(item.blocked, true)
  assert.deepEqual(item.unknownDeps, ['ostia-q-selectors'])
  assert.deepEqual(item.rootBlockers, ['ostia-q-selectors'])
  assert.equal(graph.problems.filter((problem) => problem.code === 'unknown-dep').length, 1)
})

test('two repositories make one graph — a dependency may cross', () => {
  const graph = buildGraph([
    fiche('ostia-q', { repo: '/repos/ostia', type: 'question', status: 'open' }),
    fiche('tessera-5', { dependsOn: ['ostia-q'] }),
  ])
  assert.deepEqual(byId(graph).get('tessera-5').rootBlockers, ['ostia-q'])
  assert.equal(graph.problems.length, 0)
})

test('the order is topological, ties settled by priority then by id', () => {
  const graph = buildGraph([
    fiche('t-2', { priority: 1, dependsOn: ['t-1'] }),
    fiche('t-4', { priority: 3 }),
    fiche('t-1', { status: 'done' }),
    fiche('t-3', { priority: 2, dependsOn: ['t-2'] }),
    fiche('t-9'),
    fiche('t-8'),
  ])
  // t-2's only dependency is DONE, so it is ready at once and its priority
  // wins; t-3 follows the moment t-2 is placed. What declares no priority
  // sorts last, by id — the done lot among them.
  assert.deepEqual(graph.order, ['t-2', 't-3', 't-4', 't-1', 't-8', 't-9'])
  assert.equal(byId(graph).get('t-2').rank, 0)
})

test('a fiche never disappears — not for a bad status, not for a circle', () => {
  const graph = buildGraph([
    fiche('t-a', { dependsOn: ['t-b'] }),
    fiche('t-b', { dependsOn: ['t-a'] }),
    fiche('t-c', { status: 'en-cours' }),
  ])
  assert.deepEqual(
    graph.items.map((item) => item.id).sort(),
    ['t-a', 't-b', 't-c'],
  )
  assert.equal(byId(graph).get('t-a').cycle, true)
  assert.equal(byId(graph).get('t-c').badStatus, true)
  assert.equal(byId(graph).get('t-c').owner, null)
  assert.equal(graph.problems.some((problem) => problem.code === 'cycle'), true)
  assert.equal(graph.problems.some((problem) => problem.code === 'bad-status'), true)
})

test('two fiches claiming one id is reported rather than silently arbitrated', () => {
  const graph = buildGraph([
    fiche('shared', { repo: '/repos/tessera' }),
    fiche('shared', { repo: '/repos/ostia' }),
  ])
  assert.equal(graph.items.length, 1)
  const problem = graph.problems.find((entry) => entry.code === 'duplicate-id')
  assert.deepEqual(problem.repos, ['/repos/tessera', '/repos/ostia'])
})
