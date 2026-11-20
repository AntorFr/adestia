/**
 * The web plugin's relay, against a fake browser executable and a fake MCP child:
 * no network, no browser. Expectations are written out, not read from the relay.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { SANS_SANDBOX, WITHHELD, userAgentFrom } from '../mcp/relais.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..')
const RELAY = join(PLUGIN, 'mcp', 'relais.mjs')
const BROWSER = join(HERE, 'support', 'fake-browser.sh')
const MCP = join(HERE, 'support', 'fake-mcp.mjs')
const made = []

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'adestia-web-'))
  made.push(dir)
  return dir
}

after(() => {
  for (const dir of made) {
    try {
      const { grandchild } = JSON.parse(readFileSync(join(dir, 'log.pids'), 'utf8'))
      process.kill(grandchild, 'SIGKILL')
    } catch {
      // gone, or never started
    }
  }
})

function env(dir, extra = {}) {
  return {
    PATH: process.env.PATH,
    ADESTIA_WEB_EXECUTABLE: BROWSER,
    ADESTIA_WEB_MCP: MCP,
    ADESTIA_WORKSPACE: dir,
    FAKE_LOG: join(dir, 'log'),
    FAKE_VERSION_LINE: 'Chromium 131.0.6778.33',
    FAKE_TOOLS: 'browser_navigate,browser_run_code_unsafe,browser_evaluate,browser_file_upload,browser_snapshot',
    ...extra,
  }
}

/** Start the relay; `ask` sends one request and resolves with its response line. */
function run(dir, extra) {
  const child = spawn(process.execPath, [RELAY], { env: env(dir, extra), stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, at))
      buffer = buffer.slice(at + 1)
      waiting.get(message.id)?.(message)
    }
  })
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
  let next = 1
  const ask = (method, params) =>
    new Promise((resolve) => {
      const id = next++
      waiting.set(id, resolve)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  return { child, ask, exited }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function gone(pid) {
  for (let i = 0; i < 100; i++) {
    if (!alive(pid)) return true
    await sleep(50)
  }
  return false
}

const argvOf = (dir) => JSON.parse(readFileSync(join(dir, 'log.argv'), 'utf8'))
const valueOf = (argv, flag) => argv[argv.indexOf(flag) + 1]

test('(a) the manifest is a tool plugin whose one MCP server launches the relay', () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, 'adestia-plugin.json'), 'utf8'))
  assert.equal(manifest.id, 'web')
  assert.equal(manifest.kind, 'tool')
  assert.equal(manifest.mcpServers.length, 1)
  assert.equal(manifest.mcpServers[0].command, 'node')
  assert.deepEqual(manifest.mcpServers[0].args, ['./mcp/relais.mjs'])
  assert.ok(existsSync(join(PLUGIN, manifest.skills[0])))
})

test('(b) the User-Agent follows the binary version: two versions, two strings, no HeadlessChrome', async () => {
  const seen = []
  for (const line of ['Chromium 131.0.6778.33', 'Google Chrome 142.0.7444.1 dev']) {
    const dir = tmp()
    const relay = run(dir, { FAKE_VERSION_LINE: line })
    await relay.ask('tools/list')
    seen.push(valueOf(argvOf(dir), '--user-agent'))
    relay.child.stdin.end()
    await relay.exited
  }
  assert.equal(seen[0], 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
  assert.equal(seen[1], 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')
  for (const agent of seen) assert.ok(!agent.includes('HeadlessChrome'))
  assert.equal(userAgentFrom('no version here'), undefined)
})

test('(b) no Chrome version is written in the plugin', () => {
  const offenders = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'test') continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/Chrom(e|ium)\/\d|\b1\d\d\.\d+\.\d+\.\d+\b/.test(readFileSync(path, 'utf8')) && name !== 'package-lock.json') offenders.push(path)
    }
  }
  walk(PLUGIN)
  assert.deepEqual(offenders, [])
})

test('(c) tools/list drops the three withheld tools and keeps the others, in order', async () => {
  const dir = tmp()
  const relay = run(dir)
  const response = await relay.ask('tools/list')
  assert.deepEqual(response.result.tools.map((tool) => tool.name), ['browser_navigate', 'browser_snapshot'])
  relay.child.stdin.end()
  await relay.exited
})

test('(c) a tools/call of a withheld tool is an error naming it and never reaches the child', async () => {
  const dir = tmp()
  const relay = run(dir)
  for (const name of ['browser_run_code_unsafe', 'browser_evaluate', 'browser_file_upload']) {
    const response = await relay.ask('tools/call', { name, arguments: {} })
    assert.equal(response.result, undefined)
    assert.equal(typeof response.error.code, 'number')
    assert.ok(response.error.message.includes(name), response.error.message)
  }
  const allowed = await relay.ask('tools/call', { name: 'browser_navigate', arguments: { url: 'x' } })
  assert.equal(allowed.result.content[0].text, 'ran browser_navigate')
  relay.child.stdin.end()
  await relay.exited
  const received = readFileSync(join(dir, 'log.in'), 'utf8')
  assert.ok(!/browser_run_code_unsafe|browser_evaluate|browser_file_upload/.test(received), received)
  assert.deepEqual([...WITHHELD.keys()].sort(), ['browser_evaluate', 'browser_file_upload', 'browser_run_code_unsafe'])
})

