/** What `GET /api/plugins` says: what the instance found, loaded, and what its file wants. */

export type PluginOrigin =
  | { readonly kind: 'folder' }
  | { readonly kind: 'source'; readonly name: string }

/** A problem worth showing: why a plugin is refused, or what is diminished about a loaded one. */
export interface PluginProblem {
  readonly id: string
  readonly reason: string
  readonly code?: string
  readonly params?: Readonly<Record<string, string>>
}

export interface PluginRow {
  readonly id: string
  readonly kind: 'core' | 'app' | 'feature' | 'tool'
  readonly description: string
  readonly version?: string
  readonly origin: PluginOrigin
  /** Loaded at boot: what the running instance does. */
  readonly loaded: boolean
  /** Named in the file: what the next boot will do. `core` is always true. */
  readonly wanted: boolean
  /** Degraded problems of this plugin. */
  readonly problems: readonly PluginProblem[]
}

export interface PluginsPayload {
  readonly plugins: readonly PluginRow[]
  readonly refused: readonly PluginProblem[]
  readonly file: string
  readonly writable: boolean
  readonly readOnlyReason?: string
  readonly revision: string
  readonly pluginsDir: string
}
