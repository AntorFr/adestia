#!/usr/bin/env node
/**
 * Launch Adestia on the host, without docker.
 *
 *   node bench/launch.mjs [--engine fake|claude] [--skin <id>] [--locale en|fr]
 *                         [--seed <name>] [--port <n>] [--data <dir>]
 *
 * Needs a built server (`npm run build`). Prints `listening on <url>` once
 * `/api/health` answers `ok`, runs until SIGTERM/SIGINT, then removes its
 * throwaway workspace and data directory (under os.tmpdir(), unless `--data`
 * names one — which is then kept).
 *
 * `--engine fake`   the scripted engine (bench/fake-engine.mjs) through
 *                   `start({ driverFactory })`, in this process.
 * `--engine claude` the plain binary (packages/server/bin/adestia.js) with
 *                   `CLAUDE_CODE_OAUTH_TOKEN` from the environment; refused
 *                   without it, before anything is created.
 *
 * Nothing here is part of the product: no configuration key, no driver id.
 */
import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { argv, env, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const fail = (message, code = 1) => {
  console.error(`launch: ${message}`)
  exit(code)
}

const OPTIONS = ['engine', 'skin', 'locale', 'seed', 'port', 'data']
const parseArgs = (args) => {
  const options = { engine: 'fake', seed: 'base', port: '0' }
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    const name = flag.startsWith('--') ? flag.slice(2) : ''
    if (!OPTIONS.includes(name)) fail(`unknown argument ${flag} — options: ${OPTIONS.map((o) => `--${o}`).join(' ')}`, 2)
    const value = args[++i]
    if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`, 2)
    options[name] = value
  }
  if (!['fake', 'claude'].includes(options.engine)) fail(`--engine must be fake or claude (got ${options.engine})`, 2)
  if (options.locale && !['en', 'fr'].includes(options.locale)) fail(`--locale must be en or fr (got ${options.locale})`, 2)
  if (!/^[a-z0-9-]+$/.test(options.seed)) fail(`--seed must be a seed name (got ${options.seed})`, 2)
  const port = Number(options.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`--port must be 0-65535 (got ${options.port})`, 2)
  options.port = port
  return options
}

const options = parseArgs(argv.slice(2))

// Refuse before creating anything: a missing credential is a one-line answer.
if (options.engine === 'claude' && !env.CLAUDE_CODE_OAUTH_TOKEN) {
  fail('--engine claude needs CLAUDE_CODE_OAUTH_TOKEN in the environment (a real turn cannot run without it)')
}

const serverEntry = join(root, 'packages/server/dist/src/start.js')
try {
  await access(serverEntry)
} catch {
  fail('the server is not built — run `npm run build` first')
}

const seedFile = join(here, 'seed', `${options.seed}.mjs`)
try {
  await access(seedFile)
} catch {
  fail(`no seed named ${options.seed} (expected ${seedFile})`)
}

// `yaml` is the server's own dependency: reached through its package, so the
// launcher adds none of its own.
const requireFromServer = createRequire(join(root, 'packages/server/package.json'))
const yaml = requireFromServer('yaml')

const keepData = options.data !== undefined
const base = keepData ? resolve(options.data) : await mkdtemp(join(tmpdir(), 'adestia-launch-'))
const workspace = join(base, 'workspace')
const dataDir = join(base, 'data')
await mkdir(workspace, { recursive: true })
await mkdir(dataDir, { recursive: true })

let instance
let child
let cleaning = false
const cleanup = async (code) => {
  if (cleaning) return
  cleaning = true
  try {
    if (instance) await instance.close()
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((done) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          done()
        }, 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          done()
        })
      })
    }
  } finally {
    if (!keepData) await rm(base, { recursive: true, force: true })
  }
  exit(code)
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void cleanup(0))

try {
  const seedModule = await import(pathToFileURL(seedFile).href)
  const seeded = await seedModule.default({ workspace, dataDir })
  const config = yaml.parse(seeded) ?? {}
  config.host = '127.0.0.1'
  config.port = options.port
  config.dataDir = dataDir
  config.workspace = { ...(config.workspace ?? {}), root: workspace }
  config.extensions = { ...(config.extensions ?? {}), skinsDir: join(root, 'skins') }
  if (options.skin) config.extensions.skin = options.skin
  if (options.locale) config.locale = options.locale
  const configPath = join(base, 'adestia.config.yaml')
  await writeFile(configPath, yaml.stringify(config))

  let url
  if (options.engine === 'fake') {
    const { start } = await import(pathToFileURL(serverEntry).href)
    const { createFakeEngine } = await import(pathToFileURL(join(here, 'fake-engine.mjs')).href)
    const engine = createFakeEngine({ scripts: seedModule.scripts ?? [] })
    instance = await start({
      configPath,
      cwd: base,
      driverFactory: () => engine,
      log: (message) => console.error(message),
    })
    url = instance.url
  } else {
    // Port 0 cannot be learned from a child; ask for a free one first.
    const port = config.port || (await freePort())
    config.port = port
    await writeFile(configPath, yaml.stringify(config))
    child = spawn(process.execPath, [join(root, 'packages/server/bin/adestia.js'), '--config', configPath], {
      cwd: base,
      env: env,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.once('exit', (code) => {
      if (!cleaning) {
        console.error(`launch: the server exited (${code})`)
        void cleanup(1)
      }
    })
    url = `http://127.0.0.1:${port}`
  }

  await waitForHealth(url)
  console.log(`listening on ${url}`)
} catch (error) {
  console.error(`launch: ${error instanceof Error ? (error.stack ?? error.message) : error}`)
  await cleanup(1)
}

async function freePort() {
  const { createServer } = await import('node:net')
  return new Promise((done, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => done(port))
    })
  })
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok && (await response.json()).status === 'ok') return
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`${url}/api/health did not answer ok within 60 s`)
}
