/**
 * Verify seed for `adestia-pages-etat-projet` (E-36 store rule of docs/donnees.md, "Page name at creation"):
 * `repli/` is held by the default store `perso` (not writable) AND by the second store `equipe` (writable);
 * `ordre/` is held and writable in both; `titres/` is held by the default store only.
 */
import { chmod } from 'node:fs/promises'
import { join } from 'node:path'

import { FEATURES, day, pluginsDirectory } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed({ workspace, base, onClose }) {
  const one = (store, folder) => put(workspace, `${store}/${folder}/seule.md`, page({ title: 'Seule page', type: 'fiche', due: day(10) }, 'Une.')) // same bytes as a page the corpus already holds
  await one('pages', 'repli')
  await one('equipe', 'repli')
  await one('pages', 'ordre')
  await one('equipe', 'ordre')
  await one('pages', 'titres')
  await chmod(join(workspace, 'pages/repli'), 0o555)
  onClose(async () => {
    await chmod(join(workspace, 'pages/repli'), 0o755).catch(() => undefined)
  })
  const plugins = await pluginsDirectory(base)
  const features = FEATURES.filter((f) => f === 'project-management')
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
    - id: equipe
      path: equipe
      label: Equipe
extensions:
  pluginsDir: ${plugins}
  apps: []
  features: [${features.join(', ')}]
`
}
