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

/** Bare specifiers a plugin may import. Anything else must be vendored. */
export const IMPORT_MAP_CONTRACT = 1

export const SHARED_SPECIFIERS = ['react', 'react-dom/client', 'react/jsx-runtime'] as const

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
  readonly tile?: { readonly label: string; readonly icon?: string; readonly route?: string }
}

export interface LoadedPlugin {
  readonly id: string
  readonly view?: unknown
  readonly blocks?: unknown
  readonly chrome?: unknown
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
}

function resolve(base: string, path: string): string {
  // The manifest validator already refused absolute paths and traversal, so a
  // plain join is safe here; keeping it dumb makes the URL predictable.
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${path.replace(/^\.\//, '')}`
}

async function loadFacet(
  environment: LoaderEnvironment,
  plugin: PluginDescriptor,
  facet: 'view' | 'blocks' | 'chrome',
  failures: LoadFailure[],
): Promise<unknown | undefined> {
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
    return factory
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
      loadFacet(environment, descriptor, 'view', failures),
      loadFacet(environment, descriptor, 'blocks', failures),
      loadFacet(environment, descriptor, 'chrome', failures),
    ])

    if (view === undefined && blocks === undefined && chrome === undefined) {
      // Nothing usable came back: drop the styles we just injected rather than
      // leaving a dead plugin's CSS restyling the page.
      environment.removeStylesheets(descriptor.id)
      continue
    }

    loaded.push({
      id: descriptor.id,
      ...(view === undefined ? {} : { view }),
      ...(blocks === undefined ? {} : { blocks }),
      ...(chrome === undefined ? {} : { chrome }),
    })
  }

  return { loaded, failures }
}

/** The browser implementation. Kept tiny so the logic above stays testable. */
export function browserEnvironment(): LoaderEnvironment {
  return {
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
