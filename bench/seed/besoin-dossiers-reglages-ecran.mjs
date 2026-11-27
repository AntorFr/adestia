/**
 * `adestia-dossiers-reglages-ecran` seen from its need (B-39, B-40; P-23; E-39, E-3, E-4): the plugins
 * instance plus folders under the pages store, written by hand from docs/parcours.md (P-23) and
 * docs/ecrans.md (E-39). None of them carries a `.folder.md` unless the case needs it.
 *
 *   chaudiere  two pages (« Résumé chaudière », « Entretien ») and a PDF, no settings   → the nominal of P-23
 *   cuisine    `.folder.md` with `page: plan.md` (a page that exists), and one other page          → opens the page; the settings clear it
 *   garage     two pages, no settings                                                          → refused writes, cancel, offline
 *   fantome    `.folder.md` with `page: disparu.md` (no such file) and one page          → opens the classic view
 *   gele       one page, directory mode 555                                              → cannot be written
 *   voyage     `app: voyages`, `page: note.md`, a page and `assets/voyage.json`          → the plugin's screen wins
 */
import { chmod } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import plugins from './plugins.mjs'

export { scripts, engine, config } from './plugins.mjs'

export default async function seed(ctx) {
  const yaml = await plugins(ctx)
  const w = ctx.workspace
  const p = (path, text) => put(w, `pages/${path}`, text)
  await p('chaudiere/resume.md', page({ title: 'Résumé chaudière' }, 'Chaudière gaz, révisée chaque octobre.'))
  await p('chaudiere/entretien.md', page({ title: 'Entretien' }, 'Purger les radiateurs.'))
  await p('chaudiere/facture.pdf', '%PDF-1.4\n% facture\n')
  await p('cuisine/.folder.md', '---\ntitle: Cuisine\npage: plan.md\n---\n')
  await p('cuisine/plan.md', page({ title: 'Plan de la cuisine' }, 'Quatre meubles hauts, deux bas.'))
  await p('cuisine/autre.md', page({ title: 'Autre fiche' }, 'Texte.'))
  await p('garage/etabli.md', page({ title: 'Établi du garage' }, 'Texte.'))
  await p('garage/outils.md', page({ title: 'Outils' }, 'Texte.'))
  await p('fantome/.folder.md', '---\npage: disparu.md\n---\n')
  await p('fantome/note.md', page({ title: 'Note fantôme' }, 'Texte.'))
  await p('gele/fiche.md', page({ title: 'Fiche gelée' }, 'Texte.'))
  await p('voyage/.folder.md', '---\napp: voyages\npage: note.md\n---\n')
  await p('voyage/note.md', page({ title: 'Note du voyage' }, 'Texte de la page choisie.'))
  await p('voyage/assets/voyage.json', '{"titre":"Bench","lieux":[],"items":[]}')
  await chmod(join(w, 'pages/gele'), 0o555)
  ctx.onClose(async () => {
    await chmod(join(w, 'pages/gele'), 0o755).catch(() => undefined)
  })
  return yaml
}
