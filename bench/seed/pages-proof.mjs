/** Four page repairs, with a CRLF note read by E-23 as well as the clock. */
import settings from './pages-reglages.mjs'
import { put, page } from './_lib.mjs'
import { symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
export { scripts, engine } from './pages-reglages.mjs'

export default async function seed(context) {
  const config = await settings(context)
  await put(context.workspace, 'pages/notes.md', page({ title: 'Root proof' }, '# Root proof\n\nA root page has no parent folder.'))
  await put(context.workspace, 'pages/proof/readonly.md', page({ title: 'Diagnostic proof' }, ':::unknown-proof\nAuthor content stays intact.\n:::'))
  const crlf = page({ title: 'CRLF proof', status: 'active', role: 'proof', cat: 'bench' }, '# CRLF proof\n\nThe editor and index read the same fields.')
    .replace('\n---\n', '\n---  \n').replaceAll('\n', '\r\n')
  await put(context.workspace, 'pages/proof/crlf.md', crlf)
  await put(context.workspace, 'planif/crlf-proof.md', page({ title: 'CRLF scheduled proof', at: '"07:30, 12:30"', enabled: 'false', expired: '2026-10-01' }, 'Read the CRLF proof page.').replace('\n---\n', '\n---  \n').replaceAll('\n', '\r\n'))
  await symlink(resolve('plugins/planif'), join(context.base, 'seed-plugins/planif'), 'dir')
  return config.replace('  tools: [', '  apps: [planif]\n  tools: [')
}
