/** One seat of `maxConcurrentTurns` and a turn already holding it: the next turn is refused (P-2 step 4). */
import { configFor, populate, storeToken, ready } from './_base.mjs'
import { railThreads, scripts, engine, config } from './chat-rail.mjs'

// `base`'s own ready starts the turn « Conversation en cours », which takes the only seat.
export { ready, scripts, engine, config }

export default async function seed(ctx) {
  await populate(ctx)
  await railThreads(ctx.dataDir)
  await storeToken(ctx.dataDir)
  return configFor(ctx, 'maxConcurrentTurns: 1\n')
}
