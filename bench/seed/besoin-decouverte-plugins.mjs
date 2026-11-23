/**
 * Independent seed for `adestia-decouverte-plugins` (B-34, P-21 step 4), written from the need: the REAL
 * `journal` and `todo` apps and `project-management` feature are enabled, nothing else. Two writable folders
 * (`projets/`, `maison/`) are empty, so the root and both are writable folders of the home;
 * `BESOIN_SANS_JOURNAL=1` leaves the journal plugin off; `BESOIN_TOUS=1` enables all ten bundled plugins.
 */
import { APPS, FEATURES, pluginsDirectory } from './_plugins.mjs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed({ workspace, base }) {
  // Two folders held by the store with no page in them (a page written here would have to be copied into the corpus of packages/content).
  for (const folder of ['projets', 'maison']) await mkdir(join(workspace, 'pages', folder), { recursive: true })
  const plugins = await pluginsDirectory(base)
  const all = process.env.BESOIN_TOUS === '1'
  const apps = all ? APPS : ['todo', ...(process.env.BESOIN_SANS_JOURNAL === '1' ? [] : ['journal'])]
  const features = all ? FEATURES : ['project-management']
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
extensions:
  pluginsDir: ${plugins}
  apps: [${apps.join(', ')}]
  features: [${features.join(', ')}]
`
}
