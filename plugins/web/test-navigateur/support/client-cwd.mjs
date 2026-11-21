// Same minimal JSON-RPC client as client.mjs, with the working directory the agent's CLI gives its MCP servers.
// real relay (or the real @playwright/mcp) against the real browser.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export function client(command, args, env, cwd) {
  const child = spawn(command, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line)
    waiting.get(message.id)?.(message)
  })
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
  let next = 1
  const ask = (method, params) =>
    new Promise((resolve, reject) => {
      const id = next++
      const timer = setTimeout(() => reject(new Error(`no answer to ${method} (stderr: ${stderr})`)), 60000)
      waiting.set(id, (message) => { clearTimeout(timer); resolve(message) })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  const start = async () => {
    const init = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'suite', version: '0' } })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    return init
  }
  const text = (message) => (message.result?.content ?? []).map((part) => part.text ?? '').join('\n')
  return { child, ask, start, exited, text, stderr: () => stderr }
}
