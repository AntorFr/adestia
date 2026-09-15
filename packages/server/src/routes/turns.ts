/**
 * A chat turn, from the POST that starts it to the stream that follows it:
 * starting, re-attaching, answering the engine's question, stopping.
 *
 * Every chat turn goes through the desk built by `buildApp`, so the driver's
 * env contract, the concurrency cap and the transcript are applied once.
 */

import { randomUUID } from 'node:crypto'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AskAnswer, AskDesk, ShellToolsHandle, TurnEvent } from '@antorfr/adestia-drivers'

import { frameAttachments, type AttachmentInbox, type StoredAttachment } from '../attachments.js'
import type { Identity } from '../auth.js'
import type { AdestiaConfig, McpServerConfig } from '../config.js'
import type { ConversationStore } from '../conversations.js'
import type { McpSignIn } from '../mcp-signin.js'
import { frameView } from '../screen.js'
import { TurnCapacityError, type TurnDesk, type TurnJob, type TurnSpec } from '../turns.js'
import { identityOf } from './identity.js'

/** Per-user tokens, when the instance keeps them. */
export interface UserTokens {
  accessToken(subject: string): Promise<string | undefined>
  remember(subject: string, refreshToken: string): Promise<void>
}

/** The instance's own tools, minted per turn and released with it. */
export interface ShellToolsPort {
  handleFor(ctx: { userId: string; conversationId: string }): ShellToolsHandle
  release(handle: ShellToolsHandle): Promise<void>
}

export interface TurnsDependencies {
  readonly config: AdestiaConfig
  readonly desk: TurnDesk
  readonly conversations: ConversationStore
  readonly inbox: AttachmentInbox
  readonly mcpSignIn: McpSignIn
  readonly outboundServers: () => Promise<readonly McpServerConfig[]>
  /** The stores mounted outside the workspace, named to the engine. */
  readonly agentRoots: readonly string[]
  readonly userTokens?: UserTokens | undefined
  readonly shellTools?: ShellToolsPort | undefined
  readonly asks?: AskDesk | undefined
}

/**
 * The desk address of a conversation's turns.
 *
 * What serializes turns: the conversation when there is one, the CLI session
 * otherwise. Both prefixed by the user — a key is an address, and two people
 * must never share one. A turn with no conversation is an EPHEMERAL one —
 * the parity bar's ephemeral mode, which the shell does not offer yet: the
 * browser holds the engine session because no thread exists to hold it,
 * and nothing can read such a turn back, adopt it or stop it by address.
 * The shell never falls into this path by accident any more: a thread it
 * could not create is said, not skipped.
 *
 * Written once because two routes need the SAME answer: the one that starts a
 * turn and the one that stops it. A stop that computes its own key is a stop
 * that misses.
 */
function turnKey(
  userId: string,
  conversationId: string | undefined,
  sessionId: string | undefined,
): string | undefined {
  if (conversationId) return `${userId}/c:${conversationId}`
  if (sessionId) return `${userId}/s:${sessionId}`
  return undefined
}

/** One SSE frame. Multi-line payloads must be prefixed per line or they break. */
export function sseFrame(event: TurnEvent): string {
  const data = JSON.stringify(event)
  return `event: ${event.type}\ndata: ${data}\n\n`
}

