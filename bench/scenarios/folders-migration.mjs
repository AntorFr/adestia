/**
 * `skills/folders-migration/SKILL.md` replayed on an instance in the OLD format (AD-44, P-24).
 *
 * The simulated engine does not read the skill, so this script plays, in the text's order, the
 * calls it prescribes — the `folder_settings` tool in process, with the context of a turn, and
 * the front-matter edits an agent makes with its file tools — then proves what the exit
 * criterion names: the settings `folderSettings` reads equal the old ones, texts and
 * attachments are still there, no file is deleted, and a second replay changes no file.
 *
 * Needs the server built (`npm run build --workspace @antorfr/adestia-server`), no browser:
 *   node bench/scenarios/folders-migration.mjs
 * The instance is the one `folders-migration.prep.sh` stages, in a throwaway directory.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..', '..')
const server = (name) => import(pathToFileURL(join(root, 'packages/server/dist/src', `${name}.js`)).href)

const OLD_KEYS = ['title', 'ico', 'couleur', 'app']

/** Every file under `dir`, relative, with its bytes' hash and its modification time. */
function snapshot(dir) {
  const out = {}
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else out[relative(dir, path)] = { hash: createHash('sha256').update(readFileSync(path)).digest('hex'), mtime: statSync(path).mtimeMs }
    }
  }
  walk(dir)
  return out
}

const split = (text) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  return match ? { head: match[1].split('\n'), rest: text.slice(match[0].length) } : { head: [], rest: text }
}
const keyOf = (line) => /^([A-Za-z]+):\s*(.*)$/.exec(line)

/** Steps 1 to 6 of the skill, in order. Returns the report of step 6. */
async function replay(memory, call) {
  // 1. List: every INDEX.md (any case) and every page x/x.md.
  const pages = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (dir !== memory && /\.md$/i.test(entry.name)) {
        const isIndex = entry.name.toLowerCase() === 'index.md'
        if (isIndex || entry.name === `${basename(dir)}.md`) pages.push({ path, folder: relative(memory, dir), isIndex })
      }
    }
  }
  walk(memory)
  pages.sort((a, b) => Number(b.isIndex) - Number(a.isIndex) || a.path.localeCompare(b.path)) // index first
  const report = { migrated: [], left: [], refused: [] }

  for (const { path, folder } of pages) {
    const file = relative(memory, path)
    // 2. Keep the pages that carry something: title, ico, couleur or app.
    const { head } = split(readFileSync(path, 'utf8'))
    const old = Object.fromEntries(head.map(keyOf).filter((m) => m && OLD_KEYS.includes(m[1])).map((m) => [m[1], m[2]]))
    if (Object.keys(old).length === 0) { report.left.push([file, 'no old key']); continue }

    // 3. Copy: get the revision, set only the keys the settings do not already hold.
    const got = await call({ action: 'get', folder })
    const held = got.settings
    const wanted = Object.fromEntries(Object.entries(old).filter(([key]) => held[key] === undefined))
    if (Object.keys(wanted).length > 0) {
      const set = await call({ action: 'set', folder, ...wanted, ...(got.revision ? { revision: got.revision } : {}) })
      if (set.error) { report.refused.push([file, set.error]); continue }
    }

    // 4. Clean: drop couleur and app from the page, nothing else.
    const text = readFileSync(path, 'utf8')
    const { head: lines, rest } = split(text)
    const kept = lines.filter((line) => !['couleur', 'app'].includes(keyOf(line)?.[1] ?? ''))
    if (kept.length !== lines.length) writeFileSync(path, `---\n${kept.join('\n')}\n---\n${rest}`)
    report.migrated.push([file, Object.keys(wanted)])
  }
  return report
}

export default async function scenario() {
  const stage = mkdtempSync(join(tmpdir(), 'adestia-migration-'))
  try {
    execFileSync('sh', [join(root, 'bench/scenarios/folders-migration.prep.sh'), stage], { stdio: 'pipe' })
    const memory = join(stage, 'workspace', 'memory')
    const { ShellToolsService } = await server('shell-tools')
    const { resolveStores } = await server('stores')
    const { folderSettingsOf } = await server('folder-settings')
    const { ConversationStore } = await server('conversations')
    const stores = resolveStores([{ id: 'memory', path: 'memory' }], join(stage, 'workspace')).stores
    const data = join(stage, 'data')
    execFileSync('mkdir', ['-p', data])
    const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
    const call = async (args) => {
      const out = await service.dispatch({ userId: 'bench', conversationId: 'migration' }, 'folder_settings', args)
      return out.ok ? JSON.parse(out.text) : { error: out.error }
    }
    try {
      const before = snapshot(memory)
      const folders = ['voyages', 'maison', 'atelier', 'projets', 'cuisine']
      assert.deepEqual(await folderSettingsOf(stores, folders), {}, 'the old instance has no settings file')

      const first = await replay(memory, call)
      const settings = await folderSettingsOf(stores, folders)
      const plain = (name) => { const { revision, ...rest } = settings[name] ?? {}; return rest }
      // Same icons, hues and owners as the old pages declared; the folder without settings stays without.
      assert.deepEqual(plain('voyages'), { title: 'Voyages', ico: '✈️', couleur: 'turquoise', app: 'voyages' })
      assert.deepEqual(plain('maison'), { title: 'Maison', ico: '🏠', couleur: 'vert' })
      assert.deepEqual(plain('atelier'), { ico: '🔧' })
      assert.deepEqual(plain('projets'), { title: 'Projets' })
      assert.equal(settings['cuisine'], undefined, 'a folder without settings gets no file')
      assert.deepEqual(first.refused, [])

      // Texts and attachments are still there, no file is deleted, the pages keep title and ico.
      const after = snapshot(memory)
      for (const file of Object.keys(before)) assert.ok(after[file], `${file} still exists`)
      assert.ok(after['maison/facture.pdf'].hash === before['maison/facture.pdf'].hash, 'the attachment is untouched')
      const index = readFileSync(join(memory, 'voyages/INDEX.md'), 'utf8')
      assert.equal(index, '---\ntitle: Voyages\nico: ✈️\ntags: [carnet]\n---\n\nTout ce qui se prépare avant de partir.\n')
      assert.equal(readFileSync(join(memory, 'maison/maison.md'), 'utf8'), '---\ntitle: Maison\nico: 🏠\n---\n\nLes papiers de la maison.\n')
      assert.deepEqual(after['cuisine/recette.md'], before['cuisine/recette.md'], 'a page that is no candidate is not touched')

      // A second replay changes no file: same bytes, same modification times, same list.
      const second = await replay(memory, call)
      assert.deepEqual(snapshot(memory), after, 'the second replay changes no file')
      assert.deepEqual(second.refused, [])
      console.log(`folders-migration: ${first.migrated.length} pages migrated, none deleted, second replay a no-op`)
    } finally {
      await service.close()
    }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
