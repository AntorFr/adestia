/**
 * The graphical bench — what only a browser can tell you.
 *
 * Unit tests render the components; they cannot say where the indicator
 * SITS, whether a bubble is legible in the dark, or that a strip of tabs
 * eats the thread. Two defects of the tab strip were found this way and by
 * no other means, which is why `CLAUDE.md` asks for a run of this whenever
 * a change touches what the shell draws.
 *
 * The shape of a run: the real image, in a container, behind a proxy that
 * forwards everything to it EXCEPT the turn endpoints. No agent CLI lives in
 * the bench — an operator adds one, the image ships none — so a real turn
 * cannot run, and a turn is scripted instead: the same SSE the server would
 * send, paced by hand, through the shell's real reducer and real components.
 * What is faked is the engine, never the shell.
 *
 * A scenario module default-exports `async (bench) => {}` and gets:
 *   open({ theme, width, height, tab })  a page, with a tab restored
 *   shoot(page, name)                    a screenshot into /shots
 *   attached()                           resolves when the shell has attached
 *   emit(event) / endTurn()              drive the scripted turn
 *   api(path, init)                      fetch against the app, JSON in/out
 *   dataDir                              the app's data volume, mounted here
 *
 * Run it through `bench/run.sh <scenario>`; the traps that cost an hour are
 * in `bench/README.md`.
 */
import { createServer, request } from 'node:http'
import { argv, env } from 'node:process'
import playwright from '/usr/lib/node_modules/playwright-core/index.js'

const { chromium } = playwright
const UPSTREAM = { host: env.APP_HOST ?? 'golem-bench-app', port: Number(env.APP_PORT ?? 8730) }
const ORIGIN = 'http://127.0.0.1:8080'
const SHOTS = '/shots'

let turn // the open SSE response, once the shell has attached
let served = 0
const waiting = []

const proxy = createServer((req, res) => {
  const url = new URL(req.url, 'http://bench')
  if (url.pathname === '/api/turn/attach') {
    // ONCE. The shell re-attaches after every turn it finishes, so a stream
    // that always answers would loop for as long as the bench runs.
    if (served > 0 || turn) {
      res.writeHead(204).end()
      return
    }
    served += 1
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    turn = res
    for (const resolve of waiting.splice(0)) resolve()
    return
  }
  const upstream = request(
    {
      ...UPSTREAM,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}` },
    },
    (up) => {
      // Named rather than swallowed: a 404 the browser shrugs off is how a
      // missing asset hides, and the console only says "Failed to load".
      if ((up.statusCode ?? 0) >= 400) console.log('UPSTREAM', up.statusCode, req.method, req.url)
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', () => res.writeHead(502).end())
  req.pipe(upstream)
})

await new Promise((resolve) => proxy.listen(8080, '127.0.0.1', resolve))
const browser = await chromium.launch({ args: ['--no-sandbox'] })

const bench = {
  dataDir: '/data',

  async open({ theme = 'light', width = 1280, height = 900, tab } = {}) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
      locale: env.BENCH_LOCALE ?? 'fr-FR',
    })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('CONSOLE', message.text())
    })
    if (tab) {
      await page.addInitScript(
        ([key, id]) => window.localStorage.setItem(key, JSON.stringify({ open: [id], active: id })),
        ['golem.tabs', tab],
      )
    }
    // NOT `networkidle`: an attached turn holds its SSE connection open for
    // the whole turn, so the network is never idle — by design.
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.golem-chat', { timeout: 20_000 })
    await page.waitForTimeout(800)
    return page
  },

  async shoot(page, name) {
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
    console.log('shot', name)
  },

  attached() {
    return turn ? Promise.resolve() : new Promise((resolve) => waiting.push(resolve))
  },

  emit(event) {
    if (!turn) throw new Error('nothing is attached yet — await bench.attached()')
    turn.write(`data: ${JSON.stringify(event)}\n\n`)
  },

  endTurn() {
    turn?.end()
    turn = undefined
  },

  async api(path, init) {
    const response = await fetch(`${ORIGIN}${path}`, init)
    return response.json()
  },
}

const { default: scenario } = await import(argv[2] ?? '/bench/scenarios/turn-parts.mjs')
try {
  await scenario(bench)
} finally {
  await browser.close()
  proxy.close()
  bench.endTurn()
}
