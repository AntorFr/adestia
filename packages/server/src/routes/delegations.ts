/**
 * The delegations screen's two questions: what ran here, and what did it
 * say. Read-only on purpose — these conversations belong to the CALLING
 * agents, and a person typing into one would inject a turn into a
 * conversation its owner believes it holds alone. Gated like every other /api
 * route: any signed-in human may look, which is rather the point.
 */

import type { FastifyInstance } from 'fastify'

import type { DelegationChannel } from '../delegations.js'

export function registerDelegations(
  app: FastifyInstance,
  deps: { readonly channel: DelegationChannel },
): void {
  const { channel } = deps
  app.get('/api/delegations', async () => ({ delegations: await channel.list() }))

  app.get<{ Params: { caller: string; id: string } }>(
    '/api/delegations/:caller/:id',
    async (request, reply) => {
      let conversation
      try {
        conversation = await channel.read(request.params.caller, request.params.id)
      } catch {
        // An unsafe caller segment throws in the store's last-line guard;
        // from this side it is the same answer as a conversation that is not there.
        conversation = undefined
      }
      if (!conversation) return reply.code(404).send({ error: 'no such delegation' })
      return { caller: request.params.caller, ...conversation }
    },
  )
}
