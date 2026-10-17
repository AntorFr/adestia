import { connect } from 'node:net'

const socket = process.env.ADESTIA_TOOLS_SOCKET
const token = process.env.ADESTIA_TOOLS_TOKEN
if (!socket || !token) {
  process.stderr.write('adestia-tool: ADESTIA_TOOLS_SOCKET/ADESTIA_TOOLS_TOKEN not set\n')
  process.exit(2)
}

const [cmd, name, argsJson] = process.argv.slice(2)
let args = {}
if (argsJson) {
  try { args = JSON.parse(argsJson) } catch { process.stderr.write('adestia-tool: arguments must be a JSON object\n'); process.exit(2) }
}
const request =
  cmd === 'list' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  : cmd === 'call' ? { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
  : null
if (!request) {
  process.stderr.write("usage: adestia-tool <list|call> [name] ['<json-args>']\n")
  process.exit(2)
}

const conn = connect(socket)
let buffer = ''
const timer = setTimeout(() => { process.stderr.write('adestia-tool: timed out\n'); process.exit(2) }, 15000)
timer.unref?.()
conn.on('connect', () => {
  conn.write(JSON.stringify({ jsonrpc: '2.0', method: 'bridge/hello', params: { token } }) + '\n')
  conn.write(JSON.stringify(request) + '\n')
})
conn.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let nl = buffer.indexOf('\n')
  while (nl !== -1) {
    const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); nl = buffer.indexOf('\n')
    if (!line.trim()) continue
    let msg; try { msg = JSON.parse(line) } catch { continue }
    if (msg.id !== 1) continue
    const result = msg.result ?? {}
    if (cmd === 'list') {
      process.stdout.write(JSON.stringify(result.tools ?? [], null, 2) + '\n')
      conn.end(); process.exit(0)
    }
    const text = result.content && result.content[0] ? result.content[0].text : ''
    process.stdout.write((text ?? '') + '\n')
    conn.end(); process.exit(result.isError ? 1 : 0)
  }
})
conn.on('error', (error) => { process.stderr.write('adestia-tool: ' + error.message + '\n'); process.exit(2) })
