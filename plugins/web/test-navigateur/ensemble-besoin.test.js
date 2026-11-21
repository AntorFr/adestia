/**
 * Adestia-web, tests d'ensemble écrits depuis le besoin (critère amendé du 2026-11-20 22:10,
 * points (3), (4), (5)) : le vrai serveur Adestia lancé, le vrai relais, le vrai @playwright/mcp
 * et le vrai Chrome headless-shell, sur des pages servies en local. Aucun réseau hors boucle locale.
 * Joués par la suite attestée seulement (`npm run test:web-navigateur`) : le navigateur y est installé
 * et le serveur construit ; un navigateur absent est rouge, jamais sauté.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { client } from './support/client-cwd.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..')
const ROOT = join(PLUGIN, '..', '..')
const PLUGINS = join(ROOT, 'plugins')
const BIN = join(ROOT, 'packages', 'server', 'bin', 'adestia.js')
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/browsers'
const MIB = 1024 * 1024
const WITHHELD = ['browser_run_code_unsafe', 'browser_evaluate', 'browser_file_upload']

const cleanup = []
after(() => {
  for (const fn of cleanup) { try { fn() } catch { /* already gone */ } }
})

const tmp = () => mkdtempSync(join(tmpdir(), 'adestia-web-ens-'))

/** Chrome processes alive now, read from /proc, independent of the code under test. */
function chromes() {
  const found = []
  for (const pid of readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
    try {
      const exe = (readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0] ?? '')
      if (/chrome-headless-shell|headless_shell|chromium|chrome$/.test(exe.split('/').pop() ?? '')) found.push(Number(pid))
    } catch { /* gone */ }
  }
  return found
}
async function noChrome(what) {
  for (let i = 0; i < 100; i++) { if (chromes().length === 0) return; await sleep(100) }
  assert.fail(`${what}: chrome still running (${chromes().join(', ')})`)
}

/** The version the real binary announces, read by the test itself. */
function realChromeMajor() {
  const dir = readdirSync(BROWSERS).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop()
  const exe = join(BROWSERS, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
  const out = spawnSync(exe, ['--version'], { encoding: 'utf8' }).stdout
  const m = /(\d+)\.\d+\.\d+\.\d+/.exec(out)
  assert.ok(m, `no version in "${out}"`)
  return m[1]
}

async function freePort() {
  return new Promise((resolve) => {
    const s = netServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
}

/** A real Adestia server, started as an operator does, with or without the web plugin named. */
async function adestia(tools) {
  const dir = tmp()
  const workspace = join(dir, 'ws')
  mkdirSync(join(workspace, 'pages'), { recursive: true })
  writeFileSync(join(workspace, 'pages', 'visible.md'), '# Visible\n')
  const port = await freePort()
  writeFileSync(join(dir, 'c.yaml'), [
    'host: 127.0.0.1', `port: ${port}`, `dataDir: ${join(dir, 'data')}`,
    'workspace:', `  root: ${workspace}`,
    'extensions:', `  pluginsDir: ${PLUGINS}`, `  tools: [${tools.join(', ')}]`, '',
  ].join('\n'))
  const child = spawn(process.execPath, [BIN, '-c', 'c.yaml'], { cwd: dir, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (c) => { log += c })
  child.stderr.on('data', (c) => { log += c })
  cleanup.push(() => child.kill('SIGKILL'))
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break } catch { /* not yet */ }
    await sleep(200)
    if (i === 149) assert.fail(`the server did not start: ${log}`)
  }
  const json = async (path) => { const r = await fetch(`${base}${path}`); return { status: r.status, body: await r.json() } }
  return { base, workspace, json, stop: () => child.kill('SIGTERM') }
}

/** Local pages. /ua echoes the User-Agent it received; /js builds its text by script; /blocked is a 403. */
let pages
let local
before(async () => {
  pages = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    const big = /^\/big\/(\d+)/.exec(req.url)
    if (req.url === '/ua') return res.end(`<body><p>UA=[${req.headers['user-agent']}]</p></body>`)
    if (req.url === '/blocked') { res.statusCode = 403; return res.end('<body><h1>Access denied</h1><p>Cloudflare challenge</p></body>') }
    if (req.url === '/js') return res.end('<body><p id="a"></p><script>document.getElementById("a").textContent="prix-"+(19+10)+"-euros"</script></body>')
    if (req.url === '/marker') return res.end('<body><title>avant</title><p>marqueur</p></body>')
    if (big) return res.end(`<body><script>const p=[];for(let i=0;i<20000;i++)p.push('<p>n${big[1]} ligne '+i+' '+'y'.repeat(80)+'</p>');document.body.innerHTML=p.join('')</script></body>`)
    res.statusCode = 404
    res.end('<body>nope</body>')
  })
  await new Promise((r) => pages.listen(0, '127.0.0.1', r))
  local = `http://127.0.0.1:${pages.address().port}`
  cleanup.push(() => pages.close())
})

