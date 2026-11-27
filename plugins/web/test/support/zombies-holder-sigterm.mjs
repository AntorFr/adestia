// Stands in for the server under the container's init: it runs one web read through the
// relay (a call, then stdin closed), says "relay-closed", then stays up until SIGTERM so
// the test can look at the process table while the init is still PID 1 of the tree.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const relay = spawn(process.execPath, [process.env.RELAY], { stdio: ['pipe', 'pipe', 'inherit'] })
const lines = createInterface({ input: relay.stdout })
relay.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browser_navigate' } })}\n`)
lines.on('line', () => process.kill(relay.pid, "SIGTERM"))
relay.on('exit', () => {
  process.stdout.write('relay-closed\n')
  setInterval(() => {}, 1000)
})
process.on('SIGTERM', () => process.exit(0))
