/**
 * Dev flow's server side: a window onto repositories, with the glass sealed.
 *
 * One constraint governs every line here, and it is the plugin's whole reason
 * to exist in this shape: **it never writes**. Not the fiches, not a sibling
 * overlay, not a lock, not an index. The workbench and the trips app both keep
 * a state file beside the data they draw; this one keeps nothing, because the
 * state it shows belongs to git and to the people who commit — Monsieur, who
 * specifies and decides, and the agents, who work. Adestia is a window here,
 * not a pen. Every button on the screen it feeds either navigates or drops a
 * sentence in the composer for a person to send.
 *
 * WHERE it looks is operator configuration, arriving through the one channel
 * an instance has for handing a named value to a plugin: a declared secret,
 * `DEV_FLOW_REPOS`. Not a secret in the credential sense, and the manifest
 * says so — but a list of repositories a plugin may read IS the operator's
 * business rather than a document's, and a page in the workspace could be
 * rewritten by anything with a pen into a read primitive pointed at whatever
 * it liked. Configuration that grants reach lives in the configuration.
 *
 * Each entry says its own source by its SHAPE, which is the whole of the
 * syntax: `/repos/tessera` is a repository on this disk, `AntorFr/tessera` is
 * one on a forge, read over HTTP with nothing cloned. The second is the normal
 * case — a pod holds the repositories it CODES in, not the ones it watches —
 * and the first costs nothing when the repository happens to be there anyway.
 */

import { buildGraph } from './graph.mjs'
import { gitIn, gitSource, hasGit } from './git.mjs'
import { SLUG, forgeSource } from './forge.mjs'
import { scanSource, timelineOf } from './read.mjs'

/**
 * How long a scan is reused.
 *
 * A local scan spawns a handful of git processes; a forge scan spends a
 * handful of requests against somebody's rate limit. Short enough that a
 * commit made a minute ago shows up on the next look, long enough that walking
 * through four fiches does not re-read two repositories four times. The
 * refresh button bypasses it: an explicit ask deserves the real answer.
 */
const TTL_MS = 15_000

/** `:` and `,` both separate; neither appears in a path or a slug. */
export function readRepos(configured) {
  return String(configured ?? '')
    .split(/[:,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Which reader an entry asks for, from its shape alone.
 *
 * A path is anything that looks like one — absolute, relative, or `~`-rooted.
 * `owner/repo` is a forge slug. Anything else is refused BY NAME rather than
 * guessed at: an entry nobody can classify is a line of configuration somebody
 * meant something by, and picking a reader for it would answer the wrong
 * question quietly.
 */
export function kindOf(entry) {
  if (entry.startsWith('/') || entry.startsWith('.') || entry.startsWith('~')) return 'local'
  return SLUG.test(entry) ? 'forge' : 'unknown'
}

/** The name a repository goes by on screen — its last segment. */
export const nameOf = (entry) => entry.replace(/\/+$/, '').split('/').pop() || entry

export default async function api(app, opts) {
  const entries = readRepos(opts.secrets?.DEV_FLOW_REPOS)
  const token = opts.secrets?.DEV_FLOW_TOKEN ?? ''
  let cached

  /** The source for one entry, or the reason there is none. */
  async function sourceFor(entry, git) {
    const kind = kindOf(entry)
    if (kind === 'unknown') {
      return {
        problem: {
          code: 'bad-entry',
          repo: entry,
          message: `"${entry}" is neither a path nor an owner/repo — nothing was read for it`,
        },
      }
    }
    if (kind === 'local' && !git) {
      // Named, because the alternative is a screen that says "no fiches" on an
      // instance whose repositories are perfectly fine. The local reader goes
      // through git and will not fall back to a working tree — see `git.mjs`.
      return {
        problem: {
          code: 'no-git',
          repo: entry,
          message: 'git is not installed here, and a local repository is read through it',
        },
      }
    }
    return { source: kind === 'local' ? gitSource(entry) : forgeSource(entry, token) }
  }

  async function scan() {
    if (cached && cached.until > Date.now()) return cached.value

    const problems = []
    const items = []
    const bodies = new Map()
    const sources = new Map()
    // Asked once per scan rather than once per repository: spawning `git
    // --version` for each entry of a list that is usually forge slugs is a
    // process nobody needed.
    const git = entries.some((entry) => kindOf(entry) === 'local') ? await hasGit() : false

    const scanned = []
    for (const entry of entries) {
      const { source, problem } = await sourceFor(entry, git)
      if (problem) {
        problems.push(problem)
        scanned.push({ path: entry, name: nameOf(entry), kind: kindOf(entry), items: 0, ok: false })
        continue
      }

      sources.set(entry, source)
      const result = await scanSource(source)
      problems.push(...result.problems)
      items.push(...result.items)
      for (const [id, body] of result.bodies) bodies.set(id, body)
      scanned.push({
        path: entry,
        name: nameOf(entry),
        kind: kindOf(entry),
        items: result.items.length,
        ok: !result.problems.some((problem) => problem.severity !== 'info'),
      })
    }

    const graph = buildGraph(items)
    const value = {
      configured: entries.length > 0,
      repos: scanned,
      items: graph.items,
      order: graph.order,
      problems: [...problems, ...graph.problems],
      bodies,
      sources,
      scannedAt: new Date().toISOString(),
    }
    cached = { until: Date.now() + TTL_MS, value }
    return value
  }

  app.get('/graph', async (request) => {
    if (request.query.fresh === '1') cached = undefined
    // The bodies and the live sources stay behind: prose for every fiche of
    // every repository on a screen that shows titles is a payload nobody
    // reads, and a source is a closure.
    const { bodies: _prose, sources: _readers, ...graph } = await scan()
    return graph
  })

  /**
   * One fiche in full: its prose, and its history.
   *
   * The id is checked against what was SCANNED rather than sanitised. A path
   * built from a query string is a read primitive however carefully it is
   * escaped; an id that must already be in the graph cannot name a file the
   * plugin was not going to read anyway.
   */
  app.get('/item', async (request, reply) => {
    const { items, bodies, sources } = await scan()
    const item = items.find((candidate) => candidate.id === request.query.id)
    if (!item) return reply.code(404).send({ error: 'no such item' })

    const source = sources.get(item.repo)
    let timeline = []
    if (source) {
      try {
        timeline = await timelineOf(item, source)
      } catch {
        // A history that will not load costs the history, never the fiche:
        // the prose and the state are what somebody opened this for.
        timeline = []
      }
    }
    return { item, body: bodies.get(item.id) ?? '', timeline }
  })
}

// Re-exported so a caller holding a path can still build the local reader
// directly — the tests, and anything that wants git without the config layer.
export { gitIn, gitSource }
