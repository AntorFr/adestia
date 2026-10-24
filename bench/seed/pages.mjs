/** The base corpus, one app without a view and one editable page holding every kind of block, for the pages matrix. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import seed, { engine, scripts, config } from './base.mjs'
import { page, put, PNG } from './_lib.mjs'
export { engine, scripts, config }
export default async function pages(ctx) {
  const yaml = await seed(ctx)
  // Every block the vocabulary draws, valid, so the page is editable (the base's
  // `tous-les-blocs` is refused on purpose and opens read-only).
  const body = `# Tous les blocs, éditable

Un paragraphe, puis une liste à puces :

- un premier point
- un second, avec **du gras** et un [[projet#servante]] qui existe
- un lien perdu : [[projet#introuvable]]

> Une citation, pour voir son filet.

:::callout{ico=💡 title="À savoir"}
Un encadré, avec un peu de texte dedans.
:::

:::figures{title="En chiffres" ico=📊 couleur=rouge}
- Avancement: 62 % — 8 lots sur 13
- Jalon: 12 oct. — dans 3 jours
:::

:::table
| Pièce | Quantité |
|---|---|
| Plaque | 2 |
| Tasseau | 14 |
:::

:::list{source=files view=cards title="Fichiers" ico=📎}
:::

:::list{depth=children pull=status title="Sous-pages"}
:::

:::gallery
![Avant](assets/degrade.png)
![Après](assets/degrade.png)
:::

:::content{type=note title="À gauche" w=1/2}
Un premier bloc de la ligne.
:::

:::content{type=note title="À droite" w=1/2}
Un second.
:::

:::content{type=note from=disparu title="D'un plugin absent"}
Ce bloc demande un plugin qui n'est pas là.
:::
`
  await put(ctx.workspace, 'pages/editeur/blocs.md', page({ title: 'Tous les blocs, éditable', type: 'fiche', id: 'editeur-blocs' }, body))
  await put(ctx.workspace, 'pages/editeur/assets/degrade.png', PNG)
  await put(ctx.workspace, 'pages/editeur/assets/plan.pdf', '%PDF-1.4\n% bench\n')
  const dir = join(ctx.base, 'seed-plugins', 'bench-noview')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'adestia-plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'bench-noview', kind: 'app', description: 'An inactive screen for the pages bench.', contract: 1, blocks: './blocks.js', vocabulary: { 'bench-noview': { content: 'empty', description: 'No view' } }, tile: { label: 'No view', icon: 'plug' } }))
  await writeFile(join(dir, 'blocks.js'), "export default function create() { return { tags: { 'bench-noview': () => null } } }\n")
  return yaml.replace('  tools: [', '  apps: [bench-noview]\n  tools: [')
}
