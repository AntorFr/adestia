/**
 * The plugin manifest — `golem-plugin.json`, schema version 1.
 *
 * Shaped by two things: the predecessor's six lived plugin classes (content
 * contract, API-only tool, full app, heavy chrome capability with a lazy
 * decoder, MCP provider, skin-adjacent), and spike 2, which proved what a
 * runtime ESM loader actually needs — a manifest that DECLARES its facets
 * rather than a build that scans filenames.
 *
 * Everything here is declared data. The shell reads it before importing a
 * single line of plugin code, so it can refuse what it cannot honour.
 */

export const PLUGIN_SCHEMA_VERSION = 1

/** When a plugin is active. Presence in a folder is never enough. */
export const PLUGIN_KINDS = [
  /** Always active: what every agent must have (a writing contract, a body capability). */
  'core',
  /** Active when its id is listed in the instance's `apps`: a tile, a route. */
  'app',
  /** Active when listed in `features`: a control in the composer or settings. */
  'feature',
  /** Active when listed in `tools`: an agent capability with no UI at all. */
  'tool',
] as const

export type PluginKind = (typeof PLUGIN_KINDS)[number]

/** A launcher tile. A view without one is legitimate — a detail screen. */
export interface PluginTile {
  readonly label: string
  readonly icon?: string
  readonly route?: string
}

/**
 * An MCP server a plugin brings. Active plugin = wired; inactive = absent.
 * Materialized per driver at the single spawn site (DESIGN → MCP configuration).
 */
export interface PluginMcpServer {
  readonly name: string
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Readonly<Record<string, string>>
}

export interface PluginManifest {
  readonly schemaVersion: number
  /** Must equal the folder name — the folder wins, a lying manifest is refused. */
  readonly id: string
  readonly kind: PluginKind
  readonly description: string
  readonly version?: string
  /**
   * The bare-specifier contract this plugin was written against (the shell's
   * import map). A plugin importing outside the mapped set fails only at load
   * time, in the browser, with an error its author never saw — spike 2's
   * lesson, hence the pin.
   */
  readonly contract?: number

  /** Front-end facets, all paths relative to the plugin folder. */
  readonly view?: string
  readonly blocks?: string
  readonly chrome?: string
  readonly styles?: readonly string[]
  readonly tile?: PluginTile

  /** Server-side facets. */
  readonly api?: string
  readonly setup?: string
  readonly bin?: readonly string[]

  /** Agent-facing facets. */
  readonly skills?: readonly string[]
  readonly mcpServers?: readonly PluginMcpServer[]
}
