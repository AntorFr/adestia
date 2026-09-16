/**
 * Arming the engine from the interface: a secret captured by the driver,
 * stored by the core, and handed back under the variable the CLI reads.
 */

import type { FastifyInstance } from 'fastify'
import type { AuthManagement, Driver, DriverDescriptor } from '@antorfr/adestia-drivers'

import type { ArmingFlows, SecretStore } from '../secrets.js'

/**
 * Variables a driver may NOT claim for its secret.
 *
 * The driver names the variable — a hardcoded map in the core would mean no
 * third-party engine could ever be armed — but the core VALIDATES it. Without
 * this list, a driver could ask for its token to be written into `PATH` and
 * turn an arming flow into arbitrary code execution at the next spawn.
 */
const FORBIDDEN_CREDENTIAL_VARS = new Set([
  'PATH',
  'HOME',
  'NODE_OPTIONS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'SHELL',
  'IFS',
  'BASH_ENV',
  'ENV',
])

export function credentialVar(driver: { credentialVar?: string }, driverId: string): string {
  const variable = driver.credentialVar
  if (!variable) {
    throw new Error(`driver "${driverId}" declares no credential variable`)
  }
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(variable)) {
    throw new Error(`driver "${driverId}" asks for an implausible variable name: ${variable}`)
  }
  if (FORBIDDEN_CREDENTIAL_VARS.has(variable)) {
    // Loud, because this is either a bug or an attack, and both deserve to be
    // read rather than swallowed.
    throw new Error(`driver "${driverId}" may not store its secret in ${variable}`)
  }
  return variable
}

export function registerArming(
  app: FastifyInstance,
  {
    driver,
    descriptor,
    secrets,
    arming,
  }: {
    readonly driver: Driver
    readonly descriptor: DriverDescriptor
    readonly secrets: SecretStore
    readonly arming: ArmingFlows
  },
): void {
  const canArm = descriptor.capabilities.includes('authManagement')
  const authDriver = driver as Driver & AuthManagement

  app.get('/api/auth/driver', async (_request, reply) => {
    if (!canArm) {
      // 404 rather than a status saying "absent": "this engine cannot be armed
      // from here" and "this engine has no token" are different facts, and an
      // interface that confuses them offers a button that can never work.
      await reply.code(404).send({ error: 'this driver cannot be armed from the interface' })
      return reply
    }
    return authDriver.authStatus()
  })

  app.post('/api/auth/driver/begin', async (_request, reply) => {
    if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })
    try {
      const prompt = await authDriver.beginAuth()
      const flow = arming.start(descriptor.id)
      // The driver's own session id is replaced by ours: the browser holds a
      // handle to OUR flow, and the driver never has to be trusted with
      // session bookkeeping it does not own.
      return { ...prompt, sessionId: flow.id }
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message })
    }
  })

  app.post<{ Body: { sessionId?: unknown; input?: unknown } }>(
    '/api/auth/driver/complete',
    async (request, reply) => {
      if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })

      const { sessionId, input } = request.body ?? {}
      if (typeof sessionId !== 'string' || typeof input !== 'string' || input.trim() === '') {
        return reply.code(400).send({ error: 'sessionId and input are required' })
      }
      const flow = arming.get(sessionId)
      if (!flow) {
        return reply.code(409).send({ error: 'that arming attempt has expired; start again' })
      }

      try {
        const { secret } = await authDriver.completeAuth(sessionId, input)
        // The CORE stores it: one policy for every engine, and the file never
        // passes back through the driver.
        const stored = await secrets.write(descriptor.id, secret)
        authDriver.setCredentials?.(
          { [credentialVar(authDriver, descriptor.id)]: stored.value },
          stored.savedAt,
        )
        arming.end(sessionId)
        return { armed: true, savedAt: stored.savedAt }
      } catch (error) {
        arming.end(sessionId)
        return reply.code(502).send({ error: (error as Error).message })
      }
    },
  )

  app.post<{ Body: { sessionId?: unknown } }>('/api/auth/driver/cancel', async (request) => {
    const sessionId = request.body?.sessionId
    if (typeof sessionId === 'string') {
      arming.end(sessionId)
      await authDriver.cancelAuth(sessionId).catch(() => undefined)
    }
    return { cancelled: true }
  })

  app.delete('/api/auth/driver', async (_request, reply) => {
    if (!canArm) return reply.code(404).send({ error: 'this driver cannot be armed' })
    const cleared = await secrets.clear(descriptor.id)
    authDriver.setCredentials?.({}, undefined)
    return cleared ? { cleared: true } : reply.code(404).send({ error: 'nothing stored' })
  })
}
