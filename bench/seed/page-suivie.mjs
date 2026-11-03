/**
 * The base instance plus the pages `bench/scenarios/page-suivie.mjs` rewrites
 * and deletes, as the agent would: one per posture in the main store, one in
 * the second store. The scenario writes the files itself (the engine is the
 * fake one), so this seed only creates them.
 *
 * `BENCH_WATCH=off` starts the instance with `workspace.watch.enabled: false`.
 */
import { join } from 'node:path'
import seed, { engine, scripts, config } from './base.mjs'
import { page, put } from './_lib.mjs'
export { engine, scripts, config }

export const ORIGINAL = 'Version d’origine de la page.'

export default async function pageSuivie(ctx) {
  const yaml = await seed(ctx)
  for (const name of ['lecture', 'edition', 'disparue-lecture', 'disparue-edition']) {
    await put(ctx.workspace, `pages/suivi/${name}.md`, page({ title: `Suivi ${name}` }, ORIGINAL))
  }
  await put(join(ctx.base, 'famille'), 'suivi/partage.md', page({ title: 'Suivi partagé' }, ORIGINAL))
  return process.env.BENCH_WATCH === 'off' ? yaml.replace('workspace:\n', 'workspace:\n  watch:\n    enabled: false\n') : yaml
}
