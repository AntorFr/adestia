/**
 * What the shell asks first: whether the instance is up, what it is, and
 * which models its engine can name.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Driver, DriverDescriptor, ModelSelection } from '@antorfr/adestia-drivers'

import type { Identity } from '../auth.js'
import type { BackgroundTrouble } from '../background.js'
import type { AdestiaConfig } from '../config.js'
import { frontendPayload, type DiscoveredPlugin, type DiscoveryProblem } from '../extensions.js'

/** What the shell needs to dress itself, before it renders anything. */
export interface SkinPayload {
  readonly styles?: string
  readonly module?: string
  readonly icon?: string
  readonly scheme?: 'light' | 'dark' | 'auto'
}

interface InstanceDependencies {
  readonly config: AdestiaConfig
  readonly driver: Driver
  readonly descriptor: DriverDescriptor
  readonly skin?: { readonly id: string; readonly manifest: SkinPayload } | undefined
  readonly plugins: readonly DiscoveredPlugin[]
  /** Read per request: the plugin APIs report theirs only once mounted. */
  readonly problems: () => readonly DiscoveryProblem[]
  /** The background reach's standing trouble, when a mint keeps failing. */
  readonly background?: (() => BackgroundTrouble | undefined) | undefined
  /** Turns running at this instant. */
  readonly running: () => number
  /** Where the release headings are read from; the repository's own by default. */
  readonly changelogPath?: string | undefined
}

const VERSION_HEADING = /^## v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?=\s|$)/gm

/** The last release heading of a changelog, without its `v`: the newest entry. */
export function lastReleaseOf(changelog: string): string | undefined {
  let last: string | undefined
  for (const match of changelog.matchAll(VERSION_HEADING)) last = match[1]
  return last
}

/**
 * The repository's `CHANGELOG.md`, found by walking up from this module: the
 * source sits four levels under the root and the compiled `dist/src/routes`
 * five, so no fixed relative path serves both.
 */
function findChangelog(from: string = import.meta.url): string | undefined {
  let dir = dirname(fileURLToPath(from))
  for (;;) {
    const candidate = join(dir, 'CHANGELOG.md')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Which published version of Adestia is running, when one can be named.
 *
 * The image says it: the publish workflow bakes the tag it pushes into
 * `ADESTIA_VERSION`, and that wins. Without it (an installation from the
 * sources) the answer is the last `## vX.Y.Z` heading of the root
 * `CHANGELOG.md`, the same number as the tag without its `v`, because the
 * package manifests all read `0.0.0`. A missing, unreadable or version-less
 * changelog gives no version, silently: nothing is invented.
 */
function buildVersion(
  env: NodeJS.ProcessEnv = process.env,
  changelogPath: string | undefined = findChangelog(),
): string | undefined {
  const raw = env['ADESTIA_VERSION']?.trim()
  if (raw !== undefined && raw !== '') return raw
  if (changelogPath === undefined) return undefined
  try {
    return lastReleaseOf(readFileSync(changelogPath, 'utf8'))
  } catch {
    return undefined
  }
}

export function registerInstance(app: FastifyInstance, deps: InstanceDependencies): void {
  const { config, driver, descriptor, plugins } = deps

  app.get('/api/health', () => ({ status: 'ok' }))

  // Read once: the environment of a running process does not change, and a
  // colophon is not worth an `env` lookup per request.
  const version = buildVersion(process.env, deps.changelogPath ?? findChangelog())

  /**
   * What the UI is built from. The driver's *name* never appears — the front
   * end renders from capabilities alone, so a second engine needs no UI change.
   */
  app.get('/api/instance', (request) => {
    /**
     * A background reach that keeps failing to mint — the shell shows it as
     * a banner, because a background that quietly stopped reading the mail
     * is indistinguishable from one that never ran. Absent means healthy,
     * including "nothing is flagged": no banner for a granted nothing.
     */
    const backgroundTrouble = deps.background?.()
    return {
      /**
       * Which build is answering. Absent when neither the image nor a changelog names one, and that
       * absence is the honest answer rather than a gap — see `buildVersion`.
       */
      ...(version ? { version } : {}),
      driver: {
        label: descriptor.label,
        cliVersion: descriptor.cliVersion,
        capabilities: descriptor.capabilities,
      },
      auth: { mode: config.auth.mode },
      /**
       * What the operator called this instance, when they called it anything.
       *
       * The shell needs it, not just the manifest: iOS proposes the DOCUMENT
       * TITLE when someone adds the page to their home screen, so a name that
       * only reached the manifest would be ignored on the platform it was most
       * wanted for.
       */
      ...(config.name ? { name: config.name } : {}),
      /**
       * Absent when the operator set none — the shell then asks the browser,
       * which is what lets one instance answer two visitors in their own
       * languages.
       */
      ...(config.locale ? { locale: config.locale } : {}),
      user: (request as FastifyRequest & { identity?: Identity }).identity ?? null,
      /**
       * What the shell loads, not just a name. A skin named in config but absent
       * from disk must not leave the front end fetching files that are not there
       * — it renders the default, and the boot log already said why.
       */
      skin: deps.skin
        ? { id: deps.skin.id, base: '/skin/', ...deps.skin.manifest }
        : { id: 'default', base: '/skin/' },
      plugins: frontendPayload(plugins),
      /**
       * Refused plugins are reported to the UI, not buried in a log nobody
       * reads: a plugin you believe is loaded and is not costs far more than one
       * that says out loud why it was rejected.
       */
      pluginProblems: deps.problems(),
      ...(backgroundTrouble ? { backgroundTrouble } : {}),
      /**
       * How a signature card opens its ceremony: in a sheet over the chat
       * when the operator says the façade accepts to be framed here, in a new
       * tab otherwise. Absent when no façade is configured.
       */
      ...(config.signatures.origins.length > 0 ? { signatures: { embed: config.signatures.embed } } : {}),
      turns: { max: config.maxConcurrentTurns, running: deps.running() },
    }
  })

  app.get('/api/models', async (_request, reply) => {
    if (!descriptor.capabilities.includes('modelSelection')) {
      // 404, not an empty list: "this instance cannot enumerate models" and
      // "this instance has no models" are different facts.
      await reply.code(404).send({ error: 'this driver does not enumerate models' })
      return reply
    }
    return { models: await (driver as Driver & ModelSelection).listModels() }
  })
}
