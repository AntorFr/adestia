/**
 * Runtime plugin loading — the mechanism spike 2 proved, turned into product.
 *
 * What the spike established, and what this file must keep true:
 *
 * - a plugin is plain ESM in a mounted folder, imported at runtime, with NO
 *   shared build step and no rebuild of the shell;
 * - shared dependencies come from the page's **import map** — that map is a
 *   published, versioned contract, and a bare specifier outside it fails only
 *   at load time in the browser, where the plugin author never sees it;
 * - CSS is listed in the manifest and owned by the SHELL (injected and
 *   removed), never `import`ed from a module;
 * - a plugin that throws loses its own contribution, never the page.
 */

import {
  narrowBlocks,
  narrowChrome,
  narrowView,
  type BlocksContribution,
  type ChromeContribution,
  type PluginApi,
  type ViewContribution,
} from './contract.js'

/** Bare specifiers a plugin may import. Anything else must be vendored. */
export const IMPORT_MAP_CONTRACT = 1

export const SHARED_SPECIFIERS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
] as const

export interface PluginDescriptor {
  readonly id: string
  readonly kind: string
  /** URL prefix the server serves this plugin's files from. */
  readonly base: string
  readonly view?: string
  readonly blocks?: string
  readonly chrome?: string
  readonly styles?: readonly string[]
  readonly contract?: number
  /** Launcher tile. A view without one is legitimate — a detail screen. */
  readonly tile?: {
    readonly label: string
    readonly icon?: string
    readonly glyph?: string
    readonly hue?: string
    readonly route?: string
  }
}

export interface LoadedPlugin {
  readonly id: string
  readonly base: string
  readonly tile?: PluginDescriptor['tile']
  readonly view?: ViewContribution
  readonly blocks?: BlocksContribution
  readonly chrome?: ChromeContribution
}

export interface LoadFailure {
  readonly id: string
  readonly facet: string
  readonly reason: string
}

export interface LoadResult {
  readonly loaded: readonly LoadedPlugin[]
  readonly failures: readonly LoadFailure[]
}

/** Injected so tests can drive the loader without a browser or a network. */
export interface LoaderEnvironment {
  importModule(url: string): Promise<Record<string, unknown>>
  addStylesheet(id: string, url: string): void
  removeStylesheets(id: string): void
  /** Builds the api handed to each factory. */
  makeApi(descriptor: PluginDescriptor): PluginApi
}

function resolve(base: string, path: string): string {
  // The manifest validator already refused absolute paths and traversal, so a
  // plain join is safe here; keeping it dumb makes the URL predictable.
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${path.replace(/^\.\//, '')}`
}

/**
 * Imports one facet, CALLS its factory, and narrows what came back.
 *
 * Calling it here rather than at use time is deliberate: a factory that throws
 * costs its own facet at load, when the shell can report it, instead of
 * exploding inside a render where React unmounts the tree around it.
 */
async function loadFacet<T>(
  environment: LoaderEnvironment,
  plugin: PluginDescriptor,
  facet: 'view' | 'blocks' | 'chrome',
  narrow: (raw: unknown) => { issue?: { reason: string } } & Record<string, unknown>,
  failures: LoadFailure[],
): Promise<T | undefined> {
  const path = plugin[facet]
  if (!path) return undefined
  try {
    const module = await environment.importModule(resolve(plugin.base, path))
    const factory = module['default']
    if (typeof factory !== 'function') {
      // Saying so beats a mystery blank panel: the contract is a default
      // export, and a module that exports something else never runs.
      failures.push({
        id: plugin.id,
        facet,
        reason: `module must default-export a factory, got ${typeof factory}`,
      })
      return undefined
    }

    const produced = (factory as (api: PluginApi) => unknown)(environment.makeApi(plugin))
    const narrowed = narrow(produced)
    if (narrowed.issue) {
      failures.push({ id: plugin.id, facet, reason: narrowed.issue.reason })
      return undefined
    }
    return narrowed[facet] as T
  } catch (error) {
    failures.push({ id: plugin.id, facet, reason: (error as Error).message })
    return undefined
  }
}

export async function loadPlugins(
  descriptors: readonly PluginDescriptor[],
  environment: LoaderEnvironment,
): Promise<LoadResult> {
  const loaded: LoadedPlugin[] = []
  const failures: LoadFailure[] = []

  for (const descriptor of descriptors) {
    if (descriptor.contract !== undefined && descriptor.contract !== IMPORT_MAP_CONTRACT) {
      // Refused before importing anything: a plugin written against another
      // shared-dependency contract may import a specifier this page does not
      // map, and that failure would surface as an unreadable browser error.
      failures.push({
        id: descriptor.id,
        facet: 'manifest',
        reason: `declares contract ${descriptor.contract}, this shell provides ${IMPORT_MAP_CONTRACT}`,
      })
      continue
    }

    for (const style of descriptor.styles ?? []) {
      environment.addStylesheet(descriptor.id, resolve(descriptor.base, style))
    }

    const [view, blocks, chrome] = await Promise.all([
      loadFacet<ViewContribution>(environment, descriptor, 'view', narrowView, failures),
      loadFacet<BlocksContribution>(environment, descriptor, 'blocks', narrowBlocks, failures),
      loadFacet<ChromeContribution>(environment, descriptor, 'chrome', narrowChrome, failures),
    ])

    if (view === undefined && blocks === undefined && chrome === undefined) {
      // Nothing usable came back: drop the styles we just injected rather than
      // leaving a dead plugin's CSS restyling the page.
      environment.removeStylesheets(descriptor.id)
      continue
    }

    loaded.push({
      id: descriptor.id,
      base: descriptor.base,
      ...(descriptor.tile ? { tile: descriptor.tile } : {}),
      ...(view === undefined ? {} : { view }),
      ...(blocks === undefined ? {} : { blocks }),
      ...(chrome === undefined ? {} : { chrome }),
    })
  }

  return { loaded, failures }
}

/**
 * The browser implementation.
 *
 * @param ask how a plugin sends a message to the agent. Passed in rather than
 *   imported, because the chat owns that channel and the loader must not.
 */
export function browserEnvironment(
  ask: (prompt: string) => void,
  compose: (text: string) => void,
  locale = 'en',
): LoaderEnvironment {
  return {
    makeApi: (descriptor) => ({
      id: descriptor.id,
      base: descriptor.base,
      locale,
      fetch: (...args) => fetch(...args),
      ask,
      compose,
    }),
    importModule: (url) => import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>,
    addStylesheet(id, url) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.dataset['plugin'] = id
      document.head.append(link)
    },
    removeStylesheets(id) {
      for (const link of document.querySelectorAll(`link[data-plugin="${id}"]`)) link.remove()
    },
  }
}
