/**
 * B-30, P-20: the shipped "Project status" template, from a project folder of a few sub-pages.
 * `projet/` holds five sub-pages (two finished, one late) and no page of the template yet; the real
 * `project-management` plugin ships the template, so no test plugin is added.
 */
import blocks from './etat-projet-blocs.mjs'
import { day } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './etat-projet-blocs.mjs'

export default async function seed(context) {
  const yaml = await blocks(context)
  const p = (path, front, body) => put(context.workspace, `pages/${path}`, page(front, body))
  const subs = [
    ['cadrage', 'Cadrage', 'clos', -40, -30],
    ['maquette', 'Maquette', 'clos', -30, -10],
    ['developpement', 'Développement', 'en cours', -10, 20],
    ['recette', 'Recette', 'en cours', 15, 35],
    ['retard', 'Dossier en retard', 'en cours', -30, -3],
  ]
  for (const [slug, title, status, start, due] of subs) {
    await p(`projet/${slug}.md`, { title, type: 'fiche', status, start: day(start), due: day(due) }, 'x')
  }
  return yaml
}
