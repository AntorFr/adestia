/**
 * The reading rule, and the fiche format it reads. No git here, no HTTP.
 *
 * The rule the scanned repositories publish, and it is not an implementation
 * detail: **a state exists only once it is committed**. A fiche edited and not
 * committed is invisible on purpose, so reading whatever a checkout happens to
 * have open — the obvious thing, and the wrong one — would show a state nobody
 * else can see and that no merge will ever carry.
 *
 * Hence, per repository:
 *
 * 1. `main` is the index, and the ONLY index: every fiche it holds is read at
 *    `main`, whatever a working tree happens to contain.
 * 2. A fiche that names a `branch` is re-read at that branch's tip, which wins
 *    for ITS OWN fiche until the branch merges — that is where the coder
 *    commits the state changes that go with the work. New `question` fiches at
 *    that tip are picked up too: a code→design hand-back invents one, and it
 *    is precisely the fiche somebody needs to see.
 * 3. Branches are never enumerated. A branch `main` does not name does not
 *    exist here — which is what keeps a dozen stale branches from turning into
 *    a dozen phantom chantiers.
 *
 * A SOURCE answers four questions, and the rule knows nothing else about it:
 * `ready()`, `hasRef(ref)`, `list(ref)`, `show(ref, path)` — plus `timeline()`
 * for one fiche on demand. `git.mjs` answers them from a repository on this
 * disk; `forge.mjs` answers them over HTTP, holding nothing. The rule is
 * written once because it is the part that must not diverge: two readers with
 * two ideas of what `main` means would be two products.
 */

export const LOTS = '.agent/lots'

/** How a lot file is named, and the one file in the folder that is not one. */
export const isFiche = (path) => path.endsWith('.md') && !path.endsWith('/README.md')

/**
 * A branch name, as a fiche wrote it.
 *
 * Checked rather than trusted, and for two different reasons depending on who
 * reads it: handed to `git` a name beginning with `-` is an OPTION, and handed
 * to a forge it lands in a URL. The repositories are the operator's own, so
 * this is not a hostile input — it is the check that costs one line and
 * removes a whole class of question.
 */
const SAFE_REF = /^(?!-)[A-Za-z0-9._/-]{1,200}$/

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
 * @param source anything answering `ready/hasRef/list/show` — see `git.mjs`
 *               and `forge.mjs`
 * @returns `{ items, bodies, problems }`
 */
export async function scanSource(source) {
  const repo = source.repo
  const problems = []
  const items = new Map()
  const bodies = new Map()

  const blocked = await source.ready()
  if (blocked) return { items: [], bodies, problems: [blocked] }

  const onMain = await source.list('main')
  if (onMain.length === 0) {
    // The same absence means two different things, and conflating them would
    // send somebody looking in the wrong place. On disk, `main` has no fiches.
    // On a forge, `main` has no fiches THAT WERE PUSHED — and a repository
    // whose author commits locally looks identical to one that never had any.
    problems.push(
      source.kind === 'forge'
        ? {
            code: 'no-lots-pushed',
            repo,
            message: `${repo} carries no ${LOTS}/ on the main that reached the forge`,
          }
        : { code: 'no-lots', repo, message: `${repo} carries no ${LOTS}/ on main` },
    )
  }

  for (const path of onMain) {
    const read = await source.show('main', path)
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
        message: `${owner.id} names a branch this plugin will not pass on: "${branch}"`,
      })
      continue
    }

    if (!(await source.hasRef(branch))) {
      // Two very different absences, and this is the distinction that decides
      // whether the screen is honest.
      //
      // On DISK, a branch that is not there was merged and deleted — the
      // normal end of a lot. `main` holds the fiche, `main` is what is shown,
      // nothing is lost, and a word is enough.
      //
      // On a FORGE, it usually means the branch was never pushed — and under a
      // doctrine where working branches stay local (this galaxy's own), it
      // will NEVER be there. The fiche shown is then `main`'s, which is
      // exactly the version the coder's branch supersedes: the hand-back, the
      // question raised mid-work, the status that moved on. Saying "gone"
      // there would claim the work ended when it is in flight and out of
      // sight, so this source says what is true — it cannot see it.
      problems.push(
        source.kind === 'forge'
          ? {
              code: 'branch-not-pushed',
              repo,
              id: owner.id,
              branch,
              severity: 'info',
              message: `${owner.id} is in flight on ${branch}, which never reached the forge — what is shown is main's, and may be behind`,
            }
          : {
              code: 'branch-gone',
              repo,
              id: owner.id,
              branch,
              severity: 'info',
              message: `${owner.id} names the branch ${branch}, which no longer exists here`,
            },
      )
      continue
    }

    for (const path of await source.list(branch)) {
      const known = [...items.values()].find((item) => item.path === path)
      const isNew = known === undefined
      // Its own fiche, or a question the branch invented. A branch's version
      // of somebody ELSE'S lot is ignored: a coder only ever writes their own
      // fiche, so anything else there is a stale copy from before the branch
      // was cut, and `main` is fresher.
      if (!isNew && known.branch !== branch) continue

      const read = await source.show(branch, path)
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

/**
 * A fiche's history: the refs it lives on, newest commit first.
 *
 * No history FIELD exists in the schema, and that is deliberate — a field
 * would have to be maintained by hand beside the thing that already records it
 * perfectly. Which refs to ask about is the rule's business (a fiche read at a
 * branch tip has two), how to answer is the source's.
 */
export async function timelineOf(item, source) {
  const refs = (item.source.startsWith('branch:') ? [item.source.slice(7), 'main'] : ['main']).filter(
    (ref) => SAFE_REF.test(ref),
  )
  const entries = await source.timeline(item, refs)
  return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}
