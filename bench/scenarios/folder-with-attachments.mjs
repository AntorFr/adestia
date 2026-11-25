/**
 * The rule « A folder with its attachments » of `skills/page-author/SKILL.md` (AD-43, P-22),
 * replayed on a NEW instance.
 *
 * The simulated engine does not read the skill, so this script plays, in the text's order, the
 * calls it prescribes: the text as an ordinary page of the folder, the files filed in the
 * folder, then the `folder_settings` tool (in process, with the context of a turn). It proves
 * what the exit criterion names: the text is an ordinary page, the pieces are what
 * `GET /api/files?folder=` lists (the same `collectFiles` the route calls), the settings are in
 * `.folder.md` only, and no `INDEX.md` nor `x/x.md` was written. It also reads the skill: no
 * line shows `INDEX.md` except to forbid it.
 *
 * Needs the server built (`npm run build --workspace @antorfr/adestia-server`), no browser:
 *   node bench/scenarios/folder-with-attachments.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..', '..')
const server = (name) => import(pathToFileURL(join(root, 'packages/server/dist/src', `${name}.js`)).href)

const files = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)])

export default async function scenario() {
  // The skill: every line naming INDEX.md says NOT to make one.
  const skill = readFileSync(join(root, 'skills/page-author/SKILL.md'), 'utf8').split('\n')
  const hits = skill.flatMap((line, i) => (line.includes('INDEX.md') ? [i] : []))
  for (const i of hits) {
    const around = skill.slice(Math.max(0, i - 1), i + 2).join(' ')
    assert.match(around, /Never create/, `line ${i + 1} shows INDEX.md without forbidding it`)
  }
  assert.match(skill.join('\n'), /## A folder with its attachments/)

  const stage = mkdtempSync(join(tmpdir(), 'adestia-folder-'))
  const workspace = join(stage, 'workspace')
  const memory = join(workspace, 'memory')
  mkdirSync(memory, { recursive: true })
  const data = join(stage, 'data')
  mkdirSync(data)
  const { ShellToolsService } = await server('shell-tools')
  const { resolveStores } = await server('stores')
  const { folderSettingsOf } = await server('folder-settings')
  const { collectFiles } = await server('files')
  const { ConversationStore } = await import(pathToFileURL(join(root, 'packages/server/dist/src/conversations.js')).href)
  const stores = resolveStores([{ id: 'memory', path: 'memory' }], workspace).stores
  const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
  const call = async (args) => {
    const out = await service.dispatch({ userId: 'bench', conversationId: 'folder' }, 'folder_settings', args)
    return out.ok ? JSON.parse(out.text) : { error: out.error }
  }
  try {
    // 1. The text, an ordinary page of the folder. 2. The files, in the folder and its assets/.
    const folder = 'domaines/maison'
    mkdirSync(join(memory, folder, 'assets'), { recursive: true })
    writeFileSync(join(memory, folder, 'presentation.md'), '---\ntitle: La maison\n---\n\nLes papiers de la maison.\n')
    writeFileSync(join(memory, folder, 'devis.pdf'), '%PDF-1.4 devis\n')
    writeFileSync(join(memory, folder, 'assets', 'avant.jpg'), 'jpg')
    // 3. The settings, through the tool: get the revision, set with it.
    const got = await call({ action: 'get', folder })
    assert.deepEqual(got.settings, {}, 'a new folder has no settings')
    const set = await call({ action: 'set', folder, title: 'Maison', ico: '🏠', couleur: 'vert', ...(got.revision ? { revision: got.revision } : {}) })
    assert.equal(set.error, undefined)

    // What E-3 reads: the pieces, the settings, the text as a page.
    const pieces = (await collectFiles(stores, folder, true, false)).map((f) => f.path).sort()
    assert.deepEqual(pieces, ['domaines/maison/assets/avant.jpg', 'domaines/maison/devis.pdf'])
    const { revision, ...settings } = (await folderSettingsOf(stores, [folder]))[folder]
    assert.ok(revision)
    assert.deepEqual(settings, { title: 'Maison', ico: '🏠', couleur: 'vert' })
    const head = readFileSync(join(memory, folder, '.folder.md'), 'utf8')
    assert.match(head, /^---\n[\s\S]*\n---\n*$/, '.folder.md is front matter only')
    const written = files(memory)
    assert.ok(!written.some((f) => /(^|\/)index\.md$/i.test(f)), 'no INDEX.md')
    assert.ok(!written.includes('domaines/maison/maison.md'), 'no homonymous page')
    assert.deepEqual(written.filter((f) => f.endsWith('.md')).sort(), ['domaines/maison/.folder.md', 'domaines/maison/presentation.md'])
    console.log('folder-with-attachments: text page, 2 pieces, settings in .folder.md, no index page')
  } finally {
    await service.close()
    rmSync(stage, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
