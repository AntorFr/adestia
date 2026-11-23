/**
 * Independent seed for `adestia-decouverte-plugins` (B-34, P-21 step 4), written from the need: the REAL
 * `journal` and `todo` apps and `project-management` feature are enabled, nothing else. Two writable folders
 * (`projets/`, `maison/`) hold one page each, so the root and both are writable folders of the home;
 * `BESOIN_SANS_JOURNAL=1` leaves the journal plugin off; `BESOIN_TOUS=1` enables all ten bundled plugins.
 */
import { APPS, FEATURES, pluginsDirectory } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed({ workspace, base }) {
  await put(workspace, 'pages/projets/premier.md', page({ title: 'Premier projet', type: 'fiche' }, 'Un.'))
  await put(workspace, 'pages/maison/travaux.md', page({ title: 'Travaux', type: 'fiche' }, 'Deux.'))
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
