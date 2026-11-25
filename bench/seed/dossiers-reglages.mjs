/**
 * The folder settings tranche seen from the screen (adestia-dossiers-fichier-reglages-ecran):
 * the populated base plus folders dressed by their `.folder.md`, a folder holding an
 * `INDEX.md` and a homonymous page as ordinary cards, and a folder the file leaves bare.
 */
import { MCP_HEALTH, populate, storeToken } from './_base.mjs'
import { page, put } from './_lib.mjs'
import { chatScripts } from './_scripts.mjs'

export { ready } from './_base.mjs'
export const scripts = chatScripts
export const engine = { mcp: MCP_HEALTH, auth: 'armed' }
export const config = { file: 'none' }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  const w = ctx.workspace
  const p = (path, text) => put(w, `pages/${path}`, text)

  await p('atelier/.folder.md', '---\ntitle: Atelier du garage\nico: 🔧\ncouleur: vert\n---\n')
  await p('atelier/INDEX.md', page({ title: 'Vue d’ensemble de l’atelier' }, 'Une page comme une autre.'))
  await p('atelier/atelier.md', page({ title: 'Page homonyme' }, 'Ordinaire aussi.'))
  await p('atelier/etabli.md', page({ title: 'Établi' }, 'Texte.'))
  await p('cave/.folder.md', '---\nico: 🍷\ncouleur: rouge\n---\n')
  await p('cave/vins.md', page({ title: 'Vins' }, 'Texte.'))
  await p('nu/une.md', page({ title: 'Une page' }, 'Texte.'))
  // An old-style index: nothing reads its settings any more.
  await p('ancien/INDEX.md', page({ title: 'Titre ignoré', ico: '❌', couleur: 'red' }, 'Plus de réglages ici.'))
  await p('ancien/b.md', page({ title: 'B' }, 'Texte.'))
  return ''
}
