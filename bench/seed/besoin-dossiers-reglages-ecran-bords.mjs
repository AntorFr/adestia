/**
 * `adestia-dossiers-reglages-ecran`, the edges of its need (B-39, B-40; P-23; E-39, E-4): the seed
 * `besoin-dossiers-reglages-ecran` plus two folders written by hand from docs/parcours.md (P-23) and docs/ecrans.md (E-39).
 *
 *   verrou   `.folder.md` with `page: note.md`, a page, directory mode 555   → read-only folder whose replacement page opens
 *   retrait  one page, and `chemin.md` holding the path of the pages store    → a test withdraws the right to write while the sheet is open
 */
import { chmod } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import base from './besoin-dossiers-reglages-ecran.mjs'

export { scripts, engine, config } from './besoin-dossiers-reglages-ecran.mjs'

export default async function seed(ctx) {
  const yaml = await base(ctx)
  const w = ctx.workspace
  await put(w, 'pages/verrou/.folder.md', '---\npage: note.md\n---\n')
  await put(w, 'pages/verrou/note.md', page({ title: 'Note du verrou' }, 'Texte de la page du dossier verrouillé.'))
  await put(w, 'pages/retrait/fiche.md', page({ title: 'Fiche du retrait' }, 'Texte.'))
  await put(w, 'pages/retrait/chemin.md', page({ title: 'Chemin' }, join(w, 'pages/retrait')))
  await chmod(join(w, 'pages/verrou'), 0o555)
  ctx.onClose(async () => {
    await chmod(join(w, 'pages/verrou'), 0o755).catch(() => undefined)
    await chmod(join(w, 'pages/retrait'), 0o755).catch(() => undefined)
  })
  return yaml
}
