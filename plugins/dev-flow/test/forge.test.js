/**
 * The forge source: the same rule, over HTTP, holding nothing.
 *
 * The assertions here are deliberately the SAME ones `read.test.js` makes
 * against a scripted git — main is the index, a branch tip wins for its own
 * fiche, a question born at that tip is picked up, a stale copy of somebody
 * else's lot is not. That repetition is the point: two sources that disagreed
 * about what `main` means would be two products, and the way to prove they do
 * not is to hold them to one set of expectations.
 *
 * What is specific to this source is the failure vocabulary. A 404 is an
 * absence and reads as one; anything else — a rate limit, a 500, an expired
 * token — must NEVER be drawn as an empty repository, and that is the
 * distinction most of these tests are about.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { SLUG, forgeSource } from '../forge.mjs'
import { scanSource, timelineOf } from '../read.mjs'

const fiche = (fields, body = '') =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n${body}`

/** The same galaxy `read.test.js` scripts for git, as a forge would serve it. */
const galaxy = () => ({
  main: {
    '.agent/lots/README.md': '# not a fiche\n',
    '.agent/lots/t-1.md': fiche({ id: 't-1', type: 'lot', status: 'code', branch: 'lot1' }),
    '.agent/lots/t-2.md': fiche({ id: 't-2', type: 'lot', status: 'idea', depends_on: '[t-1]' }),
  },
  lot1: {
    '.agent/lots/t-1.md': fiche({
      id: 't-1',
      type: 'lot',
      status: 'design',
      branch: 'lot1',
      depends_on: '[t-q]',
    }),
    '.agent/lots/t-q.md': fiche({ id: 't-q', type: 'question', status: 'open' }, 'À trancher.\n'),
    '.agent/lots/t-2.md': fiche({ id: 't-2', type: 'lot', status: 'done' }),
  },
})

/**
 * A forge, reduced to what the source actually calls.
 *
 * `status` lets one test make it fail without touching the rest, which is how
 * "a rate limit is not an empty repository" gets pinned.
 */
function fakeForge(tree, { status = 200, commits = [] } = {}) {
  const calls = []
  const answer = (body, code = 200) => ({
    ok: code < 400,
    status: code,
    json: async () => body,
    text: async () => body,
  })

  return {
    calls,
    call: async (url) => {
      calls.push(url)
      if (status !== 200) return answer({ message: 'nope' }, status)
      const rest = url.replace('https://api.github.com/repos/AntorFr/tessera', '')

      if (rest === '') return answer({ full_name: 'AntorFr/tessera' })

      const branch = /^\/branches\/(.+)$/.exec(rest)
      if (branch) {
        return tree[decodeURIComponent(branch[1])]
          ? answer({ name: branch[1] })
          : answer({ message: 'Branch not found' }, 404)
      }

      if (rest.startsWith('/commits')) return answer(commits)

      const contents = /^\/contents\/(.*)\?ref=(.+)$/.exec(rest)
      if (contents) {
        const [, path, ref] = contents
        const files = tree[decodeURIComponent(ref)]
        if (!files) return answer({ message: 'Not Found' }, 404)
        const wanted = decodeURIComponent(path)
        if (wanted === '.agent/lots') {
          return answer(
            Object.keys(files).map((name) => ({ type: 'file', name: name.split('/').pop(), path: name })),
          )
        }
        return files[wanted] === undefined
          ? answer({ message: 'Not Found' }, 404)
          : answer(files[wanted])
      }

      throw new Error(`unscripted: ${url}`)
    },
  }
}

const scan = (tree, options) =>
  scanSource(forgeSource('AntorFr/tessera', 'token', fakeForge(tree, options).call))

test('a slug is owner/repo, and nothing that could be a path', () => {
  assert.equal(SLUG.test('AntorFr/tessera'), true)
  assert.equal(SLUG.test('/repos/tessera'), false)
  assert.equal(SLUG.test('https://github.com/AntorFr/tessera'), false)
  assert.equal(SLUG.test('AntorFr/tessera/../../etc'), false)
})

test('main is the index and the branch tip wins for its own fiche — over HTTP', async () => {
  const { items, bodies, problems } = await scan(galaxy())
  const byId = new Map(items.map((item) => [item.id, item]))

  assert.equal(byId.get('t-1').status, 'design')
  assert.equal(byId.get('t-1').source, 'branch:lot1')
  assert.equal(byId.get('t-2').status, 'idea', "a coder only writes their own fiche")
  assert.equal(byId.get('t-2').source, 'main')
  assert.equal(byId.get('t-q').type, 'question')
  assert.equal(bodies.get('t-q').trim(), 'À trancher.')
  assert.equal(problems.length, 0)
  assert.equal(byId.has('README'), false)
})

