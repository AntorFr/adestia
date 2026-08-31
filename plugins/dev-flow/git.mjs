/**
 * A source that reads a repository sitting on this disk.
 *
 * The one thing to understand about this file: **nothing here touches a
 * working tree.** `ls-tree` and `show` read the object database at a named
 * ref; `HEAD` never moves, no branch is ever checked out, and with
 * `GIT_OPTIONAL_LOCKS=0` not even the index file is refreshed. That is what
 * makes it safe to point at a repository somebody is coding in RIGHT NOW —
 * which is the normal case here, since the pod that will run this plugin is
 * the pod that does the coding. A reader that checked out branches to see them
 * would corrupt the work it is trying to describe.
 *
 * Local is the CHEAP source, and only in one situation: when the repository is
 * already on the disk for another reason. Cloning repositories so that a screen
 * can read eight markdown files is the mistake `forge.mjs` exists to avoid.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { LOTS, isFiche } from './read.mjs'

const execFileAsync = promisify(execFile)

/** A git call that has not answered by now is a repository nobody should wait on. */
const TIMEOUT_MS = 10_000
const MAX_BUFFER = 4 * 1024 * 1024

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
 * A local repository, as the reading rule wants to see it.
 *
 * @param repo absolute path of the repository
 * @param run  a git runner, injected so the rule can be driven by a scripted
 *             git as well as by a real one
 */
export function gitSource(repo, run = gitIn(repo)) {
  return {
    repo,
    kind: 'git',

    /** Is there a repository here at all, and can we read `main` from it? */
    async ready() {
      try {
        await run(['rev-parse', '--git-dir'])
      } catch {
        return { code: 'not-a-repo', repo, message: `${repo} is not a git repository` }
      }
      // Said out loud rather than guessed at. Falling back to HEAD would read
      // whatever branch the checkout happens to sit on, which is exactly the
      // "some branch somebody left open" the rule exists to exclude.
      if (!(await this.hasRef('main'))) {
        return { code: 'no-main', repo, message: `${repo} has no local main branch to read` }
      }
      return undefined
    },

    async hasRef(ref) {
      try {
        await run(['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`])
        return true
      } catch {
        return false
      }
    },

    async list(ref) {
      try {
        const out = await run(['ls-tree', '-z', '--name-only', ref, '--', `${LOTS}/`])
        return out.split('\0').filter((path) => path !== '' && isFiche(path)).sort()
      } catch {
        return []
      }
    },

    async show(ref, path) {
      try {
        return await run(['show', `${ref}:${path}`])
      } catch {
        return undefined
      }
    },

    /**
     * A fiche's history — which is `git log` on its file, and nothing else.
     *
     * The contract says so in as many words: no history FIELD exists, because
     * a field would have to be maintained by hand beside the thing that
     * already records it perfectly. `--follow` so a fiche that was renamed
     * keeps its past.
     */
    async timeline(item, refs) {
      const seen = new Set()
      const entries = []
      for (const ref of refs) {
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
      return entries
    },
  }
}
