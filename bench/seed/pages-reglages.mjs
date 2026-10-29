/** Base's real E-19 bands, plus enough page content to exercise scrolling. */
import base from './base.mjs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
export { scripts, engine } from './base.mjs'
export default async function seed(context) {
  const config = await base(context)
  const file = join(context.workspace, 'pages/pieces/dossier.md')
  const source = await readFile(file, 'utf8')
  const paragraphs = (count) => Array.from({ length: count }, (_, i) => `Paragraph ${i + 1} of the settings bench.\n\n`).join('')
  await writeFile(file, source.replace(':::list', `${paragraphs(8)}:::list`) + '\n\n' + paragraphs(35))
  return config
}
