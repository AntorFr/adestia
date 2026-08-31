/**
 * The reading rule, which is the part somebody will be tempted to simplify.
 *
 * Two suites, and they answer different questions. The first drives `scanRepo`
 * against a SCRIPTED git — every ref and every file spelled out — so the rule
 * itself is pinned: main is the index, a branch wins for its own fiche, a new
 * question at a tip is picked up, and nothing else on that branch is. The
 * second builds a real repository in a temporary directory and reads it with
 * the real `git`, because a scripted git agrees with whatever the code asks it
 * and cannot catch a wrong command.
 */

import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { gitIn, hasGit, parseFrontmatter, readFiche, scanRepo, timelineOf } from '../read.mjs'

const execFileAsync = promisify(execFile)

const fiche = (fields, body = '') =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n${body}`

/* The frontmatter --------------------------------------------------------- */

test('the flat YAML this contract writes, parsed', () => {
  const { fields, body } = parseFrontmatter(
    [
      '---',
      'id: tessera-2',
      'type: lot',
      'title: "Cas 1 — repo_tag de bout en bout"',
      'status: idea',
      'priority: 1',
      'depends_on: [tessera-1, ostia-q-selectors]',
      'spec: CONCEPTION.md',
      'branch: null',
      'updated: 2026-08-29',
      '---',
      '',
      'Le corps est de la prose.',
    ].join('\n'),
  )
  assert.equal(fields.id, 'tessera-2')
  assert.equal(fields.title, 'Cas 1 — repo_tag de bout en bout')
  assert.equal(fields.priority, 1)
  assert.deepEqual(fields.depends_on, ['tessera-1', 'ostia-q-selectors'])
  assert.equal(fields.branch, null)
  assert.equal(body.trim(), 'Le corps est de la prose.')
})

test('an empty inline list, a block list, and a comment', () => {
  const { fields } = parseFrontmatter(
    ['---', '# a note to a reader', 'depends_on: []', 'tags:', '  - a', '  - b', '---', ''].join('\n'),
  )
  assert.deepEqual(fields.depends_on, [])
  assert.deepEqual(fields.tags, ['a', 'b'])
})

test('a file with no frontmatter is a diagnostic, never a guess', () => {
  assert.equal(parseFrontmatter('# Just a heading\n'), undefined)
  const { problem } = readFiche('# Just a heading\n', {
    repo: '/r',
    path: '.agent/lots/x.md',
    source: 'main',
  })
  assert.equal(problem.code, 'no-frontmatter')
})

test('a fiche whose file name and id disagree is read, and reported', () => {
  const { item, problems } = readFiche(fiche({ id: 'tessera-2', type: 'lot', status: 'idea' }), {
    repo: '/r',
    path: '.agent/lots/tessera-two.md',
    source: 'main',
  })
  // Read: every dependency points at the ID, so the graph is still right.
  assert.equal(item.id, 'tessera-2')
  assert.equal(problems[0].code, 'id-mismatch')
})

test('a missing title falls back to the id rather than to an empty row', () => {
  const { item } = readFiche(fiche({ id: 'ostia-b', type: 'lot', status: 'done' }), {
    repo: '/r',
    path: '.agent/lots/ostia-b.md',
    source: 'main',
  })
  assert.equal(item.title, 'ostia-b')
  assert.deepEqual(item.dependsOn, [])
  assert.equal(item.branch, null)
})

/* The rule, against a scripted git ---------------------------------------- */

/** A git that answers from a literal `{ ref: { path: contents } }` tree. */
function fakeGit(tree) {
  const calls = []
  return {
    calls,
    run: async (args) => {
      calls.push(args.join(' '))
      if (args[0] === 'rev-parse' && args[1] === '--git-dir') return '.git\n'
      if (args[0] === 'rev-parse') {
        const ref = args.at(-1).replace('refs/heads/', '')
        if (!tree[ref]) throw new Error(`unknown ref ${ref}`)
        return 'ok\n'
      }
      if (args[0] === 'ls-tree') {
        const ref = args[3]
        return `${Object.keys(tree[ref] ?? {}).join('\0')}\0`
      }
      if (args[0] === 'show') {
        const [ref, path] = args[1].split(/:(.*)/)
        const found = tree[ref]?.[path]
        if (found === undefined) throw new Error(`no ${path} at ${ref}`)
        return found
      }
      throw new Error(`unscripted: ${args.join(' ')}`)
    },
  }
}

const galaxy = () => ({
  main: {
    '.agent/lots/README.md': '# not a fiche\n',
    '.agent/lots/t-1.md': fiche({ id: 't-1', type: 'lot', status: 'code', branch: 'lot1' }),
    '.agent/lots/t-2.md': fiche({ id: 't-2', type: 'lot', status: 'idea', depends_on: '[t-1]' }),
  },
  lot1: {
    // The coder's own fiche, one state further on than main knows.
    '.agent/lots/t-1.md': fiche({
      id: 't-1',
      type: 'lot',
      status: 'design',
      branch: 'lot1',
      depends_on: '[t-q]',
    }),
    // The question the hand-back invented — it exists nowhere else yet.
    '.agent/lots/t-q.md': fiche({ id: 't-q', type: 'question', status: 'open' }),
    // A stale copy of somebody else's lot, from before the branch was cut.
    '.agent/lots/t-2.md': fiche({ id: 't-2', type: 'lot', status: 'done' }),
  },
})

test('main is the index, and the branch tip wins for its own fiche', async () => {
  const git = fakeGit(galaxy())
  const { items, problems } = await scanRepo('/repos/tessera', git.run)
  const byId = new Map(items.map((item) => [item.id, item]))

  assert.equal(byId.get('t-1').status, 'design')
  assert.equal(byId.get('t-1').source, 'branch:lot1')
  // …and never for anybody else's: a coder only writes their own fiche, so a
  // copy of t-2 sitting on lot1 is older than main, not newer.
  assert.equal(byId.get('t-2').status, 'idea')
  assert.equal(byId.get('t-2').source, 'main')
  // The question created at the tip is picked up — it is the whole point of
  // looking at the branch at all.
  assert.equal(byId.get('t-q').type, 'question')
  assert.equal(byId.get('t-q').source, 'branch:lot1')
  assert.equal(problems.length, 0)
  // README.md is not a fiche.
  assert.equal(byId.has('README'), false)
})

test('branches are never enumerated — only the ones main names are opened', async () => {
  const tree = galaxy()
  tree.abandoned = { '.agent/lots/t-9.md': fiche({ id: 't-9', type: 'lot', status: 'code' }) }
  const git = fakeGit(tree)
  const { items } = await scanRepo('/repos/tessera', git.run)

  assert.equal(items.some((item) => item.id === 't-9'), false)
  assert.equal(git.calls.some((call) => call.startsWith('branch')), false)
  assert.equal(git.calls.some((call) => call.includes('abandoned')), false)
})

test('a merged branch that has gone leaves main’s fiche standing, and says so', async () => {
  const tree = galaxy()
  delete tree.lot1
  const { items, problems } = await scanRepo('/repos/tessera', fakeGit(tree).run)

  assert.equal(items.find((item) => item.id === 't-1').status, 'code')
  const gone = problems.find((problem) => problem.code === 'branch-gone')
  assert.equal(gone.branch, 'lot1')
  // Normal, not broken: this is what the end of a lot looks like.
  assert.equal(gone.severity, 'info')
})

test('a repository with no main, and one that is no repository at all', async () => {
  const { items: none, problems: noMain } = await scanRepo('/repos/x', fakeGit({ master: {} }).run)
  assert.deepEqual(none, [])
  assert.equal(noMain[0].code, 'no-main')

  const { problems: notRepo } = await scanRepo('/repos/y', async () => {
    throw new Error('fatal: not a git repository')
  })
  assert.equal(notRepo[0].code, 'not-a-repo')
})

test('a branch name git would read as an option is refused, not handed over', async () => {
  const tree = {
    main: {
      '.agent/lots/t-1.md': fiche({ id: 't-1', type: 'lot', status: 'code', branch: '--upload-pack' }),
    },
  }
  const git = fakeGit(tree)
  const { problems } = await scanRepo('/repos/tessera', git.run)
  assert.equal(problems[0].code, 'bad-branch')
  assert.equal(git.calls.some((call) => call.includes('--upload-pack')), false)
})

/* The rule, against a real repository -------------------------------------- */

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Bench',
  GIT_AUTHOR_EMAIL: 'bench@example.org',
  GIT_COMMITTER_NAME: 'Bench',
  GIT_COMMITTER_EMAIL: 'bench@example.org',
}

async function repository() {
  const dir = await mkdtemp(join(tmpdir(), 'lots-'))
  const git = (...args) =>
    execFileAsync('git', ['-C', dir, ...args], { env: { ...process.env, ...GIT_ENV } })
  const commit = async (path, contents, message) => {
    await mkdir(join(dir, '.agent/lots'), { recursive: true })
    await writeFile(join(dir, path), contents)
    await git('add', '--', path)
    await git('commit', '-q', '-m', message)
  }

  await git('init', '-q', '-b', 'main')
  await commit(
    '.agent/lots/t-1.md',
    fiche({ id: 't-1', type: 'lot', status: 'code', branch: 'lot1' }, 'Le lot.\n'),
    'Open lot 1',
  )
  await git('checkout', '-q', '-b', 'lot1')
  await commit(
    '.agent/lots/t-1.md',
    fiche({ id: 't-1', type: 'lot', status: 'design', branch: 'lot1', depends_on: '[t-q]' }, 'Renvoi.\n'),
    'Hand lot 1 back to design',
  )
  await commit(
    '.agent/lots/t-q.md',
    fiche({ id: 't-q', type: 'question', status: 'open' }, 'À trancher.\n'),
    'Raise the question that froze lot 1',
  )
  await git('checkout', '-q', 'main')
  return { dir, git }
}

test('a real repository, read by the real git', { skip: !(await hasGit()) }, async (t) => {
  const { dir } = await repository()
  t.after(() => rm(dir, { recursive: true, force: true }))

  const { items, bodies, problems } = await scanRepo(dir, gitIn(dir))
  const byId = new Map(items.map((item) => [item.id, item]))

  assert.equal(problems.length, 0)
  assert.equal(byId.get('t-1').status, 'design', 'the branch tip wins for its own fiche')
  assert.equal(byId.get('t-q').status, 'open', 'the question raised on the branch is picked up')
  assert.equal(bodies.get('t-q').trim(), 'À trancher.')

  // The working tree is NOT the source: an edit nobody committed stays invisible.
  await writeFile(
    join(dir, '.agent/lots/t-1.md'),
    fiche({ id: 't-1', type: 'lot', status: 'done', branch: 'lot1' }),
  )
  const again = await scanRepo(dir, gitIn(dir))
  assert.equal(again.items.find((item) => item.id === 't-1').status, 'design')
})

test('a fiche’s history is its file’s log', { skip: !(await hasGit()) }, async (t) => {
  const { dir } = await repository()
  t.after(() => rm(dir, { recursive: true, force: true }))

  const { items } = await scanRepo(dir, gitIn(dir))
  const item = items.find((entry) => entry.id === 't-1')
  const timeline = await timelineOf(item, gitIn(dir))

  assert.deepEqual(
    timeline.map((entry) => entry.subject),
    ['Hand lot 1 back to design', 'Open lot 1'],
  )
  assert.equal(timeline[0].sha.length, 8)
})
