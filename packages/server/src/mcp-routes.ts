/**
 * The `/mcp` endpoint.
 *
 * Mounted only when the operator turned it on AND set a token — an inbound
 * surface that other machines can reach must never be a thing an instance
 * grows by accident.
 */

import type { FastifyInstance } from 'fastify'

import { BusyThreadError, type DelegatedResult } from './delegations.js'
import {
  JobRegistry,
  bearerOf,
  callbackUrlOf,
  callerOf,
  pingBody,
  toolsFor,
  tokenMatches,
  type Job,
  type JsonRpcRequest,
  type McpConfig,
} from './mcp-in.js'

/**
 * What this route needs from the delegation channel — structural on purpose,
 * so the tests can hand it a channel with no desk and no disk behind it.
 * `DelegationChannel` satisfies it as it is.
 */
export interface DelegationPort {
  open(
    caller: string,
    request: string,
    taskId: string | undefined,
  ): Promise<{ threadId: string } | { unknown: true }>
  busy(caller: string, threadId: string): boolean
  run(caller: string, threadId: string, request: string): Promise<DelegatedResult>
}

export interface McpDependencies {
  readonly config: McpConfig
  /** The channel delegated turns run in — desk, store and framing included. */
  readonly channel: DelegationPort
  /** Injectable for the ping tests; the default is the platform's. */
  readonly fetchImpl?: typeof fetch
}

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
})

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result })

/** MCP tool results are content blocks, even when the content is one string. */
const textResult = (text: string, isError = false) => ({
  content: [{ type: 'text', text }],
  ...(isError ? { isError: true } : {}),
})

/**
 * The endpoint, both spellings.
 *
 * Fastify matches a trailing slash as a different path, and the predecessor's
 * gateway required `/mcp/` exactly — so every client carried over from it keeps
 * that spelling. Answering only one of the two turns a copied URL into a
 * failure that names the wrong culprit; `auth.ts` exempts both for the same
 * reason. Serving both is not a prefix rule: `/mcp/anything` still matches
 * nothing here.
 */
const PATHS = ['/mcp', '/mcp/'] as const

/**
 * How long a settled job's ping may take before it is abandoned.
 * Fail-soft either way: the work is done, and the caller keeps the status
 * poll as its net — a lost ping must never cost anything but itself.
 */
const PING_TIMEOUT_MS = 30_000

