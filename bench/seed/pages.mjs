/** The base corpus and one app without a view, for the pages matrix. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import seed, { engine, scripts, config } from './base.mjs'
export { engine, scripts, config }
export default async function pages(ctx) {
  const yaml = await seed(ctx)
  const dir = join(ctx.base, 'seed-plugins', 'bench-noview')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'adestia-plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'bench-noview', kind: 'app', description: 'An inactive screen for the pages bench.', contract: 1, blocks: './blocks.js', vocabulary: { 'bench-noview': { content: 'empty', description: 'No view' } }, tile: { label: 'No view', icon: 'plug' } }))
  await writeFile(join(dir, 'blocks.js'), "export default function create() { return { tags: { 'bench-noview': () => null } } }\n")
  return yaml.replace('  tools: [', '  apps: [bench-noview]\n  tools: [')
}
