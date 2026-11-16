/** The `plugins` seed, plus pages that draw `progress`, `milestones` and `risks` in each state (E-31, B-29). */
import plugins from './plugins.mjs'
import { day } from './_plugins.mjs'
import { page, put } from './_lib.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed(context) {
  const yaml = await plugins(context)
  const w = context.workspace
  const p = (path, front, body) => put(w, `pages/${path}`, page(front, body))
  const blocks = (m, r) => `:::milestones\n${m}\n:::\n\n:::risks\n${r}\n:::`
  // Empty: no page below, empty bullets.
  await p('etat/vide/INDEX.md', { title: 'Projet vide', type: 'project-management' }, `:::progress\n:::\n\n${blocks('-', '-')}`)
  await p('etat/une/INDEX.md', { title: 'Une ligne', type: 'project-management' }, `:::progress{view=bar}\n:::\n\n${blocks(`- Recette: ${day(20)}`, '- Fournisseur: High — Marc')}`)
  await p('etat/une/seule.md', { title: 'Seule page', type: 'fiche', due: day(10) }, 'Une.')
  const rows = (n) => Array.from({ length: n }, (_, i) => i)
  await p('etat/plusieurs/INDEX.md', { title: 'Plusieurs lignes', type: 'project-management' },
    `:::progress\n:::\n\n:::progress{view=bar}\n:::\n\n${blocks(
      [`- Cadrage: ${day(-30)} — done`, `- Maquette: ${day(-5)}`, `- Livraison: ${day(14)}`, `- Mise en service d’une installation au nom volontairement très long pour vérifier le retour à la ligne: ${day(45)}`].join('\n'),
      ['- Fournisseur unique: High — Marc', '- Budget: medium — Léa', '- Météo: Low', '- Un risque dont le libellé est très long pour voir comment il passe à la ligne sur un téléphone: High — Jean-Baptiste Longuenom'].join('\n'),
    )}\n\n:::milestones{view=cards}\n- Cadrage: ${day(-30)} — done\n- Livraison: ${day(14)}\n:::\n\n:::risks{view=cards}\n- Budget: Medium — Léa\n- Fournisseur: High\n:::`)
  for (const i of rows(8)) await p(`etat/plusieurs/sous-${i}.md`, { title: `Sous-page ${i}`, type: 'fiche', ...(i < 5 ? { status: 'clos' } : {}), due: day(i < 5 ? -20 : i === 5 ? -3 : 7 * i) }, 'x')
  await p('etat/illisible/INDEX.md', { title: 'Ligne illisible', type: 'project-management' },
    blocks(`- Recette: ${day(20)}\n- Pas de deux-points\n- Gel: 2026-02-31`, '- Fournisseur: High — Marc\n- Panne: Critique\n- sans niveau'))
  return yaml
}
