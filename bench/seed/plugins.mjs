/**
 * The instance with the ten bundled plugins active and the data each draws
 * (E-20, E-22 to E-31). Nothing else is on it — no refused plugin, no MCP
 * server — so no band of E-19 sits over a plugin's screen. The data is written
 * by `_plugins.mjs`, in the plugin's own formats.
 *
 * Two things have no file to live in:
 *  - E-20: `bench-noview` is loaded with a tile and no view, so `#/bench-noview`
 *    is the route of a plugin that has none (written by `pluginsDirectory`).
 *  - E-30: the camera belongs to the browser. The scan feature is on; the
 *    sweep launches Chromium with a fake media stream.
 * The clock of planif is off (`schedule.enabled` unset): a scheduled turn
 * would run by itself during a capture.
 */
import { APPS, FEATURES, pluginsDirectory, startFeeds, writePluginData } from './_plugins.mjs'
import { chatScripts } from './_scripts.mjs'

export const scripts = chatScripts
export const engine = { mcp: [], auth: 'armed' }
export const config = { file: 'writable' }

export default async function seed({ workspace, dataDir, base, onClose }) {
  const feeds = await startFeeds(onClose)
  await writePluginData({ workspace, dataDir, feeds })
  const plugins = await pluginsDirectory(base)
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
# The trips plugin declares a map key. Any value keeps the « missing secret » band
# off the screens; the forecast it would fetch with it fails and shows as a grey day.
secrets:
  GOOGLE_MAPS_API_KEY: bench-not-a-key
extensions:
  pluginsDir: ${plugins}
  apps: [${APPS.join(', ')}]
  features: [${FEATURES.join(', ')}]
`
}