/** The relay as the agent's CLI starts it: the declared command, working directory = the agent's workspace. */
function relayFor(workspace, env = {}) {
  const c = client(process.execPath, [join(PLUGIN, 'mcp', 'relais.mjs')], { PATH: process.env.PATH, HOME: process.env.HOME, PLAYWRIGHT_BROWSERS_PATH: BROWSERS, ...env }, workspace)
  cleanup.push(() => { try { process.kill(-c.child.pid, 'SIGKILL') } catch { /* gone */ } c.child.kill('SIGKILL') })
  return c
}
const call = (c, name, args) => c.ask('tools/call', { name, arguments: args })

test('B(3) plugin_web_decouvert_et_actif_seulement_si_tools_le_nomme: le serveur lancé câble le serveur MCP web, ou aucun outil web sans la mention', async () => {
  const on = await adestia(['web'])
  const plugins = (await on.json('/api/plugins')).body.plugins.find((p) => p.id === 'web')
  assert.equal(plugins?.kind, 'tool')
  assert.equal(plugins.wanted, true)
  assert.deepEqual(plugins.problems, [])
  const servers = (await on.json('/api/mcp/servers')).body.servers
  assert.deepEqual(servers.filter((s) => s.name === 'web').map((s) => s.source + ':' + s.owner), ['plugin:web'])
  on.stop()

  const off = await adestia([])
  const dormant = (await off.json('/api/plugins')).body.plugins.find((p) => p.id === 'web')
  assert.equal(dormant?.kind, 'tool', 'the plugin is still discovered')
  assert.equal(dormant.wanted, false)
  assert.deepEqual((await off.json('/api/mcp/servers')).body.servers.filter((s) => s.name === 'web'), [], 'an inactive plugin must expose no web tool')
  off.stop()
})

test('B(3) identite_derivee_de_la_version_du_binaire: le site reçoit Chrome/<version réelle>, jamais HeadlessChrome', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  const nav = await call(c, 'browser_navigate', { url: `${local}/ua` })
  assert.ok(!nav.error && !nav.result?.isError, c.text(nav))
  const text = c.text(await call(c, 'browser_snapshot', {}))
  const major = realChromeMajor()
  const ua = /UA=\[([^\]]*)\]/.exec(text)?.[1]
  assert.ok(ua, `no UA echoed in: ${text}`)
  assert.ok(ua.includes(`Chrome/${major}.`), `UA "${ua}" does not carry the real major ${major}`)
  assert.ok(!/HeadlessChrome/i.test(ua), `UA "${ua}" announces HeadlessChrome`)
  assert.match(ua, /^Mozilla\/5\.0 \(/)
  c.child.stdin.end()
  await c.exited
})

test('B(3) page_servie_localement_lue: un texte construit par JavaScript est rendu à l’agent', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  await call(c, 'browser_navigate', { url: `${local}/js` })
  assert.match(c.text(await call(c, 'browser_snapshot', {})), /prix-29-euros/)
  c.child.stdin.end()
  await c.exited
})

test('B(3) site_qui_bloque_est_dit: la page de refus est rendue telle quelle, sans faux contenu', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  const nav = await call(c, 'browser_navigate', { url: `${local}/blocked` })
  const text = c.text(nav) + c.text(await call(c, 'browser_snapshot', {}))
  assert.match(text, /Access denied/)
  assert.match(text, /Cloudflare challenge/)
  c.child.stdin.end()
  await c.exited
})

test('B(3) outils_ecartes_absents: les trois outils dangereux n’existent pas pour l’agent et un appel direct n’exécute rien', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  const names = (await c.ask('tools/list', {})).result.tools.map((t) => t.name)
  for (const w of WITHHELD) assert.ok(!names.includes(w), `${w} is listed`)
  for (const keep of ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_take_screenshot']) assert.ok(names.includes(keep), `${keep} is missing`)
  await call(c, 'browser_navigate', { url: `${local}/marker` })
  const ev = await call(c, 'browser_evaluate', { function: '() => { document.title = "piege"; return 1 }' })
  assert.ok(ev.error || ev.result?.isError, 'browser_evaluate answered as if it ran')
  const code = await call(c, 'browser_run_code_unsafe', { code: 'async (page) => { await page.evaluate(() => { document.title = "piege" }) }' })
  assert.ok(code.error || code.result?.isError, 'browser_run_code_unsafe answered as if it ran')
  const up = await call(c, 'browser_file_upload', { paths: ['/etc/hostname'] })
  assert.ok(up.error || up.result?.isError, 'browser_file_upload answered as if it ran')
  const tabs = c.text(await call(c, 'browser_tabs', { action: 'list' }))
  assert.ok(!tabs.includes('piege'), `a withheld tool ran: ${tabs}`)
  c.child.stdin.end()
  await c.exited
})

