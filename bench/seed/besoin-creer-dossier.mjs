/**
 * `adestia-decouverte-creer-dossier`: a plugin-less instance whose default store holds one page and
 * one folder (`projets`, with a page), a second writable store (`famille`, a folder `commun`), and a
 * READ-ONLY store mounted at `lecture` (a folder `ancien` with a page, held in a mode 555 directory).
 * Written from the need (B-32, B-33): the + is there with tiles, a folder in read-only draws no +.
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
  await mkdir(join(base, 'famille', 'commun'), { recursive: true })
  await put(base, 'lecture/ancien/vieille.md', page({ title: 'Vieille page' }, 'Texte.'))
  await chmod(join(base, 'lecture/ancien'), 0o555)
  await chmod(join(base, 'lecture'), 0o555)
  onClose(async () => {
    await chmod(join(base, 'lecture'), 0o755).catch(() => undefined)
    await chmod(join(base, 'lecture/ancien'), 0o755).catch(() => undefined)
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
    - id: famille
      path: ${join(base, 'famille')}
      label: Famille
    - id: lecture
      path: ${join(base, 'lecture')}
      label: Lecture
      at: lecture
extensions:
  pluginsDir: ${plugins}
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
`
}
