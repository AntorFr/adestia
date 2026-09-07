/**
 * The revision of a document: a digest of its bytes.
 *
 * Content rather than a timestamp, deliberately. A rewrite that changes nothing
 * leaves the revision alone, so an agent that reformats a file does not
 * invalidate a screen somebody is dragging on — and there is no clock to agree
 * about between a container, a laptop and whatever spawned the agent.
 *
 * Its own file because two processes need it and neither should import the
 * other: the HTTP API runs inside the server, the MCP server runs beside the
 * agent, and they must compute the same number or the guard is theatre.
 */

import { createHash } from 'node:crypto'

export const revisionOf = (text) =>
  createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 16)
