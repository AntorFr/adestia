/**
 * Data for the complement ensemble tests of `adestia-pages-blocs-formulaires` (B-27, E-35: the table form, the
 * block that changes under an open form, the single undo step). The `besoin-pages-deplacer` instance
 * (project-management enabled, writable) plus copies of the hand-written files of
 * `packages/web/test/fixtures/complement-formulaires/`, one per test that writes.
 */
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { put } from './_lib.mjs'
import { build } from './besoin-pages-deplacer.mjs'

export { scripts, engine, config } from './besoin-pages-deplacer.mjs'

const fixtures = new URL('../../packages/web/test/fixtures/complement-formulaires/', import.meta.url)

const COPIES = {
  'tableau-avant.md': ['tb-colonne', 'tb-barre'],
  'figures-avant.md': ['f-annuler'],
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
