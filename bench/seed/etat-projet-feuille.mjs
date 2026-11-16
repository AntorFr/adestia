/**
 * The `etat-projet-blocs` instance plus a test plugin that ships two page seeds (B-30, E-36, AD-36).
 * It is a TEST seed, not the shipped "Project status" template: the second one has a long name and a
 * long line so the phone layout is seen with text that wraps, and its `template:` carries `fr` text.
 */
import { join } from 'node:path'

import blocks from './etat-projet-blocs.mjs'
import { put } from './_lib.mjs'
export { scripts, engine, config } from './etat-projet-blocs.mjs'

const PICTURE = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 72"><rect width="160" height="72" rx="6" fill="${fill}" opacity=".18"/><rect x="12" y="12" width="60" height="10" rx="3" fill="${fill}"/><rect x="12" y="30" width="136" height="8" rx="3" fill="${fill}" opacity=".5"/><rect x="12" y="46" width="100" height="8" rx="3" fill="${fill}" opacity=".5"/></svg>\n`

export default async function seed(context) {
  const yaml = await blocks(context)
  const dir = join(context.base, 'seed-plugins')
  await put(dir, 'bench-templates/adestia-plugin.json', JSON.stringify({
    schemaVersion: 1,
    id: 'bench-templates',
    kind: 'feature',
    description: 'Ships two page seeds for the E-36 bench.',
    contract: 1,
    templates: ['templates/status.md', 'templates/long.md'],
  }, null, 2) + '\n')
  await put(dir, 'bench-templates/templates/status.svg', PICTURE('#3b6fd4'))
  await put(dir, 'bench-templates/templates/long.svg', PICTURE('#7a4fb0'))
  await put(dir, 'bench-templates/templates/status.md', `---
template:
  name: {en: Test status, fr: Statut d'essai}
  image: ./status.svg
  description: {en: A summary and a line of prose., fr: Une synthèse et une ligne de texte.}
type: project-management
---

:::section{title="Summary"}
Write the point of the project in one line.
:::

:::progress
:::
`)
  await put(dir, 'bench-templates/templates/long.md', `---
template:
  name: {en: A template whose name is long enough to wrap on a phone and then some, fr: Un modèle dont le nom est assez long pour passer à la ligne sur un téléphone}
  image: ./long.svg
  description: {en: A line that is also long so that the card has to wrap it instead of cutting it short somewhere in the middle of a word., fr: Une ligne longue elle aussi}
---

Body of the long seed.
`)
  return yaml.replace(/features: \[([^\]]*)\]/, (_, list) => `features: [${list}, bench-templates]`)
}
