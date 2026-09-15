/**
 * The instruction zone — the prose the engine reads before every turn, as
 * files a person may open and correct.
 */

import { readFile, stat } from 'node:fs/promises'

import type { FastifyInstance } from 'fastify'
import type { Driver } from '@antorfr/adestia-drivers'

import {
  describeInstructionPaths,
  isManaged,
  listInstructions,
  safeInstructionPath,
  writeInstruction,
} from '../instructions.js'
import { MANAGED_MARKER } from '../skills.js'

export function registerInstructions(
  app: FastifyInstance,
  { driver, workspaceRoot }: { readonly driver: Driver; readonly workspaceRoot: string },
): void {
  /**
   * The instruction zone: prose a person may read and correct.
   *
   * 404 when the driver declares none, the same shape as the other
   * driver-gated routes: "this engine has no such concept" and "you have
   * written none" are different facts.
   */
  app.get('/api/instructions', async (_request, reply) => {
    const paths = driver.instructionPaths?.() ?? []
    if (paths.length === 0) {
      await reply.code(404).send({ error: 'this driver declares no instruction zone' })
      return reply
    }
    return {
      files: await listInstructions(workspaceRoot, paths),
      // Where one may be CREATED. A zone with nothing in it and no way to put
      // anything there is a dead end: the listing shows what exists, and a
      // fresh instance has nothing. The client cannot guess these — only the
      // driver knows where its CLI reads prose.
      paths: await describeInstructionPaths(workspaceRoot, paths),
    }
  })

  app.get<{ Params: { '*': string } }>('/api/instructions/*', async (request, reply) => {
    const paths = driver.instructionPaths?.() ?? []
    const file = safeInstructionPath(workspaceRoot, paths, request.params['*'])
    if (!file) return reply.code(400).send({ error: 'not an instruction path' })
    try {
      const [info, markdown] = await Promise.all([stat(file), readFile(file, 'utf8')])
      return {
        path: request.params['*'],
        markdown,
        modified: new Date(info.mtimeMs).toISOString(),
        // Reported rather than hidden: the listing already omits managed
        // files, and a client that reached one anyway must not be told it can
        // save over something the next restart will rewrite.
        managed: markdown.includes(MANAGED_MARKER),
      }
    } catch {
      return reply.code(404).send({ error: 'no such instruction' })
    }
  })

  app.put<{ Params: { '*': string }; Body: { markdown?: unknown } }>(
    '/api/instructions/*',
    async (request, reply) => {
      const paths = driver.instructionPaths?.() ?? []
      const file = safeInstructionPath(workspaceRoot, paths, request.params['*'])
      if (!file) return reply.code(400).send({ error: 'not an instruction path' })

      const markdown = request.body?.markdown
      if (typeof markdown !== 'string') {
        return reply.code(400).send({ error: 'markdown is required' })
      }
      // Refused rather than accepted-then-lost: the core rewrites this file at
      // every start, so saving it would be a change that disappears without
      // anyone being told.
      if (await isManaged(file)) {
        return reply
          .code(409)
          .send({ error: 'this file is delivered with the product and is rewritten at every start' })
      }

      await writeInstruction(file, markdown)
      return { path: request.params['*'], modified: new Date().toISOString() }
    },
  )
}
