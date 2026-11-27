/**
 * The Attachments brick of a folder (E-3, B-38): the plugins instance (`voyages`
 * active) plus folders under `pj/` holding files and, each, one page so the
 * folder is a section.
 *
 *   pj/complet  a PDF and two photos                     → brick « 3 »
 *   pj/mixte    the same plus `assets/voyage.json`       → the route lists 3 (voyages owns the folder: its screen opens, not E-3)
 *   pj/donnees  only `assets/voyage.json`                → the route lists none
 *   pj/treize   thirteen files                           → twelve rows, « Show all 13 »
 *   pj/cache    a file and `attachments: false`          → no brick
 */
import { put, page } from './_lib.mjs'
import plugins from './plugins.mjs'

export { scripts, engine, config } from './plugins.mjs'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64')

export default async function seed(ctx) {
  const yaml = await plugins(ctx)
  const w = `${ctx.workspace}`
  const p = (path, text, mode) => put(w, `pages/pj/${path}`, text, mode)
  await p('INDEX.md', page({ title: 'Pièces jointes', type: 'index' }, 'Dossiers du banc.'))
  await p('complet/note.md', page({ title: 'Note du dossier' }, 'Texte.'))
  await p('complet/.folder.md', '---\nattachments: true\n---\n')
  await p('complet/billet.pdf', '%PDF-1.4\n% billet\n')
  await p('complet/photo-une.png', PNG)
  await p('complet/assets/photo-deux.png', PNG)
  const trip = '{"titre":"Bench","lieux":[],"items":[]}'
  await p('mixte/.folder.md', '---\nattachments: true\n---\n')
  await p('mixte/billet.pdf', '%PDF-1.4\n% billet\n')
  await p('mixte/photo-une.png', PNG)
  await p('mixte/assets/photo-deux.png', PNG)
  await p('mixte/assets/voyage.json', trip)
  await p('donnees/note.md', page({ title: 'Seulement des données' }, 'Texte.'))
  await p('donnees/.folder.md', '---\nattachments: true\n---\n')
  await p('donnees/assets/voyage.json', trip)
  await p('treize/note.md', page({ title: 'Treize fichiers' }, 'Texte.'))
  await p('treize/.folder.md', '---\nattachments: true\n---\n')
  for (let i = 1; i <= 13; i++) await p(`treize/piece-${String(i).padStart(2, '0')}.pdf`, `%PDF-1.4\n% ${i}\n`)
  await p('cache/note.md', page({ title: 'Pièces masquées' }, 'Texte.'))
  await p('cache/.folder.md', '---\nattachments: false\n---\n')
  await p('cache/billet.pdf', '%PDF-1.4\n% billet\n')
  return yaml
}
