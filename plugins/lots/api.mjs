/**
 * The lots' server side: a window onto repositories, with the glass sealed.
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
 * `LOTS_REPOS`. Not a secret in the credential sense, and the manifest says
 * so — but a list of absolute paths a plugin may read IS the operator's
 * business rather than a document's, and a page in the workspace could be
 * rewritten by anything with a pen into a file-read primitive pointed at
 * whatever it liked. Configuration that grants reach lives in the config.
 */

import { buildGraph } from './graph.mjs'
import { gitIn, hasGit, scanRepo, timelineOf } from './read.mjs'

/**
 * How long a scan is reused.
 *
 * Every read spawns a handful of git processes, and the screen refetches
 * whenever it is opened. Short enough that a commit made in another window
 * shows up on the next look, long enough that walking through four items does
 * not re-read two repositories four times. The refresh button bypasses it: an
 * explicit ask deserves the real answer.
 */
const TTL_MS = 15_000

/** `:` and `,` both separate; neither appears in a POSIX path anybody has. */
export function readRepos(configured) {
  return String(configured ?? '')
    .split(/[:,\n]/)
    .map((path) => path.trim())
    .filter((path) => path !== '')
}

/** The name a repository goes by on screen — its folder, not its whole path. */
export const nameOf = (path) => path.replace(/\/+$/, '').split('/').pop() || path

export default async function api(app, opts) {
  const repos = readRepos(opts.secrets?.LOTS_REPOS)
  let cached

  async function scan() {
    if (cached && cached.until > Date.now()) return cached.value

    const problems = []
    const items = []
    const bodies = new Map()
    const git = await hasGit()

    if (!git) {
      // Named, because the alternative is a screen that says "no lots" on an
      // instance whose repositories are perfectly fine. This plugin reads git
      // and will not fall back to the working tree — see `read.mjs`.
      problems.push({
        code: 'no-git',
        message: 'git is not installed here, and every fiche is read through it',
      })
    }

    const scanned = []
    for (const repo of repos) {
      if (!git) {
        scanned.push({ path: repo, name: nameOf(repo), items: 0, ok: false })
        continue
      }
      const result = await scanRepo(repo, gitIn(repo))
      problems.push(...result.problems)
      items.push(...result.items)
      for (const [id, body] of result.bodies) bodies.set(id, body)
      scanned.push({
        path: repo,
        name: nameOf(repo),
        items: result.items.length,
        ok: !result.problems.some((problem) => problem.severity !== 'info'),
      })
    }

    const graph = buildGraph(items)
    const value = {
      configured: repos.length > 0,
      git,
      repos: scanned,
      items: graph.items,
      order: graph.order,
      problems: [...problems, ...graph.problems],
      bodies,
      scannedAt: new Date().toISOString(),
    }
    cached = { until: Date.now() + TTL_MS, value }
    return value
  }

  app.get('/graph', async (request) => {
    if (request.query.fresh === '1') cached = undefined
    const { bodies: _prose, ...graph } = await scan()
    // The bodies stay behind: prose for every fiche of every repository on a
    // screen that shows titles is a payload nobody reads. `/item` serves the
    // one that is open.
    return graph
  })

  /**
   * One fiche in full: its prose, and its history.
   *
   * The id is checked against what was SCANNED rather than sanitised. A path
   * built from a query string is a file-read primitive however carefully it is
   * escaped; an id that must already be in the graph cannot name a file the
   * plugin was not going to read anyway.
   */
  app.get('/item', async (request, reply) => {
    const { items, bodies, git } = await scan()
    const item = items.find((candidate) => candidate.id === request.query.id)
    if (!item) return reply.code(404).send({ error: 'no such item' })

    const timeline = git ? await timelineOf(item, gitIn(item.repo)) : []
    return { item, body: bodies.get(item.id) ?? '', timeline }
  })
}
