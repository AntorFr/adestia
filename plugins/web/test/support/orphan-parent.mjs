// Starts the relay with piped stdio, reports its pid, then waits to be SIGKILLed.
import { spawn } from 'node:child_process'
const relay = spawn(process.execPath, [process.argv[2]], { stdio: ['pipe', 'pipe', 'inherit'] })
process.stdout.write(`${relay.pid}\n`)
setInterval(() => {}, 1000)
