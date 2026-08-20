/**
 * The Fastify application.
 *
 * One rule governs this file: **there is a single spawn site.** Every agent
 * turn — chat, scheduled, delegated over MCP — goes through `runTurn` here, so
 * the driver's env contract, the concurrency cap and the transcript are
 * applied once. The predecessor had two spawn paths and forgetting one broke a
 * whole channel silently for days.
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/golem-drivers'

import { isPublicRoute, resolveIdentity, type Identity } from './auth.js'
import { ConversationStore, type StoredMessage } from './conversations.js'
import type { GolemConfig } from './config.js'
import { frontendPayload, type DiscoveredPlugin, type DiscoveryProblem } from './extensions.js'
import { registerPages } from './pages.js'
import { registerStatic } from './static.js'

export interface AppDependencies {
  readonly config: GolemConfig
  readonly driver: Driver
  readonly plugins: readonly DiscoveredPlugin[]
  readonly pluginProblems: readonly DiscoveryProblem[]
  /** Built shell bundle. Absent in dev, where Vite serves it and proxies here. */
  readonly webRoot?: string | undefined
}

/** The identity every authenticated route can count on. */
function identityOf(request: FastifyRequest): Identity {
  return (request as FastifyRequest & { identity?: Identity }).identity ?? {
    userId: 'local',
    displayName: 'Local user',
    groups: [],
  }
}

/** Turn admission: subscription limits are real, so concurrency is bounded. */
class TurnLimiter {
  #running = 0
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.#running >= this.max) return false
    this.#running += 1
    return true
  }

  release(): void {
    this.#running = Math.max(0, this.#running - 1)
  }

  get running(): number {
    return this.#running
  }
}

