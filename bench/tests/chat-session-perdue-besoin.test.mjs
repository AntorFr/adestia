/**
 * B-22 / P-16 step 7 / exit criterion of `adestia-ajouts-chat`, with the real Claude engine: a conversation
 * that already had a turn continues after Claude's sessions are gone (container recreated: same data, empty
 * engine home). The next turn must succeed on the same conversation and the thread must show the line
 * "The engine no longer remembers the earlier messages." directly above that turn's first agent message;
 * the earlier messages stay; no error is shown. Control: with the sessions kept (a plain restart), no line.
 *
 *   npm run build && CLAUDE_CODE_OAUTH_TOKEN=… node --test bench/tests/chat-session-perdue-besoin.test.mjs
 *
 * Needs the token and the network; without the token the test is skipped and says so (a green run then does
 * not prove it). Pictures go to the ignored `bench/shots-besoin-chat/`.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin-chat')
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.SDLC_CLAUDE_OAUTH_TOKEN

function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()) } catch { /* fixed root only */ }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(`${dir}/`)(name) } catch { /* not here */ }
    }
  }
  throw new Error('playwright not found in the environment')
}

function start(data, home) {
  return new Promise((resolveStart, reject) => {
    const env = { ...process.env, HOME: home, CLAUDE_CODE_OAUTH_TOKEN: token }
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'claude', '--seed', 'empty', '--locale', 'en', '--data', data], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) { clearTimeout(timer); resolveStart({ url: match[1], stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }) }) }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
  })
}

const dirs = []
after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

async function send(page, chat, text, expected) {
  await chat.locator('.adestia-composer__input').fill(text)
  await chat.locator('.adestia-composer__send').click()
  await chat.locator('.adestia-bubble--agent', { hasText: expected }).last().waitFor({ timeout: 120_000 })
  await chat.locator('.adestia-composer__send').waitFor({ timeout: 120_000 })
}

/** Opens the only conversation of the instance through the list, whatever title the engine gave it. */
async function reopen(page, chat) {
  const list = await (await page.request.get(new URL('/api/conversations', page.url()).href)).json()
  const rows = Array.isArray(list) ? list : (list.conversations ?? [])
  assert.equal(rows.length, 1)
  await page.getByRole('button', { name: 'Conversations' }).click()
  await chat.getByText(rows[0].title, { exact: true }).first().click()
  await chat.getByText('ALPHA7').first().waitFor()
}

async function scenario(t, wipeSessions) {
  const { chromium } = loadPlaywright()
  const data = await mkdtemp(join(tmpdir(), 'besoin-claude-data-'))
  const home = await mkdtemp(join(tmpdir(), 'besoin-claude-home-'))
  dirs.push(data, home)
  await mkdir(shots, { recursive: true })
  const browser = await chromium.launch()
  let inst = await start(data, home)
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
    const chat = page.locator('.adestia-chat')
    await page.goto(inst.url)
    await send(page, chat, 'Reply with exactly the word ALPHA7 and nothing else.', 'ALPHA7')
    // The turn is over for the product once the reply is stored with the engine session; stopping before loses it.
    const stored = async () => {
      const list = await (await page.request.get(new URL('/api/conversations', page.url()).href)).json()
      const id = (Array.isArray(list) ? list : list.conversations)[0].id
      return (await page.request.get(new URL(`/api/conversations/${id}`, page.url()).href)).json()
    }
    for (let i = 0; i < 60; i++) {
      const c = await stored()
      if (c.sessionId && c.messages.some((m) => m.role === 'agent' && m.text.includes('ALPHA7'))) break
      await page.waitForTimeout(500)
    }
    await inst.stop()
    if (wipeSessions) await rm(join(home, '.claude'), { recursive: true, force: true })
    inst = await start(data, home)
    await page.goto(inst.url)
    await reopen(page, chat)
    await send(page, chat, 'Reply with exactly the word BRAVO8 and nothing else.', 'BRAVO8')
    return { page, chat, shot: (name) => page.screenshot({ path: join(shots, name) }) }
  } finally {
    t.after(async () => { await browser.close(); await inst.stop() })
  }
}

test('B-22 real Claude, sessions gone: the next turn succeeds on the same conversation and the line sits above its reply', { skip: token ? false : 'no Claude token: this test is NOT played', timeout: 400_000 }, async (t) => {
  const { chat, page, shot } = await scenario(t, true)
  await chat.getByRole('note').first().waitFor({ timeout: 30_000 }).catch(async (error) => {
    const list = await (await page.request.get(new URL('/api/conversations', page.url()).href)).json()
    const id = (Array.isArray(list) ? list : list.conversations)[0].id
    const stored = await (await page.request.get(new URL(`/api/conversations/${id}`, page.url()).href)).json()
    await shot('claude-session-perdue-echec.png')
    throw new Error(`no line after the turn. Screen: ${(await chat.innerText()).replace(/\n+/g, ' | ')} Stored: ${JSON.stringify(stored).slice(0, 1500)}`, { cause: error })
  })
  const notes = chat.getByRole('note')
  assert.equal(await notes.count(), 1)
  assert.equal((await notes.first().innerText()).trim(), 'The engine no longer remembers the earlier messages.')
  assert.ok((await notes.first().evaluate((e) => e.nextElementSibling?.textContent ?? '')).includes('BRAVO8'))
  assert.ok((await notes.first().evaluate((e) => e.previousElementSibling?.textContent ?? '')).includes('Reply with exactly the word BRAVO8'), 'the line follows the user message of the turn')
  assert.ok((await chat.innerText()).includes('ALPHA7'), 'the earlier messages are untouched')
  assert.equal(await chat.locator('.adestia-bubble--error, [role=alert]').count(), 0, 'no error shown')
  await page.reload()
  await reopen(page, chat)
  await chat.getByRole('note').first().waitFor()
  await shot('claude-session-perdue.png')
})

test('B-22 real Claude, sessions kept: a plain restart draws no line', { skip: token ? false : 'no Claude token: this test is NOT played', timeout: 400_000 }, async (t) => {
  const { chat } = await scenario(t, false)
  assert.equal(await chat.getByRole('note').count(), 0)
})
