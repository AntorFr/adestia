/**
 * What the shell asks first: whether the instance is up, what it is, and
 * which models its engine can name.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Driver, DriverDescriptor, ModelSelection } from '@antorfr/adestia-drivers'

import type { Identity } from '../auth.js'
import type { AdestiaConfig } from '../config.js'
import { frontendPayload, type DiscoveredPlugin, type DiscoveryProblem } from '../extensions.js'

/** What the shell needs to dress itself, before it renders anything. */
export interface SkinPayload {
  readonly styles?: string
  readonly module?: string
  readonly icon?: string
  readonly scheme?: 'light' | 'dark' | 'auto'
}

export interface InstanceDependencies {
  readonly config: AdestiaConfig
  readonly driver: Driver
  readonly descriptor: DriverDescriptor
  readonly skin?: { readonly id: string; readonly manifest: SkinPayload } | undefined
  readonly plugins: readonly DiscoveredPlugin[]
  /** Read per request: the plugin APIs report theirs only once mounted. */
  readonly problems: () => readonly DiscoveryProblem[]
  /** Turns running at this instant. */
  readonly running: () => number
}

/**
 * Which build of Adestia is running, when the build said so.
 *
 * Read from the environment rather than from a manifest because nothing in
 * the tree carries the number: a release is cut as `git tag vX.Y.Z`, the
 * package manifests all read `0.0.0`, and the thing an operator actually
 * wants to match against is the IMAGE TAG they deployed. The publish workflow
 * bakes exactly that tag into the image, so what the instance says and what
 * the registry holds cannot drift apart.
 *
 * A local run therefore has no version, and says so by saying nothing: a
 * checkout is not a release, and inventing `0.0.0-dev` for it would put a
 * number on screen that answers no question anyone asked.
 */
export function buildVersion(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env['ADESTIA_VERSION']?.trim()
  return raw === undefined || raw === '' ? undefined : raw
}

export function registerInstance(app: FastifyInstance, deps: InstanceDependencies): void {
  const { config, driver, descriptor, plugins } = deps

  app.get('/api/health', () => ({ status: 'ok' }))

  // Read once: the environment of a running process does not change, and a
  // colophon is not worth an `env` lookup per request.
  const version = buildVersion()

  /**
   * What the UI is built from. The driver's *name* never appears — the front
   * end renders from capabilities alone, so a second engine needs no UI change.
   */
  app.get('/api/instance', (request) => ({
    /**
     * Which build is answering. Absent from a checkout, and that absence is
     * the honest answer rather than a gap — see `buildVersion`.
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
    turns: { max: config.maxConcurrentTurns, running: deps.running() },
  }))

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
