/**
 * Feature adestia-web-zombies, seen from the container: after a read by the web plugin
 * and the closing of the relay, no chrome process stays in the process table (alive or
 * zombie, counted in /proc), and the server still stops cleanly on SIGTERM.
 *
 * The image cannot run here (no docker), so the container's PID 1 is stood in for by the
 * entrypoint the Dockerfile declares: its words before `node` are the init. With an init
 * (tini) it is run as `tini -s` (adopt the orphans of the tree, as PID 1 does); without
 * one, by support/zombies-sans-init.py, which adopts and never reaps, as node as PID 1.
 * Expectations are written out in this file, none read from the code under test.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import process from 'node:process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const RELAY = join(ROOT, 'plugins', 'web', 'mcp', 'relais.mjs')
const SERVER = join(ROOT, 'packages', 'server', 'bin', 'adestia.js')
const made = []
const running = []

const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'adestia-zombies-'))
  made.push(dir)
  return dir
}

after(() => {
  for (const child of running) {
    try {
      child.kill('SIGKILL')
    } catch {
      // gone
    }
  }
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** The Dockerfile's ENTRYPOINT, as the list of words. */
function entrypoint() {
  const line = readFileSync(join(ROOT, 'Dockerfile'), 'utf8').split('\n').find((l) => l.startsWith('ENTRYPOINT'))
  assert.ok(line, 'the Dockerfile has an ENTRYPOINT')
  return JSON.parse(line.slice('ENTRYPOINT'.length).trim())
}

/** The init words of the entrypoint, those before `node`. */
const initWords = () => entrypoint().slice(0, entrypoint().indexOf('node'))

/** Command that runs `argv` under the container's PID 1. */
function underInit(argv) {
  const init = initWords()
  if (init.length === 0) return ['python3', join(HERE, 'support', 'zombies-sans-init.py'), ...argv]
  return [init[0], '-s', ...init.slice(1), ...argv]
}

/** Every process of the machine as { pid, ppid, state, comm }, read in /proc. */
function processes() {
  const out = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      out.push({ pid: Number(name), ppid: Number(rest[1]), state: rest[0], comm })
    } catch {
      // vanished while reading
    }
  }
  return out
}

const chromes = () => processes().filter((p) => p.comm.startsWith('chrome-headless'))

function chromeBin(dir) {
  const bin = join(dir, 'chrome-headless-shell')
  symlinkSync(existsSync('/bin/sleep') ? '/bin/sleep' : '/usr/bin/sleep', bin)
  return bin
}

/** One web read under the init; resolves with the chromes seen while the read ran and once the relay is closed. */
async function oneRead({ closeBy }) {
  const dir = tmp()
  const bin = chromeBin(dir)
  const env = {
    PATH: process.env.PATH,
    RELAY,
    CHROME_BIN: bin,
    ADESTIA_WEB_EXECUTABLE: join(HERE, 'support', 'zombies-browser.sh'),
    ADESTIA_WEB_MCP: join(HERE, 'support', 'zombies-mcp.mjs'),
    ADESTIA_WORKSPACE: dir,
  }
  const [cmd, ...args] = underInit([process.execPath, join(HERE, 'support', closeBy === 'sigterm' ? 'zombies-holder-sigterm.mjs' : 'zombies-holder.mjs')])
  const init = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'inherit'] })
  running.push(init)
  let seen = ''
  init.stdout.on('data', (chunk) => (seen += chunk))
  for (let i = 0; i < 200 && !seen.includes('relay-closed'); i++) await sleep(50)
  assert.ok(seen.includes('relay-closed'), 'the relay closed after the read')
  await sleep(1000)
  const left = chromes()
  const stop = new Promise((resolve) => init.on('exit', (code, signal) => resolve({ code, signal })))
  init.kill('SIGTERM')
  const ended = await Promise.race([stop, sleep(5000).then(() => 'timeout')])
  init.kill('SIGKILL')
  return { left, ended }
}

test('E2E · a web read followed by the closing of the relay leaves no chrome process, alive or zombie', async () => {
  const { left } = await oneRead({ closeBy: 'stdin' })
  assert.deepEqual(left, [])
})

test('E2E · two web reads in a row leave no chrome process either', async () => {
  const first = await oneRead({ closeBy: 'stdin' })
  const second = await oneRead({ closeBy: 'stdin' })
  assert.deepEqual([first.left, second.left], [[], []])
})

test('E2E · a relay ended by SIGTERM instead of a closed stdin leaves no chrome process either', async () => {
  const { left } = await oneRead({ closeBy: 'sigterm' })
  assert.deepEqual(left, [])
})

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

const health = (port) =>
  fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) }).then((r) => r.json(), () => undefined)

test('E2E · the server started under the entrypoint answers, then stops on SIGTERM with exit code 0 and stops answering', async () => {
  const dir = tmp()
  const port = await freePort()
  writeFileSync(join(dir, 'adestia.config.yaml'), `host: 127.0.0.1\nport: ${port}\ndataDir: ${join(dir, 'data')}\n`)
  const init = entrypoint().slice(0, entrypoint().indexOf('node'))
  const argv = [...init.slice(0, 1).flatMap((w) => [w, '-s']), ...init.slice(1), process.execPath, SERVER, '--config', join(dir, 'adestia.config.yaml')]
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] })
  running.push(child)
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
  let body
  for (let i = 0; i < 200 && !body; i++) {
    body = await health(port)
    if (!body) await sleep(100)
  }
  assert.deepEqual(body, { status: 'ok' })
  child.kill('SIGTERM')
  const result = await Promise.race([exited, sleep(10000).then(() => 'timeout')])
  assert.deepEqual(result, { code: 0, signal: null }, stderr)
  assert.equal(await health(port), undefined)
})
