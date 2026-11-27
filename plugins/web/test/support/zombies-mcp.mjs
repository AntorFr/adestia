// Stand-in for @playwright/mcp that "launches Chrome" like the real one: a small tree of
// processes named chrome-headless-shell (a symlink to sleep, found in CHROME_BIN), the
// parent shell dying with the group when the relay kills it.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const bin = process.env.CHROME_BIN
spawn('sh', ['-c', `${bin} 300 & ${bin} 300 & ${bin} 300 & wait`], { stdio: 'ignore' })
const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'tools/list') reply(message.id, { tools: [{ name: 'browser_navigate' }] })
  else if (message.method === 'tools/call') reply(message.id, { content: [{ type: 'text', text: 'page read' }] })
})
