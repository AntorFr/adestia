/** AD-44, P-24: the folders-migration skill's text, and the tool contract its steps lean on. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const skill = readFileSync(join(root, 'skills/folders-migration/SKILL.md'), 'utf8')
const server = (name) => import(pathToFileURL(join(root, 'packages/server/dist/src', `${name}.js`)).href)

test('the skill has front matter naming it, and six numbered steps in order', () => {
  assert.match(skill, /^---\nname: folders-migration\ndescription: .+\n---\n/)
  const steps = [...skill.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map((m) => [Number(m[1]), m[2]])
  assert.deepEqual(steps.map((s) => s[0]), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(steps.map((s) => s[1].replace(/\.$/, '')), ['List the candidates', 'Keep the pages that carry something', 'Copy the settings', 'Clean the page', 'Look', 'Report'])
})

test('the skill never deletes, never writes .folder.md itself, keeps title and ico', () => {
  assert.match(skill, /never delete a file/i)
  assert.match(skill, /never by writing `\.folder\.md` with your\s+file tools/)
  assert.match(skill, /\*\*Keep `title` and `ico`\*\*/)
  assert.match(skill, /remove the `couleur` and `app` lines/)
  assert.doesNotMatch(skill, /\brm\b|unlink/)
})

test('the scenario replays green: settings equal, nothing deleted, second replay a no-op', { timeout: 120000 }, () => {
  const out = execFileSync('node', [join(root, 'bench/scenarios/folders-migration.mjs')], { cwd: root, encoding: 'utf8' })
  assert.match(out, /second replay a no-op/)
})

async function withTool(files, run) {
  const stage = mkdtempSync(join(tmpdir(), 'adestia-fm-test-'))
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(stage, 'workspace/memory', file)), { recursive: true })
      writeFileSync(join(stage, 'workspace/memory', file), text)
    }
    const { ShellToolsService } = await server('shell-tools')
    const { resolveStores } = await server('stores')
    const { ConversationStore } = await server('conversations')
    const stores = resolveStores([{ id: 'memory', path: 'memory' }], join(stage, 'workspace')).stores
    const data = join(stage, 'data')
    mkdirSync(data)
    const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
    const call = async (args) => {
      const out = await service.dispatch({ userId: 'u', conversationId: 'c' }, 'folder_settings', args)
      return out.ok ? JSON.parse(out.text) : { error: out.error }
    }
    try { await run(call, join(stage, 'workspace/memory')) } finally { await service.close() }
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

test('a colour outside the palette is refused and writes no file', async () => {
  await withTool({ 'x/INDEX.md': '---\ncouleur: fuchsia\n---\ntexte\n' }, async (call, memory) => {
    const got = await call({ action: 'get', folder: 'x' })
    assert.deepEqual(got.settings, {})
    const set = await call({ action: 'set', folder: 'x', couleur: 'fuchsia' })
    assert.ok(set.error, 'refused')
    assert.equal(existsSync(join(memory, 'x/.folder.md')), false)
  })
})

test('a stale revision is refused; set merges and keeps what the folder already holds', async () => {
  await withTool({ 'x/INDEX.md': '---\nico: A\n---\n' }, async (call) => {
    const first = await call({ action: 'set', folder: 'x', ico: '🏠', couleur: 'vert' })
    assert.equal(first.settings.ico, '🏠')
    const stale = await call({ action: 'set', folder: 'x', title: 'X', revision: 'deadbeef' })
    assert.ok(stale.error, 'stale refused')
    const merged = await call({ action: 'set', folder: 'x', title: 'X', revision: first.revision })
    assert.deepEqual(merged.settings, { ico: '🏠', couleur: 'vert', title: 'X' })
  })
})

test('a folder that does not exist is refused by get', async () => {
  await withTool({ 'x/a.md': 'a\n' }, async (call) => {
    assert.ok((await call({ action: 'get', folder: 'nope' })).error)
  })
})
