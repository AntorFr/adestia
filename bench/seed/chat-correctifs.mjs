/** E-16 repairs: one seat, occupied by the scenario only while it proves a refusal. */
import { configFor, populate, storeToken } from './_base.mjs'
import { scripts, engine, config } from './chat-rail.mjs'

export { scripts, engine, config }

export default async function seed(ctx) {
  await populate(ctx)
  await storeToken(ctx.dataDir)
  return configFor(ctx, 'maxConcurrentTurns: 1\n')
}
