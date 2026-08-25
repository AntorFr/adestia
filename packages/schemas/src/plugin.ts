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
  /** An emoji, shown on the tile's plate. */
  readonly icon?: string
  /**
   * A drawn glyph from the SHELL's closed set (`ic:todo`, `ic:shop`), taking
   * precedence over `icon`. Named rather than carried: a manifest is data,
   * and raw SVG in one would make every plugin folder an injection surface
   * for the launcher screen.
   */
  readonly glyph?: string
  /**
   * A named hue from the base table (`rouge`, `emeraude`…) — the tile's
   * colour: its top bar, its plate, its hot chips. A name, never a hex, for
   * the same reason pages declare `couleur:` by name — the skin decides what
   * the name means.
   */
  readonly hue?: string
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

  /**
   * Frontmatter `type:` values this plugin's own code dispatches on — e.g. a
   * task app declaring `["tache", "liste"]`.
   *
   * A page's `type` is the busiest convention in the system (it is what turns
   * one query over every page's frontmatter into a todo base for one plugin
   * and a collection for another) and the core enforces nothing about it: two
   * plugins can claim the same word and the failure is silent, a page quietly
   * misread by whichever model built its filter last. Declaring the claim
   * here is what lets discovery catch the collision instead of a person
   * finding it in a screenshot.
   *
   * Absent for a plugin that dispatches some other way — a reserved workspace
   * folder (`planif`), a sibling asset file (`atelier`) — or that reads
   * `type` only to describe pages it does not own (`collections`' `of:`
   * targets are a workspace's own vocabulary, not a claim this field makes).
   */
  readonly types?: readonly string[]

  /**
   * Page folders this plugin's TILE already stands for.
   *
   * The todo app's tile is the todo store; a "Todo" section beside it would
   * be the same thing said twice, and clicking the wrong one is a small
   * betrayal every time. Declared by the plugin because only the plugin
   * knows what its screen covers — and only while it is ACTIVE, so turning
   * it off gives the folder back rather than hiding it forever.
   *
   * A NAME, not a path. It matches wherever that run of folder names sits —
   * `voyages` covers `voyages` and `domaines/voyages` alike, because a plugin
   * cannot know how an operator files things — and it covers everything UNDER
   * the folder, since a tile that stands for a folder stands for its contents.
   * Always at a segment boundary, so `voyages` never absorbs `mes-voyages`.
   */
  readonly absorbs?: readonly string[]

  /**
   * Named secrets this plugin's SERVER SIDE needs — an API key, a token.
   *
   * Declared, never carried: the value lives in the instance's configuration
   * and the core hands it to the plugin's `api` at mount time. A plugin that
   * held its own key would put a credential in a folder anybody can drop in,
   * and would put it there in plain text.
   *
   * Names rather than ownership, which is the other half of the point: two
   * plugins that both need `GOOGLE_MAPS_API_KEY` declare the same name and
   * receive the same value. One key, one place to rotate it, however many
   * consumers.
   *
   * ⚠️ Server side ONLY. A plugin's web code runs in a browser, where a
   * secret is a secret no longer — nothing declared here ever reaches it.
   */
  readonly secrets?: readonly string[]

  /** Server-side facets. */
  readonly api?: string
  readonly setup?: string
  readonly bin?: readonly string[]

  /** Agent-facing facets. */
  readonly skills?: readonly string[]
  readonly mcpServers?: readonly PluginMcpServer[]
}
