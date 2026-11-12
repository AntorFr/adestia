/**
 * Data for the ensemble tests of `adestia-pages-deplacer` (B-23, B-24; P-17; E-4 move, E-34), written from
 * its need. A bare instance (no band over the page): pages to move blocks in, pages to insert blocks into,
 * `project-management` enabled, a plugin ENABLED with a gallery record and a plugin PRESENT BUT NOT enabled
 * with one too, and a plugin block that has no record at all.
 */
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PNG, page, put } from './_lib.mjs'
import { repoRoot } from './_plugins.mjs'

export const scripts = []
export const engine = { mcp: [], auth: 'armed' }
export const config = { file: 'writable' }

const callout = (n) => `:::callout{ico=💡 title="Bloc ${n}"}\nTexte du bloc ${n}.\n:::`

async function plugin(dir, id, vocabulary, gallery) {
  await mkdir(join(dir, id), { recursive: true })
  const tags = Object.keys(vocabulary).map((b) => `'${b}': () => null`).join(', ')
  await writeFile(join(dir, id, 'blocks.js'), `export default function create() { return { tags: { ${tags} } } }\n`)
  await writeFile(join(dir, id, 'card.png'), PNG)
  await writeFile(
    join(dir, id, 'adestia-plugin.json'),
    JSON.stringify({ schemaVersion: 1, id, kind: 'app', description: `Bench plugin ${id}.`, contract: 1, blocks: './blocks.js', vocabulary, ...(gallery ? { gallery } : {}), tile: { label: id, icon: '🧪', hue: 'gris' } }),
  )
}

export async function build({ workspace: w, base }, { projectManagement }) {
  const p = (path, text) => put(w, `pages/${path}`, text)
  // P-17 step 1: six blocks in the wrong order. The same page, one copy per test that writes.
  for (const name of ['six-clavier', 'six-boutons', 'six-telephone', 'six-bords', 'six-enregistre', 'six-retry', 'six-appui'])
    await p(`${name}.md`, page({ title: `Six blocs ${name}` }, [1, 2, 3, 4, 5, 6].map(callout).join('\n\n')))
  await p('un-seul.md', page({ title: 'Un seul bloc' }, callout(1)))
  await p('zero.md', page({ title: 'Aucun bloc' }, ''))
  // Gallery: two blocks, focus on the first one.
  for (const name of ['galerie-apres', 'galerie-fin', 'galerie-annule', 'galerie-recherche', 'galerie-lecture', 'galerie-enregistre', 'galerie-tous'])
    await p(`${name}.md`, page({ title: `Galerie ${name}` }, [1, 2].map(callout).join('\n\n')))
  // Read-only: a block the vocabulary does not know.
  await p('lecture-seule.md', page({ title: 'Lecture seule' }, `${callout(1)}\n\n:::zorglub\nQuelque chose.\n:::`))
  // Pages that use the project blocks.
  await p('projet.md', page({ title: 'Projet', type: 'project-management' }, `${callout(1)}\n\n:::timeline\n:::\n\n:::subproject\n:::`))

  const dir = join(base, 'seed-plugins')
  await mkdir(dir, { recursive: true })
  if (projectManagement) await symlink(join(repoRoot, 'plugins', 'project-management'), join(dir, 'project-management'), 'dir')
  await plugin(dir, 'bench-galerie-on', { 'bench-rapport': { content: 'empty', description: 'A report.' } }, {
    'bench-rapport': { name: { en: 'Activity report', fr: 'Rapport d’activité' }, line: { en: 'Sums up the week of a team.', fr: 'Résume la semaine d’une équipe.' }, image: './card.png', group: 'Bench group' },
  })
  // present on disk, never listed in `apps`: not enabled
  await plugin(dir, 'bench-galerie-off', { 'bench-secret': { content: 'empty', description: 'Hidden.' } }, {
    'bench-secret': { name: { en: 'Disabled secret block', fr: 'Bloc secret désactivé' }, line: { en: 'Must not be listed.', fr: 'Ne doit pas figurer.' }, image: './card.png', group: 'Bench off' },
  })
  // enabled, a block and NO gallery record
  await plugin(dir, 'bench-sans-fiche', { 'bench-nu': { content: 'empty', description: 'No record.' } }, undefined)

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
  pluginsDir: ${dir}
  apps: [bench-galerie-on, bench-sans-fiche]
  features: [${projectManagement ? 'project-management' : ''}]
`
}

export default (ctx) => build(ctx, { projectManagement: true })
