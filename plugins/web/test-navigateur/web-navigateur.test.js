/**
 * The web plugin's relay against the REAL @playwright/mcp and the REAL headless
 * browser — no fake, no network beyond the loopback. Played by the attested suite only
 * (`npm run test:web-navigateur`); the browser is installed by the suite's step, and a
 * missing browser fails these tests, it never skips them.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { WITHHELD } from '../mcp/relais.mjs'
import { client } from './support/client.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..')
const RELAY = join(PLUGIN, 'mcp', 'relais.mjs')
const MCP = join(PLUGIN, 'node_modules', '@playwright', 'mcp', 'cli.js')
const BOUND = 20 * 1024 * 1024
const made = []
const kids = []

/** The tools of the pinned @playwright/mcp the relay lets through; a new name is a decision (AD-web-1, AD-web-2). */
const KNOWN = [
  'browser_click', 'browser_close', 'browser_console_messages', 'browser_drag', 'browser_drop', 'browser_emulate_media',
  'browser_fill_form', 'browser_find', 'browser_handle_dialog', 'browser_hover', 'browser_navigate', 'browser_navigate_back',
  'browser_network_request', 'browser_network_requests', 'browser_press_key', 'browser_resize', 'browser_select_option',
  'browser_snapshot', 'browser_tabs', 'browser_take_screenshot', 'browser_type', 'browser_wait_for',
]

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'adestia-web-nav-'))
  made.push(dir)
  return dir
}

/** The browser binaries now running: any process whose command line names the headless shell. */
function chromes() {
  const found = []
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (/chrome-headless-shell|headless_shell/.test(cmd.split('\0')[0] ?? '')) found.push(Number(pid))
    } catch {
      // gone while reading
    }
  }
  return found
}

async function noChrome(what) {
  for (let i = 0; i < 100; i++) {
    if (chromes().length === 0) return
    await sleep(100)
  }
  assert.fail(`${what}: chrome still running (${chromes().join(', ')})`)
}

function relay(dir) {
  const c = client(process.execPath, [RELAY], { PATH: process.env.PATH, HOME: process.env.HOME, ADESTIA_WORKSPACE: dir, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/browsers' })
  kids.push(c.child)
  return c
}

/** A local page whose text exists only once its script has run. */
let server
let base
before(async () => {
  server = createServer((req, res) => {
    const big = /^\/big\/(\d+)/.exec(req.url)
    res.setHeader('content-type', 'text/html; charset=utf-8')
    if (big) {
      // ~2 MiB of text per page, different for each page, built by script.
      res.end(`<body><script>const n=${big[1]};const p=[];for(let i=0;i<20000;i++)p.push('<p>page '+n+' ligne '+i+' '+'x'.repeat(80)+'</p>');document.body.innerHTML=p.join('')</script></body>`)
    } else {
      res.end('<body><p id="a"></p><script>document.getElementById("a").textContent=["texte","bati",String(6*7)].join("-")</script></body>')
    }
  })
  await new Promise((resolve) => server.listen(0, 'localhost', resolve))
  base = `http://localhost:${server.address().port}`
})

after(() => {
  server?.close()
  for (const child of kids) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* not a group leader / gone */ }
    try { child.kill('SIGKILL') } catch { /* gone */ }
  }
})

test('the browser is installed, the plugin has no .node file, and no chrome runs yet', () => {
  assert.ok(existsSync(MCP), `${MCP} is missing: the suite's step installs plugins/web`)
  const found = spawnSync('find', [join(PLUGIN, 'node_modules'), '-name', '*.node'], { encoding: 'utf8' })
  assert.equal(found.status, 0)
  assert.equal(found.stdout.trim(), '', 'a native .node file is in plugins/web/node_modules (AD-web-2)')
  assert.deepEqual(chromes(), [])
})