test('(c) a withheld call with a list request in flight does not leak or break the list', async () => {
  const dir = tmp()
  const relay = run(dir)
  const [denied, listed] = await Promise.all([
    relay.ask('tools/call', { name: 'browser_evaluate' }),
    relay.ask('tools/list'),
  ])
  assert.ok(denied.error)
  assert.equal(listed.result.tools.length, 2)
  relay.child.stdin.end()
  await relay.exited
})

test('(d) the child gets exactly the AD-web-4 arguments, and no sandbox flag while SANS_SANDBOX is false', async () => {
  assert.equal(SANS_SANDBOX, false)
  const dir = tmp()
  const relay = run(dir)
  await relay.ask('tools/list')
  const argv = argvOf(dir)
  const flags = argv.filter((item) => item.startsWith('--'))
  assert.deepEqual(flags, ['--headless', '--isolated', '--executable-path', '--user-agent', '--output-dir', '--output-max-size', '--idle-timeout'])
  assert.equal(valueOf(argv, '--executable-path'), BROWSER)
  assert.equal(valueOf(argv, '--output-max-size'), String(20 * 1024 * 1024))
  assert.equal(valueOf(argv, '--idle-timeout'), '60000')
  assert.ok(!argv.includes('--no-sandbox'))
  assert.ok(!argv.includes('--allow-unrestricted-file-access'))
  assert.ok(!argv.includes('--init-script'))
  relay.child.stdin.end()
  await relay.exited
})

test('(e) closing stdin ends the relay and leaves no child or grandchild', async () => {
  const dir = tmp()
  const relay = run(dir)
  await relay.ask('tools/list')
  const { child, grandchild } = JSON.parse(readFileSync(join(dir, 'log.pids'), 'utf8'))
  assert.ok(alive(child) && alive(grandchild))
  relay.child.stdin.end()
  const { code } = await relay.exited
  assert.equal(code, 0)
  assert.ok(await gone(child), 'MCP child still alive')
  assert.ok(await gone(grandchild), 'browser stand-in still alive')
})

test('(e) killing the relay parent leaves no child or grandchild', async () => {
  const dir = tmp()
  const parent = spawn(process.execPath, [join(HERE, 'support', 'orphan-parent.mjs'), RELAY], { env: env(dir), stdio: ['ignore', 'pipe', 'inherit'] })
  const relayPid = await new Promise((resolve) => parent.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim()))))
  for (let i = 0; i < 200 && !existsSync(join(dir, 'log.pids')); i++) await sleep(50)
  await sleep(100)
  const { child, grandchild } = JSON.parse(readFileSync(join(dir, 'log.pids'), 'utf8'))
  parent.kill('SIGKILL')
  assert.ok(await gone(relayPid), 'relay still alive')
  assert.ok(await gone(child), 'MCP child still alive')
  assert.ok(await gone(grandchild), 'browser stand-in still alive')
})

test('(e) a missing, unreadable or versionless executable refuses to start with one line', () => {
  const cases = [
    { ADESTIA_WEB_EXECUTABLE: join(tmp(), 'absent') },
    { FAKE_VERSION_LINE: 'nothing readable' },
    { FAKE_VERSION_LINE: '' },
  ]
  for (const extra of cases) {
    const dir = tmp()
    const result = spawnSync(process.execPath, [RELAY], { env: env(dir, extra), encoding: 'utf8', input: '', timeout: 20000 })
    assert.notEqual(result.status, 0, JSON.stringify(extra))
    const lines = result.stderr.trim().split('\n')
    assert.equal(lines.length, 1, result.stderr)
    assert.ok(lines[0].startsWith('adestia web:'))
    assert.ok(!existsSync(join(dir, 'log.argv')), 'the MCP server must not have been launched')
  }
})

test('(e) a missing MCP entry (no node_modules) refuses to start with one line', () => {
  const dir = tmp()
  const result = spawnSync(process.execPath, [RELAY], { env: env(dir, { ADESTIA_WEB_MCP: join(dir, 'nope.js') }), encoding: 'utf8', input: '', timeout: 20000 })
  assert.notEqual(result.status, 0)
  assert.equal(result.stderr.trim().split('\n').length, 1)
})

test('(f) the output folder is .adestia-web/ in the workspace and is passed to the child', async () => {
  const dir = tmp()
  const relay = run(dir)
  await relay.ask('tools/list')
  assert.ok(statSync(join(dir, '.adestia-web')).isDirectory())
  assert.equal(valueOf(argvOf(dir), '--output-dir'), join(dir, '.adestia-web'))
  relay.child.stdin.end()
  await relay.exited
})
