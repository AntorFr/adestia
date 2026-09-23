/**
 * Restarting the instance from the browser, without killing what runs it.
 *
 * A "restart" button is ordinarily a QUIT button: a server can only exit, and
 * whether anything brings it back is its supervisor's business — which the
 * process cannot see from inside a container. Under `docker run` with no
 * restart policy, or a plain `npm start` in a terminal, the browser that
 * pressed it would have no way to call the instance back.
 *
 * So nothing here exits. `start()` returns an instance that closes cleanly,
 * and the launcher closes it and starts a new one IN THE SAME PROCESS —
 * measured at three consecutive cycles releasing the port and the tools
 * socket, about twenty milliseconds each. The container never notices, and it
 * behaves identically under `npm start`, under Docker and in Kubernetes.
 *
 * What this file owns is the decision to do it, and it is one rule: a turn in
 * flight is work somebody is waiting for, and tearing the server down under
 * it loses that work with nothing to show for it. So a restart is REFUSED
 * while turns are running, and the refusal says how many — `force` is how the
 * operator overrules it, deliberately, rather than by not knowing.
 *
 * The answer goes out BEFORE anything closes. A response written after the
 * server is gone is a dropped connection, and a dropped connection is exactly
 * what a restart looks like when it has failed — the screen could not tell
 * the two apart.
 */

import type { FastifyInstance } from 'fastify'

export interface RestartDependencies {
  /**
   * How many turns are running this instant. The same counter the instance
   * route reports, rather than a second one that could disagree.
   */
  readonly running: () => number
  /**
   * Asks the launcher for a new instance. Present only when something owns
   * that loop — `start()` alone does not, and an app built bare in a test
   * never does.
   */
  readonly restart: () => void
}

export function registerRestart(app: FastifyInstance, deps: RestartDependencies): void {
  app.post<{ Body?: { force?: unknown } }>('/api/restart', async (request, reply) => {
    const running = deps.running()
    if (running > 0 && request.body?.force !== true) {
      return reply.code(409).send({
        error: `${running} turn${running === 1 ? ' is' : 's are'} running`,
        running,
      })
    }

    // Once the response has actually left, and not a moment before. `finish`
    // is the signal for that; a timeout here would be a race dressed as a
    // delay, and it would fail on the machine that is busiest.
    reply.raw.on('finish', () => {
      setImmediate(() => deps.restart())
    })
    return reply.code(202).send({ restarting: true, ...(running > 0 ? { interrupted: running } : {}) })
  })
}