test('nothing is cloned, and no branch is ever listed', async () => {
  const forge = fakeForge(galaxy())
  await scanSource(forgeSource('AntorFr/tessera', 'token', forge.call))
  // Only the refs `main` names are ever asked about — the rule's third clause,
  // which over HTTP is also what keeps the request count bounded.
  assert.equal(forge.calls.some((url) => url.includes('/branches?')), false)
  assert.equal(forge.calls.filter((url) => url.includes('/branches/')).length, 2)
  assert.equal(forge.calls.some((url) => url.includes('git/trees')), false)
})

test('a branch the forge never saw is NOT reported as gone', async () => {
  // The one place the two sources deliberately disagree, and the reason is the
  // galaxy's own doctrine: working branches stay local and are never pushed.
  // On disk, a missing branch was merged and deleted — the end of a lot. Here,
  // it usually means the work is in flight and out of sight, and the fiche on
  // screen is `main`'s: older than the truth, not newer. Calling that "gone"
  // would announce an ending to somebody whose coder is mid-sentence.
  const tree = galaxy()
  delete tree.lot1
  const { items, problems } = await scan(tree)

  assert.equal(items.find((item) => item.id === 't-1').status, 'code', "main's version stands")
  assert.equal(problems.some((problem) => problem.code === 'branch-gone'), false)
  const unseen = problems.find((problem) => problem.code === 'branch-not-pushed')
  assert.equal(unseen.branch, 'lot1')
  assert.equal(unseen.severity, 'info')
  assert.match(unseen.message, /may be behind/)
})

test('an empty main on a forge does not read as an empty repository', async () => {
  // Tessera, on the day this was written: nine commits of fiches sitting on a
  // laptop. "No lots" would have been a lie about the galaxy; "none that
  // reached the forge" is the truth, and it names the fix.
  const { problems } = await scan({ main: {} })
  assert.equal(problems[0].code, 'no-lots-pushed')
  assert.match(problems[0].message, /reached the forge/)
})

test('a repository the token cannot see is unreachable, never empty', async () => {
  const { items, problems } = await scanSource(
    forgeSource('AntorFr/tessera', '', fakeForge({}, { status: 404 }).call),
  )
  assert.deepEqual(items, [])
  assert.equal(problems[0].code, 'no-such-repo')
})

test('a rate limit is not an absence — it is said out loud', async () => {
  // The failure this test exists for: a 403 read as "no fiches" would draw an
  // empty, confident screen over a galaxy that is perfectly alive.
  const { items, problems } = await scanSource(
    forgeSource('AntorFr/tessera', 'token', fakeForge({}, { status: 403 }).call),
  )
  assert.deepEqual(items, [])
  assert.equal(problems[0].code, 'forge-error')
  assert.match(problems[0].message, /403/)
})

test('a repository with no main branch is refused rather than guessed at', async () => {
  const { problems } = await scan({ master: {} })
  assert.equal(problems[0].code, 'no-main')
})

test('the history comes from the forge, newest first, both refs', async () => {
  const commits = [
    {
      sha: 'abcdef1234',
      commit: { author: { date: '2026-08-30T10:00:00Z', name: 'Bench' }, message: 'Hand it back\n\nbody' },
    },
  ]
  const forge = fakeForge(galaxy(), { commits })
  const source = forgeSource('AntorFr/tessera', 'token', forge.call)
  const { items } = await scanSource(source)
  const timeline = await timelineOf(items.find((item) => item.id === 't-1'), source)

  assert.equal(timeline[0].sha, 'abcdef12')
  assert.equal(timeline[0].subject, 'Hand it back', 'the subject is the first line, never the body')
  assert.equal(timeline[0].author, 'Bench')
})

test('a token travels in the header, and only when there is one', async () => {
  const seen = []
  const call = async (url, init) => {
    seen.push(init.headers.authorization)
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
  }
  await forgeSource('AntorFr/tessera', 'secret', call).hasRef('main')
  await forgeSource('AntorFr/tessera', '', call).hasRef('main')
  assert.deepEqual(seen, ['Bearer secret', undefined])
})
