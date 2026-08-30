// The generic stdio↔unix-socket bridge — the whole point is how little it is.
// It knows nothing about MCP: it announces itself once (pid + per-turn token
// from its env), then pipes bytes both ways. All tool logic stays server-side.
import { connect } from 'node:net'

const sock = process.env.ADESTIA_SOCK
if (!sock) {
  console.error('bridge: ADESTIA_SOCK is not set')
  process.exit(2)
}

const conn = connect(sock)

conn.on('connect', () => {
  conn.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'bridge/hello',
      params: {
        pid: process.pid,
        token: process.env.SPIKE_TOKEN ?? null,
        startedAt: new Date().toISOString(),
      },
    }) + '\n',
  )
  process.stdin.pipe(conn)
  conn.pipe(process.stdout)
})

conn.on('error', (error) => {
  // The dead-socket scenario: fail loudly so the engine reports the server
  // as failed instead of hanging on a silent pipe.
  console.error(`bridge: socket unreachable: ${error.message}`)
  process.exit(1)
})

conn.on('close', () => process.exit(0))
process.stdin.on('end', () => process.exit(0))
