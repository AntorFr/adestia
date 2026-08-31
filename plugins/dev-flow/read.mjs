/**
 * Reading the fiches — from git, never from the working tree.
 *
 * The rule this file implements is the scanned repositories' own, and it is
 * not an implementation detail: **a state exists only once it is committed**.
 * A fiche edited and not committed is invisible on purpose, so reading the
 * files on disk — the obvious thing, and the wrong one — would show a state
 * nobody else can see and that no merge will ever carry.
 *
 * Hence, per repository:
 *
 * 1. `main` is the index, and the ONLY index: every fiche it holds is read
 *    from `main`, whatever the checkout happens to have open.
 * 2. A fiche that names a `branch` is re-read at that branch's tip, which
 *    wins for ITS OWN fiche until the branch merges — that is where the coder
 *    commits the state changes that go with the work. New `question` fiches
 *    at that tip are picked up too: a code→design hand-back invents one, and
 *    it is precisely the fiche somebody needs to see.
 * 3. Branches are never enumerated. A branch `main` does not name does not
 *    exist here — which is what keeps a dozen stale local branches from
 *    turning into a dozen phantom chantiers.
 *
 * And throughout: this module never writes. It runs `git show`, `ls-tree`,
 * `log` and `rev-parse`, with optional locks off so that reading a repository
 * cannot even touch its index file.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const LOTS = '.agent/lots'
/** A git call that has not answered by now is a repository nobody should wait on. */
const TIMEOUT_MS = 10_000
const MAX_BUFFER = 4 * 1024 * 1024

/**
 * A branch name, as a fiche wrote it.
 *
 * Checked rather than trusted: the name reaches `git` as an argument, and one
 * beginning with `-` is an OPTION. The repositories are the operator's own, so
 * this is not a hostile input — it is the kind of check that costs one line
 * and removes a whole class of question.
 */
const SAFE_REF = /^(?!-)[A-Za-z0-9._/-]{1,200}$/

/** How a lot file is named, and the one file in the folder that is not one. */
const isFiche = (path) => path.endsWith('.md') && !path.endsWith('/README.md')

/**
 * The environment every git call here runs in. Four decisions, each load
 * bearing:
 *
 * - `GIT_OPTIONAL_LOCKS=0` is the read-only claim made to git itself. Without
 *   it a plain `git show` may refresh the index and write into a repository
 *   this plugin promised never to touch.
 * - `GIT_TERMINAL_PROMPT=0`: nothing here reaches the network, and a command
 *   that decided to ask for a password would hang a request instead.
 * - `safe.directory=*` is what makes the plugin work AT ALL in a container. A
 *   repository bind-mounted from the host is owned by the host's user, the
 *   server runs as `node`, and git refuses a repository it thinks belongs to
 *   somebody else — "detected dubious ownership", which would reach the screen
 *   as "not a git repository" for a repository that is perfectly fine.
 * - `core.fsmonitor=` is the price of the line above, paid rather than owed.
 *   The ownership check exists because a repository's CONFIG can name programs
 *   git will run; turning the check off without disabling the one such knob
 *   that fires on a read would be trading a wrong error for a real hole.
 */
const GIT_ENV = {
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'safe.directory',
  GIT_CONFIG_VALUE_0: '*',
  GIT_CONFIG_KEY_1: 'core.fsmonitor',
  GIT_CONFIG_VALUE_1: '',
}

/** Runs one git command in a repository, read-only. */
export function gitIn(repo) {
  return async (args) => {
    const { stdout } = await execFileAsync('git', ['-C', repo, ...args], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, ...GIT_ENV },
    })
    return stdout
  }
}

