/**
 * Independent seed for the feature `adestia-pages-etat-projet` (B-29, B-30, P-20), written from the need:
 * the REAL `project-management` plugin ships the template; `projet/` is a writable project folder of five
 * sub-pages (two finished by status `clos`, one open and late, two open and to come); `lecture/` is held
 * only by a read-only second store. `BESOIN_SANS_MODELE=1` leaves the plugin off: no template is shipped.
 */
import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { FEATURES, day, pluginsDirectory } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed({ workspace, base, onClose }) {
  const p = (path, front, body) => put(workspace, `pages/${path}`, page(front, body))
  const subs = [
    ['cadrage', 'Cadrage', 'clos', -40, -30],
    ['maquette', 'Maquette', 'clos', -30, -10],
    ['developpement', 'Développement', 'en cours', -10, 20],
    ['recette', 'Recette', 'en cours', 15, 35],
    ['retard', 'Dossier en retard', 'en cours', -30, -3],
  ]
  // One folder per test that creates a page: a page created in a folder is itself a page of that folder.
  for (const folder of ['projet', 'pris', ...Array.from({ length: 12 }, (_, i) => `p${i + 1}`)]) {
    for (const [slug, title, status, start, due] of subs) {
      await p(`${folder}/${slug}.md`, { title, type: 'fiche', status, start: day(start), due: day(due) }, 'x')
    }
  }
  await mkdir(join(workspace, 'pages/neuf'), { recursive: true }) // a folder held by the store, with no page in it
  // Same bytes as pages the corpus of packages/content already holds (it keeps one copy of every page a seed writes).
  const seule = (offset) => page({ title: 'Seule page', type: 'fiche', due: day(offset) }, 'Une.')
  await put(workspace, 'lecture/gele/seule.md', seule(10))
  await chmod(join(workspace, 'lecture/gele'), 0o555)
  onClose(async () => {
    await chmod(join(workspace, 'lecture/gele'), 0o755).catch(() => undefined)
  })
  const plugins = await pluginsDirectory(base)
  const features = process.env.BESOIN_SANS_MODELE === '1' ? [] : FEATURES.filter((f) => f === 'project-management')
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
    - id: lecture
      path: lecture
      label: Lecture
extensions:
  pluginsDir: ${plugins}
  apps: []
  features: [${features.join(', ')}]
`
}
