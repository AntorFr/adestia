/**
 * Data for the recette tests of `adestia-pages-blocs-formulaires` (B-25, B-26, B-27), written from its need.
 * The `besoin-pages-deplacer` instance (project-management enabled, writable) plus one copy per test that
 * writes of the hand-written references in `packages/web/test/fixtures/recette-formulaires/`.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import { build } from './besoin-pages-deplacer.mjs'

export { scripts, engine, config } from './besoin-pages-deplacer.mjs'

const fixtures = new URL('../../packages/web/test/fixtures/recette-formulaires/', import.meta.url)

export default async function seed(ctx) {
  const config = await build(ctx, { projectManagement: true })
  const w = ctx.workspace
  const copy = async (from, to) => {
    await put(w, `pages/${to}`, '')
    await copyFile(new URL(from, fixtures), join(w, 'pages', to))
  }
  for (const n of ['variante', 'ajout', 'ordre', 'suppr', 'invalide', 'raw', 'fr', 'lecture', 'defaut', 'aussitot'])
    await copy('figures-avant.md', `rf-chiffres-${n}.md`)
  await copy('figures-inline.md', 'rf-chiffres-inline.md')
  for (const n of ['ajout', 'raw']) await copy('timeline-avant.md', `rf-planning-${n}.md`)
  for (const n of ['figures', 'figures-inline']) await put(w, `pages/rf-vide-${n}.md`, page({ title: `Vide ${n}` }, 'Du texte.'))
  for (const n of ['pm']) await put(w, `pages/rf-vide-${n}.md`, page({ title: 'Projet vide', type: 'project-management' }, 'Du texte.'))
  return config
}
