/** `besoin-etat-projet` with no plugin on: no template is shipped, so no button must be drawn (B-30). */
import seed from './besoin-etat-projet.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function sansModele(context) {
  const yaml = await seed(context)
  const off = yaml.replace(/features: \[.*\]/, 'features: []')
  if (off === yaml) throw new Error('the seed lists no feature to switch off')
  return off
}
