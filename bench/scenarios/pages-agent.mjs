/** A real Claude turn reads and edits a seeded page through its own file tools.
 * Start bench/launch.mjs --engine claude --seed pages-proof, then
 * BENCH_URL=<url> node bench/scenarios/pages-agent.mjs
 * No endpoint is intercepted. A missing credential must be reported as such.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const url = process.env.BENCH_URL
assert(url, 'BENCH_URL is required')
const out = process.env.BENCH_OUT ?? 'bench/shots-pages-agent'
await mkdir(out, { recursive: true })
const json = async (path, body) => {
  const response = await fetch(`${url}${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  assert(response.ok, `${path}: ${response.status}`)
  return response.json()
}
const before = await json('/api/pages/notes.md')
const { id } = await json('/api/conversations', { title: 'Pages — real Claude read and edit' })
const prompt = 'Read pages/notes.md using your file tool. Report its current title. Append a new paragraph containing exactly PAGE-AGENT-PROOF, using your file editing tool. Preserve all existing content and frontmatter. Change no other file. Confirm when finished.'
const response = await fetch(`${url}/api/turn`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ conversationId: id, prompt }), signal: AbortSignal.timeout(240000),
})
assert(response.ok, `turn: ${response.status}`)
const stream = await response.text()
const events = stream.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)))
await writeFile(join(out, 'events.json'), JSON.stringify(events, null, 2) + '\n')
assert(!events.some((event) => event.type === 'error'), 'Real Claude returned an error; see events.json')
assert(events.some((event) => event.type === 'result'), 'Real turn completed')
const after = await json('/api/pages/notes.md')
assert(after.markdown.includes(before.markdown.trim()), 'Original page content preserved')
assert.match(after.markdown, /PAGE-AGENT-PROOF/)
assert.equal(after.fields.title, before.fields.title)
const tools = events.filter((event) => event.type === 'tool-use')
assert(tools.length >= 2, 'File reading and editing tools were called')
const transcript = await json(`/api/conversations/${id}`)
assert(transcript.messages.some((message) => message.role === 'agent' && message.text), 'Agent answer persisted')

const { chromium } = createRequire(`${execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()}/`)('playwright')
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // Navigate explicitly: automatic refresh of an already open page is out of scope (P-5.7).
  await page.goto(`${url}/#/page/notes`)
  await page.locator('.adestia-reader').waitFor()
  assert.match(await page.locator('.adestia-reader').innerText(), /PAGE-AGENT-PROOF/)
  await page.screenshot({ path: join(out, 'E-4-after-agent.png') })
} finally { await browser.close() }
const report = { engine: 'real Claude', prompt, conversationId: id, tools, preservedOriginal: true, markerReadThroughApiAndBrowser: true, automaticRefreshClaimed: false }
await writeFile(join(out, 'agent-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
