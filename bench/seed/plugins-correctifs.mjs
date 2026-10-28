/** Plugin proof: the normal seed, a hand layout, a dated block and an Amber phase. */
import plugins from './plugins.mjs'
import { page, put } from './_lib.mjs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export { scripts, engine, config } from './plugins.mjs'

export default async function seed(context) {
  const config = await plugins(context)
  const workbook = JSON.parse(await readFile(join(context.workspace, 'pages/projets/caisson/assets/workbook.json'), 'utf8'))
  // A hand-placed piece makes the real reset gesture available. No POST is faked.
  await put(context.workspace, 'pages/projets/caisson/assets/workbook-layout.json', JSON.stringify({
    poses: { [workbook.pieces[0].etiquette]: { plaque: workbook.debit[0].plaque, x: 20, y: 20 } }, bandes: {},
  }))
  await put(context.workspace, 'pages/proof/plugin-date.md', page({ title: 'Content date proof', type: 'fiche' },
    ':::content{title="Calendar day" by="Bench" on=2026-03-04}\nA dated content block.\n:::\n\n:::content{title="Author value" on=bientôt}\nAn author value stays as written.\n:::'))
  await put(context.workspace, 'pages/renovation/amber.md', page({
    title: 'Owner assessment', type: 'project-management', start: '2026-09-01', due: '2026-12-31', 'project-status': 'Amber',
  }, 'An explicit Amber assessment, beside the seed’s overdue milestone.'))
  return config
}
