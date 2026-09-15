/**
 * Files on their way to the agent: received here, kept in the inbox, and
 * named to a turn by id.
 */

import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'

import type { AttachmentInbox } from '../attachments.js'
import type { AdestiaConfig } from '../config.js'

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

    const { stored, refused } = await inbox.store(files)
    return {
      attachments: stored.map(({ id, name, bytes }) => ({ id, name, bytes })),
      // Reported alongside what worked: a file silently dropped is a file the
      // user believes the agent has.
      refused,
    }
  })
}
