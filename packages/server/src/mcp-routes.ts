/**
 * The `/mcp` endpoint.
 *
 * Mounted only when the operator turned it on AND set a token — an inbound
 * surface that other machines can reach must never be a thing an instance
 * grows by accident.
 */

import type { FastifyInstance } from 'fastify'

import {
  JobRegistry,
  bearerOf,
  frameDelegated,
  toolsFor,
  tokenMatches,
  type JsonRpcRequest,
  type McpConfig,
} from './mcp-in.js'

export interface McpDependencies {
  readonly config: McpConfig
  /** The app's own turn function — the single spawn site, again. */
  runTurn(prompt: string): Promise<string>
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

export function registerMcp(app: FastifyInstance, deps: McpDependencies): void {
  const { config } = deps
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

  app.post<{ Body: JsonRpcRequest }>('/mcp', async (request, reply) => {
    if (!tokenMatches(bearerOf(request.headers.authorization), config.token)) {
      return reply.code(401).send(rpcError(request.body?.id, -32001, 'unauthorized'))
    }

    const { id, method, params } = request.body ?? {}

    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: `golem-${config.agentName}`, version: '1' },
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

          const from = String(request.headers['x-golem-caller'] ?? 'another agent')
          const job = jobs.create(prompt, from)
          if ('refused' in job) return rpcResult(id, textResult(job.refused, true))

          // Detached on purpose: the caller gets its id now, and the turn runs
          // for as long as it needs without an HTTP connection held open
          // across a timeout neither side controls.
          void deps
            .runTurn(frameDelegated(prompt, from))
            .then((result) => jobs.finish(job.id, result))
            .catch((error: Error) => jobs.fail(job.id, error.message))

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
          if (job.state === 'failed') {
            return rpcResult(id, textResult(job.error ?? 'the task failed', true))
          }
          return rpcResult(id, textResult(job.result ?? ''))
        }

        return rpcResult(id, textResult(`unknown tool "${String(name)}"`, true))
      }

      default:
        return reply.code(400).send(rpcError(id, -32601, `unknown method "${String(method)}"`))
    }
  })
}
