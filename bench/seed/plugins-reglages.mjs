/**
 * The Plugins page (E-37): `config-writable` plus a plugins folder holding one
 * app that is on (`bench-actif`), one app found and off (`bench-inactif`), and
 * the two plugins the base folder already refuses (`bench-refused`, `bench-invalid`).
 *
 * The apps carry a tile and a view, so the proof after a restart is visible:
 * the tile and `#/bench-<name>` exist for the one the file names, and for no other.
 * Run with `--restart` to get the binary's boot loop, replayed with the scripted engine (bench/restart-loop.mjs), behind `/api/restart`.
 */
import { populate, storeToken, configFor } from './_base.mjs'
import { put } from './_lib.mjs'
import { join } from 'node:path'

export { ready, } from './_base.mjs'
export { scripts, engine, config } from './config-writable.mjs'

const app = (id, label, icon) => ({
  manifest: JSON.stringify({
    schemaVersion: 1, id, kind: 'app', description: `${label}: an app of the plugins page proof.`,
    contract: 1, view: './web/app.js', tile: { label, icon, hue: 'bleu' },
  }, null, 2) + '\n',
  view: `import { createElement as h } from 'react'\nexport default function view() {\n  return { component: () => h('section', { style: { padding: '2rem' } }, h('h1', null, '${label}')) }\n}\n`,
})

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const dir = join(ctx.base, 'seed-plugins')
  for (const [id, label, icon] of [['bench-actif', 'Actif', '🟢'], ['bench-inactif', 'Inactif', '⚪']]) {
    const made = app(id, label, icon)
    await put(dir, `${id}/adestia-plugin.json`, made.manifest)
    await put(dir, `${id}/web/app.js`, made.view)
  }
  return configFor(ctx).replace('  tools: [bench-notes, bench-degraded]', '  apps: [bench-actif]\n  tools: [bench-notes, bench-degraded]')
}
