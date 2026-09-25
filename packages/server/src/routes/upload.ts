/**
 * Files on their way to the agent: received here, kept in the inbox, and
 * named to a turn by id.
 */

import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'

import type { AttachmentInbox } from '../attachments.js'
import type { AdestiaConfig } from '../config.js'
import { identityOf } from './identity.js'

export async function registerUpload(
  app: FastifyInstance,
  { config, inbox }: { readonly config: AdestiaConfig; readonly inbox: AttachmentInbox },
): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: config.attachments.maxBytes, files: config.attachments.maxFiles },
  })

  app.post('/api/upload', async (request, reply) => {
    const files: { name: string; data: Buffer }[] = []
    try {
      for await (const part of request.files()) {
        files.push({ name: part.filename, data: await part.toBuffer() })
      }
    } catch (error) {
      // The size limit surfaces here as a throw; saying which limit was hit
      // beats a 500 that names nothing.
      return reply.code(413).send({ error: (error as Error).message })
    }
    if (files.length === 0) return reply.code(400).send({ error: 'no file was sent' })

    // Whose box these land in. Read here rather than at the turn, because the
    // box is decided when the bytes are written: what the browser gets back is
    // an id relative to it, and an id from one person's box names nothing in
    // anybody else's.
    const who = identityOf(request)
    const { stored, refused } = await inbox.store(
      { id: who.userId, displayName: who.displayName },
      files,
    )
    return {
      attachments: stored.map(({ id, name, bytes }) => ({ id, name, bytes })),
      // Reported alongside what worked: a file silently dropped is a file the
      // user believes the agent has.
      refused,
    }
  })
}
