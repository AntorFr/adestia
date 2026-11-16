/**
 * B-30: the seed `etat-projet-gabarit` with the `project-management` plugin switched off, so that no model is
 * shipped and the "New from template" button must be absent (the plugin's pages stay on disk, unread).
 */
import gabarit from './etat-projet-gabarit.mjs'
export { scripts, engine, config } from './etat-projet-gabarit.mjs'

export default async function seed(context) {
  const yaml = await gabarit(context)
  const off = yaml.replace(/^(\s*features:\s*\[)(.*)(\])$/m, (_, open, list, close) =>
    `${open}${list.split(',').map((s) => s.trim()).filter((s) => s && s !== 'project-management').join(', ')}${close}`)
  if (off === yaml) throw new Error('the seed does not list project-management among its features')
  return off
}
