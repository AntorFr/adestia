/**
 * `adestia-dossiers-fichier-reglages` (B-36, B-37): a plugin-less instance with three folders.
 * `cave` has a `.folder.md` (title « Ma cave », icon 🍷, colour rouge) and two pages;
 * `jardin` has a `.folder.md` (colour vert) and a page; `maison` has no `.folder.md`, an `INDEX.md`
 * (title « Sommaire maison », and an old colour the product must no longer read) and one other page.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import { SIGNATURE_ORIGIN, chatScripts } from './_scripts.mjs'

export const scripts = chatScripts
export const engine = { mcp: [], auth: 'absent' }
export const config = { file: 'writable' }

export default async function seed({ workspace, base }) {
  await put(workspace, 'pages/cave/vins.md', page({ title: 'Vins' }, 'Texte.'))
  await put(workspace, 'pages/cave/resume.md', page({ title: 'Resume cave' }, 'Texte.'))
  await put(workspace, 'pages/cave/.folder.md', '---\ntitle: Ma cave\nico: 🍷\ncouleur: rouge\n---\n')
  await put(workspace, 'pages/jardin/rosiers.md', page({ title: 'Rosiers' }, 'Texte.'))
  await put(workspace, 'pages/jardin/.folder.md', '---\ncouleur: vert\n---\n')
  await put(workspace, 'pages/maison/INDEX.md', page({ title: 'Sommaire maison', couleur: 'bleu' }, 'Texte.'))
  await put(workspace, 'pages/maison/plan.md', page({ title: 'Plan maison' }, 'Texte.'))
  const plugins = join(base, 'seed-plugins')
  await mkdir(plugins, { recursive: true })
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
  pluginsDir: ${plugins}
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
`
}
