/** The `plugins` seed, plus pages that draw `timeline` in both views and `subproject` in both (E-31, B-25). */
import plugins from './plugins.mjs'
import { day } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed(context) {
  const yaml = await plugins(context)
  const w = context.workspace
  const p = (path, front, body) => put(w, `pages/${path}`, page(front, body))
  const written = `- Cadrage: ${day(-60)} → ${day(-20)}\n- Chantier en retard: ${day(-30)} → ${day(-5)}\n- Réalisation: ${day(-10)} → ${day(40)}\n- Recette: ${day(30)}`
  await p('redessin/barres/INDEX.md', { title: 'Frise en barres', type: 'project-management' }, `:::timeline\n${written}\n:::\n\n:::timeline{depth="children"}\n:::\n\n:::subproject\n:::\n\n:::subproject{view="cards"}\n:::`)
  await p('redessin/liste/INDEX.md', { title: 'Frise en liste', type: 'project-management' }, `:::timeline{view="list"}\n${written}\n:::\n\n:::timeline{view="list" depth="children"}\n:::\n\n:::subproject{view="cards"}\n:::`)
  await p('redessin/liste/alpha.md', { title: 'Alpha', type: 'project-management', start: day(-40), due: day(20), 'project-status': 'Amber' }, 'x')
  await p('redessin/liste/bravo.md', { title: 'Bravo', type: 'project-management', status: 'en cours', start: day(-40), due: day(-3) }, 'x')
  await p('redessin/barres/alpha.md', { title: 'Alpha', type: 'project-management', start: day(-40), due: day(20), 'project-status': 'Amber' }, 'x')
  await p('redessin/barres/bravo.md', { title: 'Bravo', type: 'project-management', status: 'en cours', start: day(-40), due: day(-3) }, 'x')
  return yaml
}