/** Whether `git` is on this machine at all. Asked once, said out loud. */
export async function hasGit() {
  try {
    await execFileAsync('git', ['--version'], { timeout: TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

/**
 * The frontmatter, as this contract writes it: flat YAML between two `---`.
 *
 * Hand-parsed, and that is a decision rather than a shortcut. The shape is
 * closed — scalars, inline lists, nothing nested — so a YAML library would be
 * a dependency vendored into a plugin folder to read eight keys. What it costs
 * is being strict about the shape, which is why anything unreadable comes back
 * as a diagnostic instead of as a guess.
 *
 * @returns `{ fields, body }`, or `undefined` when the file has no frontmatter.
 */
export function parseFrontmatter(text) {
  const normalised = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!normalised.startsWith('---\n')) return undefined
  const end = normalised.indexOf('\n---', 3)
  if (end === -1) return undefined

  const head = normalised.slice(4, end + 1)
  const body = normalised.slice(end + 4).replace(/^\n/, '')
  const fields = {}
  let last

  for (const line of head.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue

    // A block list continues the key above it — `depends_on:` then `- id`.
    // The contract writes lists inline, but a fiche somebody typed by hand
    // is still a fiche, and refusing it would be pedantry with a diagnostic.
    const dash = /^\s*-\s+(.*)$/.exec(line)
    if (dash && last) {
      if (!Array.isArray(fields[last])) fields[last] = []
      fields[last].push(scalar(dash[1]))
      continue
    }

    const pair = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    const [, key, raw] = pair
    last = key
    fields[key] = raw.trim() === '' ? null : value(raw.trim())
  }

  return { fields, body }
}

/** `[a, b]` is a list; anything else is one value. */
function value(raw) {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    return inner === '' ? [] : inner.split(',').map((part) => scalar(part.trim()))
  }
  return scalar(raw)
}

/** One YAML scalar in the closed set this contract uses. */
function scalar(raw) {
  const text = raw.trim()
  if (text === 'null' || text === '~') return null
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  if (/^-?\d+$/.test(text)) return Number(text)
  return text
}

/**
 * One fiche, validated against the schema — or the reason it is unusable.
 *
 * Two failure postures, deliberately different. A file with no frontmatter at
 * all, or missing an `id`, cannot enter the graph: there is nothing to point
 * at it with. Everything else degrades — an unknown `status` becomes a fiche
 * the screen draws as faulty rather than a fiche it drops, because a lot that
 * disappears from the list is a lot nobody remembers to fix.
 *
 * @returns `{ item }` or `{ problem }`.
 */
export function readFiche(text, { repo, path, source }) {
  const parsed = parseFrontmatter(text)
  if (!parsed) {
    return { problem: { code: 'no-frontmatter', repo, path, message: `${path} has no frontmatter` } }
  }

  const { fields, body } = parsed
  const id = typeof fields.id === 'string' ? fields.id.trim() : ''
  if (id === '') {
    return { problem: { code: 'no-id', repo, path, message: `${path} declares no id` } }
  }

  const type = fields.type === 'question' ? 'question' : 'lot'
  const depends = fields.depends_on
  const dependsOn = (Array.isArray(depends) ? depends : depends == null ? [] : [depends])
    .filter((dep) => typeof dep === 'string' && dep.trim() !== '')
    .map((dep) => dep.trim())

  const item = {
    id,
    repo,
    path,
    source,
    type,
    title: typeof fields.title === 'string' && fields.title !== '' ? fields.title : id,
    status: typeof fields.status === 'string' ? fields.status.trim() : '',
    priority: typeof fields.priority === 'number' ? fields.priority : null,
    dependsOn,
    spec: typeof fields.spec === 'string' ? fields.spec : null,
    branch: typeof fields.branch === 'string' && fields.branch !== 'null' ? fields.branch : null,
    updated: typeof fields.updated === 'string' ? fields.updated : null,
  }

  const problems = []
  // The file name mirrors the id by contract. Reported rather than corrected:
  // dependencies point at the ID, so a mismatch means every link into this
  // fiche still resolves — but the next person to open the folder will not
  // find it where its id says it lives.
  const named = path.slice(path.lastIndexOf('/') + 1, -3)
  if (named !== id) {
    problems.push({
      code: 'id-mismatch',
      repo,
      path,
      id,
      message: `${path} holds the fiche ${id} — the file name and the id must agree`,
    })
  }
  if (fields.type !== undefined && fields.type !== 'lot' && fields.type !== 'question') {
    problems.push({
      code: 'bad-type',
      repo,
      path,
      id,
      message: `${id} declares type "${String(fields.type)}"; read as a lot`,
    })
  }

  return { item, body, problems }
}

/**
 * Every fiche one repository holds, read by the rule at the top of this file.
 *
 * @param repo   absolute path of the repository to read
 * @param run    a git runner, injected so the rule can be tested against a
 *               scripted git as well as against a real repository
 * @returns `{ items, bodies, problems }`
 */
export async function scanRepo(repo, run = gitIn(repo)) {
  const problems = []
  const items = new Map()
  const bodies = new Map()

  try {
    await run(['rev-parse', '--git-dir'])
  } catch {
    return {
      items: [],
      bodies,
      problems: [{ code: 'not-a-repo', repo, message: `${repo} is not a git repository` }],
    }
  }

  try {
    await run(['rev-parse', '--verify', '--quiet', 'refs/heads/main'])
  } catch {
    // Said out loud rather than guessed at. Falling back to HEAD would read
    // whatever branch the checkout happens to sit on, which is exactly the
    // "some branch somebody left open" this rule exists to exclude.
    return {
      items: [],
      bodies,
      problems: [{ code: 'no-main', repo, message: `${repo} has no local main branch to read` }],
    }
  }

  const onMain = await listFiches(run, 'main')
  if (onMain.length === 0) {
    problems.push({ code: 'no-lots', repo, message: `${repo} carries no ${LOTS}/ on main` })
  }

  for (const path of onMain) {
    const read = await show(run, 'main', path)
    if (read === undefined) continue
    const { item, body, problem, problems: soft } = readFiche(read, { repo, path, source: 'main' })
    if (problem) problems.push(problem)
    if (soft) problems.push(...soft)
    if (item) {
      items.set(item.id, item)
      bodies.set(item.id, body)
    }
  }

  // The branch pass. Only branches `main` NAMES, and each one visited once
  // however many fiches point at it.
  const named = new Map()
  for (const item of items.values()) {
    if (item.branch && !named.has(item.branch)) named.set(item.branch, item)
  }

  for (const [branch, owner] of named) {
    if (!SAFE_REF.test(branch)) {
      problems.push({
        code: 'bad-branch',
        repo,
        id: owner.id,
        branch,
        message: `${owner.id} names a branch this plugin will not hand to git: "${branch}"`,
      })
      continue
    }

    let exists = true
    try {
      await run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
    } catch {
      exists = false
    }
    if (!exists) {
      // Merged and deleted, most often — which is the normal end of a lot,
      // not a fault. Reported as information: `main` still holds the fiche
      // and it is the one shown, so nothing is lost, but a fiche that says
      // `code` on a branch nobody can find is worth a word.
      problems.push({
        code: 'branch-gone',
        repo,
        id: owner.id,
        branch,
        severity: 'info',
        message: `${owner.id} names the branch ${branch}, which no longer exists here`,
      })
      continue
    }

    const onBranch = await listFiches(run, branch)
    for (const path of onBranch) {
      const known = [...items.values()].find((item) => item.path === path)
      const isNew = known === undefined
      // Its own fiche, or a question the branch invented. A branch's version
      // of somebody ELSE'S lot is ignored: a coder only ever writes their own
      // fiche, so anything else there is a stale copy from before the branch
      // was cut, and `main` is fresher.
      if (!isNew && known.branch !== branch) continue

      const read = await show(run, branch, path)
      if (read === undefined) continue
      const parsed = readFiche(read, { repo, path, source: `branch:${branch}` })
      if (parsed.problem) {
        problems.push(parsed.problem)
        continue
      }
      if (parsed.problems) problems.push(...parsed.problems)
      if (isNew && parsed.item.type !== 'question') continue

      items.set(parsed.item.id, parsed.item)
      bodies.set(parsed.item.id, parsed.body)
    }
  }

  return { items: [...items.values()], bodies, problems }
}

/** `.agent/lots/*.md` as one ref holds them, README excluded. */
async function listFiches(run, ref) {
  try {
    const out = await run(['ls-tree', '-z', '--name-only', ref, '--', `${LOTS}/`])
    return out.split('\0').filter((path) => path !== '' && isFiche(path)).sort()
  } catch {
    return []
  }
}

/** One file at one ref, or `undefined` if it is not there any more. */
async function show(run, ref, path) {
  try {
    return await run(['show', `${ref}:${path}`])
  } catch {
    return undefined
  }
}

/**
 * A fiche's history — which is `git log` on its file, and nothing else.
 *
 * The contract says so in as many words: no history FIELD exists, because a
 * field would have to be maintained by hand beside the thing that already
 * records it perfectly. `--follow` so a fiche that was renamed keeps its past.
 */
export async function timelineOf(item, run) {
  const refs = item.source.startsWith('branch:') ? [item.source.slice(7), 'main'] : ['main']
  const seen = new Set()
  const entries = []

  for (const ref of refs) {
    if (!SAFE_REF.test(ref)) continue
    let out
    try {
      out = await run(['log', '--follow', '--format=%H%x1f%aI%x1f%an%x1f%s', ref, '--', item.path])
    } catch {
      continue
    }
    for (const line of out.split('\n')) {
      if (line.trim() === '') continue
      const [sha, date, author, subject] = line.split('\x1f')
      if (seen.has(sha)) continue
      seen.add(sha)
      entries.push({ sha: sha.slice(0, 8), date, author, subject, ref })
    }
  }

  return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}
