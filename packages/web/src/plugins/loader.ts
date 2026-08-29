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

import { forgetContributedBlocks, registerBlocks, type ContributedBlock } from '@antorfr/adestia-content'
import { createElement, type ComponentType } from 'react'

import {
  narrowBlocks,
  narrowChrome,
  narrowView,
  type BlocksContribution,
  type ChromeContribution,
  type PageEditorProps,
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
  /**
   * The block specs the manifest declares — the same ones the server already
   * registered. Sent rather than re-derived: the browser must validate and
   * draw exactly what the server accepted, and two tables drift.
   */
  readonly vocabulary?: Readonly<Record<string, ContributedBlock>>
  readonly chrome?: string
  readonly styles?: readonly string[]
  readonly contract?: number
  /** Launcher tile. A view without one is legitimate — a detail screen. */
  readonly absorbs?: readonly string[]
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
  readonly absorbs?: PluginDescriptor['absorbs']
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

  // Refused before importing anything: a plugin written against another
  // shared-dependency contract may import a specifier this page does not map,
  // and that failure would surface as an unreadable browser error.
  const usable = descriptors.filter((descriptor) => {
    if (descriptor.contract === undefined || descriptor.contract === IMPORT_MAP_CONTRACT) {
      return true
    }
    failures.push({
      id: descriptor.id,
      facet: 'manifest',
      reason: `declares contract ${descriptor.contract}, this shell provides ${IMPORT_MAP_CONTRACT}`,
    })
    return false
  })

  // The vocabulary FIRST, and for every plugin at once, before a single module
  // is imported. The parser decides whether `:::parcours` is a block or a
  // diagnostic, and a page can be read the moment the shell has rendered —
  // registering as each plugin finishes loading would make that a race.
  //
  // Over the USABLE ones only: a plugin the shell just refused must not get to
  // teach the parser its words, or a page would validate against a block
  // nothing will ever draw.
  forgetContributedBlocks()
  for (const descriptor of usable) {
    for (const name of registerBlocks(descriptor.vocabulary ?? {})) {
      failures.push({
        id: descriptor.id,
        facet: 'vocabulary',
        reason: `block ":::${name}" is the core's own and was not taken over`,
      })
    }
  }

  for (const descriptor of usable) {
    for (const style of descriptor.styles ?? []) {
      environment.addStylesheet(descriptor.id, resolve(descriptor.base, style))
    }

    const [view, blocks, chrome] = await Promise.all([
      loadFacet<ViewContribution>(environment, descriptor, 'view', narrowView, failures),
      loadFacet<BlocksContribution>(environment, descriptor, 'blocks', narrowBlocks, failures),
      loadFacet<ChromeContribution>(environment, descriptor, 'chrome', narrowChrome, failures),
    ])

    // A component with nothing declared for it in the manifest never draws:
    // the parser leaves the name as prose, so the block is inert in a way its
    // author would otherwise only discover by staring at a page.
    for (const name of Object.keys(blocks?.tags ?? {})) {
      if (!(descriptor.vocabulary && Object.hasOwn(descriptor.vocabulary, name))) {
        failures.push({
          id: descriptor.id,
          facet: 'blocks',
          reason: `component for ":::${name}" has no matching entry in the manifest's \`vocabulary\``,
        })
      }
    }
    for (const name of Object.keys(descriptor.vocabulary ?? {})) {
      if (!blocks?.tags[name]) {
        failures.push({
          id: descriptor.id,
          facet: 'vocabulary',
          reason: `block ":::${name}" is declared but the \`blocks\` module draws nothing for it`,
        })
      }
    }

    if (view === undefined && blocks === undefined && chrome === undefined) {
      // Nothing usable came back: drop the styles we just injected rather than
      // leaving a dead plugin's CSS restyling the page.
      environment.removeStylesheets(descriptor.id)
      continue
    }

    loaded.push({
      id: descriptor.id,
      base: descriptor.base,
      ...(descriptor.absorbs ? { absorbs: descriptor.absorbs } : {}),
      ...(descriptor.tile ? { tile: descriptor.tile } : {}),
      ...(view === undefined ? {} : { view }),
      ...(blocks === undefined ? {} : { blocks }),
      ...(chrome === undefined ? {} : { chrome }),
    })
  }

  return { loaded, failures }
}

/**
 * A page editor for a shell that did not provide one.
 *
 * Says so where the editor would have been, rather than rendering nothing: a
 * plugin embedding one and getting a blank space would be read as the plugin
 * being broken, which is the wrong place to send somebody.
 */
const noPageEditor: ComponentType<PageEditorProps> = () =>
  createElement('p', { className: 'adestia-embed__problem' }, 'No page editor on this shell.')

/**
 * The browser implementation.
 *
 * @param ask how a plugin sends a message to the agent. Passed in rather than
 *   imported, because the chat owns that channel and the loader must not.
 * @param pageEditor the shell's page editor, built by whoever knows the
 *   instance's language and page routing. Same reason as `ask`: the loader
 *   hands capabilities over, it does not own them.
 */
export function browserEnvironment(
  ask: (prompt: string) => void,
  compose: (text: string) => void,
  locale = 'en',
  /**
   * Where a plugin's own screen says it is. Handed in like `ask`: the header
   * belongs to the shell, and a plugin that drew its own breadcrumb would be
   * the second one this exists to remove.
   */
  trail: (id: string, crumbs: readonly { label: string; route?: string }[]) => void = () => {},
  pageEditor: ComponentType<PageEditorProps> = noPageEditor,
): LoaderEnvironment {
  return {
    makeApi: (descriptor) => ({
      id: descriptor.id,
      base: descriptor.base,
      locale,
      fetch: (...args) => fetch(...args),
      ask,
      compose,
      // Bound to the plugin's id, so the shell can ignore a trail published
      // by a view nobody is looking at — a plugin loaded but not open.
      trail: (crumbs) => trail(descriptor.id, crumbs),
      PageEditor: pageEditor,
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
