/**
 * The instance for the pages tranche seen from its need (adestia-correctifs-pages):
 * the populated base (its refused plugin and failed MCP server put a band above the page),
 * a page at the root of the workspace, a page that breaks the vocabulary, frontmatter in
 * `\r\n` next to its `\n` twin (sections, a collection, planif notes), and the planif app.
 */
import { join } from 'node:path'

import { MCP_HEALTH, MCP_TOKEN, populate, storeToken } from './_base.mjs'
import { page, put } from './_lib.mjs'
import { APPS, pluginsDirectory } from './_plugins.mjs'
import { chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'none' }

const crlf = (text) => text.replace(/\n/g, '\r\n')

export default async function seed(ctx) {
  const { workspace: w, base } = ctx
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const p = (path, text) => put(w, `pages/${path}`, text)

  // A page at the root of the store, and one in a folder.
  await p('racine.md', page({ title: 'Page à la racine' }, 'Un texte.\n\n:::callout{ico=💡 title="Un encadré"}\nDedans.\n:::'))
  // A folder whose name is the root page's file name (racine.md) short of its last letter: a folder the page does not sit in.
  await p('racine.m/INDEX.md', page({ title: 'Dossier voisin' }, 'Un autre dossier.'))
  await p('racine.m/x.md', page({ title: 'Page voisine' }, 'Texte.'))
  await p('dossier/enfant.md', page({ title: 'Page dans un dossier' }, 'Un texte.'))

  // A tall page at the root: a block far below the bands, and room to scroll it under the header.
  const para = (n) => Array.from({ length: n }, (_, i) => `Paragraphe ${i + 1}.`).join('\n\n')
  await p('haute.md', page({ title: 'Page haute' }, `${para(6)}\n\n:::callout{ico=💡 title="Bloc bas"}\nDedans.\n:::\n\n${para(30)}`))

  // An unknown block: the page opens read-only with its diagnostics.
  await p('blocs-faux.md', page({ title: 'Blocs faux' }, ':::zorglub\nQuelque chose.\n:::\n\n:::callout{x=1 title="A"}\nTexte.\n:::'))

  // Frontmatter in CRLF, and the same pages in LF.
  const fiche = (id, status, role, cat) => `---\ntitle: Fiche ${id}\nstatus: ${status}\nrole: ${role}\ncat: ${cat}\n---\n\nCorps ${id}.\n`
  for (const [dir, wrap] of [['lf', (t) => t], ['crlf', crlf]]) {
    await p(`${dir}/INDEX.md`, wrap('---\ntitle: Dossier ' + dir + '\n---\n\nDossier.\n'))
    await p(`${dir}/a.md`, wrap(fiche('A', 'ouverte', 'cuisine', 'bois')))
    await p(`${dir}/b.md`, wrap(fiche('B', 'fermée', 'jardin', 'bois')))
    await p(`${dir}/c.md`, wrap(fiche('C', 'ouverte', 'cuisine', 'métal')))
  }

  // One facet field per folder, so each of status, role and cat is read alone.
  for (const [dir, wrap] of [['lf', (t) => t], ['crlf', crlf]]) {
    for (const [field, values] of [['role', ['cuisine', 'jardin', 'cuisine']], ['cat', ['bois', 'métal', 'bois']]]) {
      await p(`${dir}-${field}/INDEX.md`, wrap(`---\ntitle: Dossier ${dir} ${field}\n---\n\nDossier.\n`))
      for (const [i, v] of values.entries()) await p(`${dir}-${field}/p${i}.md`, wrap(`---\ntitle: Page ${i}\n${field}: ${v}\n---\n\nCorps.\n`))
    }
    // A collection of fiches grouped by cat.
    await p(`${dir}-coll/INDEX.md`, wrap('---\ntitle: Collection ' + dir + '\ntype: collection\nof: fiche' + dir + '\ngroupBy: cat\ninto: ' + dir + '-coll/membres\n---\n\nLes fiches.\n'))
    for (const [i, v] of ['bois', 'métal', 'bois'].entries())
      await p(`${dir}-coll/membres/m${i}.md`, wrap(`---\ntitle: Membre ${i}\ntype: fiche${dir}\ncat: ${v}\n---\n\nCorps.\n`))
  }

  // Planif notes in CRLF: one valid, one invalid for a reason that must be read.
  const note = (front, body) => crlf(`---\n${front}\n---\n\n${body}\n`)
  await put(w, 'planif/crlf-valide.md', note('title: Note CRLF valide\nevery: 2h', 'Fais le point.'))
  await put(w, 'planif/crlf-trop-vite.md', note('title: Note CRLF trop rapide\nevery: 5m', 'Trop souvent.'))
  await put(w, 'planif/lf-valide.md', page({ title: 'Note LF valide', every: '2h' }, 'Fais le point.'))

  const plugins = await pluginsDirectory(base)
  return `name: Adestia bench
auth:
  mode: none
workspace:
  stores:
    - id: perso
      path: pages
      label: Perso
      default: true
extensions:
  pluginsDir: ${plugins}
  apps: [planif]
mcp:
  enabled: true
  token: ${MCP_TOKEN}
  agentName: alfred
  servers:
    - name: meteo
      command: node
      args: [meteo.js]
`
}
