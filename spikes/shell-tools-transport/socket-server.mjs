// Minimal MCP server over a unix socket — stands in for the Adestia server.
// Speaks newline-delimited JSON-RPC; the bridge pipes engine stdio to here.
// Usage: node socket-server.mjs <socket-path>
import { createServer } from 'node:net'
import { unlinkSync } from 'node:fs'

const SOCK = process.argv[2]
if (!SOCK) {
  console.error('usage: node socket-server.mjs <socket-path>')
  process.exit(2)
}
try {
  unlinkSync(SOCK)
} catch {
  /* first run */
}

let connections = 0

const server = createServer((conn) => {
  const id = ++connections
  // What the bridge announced on connect — the per-turn identity under test.
  let hello = null
  let buf = ''
  log(`connection ${id} open`)

  const reply = (rpcId, result) =>
    conn.write(JSON.stringify({ jsonrpc: '2.0', id: rpcId, result }) + '\n')

  conn.on('data', (chunk) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.trim()) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        log(`connection ${id} unparseable line: ${line.slice(0, 120)}`)
        continue
      }
      handle(msg)
    }
  })
  conn.on('close', () => log(`connection ${id} closed`))
  conn.on('error', (error) => log(`connection ${id} error: ${error.message}`))

  function handle(msg) {
    if (msg.method === 'bridge/hello') {
      hello = msg.params ?? null
      log(`connection ${id} hello pid=${hello?.pid} token=${hello?.token}`)
      return
    }
    if (msg.method === 'initialize') {
      log(`connection ${id} initialize (client ${msg.params?.clientInfo?.name ?? '?'})`)
      return reply(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'spike-shell', version: '0.0.1' },
      })
    }
    if (msg.method === 'notifications/initialized') return
    if (msg.method === 'tools/list')
      return reply(msg.id, {
        tools: [
          {
            name: 'probe',
            description:
              'Report which server process, connection and bridge answered this call.',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'echo',
            description: 'Echo the given text back.',
            inputSchema: {
              type: 'object',
              properties: { text: { type: 'string' } },
              required: ['text'],
            },
          },
        ],
      })
    if (msg.method === 'tools/call') {
      const name = msg.params?.name
      log(`connection ${id} tools/call ${name}`)
      if (name === 'probe')
        return reply(msg.id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                serverPid: process.pid,
                connection: id,
                bridgePid: hello?.pid ?? null,
                bridgeToken: hello?.token ?? null,
              }),
            },
          ],
        })
      if (name === 'echo')
        return reply(msg.id, {
          content: [{ type: 'text', text: String(msg.params?.arguments?.text ?? '') }],
        })
      return conn.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `unknown tool ${name}` },
        }) + '\n',
      )
    }
    // Anything else with an id (ping, …): answer permissively so the
    // handshake never stalls on a method this stub does not care about.
    if (msg.id !== undefined) return reply(msg.id, {})
  }
})

server.listen(SOCK, () => log(`listening on ${SOCK}`))

function log(text) {
  console.log(`[server ${new Date().toISOString()}] ${text}`)
}
