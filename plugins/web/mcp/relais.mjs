#!/usr/bin/env node
/**
 * The `web` plugin's MCP server: a filtering relay in front of `@playwright/mcp`
 * (ARCHITECTURE.md, AD-web-1). It spawns the real server over stdio and forwards
 * the newline-delimited JSON-RPC both ways with exactly two edits — `tools/list`
 * loses the withheld names, and a `tools/call` naming one is answered here with
 * an error, never forwarded. Because it sits below the driver it holds on every
 * engine.
 *
 * Environment (all optional; the image sets none of them):
 *   ADESTIA_WORKSPACE      workspace root; the output folder lives in it (AD-web-7)
 *   ADESTIA_WEB_EXECUTABLE the browser binary; else looked up in PLAYWRIGHT_BROWSERS_PATH
 *   ADESTIA_WEB_MCP        the MCP server's entry script; else the pinned package's
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/**
 * Withheld tools, one line and one reason each. A denylist pinned to the version
 * of `@playwright/mcp` in package.json: a bump is a decision (AD-web-2).
 */
export const WITHHELD = new Map([
  ['browser_run_code_unsafe', 'runs arbitrary code in the server process'],
  ['browser_evaluate', 'runs code in a page the agent does not control, which a page can steer by prompt injection'],
  ['browser_file_upload', 'reads a local file into a page'],
])

/** `--no-sandbox` only if the image measured it necessary (AD-web-6). */
export const SANS_SANDBOX = false

const OUTPUT_MAX_SIZE = 20 * 1024 * 1024
const IDLE_TIMEOUT_MS = 60000

function refuse(reason) {
  process.stderr.write(`adestia web: ${reason}\n`)
  process.exit(1)
}

function findBrowser() {
  const given = process.env.ADESTIA_WEB_EXECUTABLE
  if (given) return given
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/browsers'
  let dirs = []
  try {
    dirs = readdirSync(base).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse()
  } catch {
    return undefined
  }
  for (const dir of dirs) {
    for (const bin of ['headless_shell', 'chrome-headless-shell']) {
      const path = join(base, dir, 'chrome-linux', bin)
      if (existsSync(path)) return path
    }
  }
  return undefined
}

/** The standard desktop string of the version the binary reports — never a number written here. */
export function userAgentFrom(versionOutput) {
  const match = /(\d+)\.\d+\.\d+\.\d+/.exec(versionOutput)
  if (!match) return undefined
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${match[1]}.0.0.0 Safari/537.36`
}

function start() {
  const executable = findBrowser()
  if (!executable || !existsSync(executable)) {
    refuse(`no browser executable${executable ? ` at ${executable}` : ''} (image built without WEB_BROWSER?)`)
  }
  let versionOutput = ''
  try {
    versionOutput = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    refuse(`cannot run ${executable} --version`)
  }
  const userAgent = userAgentFrom(versionOutput)
  if (!userAgent) refuse(`no readable version from ${executable} --version`)

  const entry = process.env.ADESTIA_WEB_MCP || join(ROOT, 'node_modules', '@playwright', 'mcp', 'cli.js')
  if (!existsSync(entry)) refuse(`${entry} is missing (npm ci --omit=dev --ignore-scripts in plugins/web)`)

  const outputDir = join(resolve(process.env.ADESTIA_WORKSPACE || process.cwd()), '.adestia-web')
  try {
    mkdirSync(outputDir, { recursive: true })
  } catch (error) {
    refuse(`cannot create ${outputDir}: ${error.message}`)
  }

  const args = [
    entry,
    '--headless',
    '--isolated',
    '--executable-path', executable,
    '--user-agent', userAgent,
    '--output-dir', outputDir,
    '--output-max-size', String(OUTPUT_MAX_SIZE),
    '--idle-timeout', String(IDLE_TIMEOUT_MS),
    ...(SANS_SANDBOX ? ['--no-sandbox'] : []),
  ]

  // A process group of its own, so the browser the child launches goes with it.
  const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'inherit'], detached: true })
  let done = false
  const finish = (code) => {
    if (done) return
    done = true
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // group already gone
    }
    process.exit(code)
  }
  child.on('error', (error) => {
    process.stderr.write(`adestia web: cannot start the MCP server: ${error.message}\n`)
    finish(1)
  })
  child.on('exit', (code) => finish(code ?? 1))
  child.stdin.on('error', () => {})
  process.stdout.on('error', () => finish(0))
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => finish(0))
  process.on('exit', () => {
    if (done) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // nothing left
    }
  })

  const listIds = new Set()
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

  createInterface({ input: process.stdin }).on('line', (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      child.stdin.write(`${line}\n`)
      return
    }
    if (message?.method === 'tools/list' && message.id !== undefined) listIds.add(message.id)
    const name = message?.method === 'tools/call' ? message.params?.name : undefined
    if (typeof name === 'string' && WITHHELD.has(name)) {
      send({
        jsonrpc: '2.0',
        id: message.id ?? null,
        error: { code: -32601, message: `The tool ${name} is withheld by this instance: it ${WITHHELD.get(name)}.` },
      })
      return
    }
    child.stdin.write(`${line}\n`)
  }).on('close', () => finish(0))

  createInterface({ input: child.stdout }).on('line', (line) => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      process.stdout.write(`${line}\n`)
      return
    }
    if (message?.id !== undefined && listIds.delete(message.id) && Array.isArray(message.result?.tools)) {
      message.result.tools = message.result.tools.filter((tool) => !WITHHELD.has(tool?.name))
    }
    send(message)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start()
