/**
 * Who is asking — the identity the auth hook resolved, or the local user
 * when the instance runs without one.
 */

import type { FastifyRequest } from 'fastify'

import type { Identity } from '../auth.js'

/** The identity every authenticated route can count on. */
export function identityOf(request: FastifyRequest): Identity {
  return (request as FastifyRequest & { identity?: Identity }).identity ?? {
    userId: 'local',
    displayName: 'Local user',
    groups: [],
  }
}
