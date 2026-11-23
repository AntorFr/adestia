/** The `plugins` seed with the journal plugin switched off, to see it leave the list of the + (B-34). */
import plugins from './plugins.mjs'
export { scripts, engine, config } from './plugins.mjs'

export default async function seed(context) {
  const yaml = await plugins(context)
  const off = yaml.replace(/^(\s*apps:\s*\[)(.*)(\])$/m, (_, open, list, close) =>
    `${open}${list.split(',').map((s) => s.trim()).filter((s) => s && s !== 'journal').join(', ')}${close}`)
  if (off === yaml) throw new Error('the seed does not list journal among its apps')
  return off
}
