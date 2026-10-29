/**
 * The instance for the ensemble tests of `adestia-correctifs-plugins` (bench/tests/plugins-ensemble.test.mjs):
 * the ten bundled plugins of the `plugins` seed, plus
 *  - a layout the user made by hand in the atelier, so that the reset gesture exists
 *    (`poses` keyed by the piece's label, the format the layout file has);
 *  - pages carrying `:::content` blocks with a date, a date at the year's end, and a value that is not a date.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { page, put } from './_lib.mjs'
import plugins from './plugins.mjs'

export { scripts, engine, config } from './plugins.mjs'

export default async function seed(context) {
  const config = await plugins(context)
  const workbook = JSON.parse(await readFile(join(context.workspace, 'pages/projets/caisson/assets/workbook.json'), 'utf8'))
  const first = workbook.pieces[0].etiquette
  await put(context.workspace, 'pages/projets/caisson/assets/workbook-layout.json', JSON.stringify({
    poses: { [first]: { plaque: workbook.debit[0].plaque, x: 20, y: 20 } }, bandes: {},
  }))
  await put(context.workspace, 'pages/ensemble/dates.md', page({ title: 'Dates des blocs', type: 'fiche' },
    [
      ':::content{type=note title="Mi-mars" on=2026-03-14}\nBloc du quatorze mars.\n:::',
      ':::content{type=note title="Fin decembre" on=2026-12-31}\nBloc de fin d annee.\n:::',
      ':::content{type=note title="Pas une date" on=bientot}\nValeur de l auteur.\n:::',
    ].join('\n\n')))
  // Missions that ended: the agent wrote `done:` on one, the product stamped `expired:` on the other (P-12 step 4).
  await put(context.workspace, 'planif/mission-faite.md', page({ title: 'Mission faite', every: '1d', until: '2026-12-01', done: '2026-10-20' }, 'Rien a faire de plus.'))
  await put(context.workspace, 'planif/mission-echue.md', page({ title: 'Mission echue', every: '1d', until: '2026-10-10', expired: '2026-10-11' }, 'Le delai est passe.'))
  // An owner's explicit Amber assessment: the one thing amber may mean on the planning screens.
  await put(context.workspace, 'pages/renovation/amber.md', page({
    title: 'Evaluation du proprietaire', type: 'project-management', start: '2026-09-01', due: '2026-12-31', 'project-status': 'Amber',
  }, 'Une evaluation Amber posee par le proprietaire.'))
  return config
}
