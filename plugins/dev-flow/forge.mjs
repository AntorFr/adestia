/**
 * A source that reads a repository WITHOUT holding it.
 *
 * This exists because of a design fault worth writing down. The first reader
 * assumed a clone on the local disk — true where the plugin was written (a
 * laptop full of repositories), false where it runs (a pod that holds the two
 * or three repositories it codes in, and none of the others). Cloning
 * repositories so that a screen can read eight markdown files is replicating a
 * whole history to look at its smallest file, and it drags in the thing nobody
 * wants: something has to `git fetch`, on a schedule, or the screen quietly
 * shows last week.
 *
 * The fiches are already published. A forge serves any path at any ref over
 * HTTP, so the entire reading rule — `main` as the index, a branch tip for its
 * own fiche, the questions born at that tip, the file's own history — is a
 * handful of GETs and no disk at all.
 *
 * ⚠️ This makes the plugin speak GITHUB, which the local source does not: it
 * is an API, not a protocol. That is a real coupling and it is why BOTH
 * sources exist rather than this one replacing the other. A repository on the
 * same disk is read with git, whoever hosts it; a repository somewhere else is
 * read here, as long as "somewhere else" is a forge this file understands.
 */

import { LOTS, isFiche } from './read.mjs'

const API = 'https://api.github.com'
/** A forge that has not answered by now is a forge the screen will not wait on. */
const TIMEOUT_MS = 12_000

/** `owner/repo`, and nothing that could be a path or a URL. */
export const SLUG = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * A repository on a forge, as the reading rule wants to see it.
 *
 * @param slug   `owner/repo`
 * @param token  a read-only credential; without it only public repositories
 *               answer, and a private one is reported as unreachable rather
 *               than as empty
 * @param call   the fetch to use, injected so the rule can be tested without
 *               a network
 */
export function forgeSource(slug, token, call = fetch) {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }

  /**
   * One GET. Returns `undefined` for a 404 — an absence, which the rule reads
   * as "no such ref" or "no such file" — and throws for anything else, because
   * a rate limit or a 500 is NOT an empty repository and must never be drawn
   * as one.
   */
  async function get(path, accept) {
    // No trailing slash when the path is empty: `/repos/owner/name/` and
    // `/repos/owner/name` are not the same URL to every proxy in between.
    const response = await call(`${API}/repos/${slug}${path ? `/${path}` : ''}`, {
      headers: accept ? { ...headers, accept } : headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`the forge answered ${response.status} for ${slug}/${path}`)
    }
    return response
  }

  return {
    repo: slug,
    kind: 'forge',

    async ready() {
      try {
        // The repository itself, before anything else: a typo in the slug, a
        // private repository with no token and a deleted one all answer 404
        // here, and all three deserve the same sentence — nobody can tell them
        // apart from the outside, and pretending otherwise would be inventing
        // a diagnosis.
        if ((await get('')) === undefined) {
          return {
            code: 'no-such-repo',
            repo: slug,
            message: `${slug} is not reachable on the forge — wrong name, or the token cannot see it`,
          }
        }
        if (!(await this.hasRef('main'))) {
          return { code: 'no-main', repo: slug, message: `${slug} has no main branch to read` }
        }
      } catch (error) {
        return { code: 'forge-error', repo: slug, message: error.message }
      }
      return undefined
    },

    async hasRef(ref) {
      return (await get(`branches/${encodeURIComponent(ref)}`)) !== undefined
    },

    async list(ref) {
      const response = await get(`contents/${LOTS}?ref=${encodeURIComponent(ref)}`)
      if (response === undefined) return []
      const entries = await response.json()
      if (!Array.isArray(entries)) return []
      return entries
        .filter((entry) => entry?.type === 'file' && isFiche(entry.path ?? ''))
        .map((entry) => entry.path)
        .sort()
    },

    async show(ref, path) {
      // `raw` rather than the JSON envelope: the base64 round trip costs a
      // decode and caps out at 1 MB, and a fiche is text.
      const response = await get(
        `contents/${path}?ref=${encodeURIComponent(ref)}`,
        'application/vnd.github.raw',
      )
      return response === undefined ? undefined : response.text()
    },

    /**
     * The file's history, which the forge answers as well as git does.
     *
     * No `--follow` here — the API has no equivalent, so a fiche that was
     * renamed shows the history of its current name. Said plainly rather than
     * faked: the alternative is walking every commit of the repository to
     * detect a rename, which is exactly the "hold the whole history" this
     * source exists to avoid.
     */
    async timeline(item, refs) {
      const seen = new Set()
      const entries = []
      for (const ref of refs) {
        let response
        try {
          response = await get(
            `commits?path=${encodeURIComponent(item.path)}&sha=${encodeURIComponent(ref)}&per_page=30`,
          )
        } catch {
          continue
        }
        if (response === undefined) continue
        for (const commit of await response.json()) {
          if (seen.has(commit.sha)) continue
          seen.add(commit.sha)
          entries.push({
            sha: String(commit.sha).slice(0, 8),
            date: commit.commit?.author?.date ?? null,
            author: commit.commit?.author?.name ?? null,
            subject: String(commit.commit?.message ?? '').split('\n')[0],
            ref,
          })
        }
      }
      return entries
    },
  }
}