/** One SSE frame. Multi-line payloads must be prefixed per line or they break. */
export function sseFrame(event: TurnEvent): string {
  const data = JSON.stringify(event)
  return `event: ${event.type}\ndata: ${data}\n\n`
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, driver, plugins, pluginProblems, webRoot } = deps
  const app = Fastify({ logger: false })
  const limiter = new TurnLimiter(config.maxConcurrentTurns)
  const conversations = new ConversationStore(config.dataDir)
  const descriptor: DriverDescriptor = await driver.describe()

  app.decorateRequest('identity', null)

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicRoute(request.url.split('?')[0] ?? request.url)) return

    const outcome = resolveIdentity(
      { headers: request.headers as Record<string, string | string[] | undefined> },
      config.auth,
    )
    if (!outcome.ok) {
      await reply.code(outcome.status).send({ error: outcome.reason })
      return reply
    }
    ;(request as FastifyRequest & { identity: Identity }).identity = outcome.identity
    return undefined
  })

  app.get('/api/health', () => ({ status: 'ok' }))

  /**
   * What the UI is built from. The driver's *name* never appears — the front
   * end renders from capabilities alone, so a second engine needs no UI change.
   */
  app.get('/api/instance', (request) => ({
    driver: {
      label: descriptor.label,
      cliVersion: descriptor.cliVersion,
      capabilities: descriptor.capabilities,
    },
    auth: { mode: config.auth.mode },
    user: (request as FastifyRequest & { identity?: Identity }).identity ?? null,
    skin: config.extensions.skin,
    plugins: frontendPayload(plugins),
    /**
     * Refused plugins are reported to the UI, not buried in a log nobody
     * reads: a plugin you believe is loaded and is not costs far more than one
     * that says out loud why it was rejected.
     */
    pluginProblems,
    turns: { max: config.maxConcurrentTurns, running: limiter.running },
  }))

  app.get('/api/models', async (_request, reply) => {
    if (!descriptor.capabilities.includes('modelSelection')) {
      // 404, not an empty list: "this instance cannot enumerate models" and
      // "this instance has no models" are different facts.
      await reply.code(404).send({ error: 'this driver does not enumerate models' })
      return reply
    }
    const listModels = (driver as Driver & { listModels(): Promise<unknown> }).listModels
    return { models: await listModels.call(driver) }
  })

  app.get('/api/conversations', async (request) => ({
    conversations: await conversations.list(identityOf(request).userId),
  }))

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

  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (request, reply) => {
    const removed = await conversations.remove(identityOf(request).userId, request.params.id)
    if (!removed) return reply.code(404).send({ error: 'no such conversation' })
    return { deleted: true }
  })

  app.post<{
    Body: { prompt?: unknown; sessionId?: unknown; model?: unknown; conversationId?: unknown }
  }>(
    '/api/turn',
    async (request, reply) => {
      const body = request.body ?? {}
      if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
        await reply.code(400).send({ error: 'prompt is required' })
        return reply
      }
      if (!limiter.tryAcquire()) {
        // Refusing now beats queueing behind a lock that may not release for
        // an hour: a refusal is information, a silent wait is not.
        await reply.code(429).send({
          error: 'too many turns running',
          max: config.maxConcurrentTurns,
        })
        return reply
      }

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        // Nginx and friends buffer SSE into uselessness without this.
        'x-accel-buffering': 'no',
      })

      const userId = identityOf(request).userId
      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId : undefined

      if (conversationId) {
        await conversations.append(userId, conversationId, {
          id: randomUUID(),
          role: 'user',
          text: body.prompt,
          at: new Date().toISOString(),
        })
      }

      // Accumulated as the turn streams, so what is stored is what the UI drew
      // — tool calls, interruption, usage — not just the final text.
      const tools: { name: string; target?: string; ok?: boolean }[] = []
      let text = ''
      let stopped = false
      let failure: string | undefined
      let usage: StoredMessage['usage']

      try {
        const events = driver.runTurn({
          prompt: body.prompt,
          cwd: config.workspace.root,
          ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}),
          ...(typeof body.model === 'string' ? { model: body.model } : {}),
        })
        for await (const event of events) {
          reply.raw.write(sseFrame(event))
          if (event.type === 'text-delta') text += event.text
          else if (event.type === 'tool-use') {
            tools.push({ name: event.name, ...(event.target ? { target: event.target } : {}) })
          } else if (event.type === 'tool-result') {
            const pending = tools.findLast((tool) => tool.name === event.name && tool.ok === undefined)
            if (pending) pending.ok = event.ok
          } else if (event.type === 'error') failure = event.message
          else if (event.type === 'result') {
            stopped = event.stopped
            usage = {
              ...(event.usage?.contextTokens !== undefined
                ? { contextTokens: event.usage.contextTokens }
                : {}),
              ...(event.usage?.outputTokens !== undefined
                ? { outputTokens: event.usage.outputTokens }
                : {}),
            }
            if (conversationId) await conversations.setSession(userId, conversationId, event.sessionId)
          }
        }
      } catch (error) {
        failure = (error as Error).message
        reply.raw.write(sseFrame({ type: 'error', message: failure, fatal: true }))
      } finally {
        if (conversationId) {
          // Written even when the turn failed: a thread that silently drops
          // the answer it did produce is worse than one showing it broke.
          await conversations
            .append(userId, conversationId, {
              id: randomUUID(),
              role: 'agent',
              text,
              at: new Date().toISOString(),
              ...(tools.length > 0 ? { tools } : {}),
              ...(stopped ? { stopped } : {}),
              ...(failure ? { error: failure } : {}),
              ...(usage ? { usage } : {}),
            })
            .catch(() => undefined)
        }
        limiter.release()
        reply.raw.end()
      }
      return reply
    },
  )

  app.post<{ Body: { sessionId?: unknown } }>('/api/turn/stop', async (request, reply) => {
    const sessionId = request.body?.sessionId
    if (typeof sessionId !== 'string') {
      await reply.code(400).send({ error: 'sessionId is required' })
      return reply
    }
    try {
      await driver.interrupt(sessionId)
      return { stopped: true }
    } catch (error) {
      await reply.code(409).send({ error: (error as Error).message })
      return reply
    }
  })

  registerPages(app, { root: join(config.workspace.root, config.workspace.pages) })

  // Last, so an API route always wins over the shell's catch-all.
  registerStatic(app, { plugins, ...(webRoot ? { webRoot } : {}) })

  return app
}
