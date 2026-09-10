// The smallest possible stdio MCP server: initialize, tools/list, tools/call.
// Exists so the spike can prove that codex starts a server, reports its health,
// and puts its tool on the wire — without any third-party dependency.
import { appendFileSync } from 'node:fs'

const logPath = process.env.MOCK_MCP_LOG ?? '/dev/null'
const log = (o) => appendFileSync(logPath, `${JSON.stringify(o)}\n`)

let buf = ''
process.stdin.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    log({ in: msg })
    const reply = (result) => {
      const out = { jsonrpc: '2.0', id: msg.id, result }
      log({ out })
      process.stdout.write(`${JSON.stringify(out)}\n`)
    }
    if (msg.method === 'initialize') {
      reply({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'adestia-spike-mcp', version: '0.0.1' },
      })
    } else if (msg.method === 'tools/list') {
      reply({
        tools: [
          {
            name: 'spike_ping',
            description: 'Returns pong. Proof the MCP server was reached.',
            inputSchema: { type: 'object', properties: { who: { type: 'string' } } },
          },
        ],
      })
    } else if (msg.method === 'tools/call') {
      reply({ content: [{ type: 'text', text: `pong from the spike MCP server (${msg.params?.arguments?.who ?? 'nobody'})` }] })
    } else if (msg.id !== undefined) {
      reply({})
    }
  }
})
