/**
 * The threads a person keeps: listing, naming, reading, archiving.
 */

import type { FastifyInstance } from 'fastify'

import type { ConversationStore } from '../conversations.js'
import type { TurnDesk } from '../turns.js'
import { identityOf } from './identity.js'

export function registerConversations(
  app: FastifyInstance,
  { conversations, desk }: { readonly conversations: ConversationStore; readonly desk: TurnDesk },
): void {
  app.get('/api/conversations', async (request) => {
    const userId = identityOf(request).userId
    const list = await conversations.list(userId)
    return {
      // `turn` is computed against the desk per request, never stored: a
      // status dot that survived a crash in a file would show a turn nobody
      // is running. Absent means idle.
      conversations: list.map((meta) => {
        const job = desk.activeFor(`${userId}/c:${meta.id}`)
        return job ? { ...meta, turn: job.waiting ? ('waiting' as const) : ('running' as const) } : meta
      }),
    }
  })

  app.post<{ Body?: { title?: unknown } }>('/api/conversations', async (request) => {
    // The title comes with the creation rather than in a second call: a thread
    // that exists for one round trip under the name "New conversation" is a
    // thread that keeps that name whenever the second call is lost.
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
    return conversations.create(
      identityOf(request).userId,
      ...(title.length > 0 ? ([title] as const) : []),
    )
  })

  app.patch<{ Params: { id: string }; Body?: { title?: unknown } }>(
    '/api/conversations/:id',
    async (request, reply) => {
      const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
      if (title.length === 0) return reply.code(400).send({ error: 'title is required' })

      const userId = identityOf(request).userId
      if (!(await conversations.read(userId, request.params.id))) {
        return reply.code(404).send({ error: 'no such conversation' })
      }
      await conversations.rename(userId, request.params.id, title)
      return { renamed: true }
    },
  )

  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const conversation = await conversations.read(identityOf(request).userId, request.params.id)
    // 404 rather than an empty thread: "this conversation is not yours" and
    // "this conversation is empty" must not look the same to the UI.
    if (!conversation) return reply.code(404).send({ error: 'no such conversation' })
    return conversation
  })

  app.post<{ Params: { id: string }; Body?: { archived?: unknown } }>(
    '/api/conversations/:id/archive',
    async (request, reply) => {
      // Reversible by construction: the same route brings a thread back, so
      // an archive is never a delete somebody has to regret.
      const archived = request.body?.archived !== false
      const userId = identityOf(request).userId
      const existing = await conversations.read(userId, request.params.id)
      if (!existing) return reply.code(404).send({ error: 'no such conversation' })
      await conversations.archive(userId, request.params.id, archived)
      return { id: request.params.id, archived }
    },
  )

  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const removed = await conversations.remove(identityOf(request).userId, request.params.id)
    if (!removed) return reply.code(404).send({ error: 'no such conversation' })
    return { deleted: true }
  })
}
