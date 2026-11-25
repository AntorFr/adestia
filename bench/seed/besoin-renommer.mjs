/**
 * `adestia-decouverte-renommer-ecrans`: a plugin-less instance, written from the need (B-35).
 * Default store `perso` with folders `projets` (a page), `plans` (a page), `vide` (empty);
 * a READ-ONLY store mounted at `lecture` holding two pages that link `[[projets/alpha]]`
 * (so a rename of `projets` leaves `unrewritten` at 2), and a writable store mounted at
 * `lecture/ouvert` (a folder whose parent is read-only).
 */
import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import { SIGNATURE_ORIGIN, chatScripts } from './_scripts.mjs'

export const scripts = chatScripts
export const engine = { mcp: [], auth: 'absent' }
export const config = { file: 'writable' }

export default async function seed({ workspace, base, onClose }) {
  await put(workspace, 'pages/fiche.md', page({ title: 'Fiche' }, 'Texte.'))
  await put(workspace, 'pages/projets/alpha.md', page({ title: 'Alpha' }, 'Texte.'))
  await put(workspace, 'pages/plans/un.md', page({ title: 'Un' }, 'Texte.'))
  await put(workspace, 'pages/pris/x.md', page({ title: 'X' }, 'Texte.'))
  await mkdir(join(workspace, 'pages/vide'), { recursive: true })
  await put(base, 'lecture/note-a.md', page({ title: 'Note A' }, 'Voir [[projets/alpha]].'))
  await put(base, 'lecture/note-b.md', page({ title: 'Note B' }, 'Voir [[projets/alpha:Alpha]] aussi.'))
  await mkdir(join(base, 'ouvert', 'dedans'), { recursive: true })
  await put(base, 'ouvert/dedans/p.md', page({ title: 'P' }, 'Texte.'))
  await chmod(join(base, 'lecture'), 0o555)
  onClose(async () => {
    await chmod(join(base, 'lecture'), 0o755).catch(() => undefined)
  })
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
    - id: lecture
      path: ${join(base, 'lecture')}
      label: Lecture
      at: lecture
    - id: ouvert
      path: ${join(base, 'ouvert')}
      label: Ouvert
      at: lecture/ouvert
extensions:
  pluginsDir: ${plugins}
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
`
}
