/** What the MCP screens say about a server: its health, its origin, and the blank declaration. */

import type { McpServerView } from '@antorfr/adestia-schemas'

import type { IconName } from '../icons.js'
import type { McpServerHealth } from '../Settings.js'

export type HealthState = McpServerHealth['state']

/**
 * How each state reads: one of the three tones, its words, and its own icon —
 * the tone alone never says the state (docs/charte.md § 2, Icons).
 */
export const STATES: Readonly<
  Record<HealthState, { readonly tone: string; readonly label: string; readonly icon: IconName }>
> = {
  connected: { tone: 'settled', label: 'connected', icon: 'check' },
  failed: { tone: 'waiting', label: 'failed', icon: 'circle-alert' },
  // Not a failure: a job for a person. Painted red, it sends somebody
  // debugging a network while a server waits to be logged into.
  'needs-auth': { tone: 'waiting', label: 'needs a sign-in', icon: 'key-round' },
  pending: { tone: 'underway', label: 'starting', icon: 'loader-circle' },
  disabled: { tone: 'underway', label: 'disabled', icon: 'x' },
  unknown: { tone: 'underway', label: 'not observed yet', icon: 'info' },
}

export function stateOf(state: HealthState | undefined) {
  return state ? (STATES[state] ?? STATES.unknown) : undefined
}

/** What a source reads as, in one line, on the screen that opened it. */
export function provenance(view: McpServerView, t: (key: string) => string): string {
  if (view.source === 'config') return t('Declared in the instance configuration')
  if (view.source === 'plugin') {
    return `${t('Brought by the plugin')} “${view.owner ?? '?'}”`
  }
  return t('Added from here')
}

/** A server nobody has written yet. Both transports in one comment, not two. */
export const TEMPLATE = `{
  "name": "",
  "command": "npx",
  "args": ["-y", "some-mcp-server"]
}`