test('the real @playwright/mcp lists exactly the withheld names plus the known ones, and the relay hides the withheld', async () => {
  const dir = tmp()
  const raw = await (async () => {
    // The MCP server alone, as the relay would start it, but it never launches the browser for a list.
    const c = client(process.execPath, [MCP, '--headless', '--isolated', '--output-dir', dir], { PATH: process.env.PATH, HOME: process.env.HOME })
    kids.push(c.child)
    await c.start()
    const list = await c.ask('tools/list', {})
    c.child.kill('SIGKILL')
    return list.result.tools.map((tool) => tool.name)
  })()
  for (const name of WITHHELD.keys()) assert.ok(raw.includes(name), `${name} is no longer a tool of the pinned @playwright/mcp: the denylist is stale`)
  const unknown = raw.filter((name) => !WITHHELD.has(name) && !KNOWN.includes(name))
  assert.deepEqual(unknown, [], 'the pinned @playwright/mcp has tools the relay never decided on')

  const c = relay(dir)
  await c.start()
  const names = (await c.ask('tools/list', {})).result.tools.map((tool) => tool.name)
  for (const name of WITHHELD.keys()) assert.ok(!names.includes(name), `${name} is in the relay's list`)
  assert.deepEqual([...names].sort(), raw.filter((name) => !WITHHELD.has(name)).sort())
  for (const name of WITHHELD.keys()) {
    const answer = await c.ask('tools/call', { name, arguments: {} })
    assert.ok(answer.error?.message.includes(name), `a call of ${name} is not refused by name`)
  }
  c.child.kill('SIGKILL')
})

test('a text built by JavaScript is read by the real browser, a page file is written, and no chrome outlives the relay', async () => {
  const dir = tmp()
  const c = relay(dir)
  await c.start()
  assert.deepEqual(chromes(), [], 'chrome before the call')
  const nav = await c.ask('tools/call', { name: 'browser_navigate', arguments: { url: `${base}/` } })
  assert.ok(!nav.error && !nav.result?.isError, c.text(nav))
  assert.ok(chromes().length > 0, 'the call did not start a browser')
  const read = await c.ask('tools/call', { name: 'browser_snapshot', arguments: {} })
  assert.match(c.text(read), /texte-bati-42/)
  const files = readdirSync(join(dir, '.adestia-web'))
  assert.ok(files.length > 0, 'no page file in .adestia-web')
  assert.match(readFileSync(join(dir, '.adestia-web', files[0]), 'utf8'), /texte-bati-42/)
  c.child.stdin.end()
  assert.equal((await c.exited).code, 0)
  await noChrome('after the relay closed')
})

test('no chrome is left when the parent of the relay dies', async () => {
  const dir = tmp()
  const parent = spawn(process.execPath, [join(HERE, 'support', 'parent.mjs'), RELAY, `${base}/`], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ADESTIA_WORKSPACE: dir, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/browsers' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  kids.push(parent)
  const relayPid = await new Promise((resolve, reject) => {
    parent.on('exit', () => reject(new Error('the parent exited before it was ready')))
    parent.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim().split(' ')[1])))
  })
  assert.ok(chromes().length > 0, 'the browser was not up')
  parent.kill('SIGKILL')
  await noChrome('after the parent was killed')
  for (let i = 0; i < 100 && existsSync(`/proc/${relayPid}`); i++) await sleep(100)
  assert.ok(!existsSync(`/proc/${relayPid}`), 'the relay outlived its parent')
})

test('the output folder stays under its bound after more output than the bound holds', async () => {
  const dir = tmp()
  const c = relay(dir)
  await c.start()
  let written = 0
  for (let n = 0; n < 14; n++) {
    const nav = await c.ask('tools/call', { name: 'browser_navigate', arguments: { url: `${base}/big/${n}` } })
    assert.ok(!nav.error && !nav.result?.isError, c.text(nav))
    const out = join(dir, '.adestia-web')
    written = readdirSync(out).reduce((sum, name) => sum + statSync(join(out, name)).size, 0)
    assert.ok(written <= BOUND, `${written} bytes in .adestia-web after ${n + 1} pages, over the bound ${BOUND}`)
  }
  // ~2.5 MB a page, 14 pages: more than the bound was written, so the folder was pruned.
  assert.ok(readdirSync(join(dir, '.adestia-web')).length < 14, 'nothing was pruned: the test did not exceed the bound')
  c.child.stdin.end()
  await c.exited
})
