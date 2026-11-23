/**
 * Feature adestia-plugins-reglages seen from its need (B-plugins-1 to B-plugins-4, E-37): a writable configuration file
 * and a plugins folder that holds, found with their state written here by hand:
 *   atlas (app, ON), boussole (app, off), loupe (tool, ON), veille (feature, off), socle (core),
 *   casse (refused: its manifest says another id), and a source folder holding lointain (app, off).
 * The apps carry a tile and a view (an h1 with their label), so a restart can be seen applying.
 * Run with `--restart` to get the binary's boot loop, replayed with the scripted engine (bench/restart-loop.mjs), behind `/api/restart`.
 */
import { join } from 'node:path'

import { configFor, populate, storeToken } from './_base.mjs'
import { put } from './_lib.mjs'

export { scripts, engine, config } from './config-writable.mjs'
// Two turns are running once it listens: the restart is refused with their count (B-plugins-3).
export { ready } from './_base.mjs'

const manifest = (value) => JSON.stringify({ schemaVersion: 1, ...value }, null, 2) + '\n'
const view = (label) =>
  `import { createElement as h } from 'react'\nexport default function view() {\n  return { component: () => h('section', { style: { padding: '2rem' } }, h('h1', null, '${label}')) }\n}\n`

export async function plugins(base) {
  const dir = join(base, 'besoin-plugins')
  const depot = join(base, 'besoin-depot')
  for (const [root, id, label, icon] of [
    [dir, 'atlas', 'Atlas', '🗺️'],
    [dir, 'boussole', 'Boussole', '🧭'],
    [depot, 'lointain', 'Lointain', '🔭'],
  ]) {
    await put(root, `${id}/adestia-plugin.json`, manifest({ id, kind: 'app', description: `${label}, une app d'essai.`, contract: 1, view: './web/app.js', tile: { label, icon, hue: 'bleu' } }))
    await put(root, `${id}/web/app.js`, view(label))
  }
  await put(dir, 'loupe/adestia-plugin.json', manifest({ id: 'loupe', kind: 'tool', description: 'Une loupe, outil d\'essai.' }))
  await put(dir, 'veille/adestia-plugin.json', manifest({ id: 'veille', kind: 'feature', description: 'Une veille, fonction d\'essai.' }))
  await put(dir, 'socle/adestia-plugin.json', manifest({ id: 'socle', kind: 'core', description: 'Le socle, toujours allume.' }))
  await put(dir, 'casse/adestia-plugin.json', manifest({ id: 'autre-nom', kind: 'app', description: 'Se trompe de nom.' }))
  return { dir, depot }
}

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const { dir, depot } = await plugins(ctx.base)
  return configFor(ctx)
    .replace(/  pluginsDir: .*\n/, `  pluginsDir: ${dir}\n  sources:\n    - dir: ${depot}\n`)
    .replace('  tools: [bench-notes, bench-degraded]', '  apps: [atlas]\n  tools: [loupe]')
}
