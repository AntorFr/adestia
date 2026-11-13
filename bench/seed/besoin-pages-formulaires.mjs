/**
 * Data for the ensemble tests of `adestia-pages-blocs-formulaires` (B-25, B-26, B-27; P-18; E-6, E-35), written from
 * its need. The `besoin-pages-deplacer` instance (project-management enabled, writable) plus: pages whose files
 * are the hand-written references in `packages/web/test/fixtures/besoin-formulaires/` (one copy per test that
 * writes), and empty pages to insert from the gallery, plain and `project-management`.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import { build } from './besoin-pages-deplacer.mjs'

export { scripts, engine, config } from './besoin-pages-deplacer.mjs'

const fixtures = new URL('../../packages/web/test/fixtures/besoin-formulaires/', import.meta.url)

export default async function seed(ctx) {
  const config = await build(ctx, { projectManagement: true })
  const w = ctx.workspace
  const copy = async (from, to) => {
    await put(w, `pages/${to}`, '')
    await copyFile(new URL(from, fixtures), join(w, 'pages', to))
  }
  for (const n of ['variante', 'form-ajout', 'form-ordre', 'form-suppr', 'form-invalide', 'form-annule', 'brut-ecrit', 'brut-meme', 'form-vide', 'lecture'])
    await copy('figures-avant.md', `chiffres-${n}.md`)
  for (const n of ['form-ajout', 'brut-ecrit', 'form-vide']) await copy('timeline-avant.md', `planning-${n}.md`)
  await copy('illisible-avant.md', 'illisible.md')
  await copy('liste-avant.md', 'equipe-form-ajout.md')
  await copy('liste-avant.md', 'equipe-variante.md')
  await copy('inconnu.md', 'chiffres-inconnu.md')
  for (const n of ['form-ajout-fr', 'form-invalide-fr']) await copy('figures-avant.md', `chiffres-${n}.md`)
  await copy('timeline-avant.md', 'planning-invalide.md')
  await put(w, 'pages/vide-callout.md', page({ title: 'Page vide callout' }, 'Du texte.'))
  await put(w, 'pages/vide.md', page({ title: 'Page vide' }, 'Du texte.'))
  await put(w, 'pages/vide-liste.md', page({ title: 'Page vide liste' }, 'Du texte.'))
  await put(w, 'pages/vide-projet.md', page({ title: 'Projet vide', type: 'project-management' }, 'Du texte.'))
  await put(w, 'pages/vide-projet-2.md', page({ title: 'Projet vide 2', type: 'project-management' }, 'Du texte.'))
  return config
}
