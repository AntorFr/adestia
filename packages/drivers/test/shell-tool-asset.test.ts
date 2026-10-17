/**
 * R-13: the shell-tool CLI the Copilot driver writes under its home is the
 * same program, byte for byte, as when it lived in a template string.
 * GOLDEN is the runtime value of that constant at cffe0ac, before the move.
 */

import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { CopilotDriver } from '../src/copilot-cli/driver.js'

const GOLDEN = "import { connect } from 'node:net'\n\nconst socket = process.env.ADESTIA_TOOLS_SOCKET\nconst token = process.env.ADESTIA_TOOLS_TOKEN\nif (!socket || !token) {\n  process.stderr.write('adestia-tool: ADESTIA_TOOLS_SOCKET/ADESTIA_TOOLS_TOKEN not set\\n')\n  process.exit(2)\n}\n\nconst [cmd, name, argsJson] = process.argv.slice(2)\nlet args = {}\nif (argsJson) {\n  try { args = JSON.parse(argsJson) } catch { process.stderr.write('adestia-tool: arguments must be a JSON object\\n'); process.exit(2) }\n}\nconst request =\n  cmd === 'list' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' }\n  : cmd === 'call' ? { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }\n  : null\nif (!request) {\n  process.stderr.write(\"usage: adestia-tool <list|call> [name] ['<json-args>']\\n\")\n  process.exit(2)\n}\n\nconst conn = connect(socket)\nlet buffer = ''\nconst timer = setTimeout(() => { process.stderr.write('adestia-tool: timed out\\n'); process.exit(2) }, 15000)\ntimer.unref?.()\nconn.on('connect', () => {\n  conn.write(JSON.stringify({ jsonrpc: '2.0', method: 'bridge/hello', params: { token } }) + '\\n')\n  conn.write(JSON.stringify(request) + '\\n')\n})\nconn.on('data', (chunk) => {\n  buffer += chunk.toString('utf8')\n  let nl = buffer.indexOf('\\n')\n  while (nl !== -1) {\n    const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); nl = buffer.indexOf('\\n')\n    if (!line.trim()) continue\n    let msg; try { msg = JSON.parse(line) } catch { continue }\n    if (msg.id !== 1) continue\n    const result = msg.result ?? {}\n    if (cmd === 'list') {\n      process.stdout.write(JSON.stringify(result.tools ?? [], null, 2) + '\\n')\n      conn.end(); process.exit(0)\n    }\n    const text = result.content && result.content[0] ? result.content[0].text : ''\n    process.stdout.write((text ?? '') + '\\n')\n    conn.end(); process.exit(result.isError ? 1 : 0)\n  }\n})\nconn.on('error', (error) => { process.stderr.write('adestia-tool: ' + error.message + '\\n'); process.exit(2) })\n"

function fakeSpawn() {
  const spawns: number[] = []
  const spawnImpl = () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    spawns.push(1)
    setImmediate(() => {
      child.stdout.write('{"type":"result","sessionId":"s1","exitCode":0}\n')
      child.emit('close', 0)
    })
    return child
  }
  return { spawnImpl: spawnImpl as any, spawns }
}

describe('shell-tool CLI asset (R-13)', () => {
  it('is written under the home with exactly the old bytes', async () => {
    const home = await mkdtemp(join(tmpdir(), 'adestia-cli-bytes-'))
    const fake = fakeSpawn()
    const driver = new CopilotDriver({ home, spawnImpl: fake.spawnImpl, shellToolsTransport: 'shell' })
    const stream = driver.runTurn({
      prompt: 'x',
      cwd: '/w',
      tools: {
        socketPath: '/data/s.sock',
        token: 't',
        bridgePath: '/data/b.mjs',
        tools: [],
        call: () => Promise.resolve({ ok: true as const, text: '' }),
      },
    } as never)
    for await (const _ of stream) void _
    await vi.waitFor(() => expect(fake.spawns.length).toBe(1))
    const written = await readFile(join(home, 'adestia-tool.mjs'))
    expect(written.length).toBe(1969)
    expect(written.toString('utf8')).toBe(GOLDEN)
  })

  it('the asset beside the driver source holds the old bytes', async () => {
    const path = fileURLToPath(new URL('../src/copilot-cli/shell-tool.mjs', import.meta.url))
    expect((await readFile(path)).toString('utf8')).toBe(GOLDEN)
  })

  it('still runs: no env, exits 2 naming the variables', () => {
    const path = fileURLToPath(new URL('../src/copilot-cli/shell-tool.mjs', import.meta.url))
    let status = 0
    let stderr = ''
    try {
      execFileSync(process.execPath, [path, 'list'], { env: {}, stdio: 'pipe' })
    } catch (e) {
      status = (e as { status: number }).status
      stderr = String((e as { stderr: Buffer }).stderr)
    }
    expect(status).toBe(2)
    expect(stderr).toBe('adestia-tool: ADESTIA_TOOLS_SOCKET/ADESTIA_TOOLS_TOKEN not set\n')
  })

  it('a built dist tree carries the asset with the same bytes', async () => {
    const dist = fileURLToPath(new URL('../dist/src/copilot-cli/shell-tool.mjs', import.meta.url))
    // Only meaningful after `npm run build`; absent in a fresh checkout.
    if (!existsSync(dist)) return
    expect((await readFile(dist)).toString('utf8')).toBe(GOLDEN)
  })
})
