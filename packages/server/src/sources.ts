/**
 * Extensions that live in another repository.
 *
 * Adestia ships eleven plugins and reads one directory, which made a plugin
 * from somewhere else an operator's plumbing problem: bake it into a derived
 * image, or mount it — in Kubernetes, an init container and a volume per
 * instance, for every plugin. This file is the other half of the answer: a
 * source is DECLARED in the config, fetched into the data directory, and
 * handed to discovery as one more root.
 *
 * Three properties it exists to guarantee:
 *
 * 1. **The fetch never decides anything.** It produces directories; discovery
 *    reads them exactly as it reads the bundled one. Nothing downstream —
 *    serving, APIs, skills, vocabulary — learns that a plugin came from
 *    elsewhere, which is the same ignorance that makes a plugin shippable at
 *    all.
 * 2. **A forge that is down costs a refresh, never a boot.** The checkout is
 *    kept in `dataDir`, so an instance that cannot reach the network starts on
 *    what it already has and SAYS so. A boot that fails because GitHub is
 *    having a morning is a worse product than a stale plugin.
 * 3. **Nothing is implicit.** A source names its ref, and what is fetched is
 *    code this process will run: a plugin may carry an API, a setup script and
 *    an MCP server. `ref` has no default for exactly that reason.
 */

import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import type { ExtensionSource } from './config/types.js'
import type { DiscoveryProblem } from './extensions.js'

const execFileAsync = promisify(execFile)

/**
 * How long any single git command gets.
 *
 * Boot waits on this, so it is a budget rather than a generosity: a forge that
 * hangs must degrade to the cached copy while somebody is still watching the
 * logs, not hold the instance closed for as long as TCP feels like.
 */
const GIT_TIMEOUT_MS = 60_000

export interface FetchedSources {
  /** Discovery roots, in the order they were declared. */
  readonly roots: readonly string[]
  readonly problems: readonly DiscoveryProblem[]
}

/**
 * The environment a git command runs in.
 *
 * `GIT_TERMINAL_PROMPT=0` is the important one: without it, a private
 * repository with no credentials does not fail, it ASKS — and a boot that is
 * waiting for a username nobody will type looks exactly like a hang.
 *
 * A token travels in the environment rather than in `argv`. Both are visible
 * to this user, but `/proc/<pid>/cmdline` is world-readable and
 * `/proc/<pid>/environ` is not, and a credential in a command line also lands
 * in every process listing anybody runs to debug the container.
 */
function gitEnv(token?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  if (token === undefined) return env
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return {
    ...env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
  }
}

async function git(dir: string, args: readonly string[], token?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd: dir,
    env: gitEnv(token),
    timeout: GIT_TIMEOUT_MS,
  })
  return stdout.trim()
}

/** The commit a cache is parked on, or nothing when there is no usable one. */
async function headOf(dir: string): Promise<string | undefined> {
  try {
    return await git(dir, ['rev-parse', '--short', 'HEAD'])
  } catch {
    // Either no repository, or one that was initialised and never fetched —
    // both mean "there is nothing here to fall back on", which is the only
    // question this answers.
    return undefined
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** What git said, on one line: its stderr if it wrote any, else the message. */
function gitSaid(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr
  const said = (stderr && stderr.trim()) || (error as Error).message
  return said.split('\n')[0] ?? said
}

/**
 * Fetch every declared source, and say which directories came of it.
 *
 * Never throws: a source that cannot be had is a problem in the band and a
 * line in the log, like every other extension failure.
 *
 * @param cacheDir where clones live — `<dataDir>/extensions`. Inside the data
 *   directory rather than beside the bundled plugins because that is the one
 *   place an instance is guaranteed to be able to write and to KEEP: the
 *   plugins directory is part of a read-only image, and a cache that does not
 *   survive a restart is a network dependency at every boot.
 */
export async function fetchSources(
  sources: readonly ExtensionSource[],
  cacheDir: string,
  log: (message: string) => void,
): Promise<FetchedSources> {
  if (sources.length === 0) return { roots: [], problems: [] }

  const roots: string[] = []
  const problems: DiscoveryProblem[] = []

  for (const source of sources) {
    if (source.kind === 'dir') {
      const dir = resolve(source.dir)
      if (await isDirectory(dir)) {
        roots.push(dir)
        log(`extensions: reading ${dir}`)
      } else {
        problems.push({
          id: source.dir,
          severity: 'refused',
          code: 'source-missing',
          params: { source: source.dir },
          reason: `is declared as an extension source but is not a directory on this instance`,
        })
      }
      continue
    }

    const dir = join(cacheDir, source.name)
    await mkdir(dir, { recursive: true })
    const cached = await headOf(dir)

    try {
      if (!(await isDirectory(join(dir, '.git')))) {
        await git(dir, ['init', '--quiet'], source.token)
        await git(dir, ['remote', 'add', 'origin', source.repo], source.token)
      } else {
        // The address can change under a name that does not — a repository
        // moved, a fork taken over. Kept in step rather than silently fetching
        // from wherever the cache was first filled.
        await git(dir, ['remote', 'set-url', 'origin', source.repo], source.token)
      }

      // Shallow on purpose: what is wanted is a folder at one commit, and a
      // plugin's history is somebody else's repository. `--depth 1` against a
      // ref name covers a tag, a branch and — on the forges that allow it — a
      // commit, which is why the fetch takes the ref rather than a branch flag.
      await git(dir, ['fetch', '--depth', '1', 'origin', source.ref], source.token)
      await git(dir, ['reset', '--hard', '--quiet', 'FETCH_HEAD'], source.token)

      const head = (await headOf(dir)) ?? '?'
      log(`extensions: ${source.repo} at ${source.ref} (${head})`)
    } catch (error) {
      if (cached === undefined) {
        // Nothing to fall back on: whatever this source carries is simply not
        // on this instance, and the plugins it was meant to bring will show up
        // as activations that matched nothing. Said here so the cause is in
        // the same log as the symptom.
        problems.push({
          id: source.repo,
          severity: 'refused',
          code: 'source-unreachable',
          params: { source: source.repo, ref: source.ref },
          reason: `could not be fetched at ${source.ref} and nothing is cached: ${gitSaid(error)}`,
        })
        continue
      }
      problems.push({
        id: source.repo,
        severity: 'degraded',
        code: 'source-stale',
        params: { source: source.repo, ref: source.ref, head: cached },
        reason: `could not be refreshed at ${source.ref}; running on the cached copy (${cached}): ${gitSaid(error)}`,
      })
      log(`extensions: ${source.repo} unreachable — keeping the cached copy (${cached})`)
    }

    roots.push(dir)
  }

  return { roots, problems }
}