export function registerMcp(app: FastifyInstance, deps: McpDependencies): void {
  const { config, channel } = deps
  if (!config.enabled) return
  if (!config.token) {
    // Refused rather than mounted open: an unauthenticated endpoint that runs
    // agent turns is a remote shell, and defaulting to one because a token was
    // forgotten is indefensible.
    throw new Error('mcp.enabled requires mcp.token — an open inbound endpoint runs agent turns')
  }

  const jobs = new JobRegistry(config)
  const tools = toolsFor(config)
  const askName = tools[0]!.name
  const statusName = tools[1]!.name
  const fetchImpl = deps.fetchImpl ?? fetch

  /** The ping, sent once, abandoned on any failure. See `pingBody` for why it
      carries nothing a receiver's model could ever read raw. */
  async function ping(job: Job): Promise<void> {
    if (!job.notify || !job.callbackUrl) return
    try {
      const response = await fetchImpl(job.callbackUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pingBody(config.agentName, job.id)),
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      })
      if (!response.ok) jobs.noteNotifyError(job.id, `callback answered ${response.status}`)
    } catch (error) {
      jobs.noteNotifyError(job.id, (error as Error).message)
    }
  }

  /**
   * A GET here is REFUSED, out loud.
   *
   * MCP's streamable HTTP transport lets a client open a GET on the endpoint to
   * receive server-initiated messages. This server has no such stream — every
   * answer rides the POST that asked for it — and the spec's answer for that is
   * 405, a refusal a client can act on.
   *
   * Without this route the SPA's catch-all answers instead, and it answers
   * `200 text/html`: a conforming client opens the stream, is handed a web page,
   * and tries to read it as SSE. It then fails in a place that names neither the
   * page nor this endpoint. A 200 that lies costs more than a 405 that refuses.
   */
  for (const path of PATHS) {
    app.get(path, async (_request, reply) =>
      reply.code(405).header('allow', 'POST').send({
        error: 'this endpoint speaks JSON-RPC over POST; it opens no server-to-client stream',
      }),
    )
  }

  for (const path of PATHS)
  app.post<{ Body: JsonRpcRequest }>(path, async (request, reply) => {
    if (!tokenMatches(bearerOf(request.headers.authorization), config.token)) {
      return reply.code(401).send(rpcError(request.body?.id, -32001, 'unauthorized'))
    }

    const { id, method, params } = request.body ?? {}

    // A notification is a statement, not a question: the spec's answer is to
    // accept it and say nothing. `notifications/initialized` is the one every
    // conforming client sends right after `initialize` — refusing it with
    // -32601 broke the handshake of every stock MCP client while the
    // predecessor's SDK had quietly swallowed it.
    if (typeof method === 'string' && method.startsWith('notifications/')) {
      return reply.code(202).send()
    }

    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: config.agentName, version: '1' },
        })

      case 'tools/list':
        return rpcResult(id, { tools })

      case 'tools/call': {
        const name = params?.['name']
        const args = (params?.['arguments'] ?? {}) as Record<string, unknown>

        if (name === askName) {
          const prompt = args['prompt']
          if (typeof prompt !== 'string' || prompt.trim() === '') {
            return rpcResult(id, textResult('prompt is required', true))
          }
          const taskId = typeof args['task_id'] === 'string' && args['task_id'] !== ''
            ? args['task_id']
            : undefined
          const notify = args['notify'] !== false

          const from = callerOf(request.headers['x-adestia-caller'])
          const callbackUrl = callbackUrlOf(request.headers['x-adestia-callback-url'])

          // The thread first: an unknown task_id must be refused before a job
          // exists to poll, and a fresh thread's id is part of no answer until
          // its first job settles.
          const opened = await channel.open(from, prompt, taskId)
          if ('unknown' in opened) {
            return rpcResult(
              id,
              textResult(
                `no such conversation "${taskId}" — it may belong to another caller, or be gone. ` +
                  `Start fresh without a task_id.`,
                true,
              ),
            )
          }
          if (taskId && channel.busy(from, opened.threadId)) {
            // One job per thread at a time: merging two asks into one turn
            // would owe two answers and hold one. Distinct from the global
            // `busy` below — this one clears when THIS conversation settles.
            return rpcResult(
              id,
              textResult(
                `that conversation is still working on its previous request — ` +
                  `poll its job with ${statusName} first`,
                true,
              ),
            )
          }

          const job = jobs.create({
            prompt,
            from,
            taskId: opened.threadId,
            notify,
            ...(callbackUrl ? { callbackUrl } : {}),
          })
          if ('refused' in job) return rpcResult(id, textResult(job.refused, true))

          // Detached on purpose: the caller gets its id now, and the turn runs
          // for as long as it needs without an HTTP connection held open
          // across a timeout neither side controls. The ping rides the same
          // detachment — settled first, delivered second, forgotten third.
          void channel
            .run(from, opened.threadId, prompt)
            .then((result) => {
              if (result.failure) jobs.fail(job.id, result.failure)
              else jobs.finish(job.id, result.text)
            })
            .catch((error: Error) => {
              jobs.fail(
                job.id,
                error instanceof BusyThreadError
                  ? 'the conversation was already working; try again once it settles'
                  : error.message,
              )
            })
            .then(() => ping(job))

          return rpcResult(
            id,
            textResult(
              `Started. Collect the answer with ${statusName} and job_id "${job.id}".`,
            ),
          )
        }

        if (name === statusName) {
          const jobId = args['job_id']
          if (typeof jobId !== 'string') {
            return rpcResult(id, textResult('job_id is required', true))
          }
          const job = jobs.get(jobId)
          if (!job) {
            // Expired or never existed — said as one thing, because from the
            // caller's side they are the same: there is no answer to collect.
            return rpcResult(id, textResult('no such job — it may have expired', true))
          }
          if (job.state === 'running') {
            const seconds = Math.round((Date.now() - job.startedAt) / 1000)
            return rpcResult(id, textResult(`still running (${seconds}s). Ask again shortly.`))
          }
          // The undelivered ping is worth a line either way: the caller that
          // waited for a knock that never came deserves to know why.
          const undelivered = job.notifyError
            ? `\n\n[callback ping failed: ${job.notifyError}]`
            : ''
          if (job.state === 'failed') {
            return rpcResult(id, textResult(`${job.error ?? 'the task failed'}${undelivered}`, true))
          }
          return rpcResult(
            id,
            textResult(
              `${job.result ?? ''}\n\n[task_id: "${job.taskId}" — pass it back to ${askName} ` +
                `to continue this conversation]${undelivered}`,
            ),
          )
        }

        return rpcResult(id, textResult(`unknown tool "${String(name)}"`, true))
      }

      default:
        return reply.code(400).send(rpcError(id, -32601, `unknown method "${String(method)}"`))
    }
  })
}
