/**
 * Data for the second pass of tests on the pages tranche (adestia-correctifs-pages), written from
 * its need: the cases `besoin-pages` leaves out. Same instance as `besoin-pages` (populated base,
 * planif app, scripted engine) plus a deep page, an empty `:::callout` beside an unknown block, a CRLF page
 * for the editor, and planif notes in the three cadences, each in `\n` and in `\r\n`.
 */
import { page, put } from './_lib.mjs'
import besoinPages from './besoin-pages.mjs'

export { ready, scripts, engine, config } from './besoin-pages.mjs'

const crlf = (text) => text.replace(/\n/g, '\r\n')

export default async function seed(ctx) {
  const yaml = await besoinPages(ctx)
  const { workspace: w } = ctx
  const p = (path, text) => put(w, `pages/${path}`, text)

  // A page two folders down: its trail names exactly those two folders.
  await p('dossier/sous/profonde.md', page({ title: 'Page profonde' }, 'Un texte.'))
  // An empty :::callout beside an unknown block: read-only, with the sentence `content` writes for it.
  await p('callout-vide.md', page({ title: 'Encadré vide' }, ':::zorglub\nQuelque chose.\n:::\n\n:::callout\n:::'))
  // A page for the editor whose frontmatter ends its lines in \r\n.
  await p('editeur-crlf.md', crlf('---\ntitle: Fiche éditeur CRLF\nstatus: ouverte\nrole: cuisine\ncat: bois\n---\n\nCorps.\n'))
  await p('editeur-lf.md', '---\ntitle: Fiche éditeur LF\nstatus: ouverte\nrole: cuisine\ncat: bois\n---\n\nCorps.\n')
  // Two pages the refused-save test writes into, one per theme: a fresh file each.
  for (const i of [0, 1]) await p(`refus-${i}.md`, page({ title: `Page à refuser ${i}` }, 'Corps.'))
  // A page with a callout right under the header, for E-6 with its anchor high.
  await p('haut.md', page({ title: 'Bloc en haut' }, ':::callout{ico=💡 title="Bloc haut"}\nDedans.\n:::\n\nSuite.'))

  // Planif notes: `at:`, `enabled: false` and `until:`, in LF and in CRLF.
  const note = (front, body) => `---\n${front}\n---\n\n${body}\n`
  for (const [tag, wrap] of [['LF', (t) => t], ['CRLF', crlf]]) {
    await put(w, `planif/at-${tag.toLowerCase()}.md`, wrap(note(`title: Note at ${tag}\nat: 08:00`, 'Fais le point.')))
    await put(w, `planif/off-${tag.toLowerCase()}.md`, wrap(note(`title: Note coupée ${tag}\nevery: 2h\nenabled: false`, 'Fais le point.')))
    await put(w, `planif/until-${tag.toLowerCase()}.md`, wrap(note(`title: Note mission ${tag}\nevery: 2h\nuntil: 2099-12-31`, 'Fais le point.')))
  }
  return yaml
}
