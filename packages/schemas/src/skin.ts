/**
 * The skin manifest — `golem-skin.json`, schema version 1.
 *
 * A skin dresses; exactly ONE is active, chosen by a config value. That is why
 * it is not a fifth plugin kind: every plugin axis is a list, a skin's axis is
 * a single value, and an exception like that empties a rule of its meaning.
 *
 * A skin declares tokens and narrow hooks — never structural rules. The theme
 * lint enforces it: N personalities share one shell without diverging.
 */

export const SKIN_SCHEMA_VERSION = 1

export interface SkinManifest {
  readonly schemaVersion: number
  /** Must equal the folder name. */
  readonly id: string
  readonly description: string
  readonly version?: string
  /** The factory module `(api) => skin`. */
  readonly module?: string
  /** Token overrides, scoped to this skin. */
  readonly styles?: string
  /**
   * Served, not bundled: the browser asks for the favicon and the web-app
   * manifest BEFORE a single line of the bundle runs, so anything the page
   * needs pre-boot cannot come from a client-side registry.
   */
  readonly icon?: string
  readonly manifest?: string
}