export function registerTurns(app: FastifyInstance, deps: TurnsDependencies): void {
  const { config, desk, conversations, inbox, mcpSignIn, outboundServers, agentRoots, userTokens } = deps

  app.post<{
    Body: {
      prompt?: unknown
      sessionId?: unknown
      model?: unknown
      conversationId?: unknown
      attachments?: unknown
      view?: unknown
    }
  }>(
    '/api/turn',
    async (request, reply) => {
      const body = request.body ?? {}
      if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
        await reply.code(400).send({ error: 'prompt is required' })
        return reply
      }

      // Resolved before the turn: an id that escapes the inbox is refused
      // rather than handed to the agent as a path to read.
      const attachments: StoredAttachment[] = []
      for (const id of Array.isArray(body.attachments) ? body.attachments : []) {
        if (typeof id !== 'string') continue
        const path = inbox.resolve(id)
        if (path) attachments.push({ id, name: id.split('/').pop() ?? id, bytes: 0, path })
      }

      const userId = identityOf(request).userId
      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId : undefined
      const sessionId =
        typeof body.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : undefined

      const key = turnKey(userId, conversationId, sessionId)

      // The caller's own identity, for the servers that serve their own
      // data. Resolved here because this is the only turn with a person at
      // the other end: the clock's and a delegation's have none, and
      // deliberately pass nothing.
      const caller = (request as FastifyRequest & { identity?: Identity }).identity
      const callerToken = caller?.userId
        ? await userTokens?.accessToken(caller.userId)
        : undefined

      // The signed-in servers' tokens, minted from THIS caller's own keys —
      // the per-person half of `identity: user`, for the servers whose door
      // the rebound token cannot open. A person who never connected yields no
      // entry, and the driver then omits the server from their turn.
      const serverTokens = caller?.userId
        ? await mcpSignIn.tokensFor(await outboundServers(), caller.userId)
        : {}

      // The instance's own tools, minted for THIS turn of THIS conversation.
      // The handle is how `rename_conversation` knows its target without the
      // model ever seeing an id; a turn without a conversation carries none,
      // because it has nothing to rename and no reason to hold a token.
      const tools =
        conversationId && deps.shellTools
          ? deps.shellTools.handleFor({ userId, conversationId })
          : undefined

      const spec: TurnSpec = {
        request: {
          // Framed here, not in the browser: what the thread stores is the
          // raw prompt, so a reload replays what the person typed rather
          // than the gateway's own notes.
          prompt: frameView(frameAttachments(body.prompt, attachments), body.view),
          cwd: config.workspace.root,
          ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
          // A thread's session is the THREAD's, read from its file when the
          // turn is dispatched (`session` below) — never the browser's copy.
          // The browser's copy is exactly what a stream dying under a sleeping
          // phone loses, and a message posted without it opened a fresh engine
          // session that then replaced the thread's own. Only a turn with no
          // thread still names its session from the request.
          ...(!conversationId && sessionId ? { sessionId } : {}),
          ...(typeof body.model === 'string' ? { model: body.model } : {}),
          ...(callerToken ? { callerToken } : {}),
          ...(Object.keys(serverTokens).length > 0 ? { serverTokens } : {}),
          ...(tools ? { tools } : {}),
        },
        ...(conversationId
          ? {
              session: async () =>
                (await conversations.read(userId, conversationId))?.sessionId,
            }
          : {}),
        // Written even when the turn failed: a thread that silently drops
        // the answer it did produce is worse than one showing it broke. The
        // desk calls this whether or not anybody is still watching — which
        // is the whole point of the desk.
        finish: async (outcome) => {
          if (!conversationId) return
          await conversations.recordOutcome(userId, conversationId, outcome)
          // Last, after this turn's own appends: the token dies with the
          // turn, and a rename during it compacts the thread here — under
          // the desk's serialization, so the rewrite races nothing.
          if (tools) await deps.shellTools?.release(tools).catch(() => undefined)
        },
      }

      let admission
      try {
        admission = desk.admit(key)
      } catch (error) {
        if (error instanceof TurnCapacityError) {
          // Refusing now beats queueing behind a lock that may not release
          // for an hour: a refusal is information, a silent wait is not.
          // Only a conversation's OWN backlog ever queues, above.
          await reply.code(429).send({
            error: 'too many turns running',
            max: config.maxConcurrentTurns,
          })
          return reply
        }
        throw error
      }

      if (conversationId) {
        // Persisted the moment it is ACCEPTED — held or run alike. This line
        // is why a queued message survives a reload: it is in the thread
        // before the browser hears anything back.
        try {
          await conversations.append(userId, conversationId, {
            id: randomUUID(),
            role: 'user',
            text: body.prompt,
            at: new Date().toISOString(),
          })
        } catch (error) {
          if (admission.mode === 'run') admission.abort()
          // The turn will never run, so its finish will never release this.
          if (tools) await deps.shellTools?.release(tools).catch(() => undefined)
          await reply.code(500).send({ error: (error as Error).message })
          return reply
        }
      }

      if (admission.mode === 'queued') {
        admission.enqueue(spec)
        // 202: accepted, held. The browser shows it waiting and re-attaches
        // for the merged turn once the running one settles.
        await reply.code(202).send({ held: true })
        return reply
      }

      await streamJob(admission.start(spec), request, reply)
      return reply
    },
  )

  /**
   * Re-attaching to the turn a conversation is running — turn adoption.
   *
   * A reload, a phone that slept, a second tab: the turn kept running at the
   * desk, and this replays its whole event log then follows live. Same
   * frames, same reducer in the browser — an adopted turn is
   * indistinguishable from one never left. 204 says "nothing running", which
   * is an answer, not an error.
   */
  app.get<{ Querystring: { conversation?: string } }>('/api/turn/attach', async (request, reply) => {
    const conversationId = request.query.conversation
    if (typeof conversationId !== 'string' || conversationId === '') {
      await reply.code(400).send({ error: 'conversation is required' })
      return reply
    }
    const job = desk.activeFor(`${identityOf(request).userId}/c:${conversationId}`)
    if (!job) {
      await reply.code(204).send()
      return reply
    }
    await streamJob(job, request, reply)
    return reply
  })

  /**
   * One subscription of one response to one job. The job outlives the
   * response by design: a client that goes away is unsubscribed and nothing
   * else — the turn keeps running at the desk.
   */
  async function streamJob(job: TurnJob, request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // Nginx and friends buffer SSE into uselessness without this.
      'x-accel-buffering': 'no',
    })

    // Snapshot and subscribe in the SAME tick: events are emitted from the
    // driver's async loop, so nothing can land between the two.
    for (const event of job.log) reply.raw.write(sseFrame(event))

    await new Promise<void>((resolve) => {
      const unsubscribe = job.subscribe({
        event: (event) => reply.raw.write(sseFrame(event)),
        end: () => {
          reply.raw.end()
          resolve()
        },
      })
      request.raw.on('close', () => {
        unsubscribe()
        resolve()
      })
    })
  }

  /**
   * Answering what the engine asked.
   *
   * Three answers, no policy: `once` allows this call, `always` allows it and
   * hands the engine back its OWN suggestion so IT writes the rule into its
   * own file in the workspace, `deny` refuses. Adestia stores no rule either
   * way — the durable allowlist belongs to the engine, in a file a person can
   * open and edit.
   */
  app.post<{ Body: { id?: unknown; answer?: unknown } }>(
    '/api/permission',
    async (request, reply) => {
      const { id, answer } = request.body ?? {}
      const valid = answer === 'once' || answer === 'always' || answer === 'deny'
      if (typeof id !== 'string' || !valid) {
        return reply.code(400).send({ error: 'id and answer (once|always|deny) are required' })
      }
      // 409 rather than 404: the question existed, it simply timed out or was
      // already answered — "unknown" would suggest the person clicked
      // something that never was.
      if (!deps.asks?.answer(id, answer as AskAnswer)) {
        return reply.code(409).send({ error: 'that question is no longer waiting' })
      }
      // Out of the replay too: a re-attached stream must not resurrect a
      // question that nothing can resolve any more.
      desk.scrubAsk(id)
      return { answered: true }
    },
  )

  /**
   * Stop the turn a conversation is running.
   *
   * Addressed by the CONVERSATION, like `/api/turn/attach` — never by the
   * engine's session id, which is what this used to take. That id travels
   * back in the turn's `result` event, so nobody holds it while the turn is
   * still running: the browser posted nothing at all for the first turn of a
   * thread, and the button looked broken because it WAS.
   *
   * A turn started before its thread could be created has no address at all,
   * here as at the desk, and cannot be stopped — the same rule that keeps a
   * loose job out of the status dots.
   */
  app.post<{ Body: { conversation?: unknown; sessionId?: unknown } }>(
    '/api/turn/stop',
    async (request, reply) => {
      const body = request.body ?? {}
      const conversationId = typeof body.conversation === 'string' ? body.conversation : undefined
      const sessionId =
        typeof body.sessionId === 'string' && body.sessionId !== '' ? body.sessionId : undefined
      const key = turnKey(identityOf(request).userId, conversationId, sessionId)
      if (!key) {
        await reply.code(400).send({ error: 'conversation is required' })
        return reply
      }
      // 409 rather than 404: the turn existed, it simply settled first — the
      // press was a fraction of a second late, and the thread is already
      // showing the end of it.
      if (!desk.stop(key)) {
        await reply.code(409).send({ error: 'no turn is running there' })
        return reply
      }
      return { stopped: true }
    },
  )
}