test('B(4) aucun_chrome_au_repos_ni_apres_un_appel: aucun avant, un pendant, aucun après la fin du tour, aucun après un tour sans appel', async () => {
  await noChrome('before anything')
  const ws = tmp()
  const idle = relayFor(ws)
  await idle.start()
  assert.deepEqual(chromes(), [], 'a relay at rest holds a chrome')
  idle.child.stdin.end()
  await idle.exited
  await noChrome('after a turn without call')

  const c = relayFor(ws)
  await c.start()
  await call(c, 'browser_navigate', { url: `${local}/js` })
  assert.ok(chromes().length > 0, 'no chrome during the call')
  c.child.stdin.end()
  assert.equal((await c.exited).code, 0)
  await noChrome('after the turn')
})

test('B(4) aucun_chrome_apres_arret_brutal_du_tour: SIGTERM du relais en plein appel ne laisse aucun chrome', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  await call(c, 'browser_navigate', { url: `${local}/js` })
  assert.ok(chromes().length > 0)
  c.child.kill('SIGTERM')
  await c.exited
  await noChrome('after SIGTERM')
})

test('B(5) fichier_de_page_dans_adestia_web_invisible_pour_les_ecrans: écrit dans <espace>/.adestia-web, ni listé ni servi par le serveur', async () => {
  const srv = await adestia(['web'])
  const c = relayFor(srv.workspace)
  await c.start()
  await call(c, 'browser_navigate', { url: `${local}/js` })
  const snap = c.text(await call(c, 'browser_snapshot', {}))
  assert.match(snap, /prix-29-euros/)
  const dir = join(srv.workspace, '.adestia-web')
  const files = readdirSync(dir)
  assert.ok(files.length > 0, 'no page file in .adestia-web')
  assert.ok(files.some((f) => readFileSync(join(dir, f), 'utf8').includes('prix-29-euros')), 'no file holds the page text')
  assert.ok(!existsSync(join(PLUGIN, '.adestia-web')), 'output landed in the plugin folder')

  const pagesList = (await srv.json('/api/pages')).body.pages.map((p) => p.path)
  assert.deepEqual(pagesList, ['visible.md'])
  assert.deepEqual((await srv.json('/api/files')).body.files, [])
  for (const f of files) {
    const r = await srv.json(`/api/files/.adestia-web/${f}`)
    assert.ok(r.status >= 400, `${f} is served (${r.status})`)
    assert.ok((await srv.json(`/api/pages/.adestia-web/${f}`)).status >= 400, `${f} is served as a page`)
  }
  c.child.stdin.end()
  await c.exited
  srv.stop()
})

test('B(5) dossier_borne: après plus de 20 MiB de pages, le dossier reste sous 20 MiB et les plus anciens sont partis', async () => {
  const ws = tmp()
  const c = relayFor(ws)
  await c.start()
  const dir = join(ws, '.adestia-web')
  let total = 0
  for (let n = 0; n < 12; n++) {
    const nav = await call(c, 'browser_navigate', { url: `${local}/big/${n}` })
    assert.ok(!nav.error && !nav.result?.isError, c.text(nav))
    total = readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0)
    assert.ok(total <= 20 * MIB, `${total} bytes after ${n + 1} pages`)
  }
  assert.ok(readdirSync(dir).length < 12, 'nothing was evicted: more than the bound was never written')
  c.child.stdin.end()
  await c.exited
})

test('B(3) echec_sans_navigateur: sans Chrome installé le relais refuse de démarrer, une ligne, code non nul, aucun faux outil', async () => {
  const ws = tmp()
  const c = relayFor(ws, { PLAYWRIGHT_BROWSERS_PATH: join(tmp(), 'vide') })
  const out = await Promise.race([c.exited, sleep(15000).then(() => 'timeout')])
  assert.notEqual(out, 'timeout', 'the relay stayed up without a browser')
  assert.notEqual(out.code, 0)
  const lines = c.stderr().trim().split('\n').filter(Boolean)
  assert.equal(lines.length, 1, `expected one line, got: ${c.stderr()}`)
})
