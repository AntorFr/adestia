/**
 * An instance with nothing in it: no plugin, no page, no conversation, no
 * server, no catalogue, no credential (the empty states of E-2, E-3, E-10 to
 * E-13, E-15, E-16).
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { SIGNATURE_ORIGIN, chatScripts } from './_scripts.mjs'

export const scripts = chatScripts
export const engine = { mcp: [], auth: 'absent' }
export const config = { file: 'writable' }

export default async function seed({ base }) {
  const plugins = join(base, 'seed-plugins')
  await mkdir(plugins, { recursive: true })
  return `name: Adestia bench
auth:
  mode: none
extensions:
  pluginsDir: ${plugins}
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
`
}
