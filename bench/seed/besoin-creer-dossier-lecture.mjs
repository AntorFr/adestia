/**
 * `adestia-decouverte-creer-dossier`: a plugin-less instance whose ONLY store is read-only (a mode 555
 * directory holding a page and a folder). Nothing at all can be created: no + is drawn (B-32).
 */
import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import { SIGNATURE_ORIGIN, chatScripts } from './_scripts.mjs'

export const scripts = chatScripts
export const engine = { mcp: [], auth: 'absent' }
export const config = { file: 'writable' }

export default async function seed({ base, onClose }) {
  await put(base, 'gele/fiche.md', page({ title: 'Fiche gelée' }, 'Texte.'))
  await put(base, 'gele/dossier/page.md', page({ title: 'Page gelée' }, 'Texte.'))
  await chmod(join(base, 'gele/dossier'), 0o555)
  await chmod(join(base, 'gele'), 0o555)
  onClose(async () => {
    await chmod(join(base, 'gele'), 0o755).catch(() => undefined)
    await chmod(join(base, 'gele/dossier'), 0o755).catch(() => undefined)
  })
  const plugins = join(base, 'seed-plugins')
  await mkdir(plugins, { recursive: true })
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: gele
      path: ${join(base, 'gele')}
      label: Gelé
      default: true
extensions:
  pluginsDir: ${plugins}
signatures:
  origins: ["${SIGNATURE_ORIGIN}"]
`
}
