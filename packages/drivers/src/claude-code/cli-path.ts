/**
 * Where the `claude` binary actually is.
 *
 * `spawn('claude')` only works when someone installed the CLI globally — and
 * nobody has to: the Agent SDK this driver already depends on ships the very
 * same binary in an optional per-platform package, which is what `query()`
 * runs for every turn. A machine (or an image) that can run turns therefore
 * has a CLI, just not one on PATH, and the arming flow died with
 * `spawn claude ENOENT` on exactly that gap.
 *
 * The candidate list mirrors the SDK's own resolution (read out of
 * @anthropic-ai/claude-agent-sdk 0.3.237): `@anthropic-ai/claude-agent-sdk-
 * <platform>-<arch>/claude`, with the musl and android variants Linux needs.
 * PATH stays the last resort, so an operator's own install still wins when
 * they pin one through `driver.command`.
 *
 * The libc order is not decoration. Those packages declare `os` and `cpu` but
 * no libc, so on a musl host npm installs BOTH — and picking the glibc one
 * there yields a binary that cannot even be loaded. The SDK reads the same
 * signal, and so does this.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const SDK_NATIVE_PREFIX = '@anthropic-ai/claude-agent-sdk'

export interface CliPathOptions {
  readonly platform?: string
  readonly arch?: string
  readonly preferMusl?: boolean
  /** Injected so a test can name candidates without installing them. */
  readonly resolveImpl?: (specifier: string) => string
  readonly exists?: (path: string) => boolean
}

/**
 * Whether this host links against musl rather than glibc — which node only
 * says indirectly, by leaving the glibc version out of its own report.
 */
export function preferMusl(platform: string = process.platform): boolean {
  if (platform !== 'linux') return false
  const report = typeof process.report?.getReport === 'function' ? process.report.getReport() : null
  if (report === null || typeof report === 'string') return false
  const header = (report as { header?: { glibcVersionRuntime?: string } }).header
  return header?.glibcVersionRuntime === undefined
}

/** The native packages that may hold a CLI for this platform, best first. */
export function nativeCliCandidates(
  platform: string = process.platform,
  arch: string = process.arch,
  musl: boolean = preferMusl(platform),
): readonly string[] {
  const binary = platform === 'win32' ? 'claude.exe' : 'claude'
  const packages =
    platform === 'android'
      ? [`${SDK_NATIVE_PREFIX}-linux-${arch}-android`]
      : platform === 'linux'
        ? // Both flavours, this host's first: the other one costs a failed
          // resolve, its absence would cost the whole flow.
          musl
          ? [`${SDK_NATIVE_PREFIX}-linux-${arch}-musl`, `${SDK_NATIVE_PREFIX}-linux-${arch}`]
          : [`${SDK_NATIVE_PREFIX}-linux-${arch}`, `${SDK_NATIVE_PREFIX}-linux-${arch}-musl`]
        : [`${SDK_NATIVE_PREFIX}-${platform}-${arch}`]
  return packages.map((name) => `${name}/${binary}`)
}

/**
 * An absolute path to the bundled CLI, or the bare name for PATH lookup.
 *
 * Never throws: a missing native package is not a reason to refuse to try
 * `claude`, which is what worked before this existed.
 */
export function resolveClaudeCli(options: CliPathOptions = {}): string {
  const resolveImpl = options.resolveImpl ?? createRequire(import.meta.url).resolve
  const exists = options.exists ?? existsSync
  const candidates = nativeCliCandidates(
    options.platform,
    options.arch,
    options.preferMusl ?? preferMusl(options.platform),
  )
  for (const candidate of candidates) {
    try {
      const path = resolveImpl(candidate)
      if (exists(path)) return path
    } catch {
      // Optional dependency, absent for other platforms by design.
    }
  }
  return 'claude'
}
