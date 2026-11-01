/** Two seats of `maxConcurrentTurns`, both held by the base seed (a running turn and a delegated one): the next turn is refused with a limit of 2. */
import { configFor, populate, storeToken, ready } from './_base.mjs'
import { railThreads, scripts, engine, config } from './chat-rail.mjs'

// `base`'s ready starts « Conversation en cours » and a delegated job: two seats.
export { ready, scripts, engine, config }

export default async function seed(ctx) {
  await populate(ctx)
  await railThreads(ctx.dataDir)
  await storeToken(ctx.dataDir)
  return configFor(ctx, 'maxConcurrentTurns: 2\n')
}
