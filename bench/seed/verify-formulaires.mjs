/**
 * Data for the verifier's ensemble tests of `adestia-pages-blocs-formulaires` (B-25, B-26, B-27; P-18),
 * written from the need. The `besoin-pages-deplacer` instance (project-management enabled, writable) plus
 * pages copied from the hand-written files of `packages/web/test/fixtures/verify-formulaires/`: one copy
 * per test that writes, named `<prefix>-<case>`.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { put } from './_lib.mjs'
import { build } from './besoin-pages-deplacer.mjs'

export { scripts, engine, config } from './besoin-pages-deplacer.mjs'

const fixtures = new URL('../../packages/web/test/fixtures/verify-formulaires/', import.meta.url)

const COPIES = {
  'figures-avant.md': ['f-lecture', 'f-variante', 'f-variante-meme', 'f-ajout', 'f-ordre', 'f-suppr', 'f-invalide', 'f-brut', 'f-brut-forme', 'f-annule', 'f-modif', 'f-fr', 'f-obligatoire', 'f-telephone', 'f-reglages-fr', 'f-callout-pas', 'f-vide', 'f-brut-texte', 'f-brut-intact'],
  'figures-illisible-avant.md': ['f-illisible'],
  'timeline-avant.md': ['t-reglages', 't-ajout', 't-brut', 't-invalide', 't-ordre'],
  'liste-avant.md': ['l-variante', 'l-ajout', 'l-brut'],
  'tableau-avant.md': ['tb-ajout', 'tb-brut'],
  'vide-avant.md': ['i-figures', 'i-figures-inline', 'i-annule', 'i-liste', 'i-tableau', 'i-lecture'],
  'vide-projet-avant.md': ['i-timeline', 'i-timeline-brut'],
}

export default async function seed(ctx) {
  const config = await build(ctx, { projectManagement: true })
  for (const [fixture, names] of Object.entries(COPIES))
    for (const name of names) {
      await put(ctx.workspace, `pages/${name}.md`, '')
      await copyFile(new URL(fixture, fixtures), join(ctx.workspace, 'pages', `${name}.md`))
    }
  return config
}
