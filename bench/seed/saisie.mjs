/** Base, plus the reference pages of the data form (E-35): figures, list and table, each with a line nobody can read. */
import base from './base.mjs'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
export { scripts, engine } from './base.mjs'
const fixtures = new URL('../../packages/web/test/fixtures/blockform/', import.meta.url)
export default async function seed(context) {
  const config = await base(context)
  const dir = join(context.workspace, 'pages/saisie')
  await mkdir(dir, { recursive: true })
  for (const name of ['figures', 'list', 'table']) await copyFile(new URL(`${name}.md`, fixtures), join(dir, `${name}.md`))
  return config
}
