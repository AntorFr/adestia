/**
 * B-30: the seed `etat-projet-gabarit` with every plugin that ships a model switched off (`project-management`,
 * `journal`, `todo`), so that no model is shipped and the "New from template" button must be absent (the
 * plugins' pages stay on disk, unread).
 */
import gabarit from './etat-projet-gabarit.mjs'
export { scripts, engine, config } from './etat-projet-gabarit.mjs'

const SHIPPING = new Set(['project-management', 'journal', 'todo'])

export default async function seed(context) {
  const yaml = await gabarit(context)
  const off = yaml.replace(/^(\s*(?:features|apps):\s*\[)(.*)(\])$/gm, (_, open, list, close) =>
    `${open}${list.split(',').map((s) => s.trim()).filter((s) => s && !SHIPPING.has(s)).join(', ')}${close}`)
  if (off === yaml) throw new Error('the seed does not list a plugin that ships a model')
  return off
}
