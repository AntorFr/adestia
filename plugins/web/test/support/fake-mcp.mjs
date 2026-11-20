// A stand-in for @playwright/mcp: records what it is given, answers tools/list
// with FAKE_TOOLS (comma-separated names), spawns a long sleeper as a grandchild.
import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const log = process.env.FAKE_LOG
writeFileSync(`${log}.argv`, JSON.stringify(process.argv.slice(2)))
const sleeper = spawn('sleep', ['300'], { stdio: 'ignore' })
writeFileSync(`${log}.pids`, JSON.stringify({ child: process.pid, grandchild: sleeper.pid }))
const names = (process.env.FAKE_TOOLS || '').split(',').filter(Boolean)

createInterface({ input: process.stdin }).on('line', (line) => {
  appendFileSync(`${log}.in`, `${line}\n`)
  const message = JSON.parse(line)
  if (message.method === 'tools/list') {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: names.map((name) => ({ name })) } })}\n`)
  } else if (message.method === 'tools/call') {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `ran ${message.params.name}` }] } })}\n`)
  }
})
