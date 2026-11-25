/**
 * `adestia-dossiers-migration-agent`, read from the need only (B-41; P-22, P-24; AD-44 as the docs state it).
 * Expected values are written by hand from the old pages of bench/seed/besoin-migration-ancien.mjs and
 * from docs/parcours.md. The instance is launched (fake engine); the calls the skill prescribes are
 * played in the text's order on its disk through the `folder_settings` tool (the tool's own code path), and
 * what the owner sees is read at the doors: GET /api/pages/index, GET /api/files?folder=, and E-3 in a browser.
 *
 *   npm run build && node --test bench/tests/folders-migration-ensemble.test.mjs
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin', 'migration')
const server = (name) => import(pathToFileURL(join(root, 'packages/server/dist/src', `${name}.js`)).href)

function startInstance() {
  return new Promise((done, fail) => {
    const base = mkdtempSync(join(tmpdir(), 'besoin-migration-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'besoin-migration-ancien', '--data', base], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); fail(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        done({ url: match[1], memory: join(base, 'memoire'), base, stop: () => new Promise((end) => { child.once('exit', end); child.kill('SIGTERM') }).then(() => rmSync(base, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', () => { clearTimeout(timer); fail(new Error(`instance exited:\n${log}`)) })
  })
}

const getJson = async (instance, path) => (await fetch(`${instance.url}${path}`)).json()
const index = (instance) => getJson(instance, '/api/pages/index')
const filesOf = async (instance, folder) => (await getJson(instance, `/api/files?folder=${encodeURIComponent(folder)}`)).files.map((f) => f.path).sort()
const plain = (entry) => { if (!entry) return entry; const { revision, ...rest } = entry; return rest }

/** Every file with its hash and modification time. */
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

/** `folder_settings` as the agent calls it: the shell tool, in process, on the instance's disk. */
async function openTool(instance) {
  const { ShellToolsService } = await server('shell-tools')
  const { resolveStores } = await server('stores')
  const { ConversationStore } = await server('conversations')
  const stores = resolveStores([{ id: 'memoire', path: 'memoire' }], instance.base).stores
  const data = mkdtempSync(join(tmpdir(), 'besoin-migration-tool-'))
  const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
  const call = async (args) => {
    const out = await service.dispatch({ userId: 'agent', conversationId: 'c' }, 'folder_settings', args)
    return out.ok ? JSON.parse(out.text) : { error: out.error }
  }
  return { call, close: async () => { await service.close(); rmSync(data, { recursive: true, force: true }) } }
}

const frontOf = (text) => { const m = /^---\n([\s\S]*?)\n---\n/.exec(text); return m ? { lines: m[1].split('\n'), rest: text.slice(m[0].length) } : { lines: [], rest: text } }

/**
 * The skill's six steps, in the text's order, written from the skill's wording (steps 1 to 4 and 6; step 5, « Look »,
 * is the assertions below). Returns the report of step 6.
 */
async function replaySkill(memory, call) {
  // 1. candidates: every file named INDEX.md in any case, and every x/x.md; a page at the root has no folder.
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { walk(path); continue }
      const folder = relative(memory, dir)
      const isIndex = entry.name.toLowerCase() === 'index.md'
      const isHomonym = folder !== '' && entry.name === `${dir.split('/').pop()}.md`
      if (isIndex || isHomonym) found.push({ path, folder, isIndex })
    }
  }
  walk(memory)
  const report = { migrated: [], left: [], refused: [], deleted: [] }
  // « take the index first, then the homonymous page »
  found.sort((a, b) => Number(b.isIndex) - Number(a.isIndex) || a.path.localeCompare(b.path))
  for (const { path, folder } of found) {
    const name = relative(memory, path)
    if (folder === '') { report.left.push([name, 'at the root']); continue }
    // 2. only title, ico, couleur, app count
    const { lines } = frontOf(readFileSync(path, 'utf8'))
    const old = {}
    for (const line of lines) { const m = /^(title|ico|couleur|app):\s*(.*)$/.exec(line); if (m) old[m[1]] = m[2] }
    if (Object.keys(old).length === 0) { report.left.push([name, 'no old key']); continue }
    // 3. get, then set only the keys the settings do not hold, with the revision when there is one
    const got = await call({ action: 'get', folder })
    const wanted = Object.fromEntries(Object.entries(old).filter(([k]) => got.settings[k] === undefined))
    if (Object.keys(wanted).length > 0) {
      const set = await call({ action: 'set', folder, ...wanted, ...(got.revision ? { revision: got.revision } : {}) })
      if (set.error) { report.refused.push([name, set.error]); continue }
    }
    // 4. remove couleur and app lines only
    const text = readFileSync(path, 'utf8')
    const front = frontOf(text)
    const kept = front.lines.filter((l) => !/^(couleur|app):/.test(l))
    if (kept.length !== front.lines.length) writeFileSync(path, `---\n${kept.join('\n')}\n---\n${front.rest}`)
    report.migrated.push([name, Object.keys(wanted)])
  }
  return report
}

describe('B-41 · P-24 · an old instance brought to the new format by the skill', () => {
  let instance
  let tool
  let before1
  let firstReport
  let after1
  before(async () => {
    instance = await startInstance()
    tool = await openTool(instance)
  })
  after(async () => { await tool?.close(); await instance?.stop() })

  test('nominal · before the migration no folder has any setting (nothing reads the old pages)', async () => {
    // Panne : le serveur relit les anciens réglages dans INDEX.md (« no legacy support »).
    const idx = await index(instance)
    assert.deepEqual(idx.folderSettings, {})
    before1 = snapshot(instance.memory)
  })

  test('nominal · the replay moves title, ico, couleur, app of each old page to its folder, as the pages declared them', async () => {
    // Panne : une étape de la skill ne produit pas les réglages (clé perdue, homonyme ignoré, majuscule d'Index.md).
    firstReport = await replaySkill(instance.memory, tool.call)
    after1 = snapshot(instance.memory)
    const settings = (await index(instance)).folderSettings
    assert.deepEqual(plain(settings['domaines/sante']), { title: 'Santé', ico: '❤️', couleur: 'rouge' })
    // index first (title, app), the homonymous page then gives what the index did not (ico, couleur)
    assert.deepEqual(plain(settings['voyages']), { title: 'Voyages', ico: '🧳', couleur: 'turquoise', app: 'voyages' })
    assert.deepEqual(plain(settings['cave']), { ico: '🍷' })
  })

  test('bords · a page without old key, a page at the root and a refused colour leave no setting and are listed', async () => {
    // Panne : la skill écrit un réglage vide, ou laisse passer une teinte hors palette.
    const settings = (await index(instance)).folderSettings
    assert.equal(settings['cuisine'], undefined)
    assert.equal(settings['bois'], undefined)
    assert.equal(existsSync(join(instance.memory, 'bois/.folder.md')), false)
    assert.equal(existsSync(join(instance.memory, '.folder.md')), false)
    assert.deepEqual(firstReport.left.map((l) => l[0]).sort(), ['INDEX.md'])
    assert.deepEqual(firstReport.refused.map((r) => r[0]), ['bois/INDEX.md'])
  })

  test('nominal · the pages keep their text, title, ico and other fields; only couleur and app leave', () => {
    // Panne : l'étape « nettoyer » retire title/ico ou réécrit le texte.
    const read = (f) => readFileSync(join(instance.memory, f), 'utf8')
    assert.equal(read('domaines/sante/INDEX.md'), '---\ntitle: Santé\nico: ❤️\ntags: [suivi]\n---\n\nLe suivi de la famille.\n')
    assert.equal(read('voyages/Index.md'), '---\ntitle: Voyages\n---\n\nAvant de partir.\n')
    assert.equal(read('voyages/voyages.md'), '---\ntitle: Carnet\nico: 🧳\n---\n\nLe carnet.\n')
    assert.equal(read('cave/cave.md'), '---\nico: 🍷\n---\n\nLes bouteilles.\n')
  })

  test('exclusions · a refused folder keeps its page untouched; no file is deleted; PJ and ordinary pages unchanged', () => {
    // Panne : la skill nettoie une page dont le réglage a été refusé (valeur perdue), ou supprime un fichier.
    assert.equal(readFileSync(join(instance.memory, 'bois/INDEX.md'), 'utf8'), '---\ntitle: Bois\ncouleur: fuchsia\n---\n\nLe bois.\n')
    assert.equal(readFileSync(join(instance.memory, 'INDEX.md'), 'utf8'), '---\ntitle: Racine\ncouleur: vert\n---\n\nA la racine.\n')
    for (const file of Object.keys(before1)) assert.ok(after1[file], `${file} still exists`)
    for (const file of ['domaines/sante/ordonnance.pdf', 'domaines/sante/assets/radio.jpg', 'voyages/billet.pdf', 'cave/liste.pdf', 'cuisine/recette.md']) {
      assert.deepEqual(after1[file], before1[file], `${file} untouched`)
    }
  })

  test('nominal · texts and attachments are visible: the old pages are listed as pages, the files under the folder, never .folder.md', async () => {
    // Panne : le texte de l'ancien index disparaît de la liste, ou une PJ / .folder.md sort de /api/files.
    const idx = await index(instance)
    const paths = idx.entries.map((e) => e.path)
    for (const p of ['domaines/sante/INDEX.md', 'voyages/Index.md', 'voyages/voyages.md', 'cave/cave.md']) assert.ok(paths.includes(p), p)
    assert.ok(!paths.some((p) => p.endsWith('.folder.md')))
    assert.deepEqual(await filesOf(instance, 'domaines/sante'), ['domaines/sante/assets/radio.jpg', 'domaines/sante/ordonnance.pdf'])
    assert.deepEqual(await filesOf(instance, 'voyages'), ['voyages/billet.pdf'])
    assert.deepEqual(await filesOf(instance, 'cave'), ['cave/liste.pdf'])
  })

  test('bords · a second passage finds nothing to write: same bytes, same times, no file added', async () => {
    // Panne : l'étape 3 réécrit des réglages déjà là (mtime) ou l'étape 4 retouche une page propre.
    const second = await replaySkill(instance.memory, tool.call)
    assert.deepEqual(snapshot(instance.memory), after1)
    assert.deepEqual(second.migrated.map((m) => m[1]).flat(), [])
    assert.deepEqual(second.refused.map((r) => r[0]), ['bois/INDEX.md'])
  })

  test('échec · the tool refuses a colour outside the palette and a stale revision (the skill relies on both)', async () => {
    // Panne : l'outil accepte une teinte hors palette ou une révision périmée.
    const bad = await tool.call({ action: 'set', folder: 'cuisine', couleur: 'fuchsia' })
    assert.ok(bad.error)
    const stale = await tool.call({ action: 'set', folder: 'cave', title: 'Cave', revision: 'deadbeef' })
    assert.ok(stale.error)
    assert.deepEqual(plain((await index(instance)).folderSettings['cave']), { ico: '🍷' })
  })

  describe('E-3 · what the owner sees when opening a migrated folder', () => {
    let browser
    before(async () => { browser = await loadPlaywright().chromium.launch() })
    after(async () => { await browser?.close() })

    test('E-3 · folder « voyages » shows its icon-coloured title, the old index as a page card and the Attachments brick with the ticket', async () => {
      // Panne : le dossier migré s'ouvre sans titre réglé, sans la page de l'ancien index ou sans sa PJ.
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
      const filesResponse = page.waitForResponse((r) => r.url().includes('/api/files?folder=voyages') && r.ok())
      await page.goto(`${instance.url}/#/section/voyages`)
      await filesResponse
      await page.getByRole('heading', { name: 'Attachments' }).waitFor({ timeout: 20_000 })
      await mkdirSync(shots, { recursive: true })
      await page.screenshot({ path: join(shots, 'E-3-voyages.png') })
      const body = await page.locator('body').innerText()
      assert.match(body, /Voyages/)
      assert.match(body, /Carnet/)
      assert.match(body, /billet\.pdf/)
    })
  })
})

describe('B-41 · P-22 · the page-author rule « a folder with its attachments » on a fresh instance', () => {
  let instance
  let tool
  before(async () => { instance = await startInstance(); tool = await openTool(instance) })
  after(async () => { await tool?.close(); await instance?.stop() })

  test('nominal · text in an ordinary page, files in the folder, settings through the tool: all visible, no index created', async () => {
    // Panne : une pièce jointe ou le texte du dossier reste invisible (page non listée, fichier absent de /api/files, .folder.md compté).
    const dir = join(instance.memory, 'chaudiere')
    mkdirSync(join(dir, 'assets'), { recursive: true })
    writeFileSync(join(dir, 'resume.md'), '---\ntitle: Résumé chaudière\n---\n\nEntretien annuel.\n')
    writeFileSync(join(dir, 'facture.pdf'), '%PDF-1.4 facture\n')
    writeFileSync(join(dir, 'assets/photo1.jpg'), 'IMG1')
    writeFileSync(join(dir, 'assets/photo2.jpg'), 'IMG2')
    const set = await tool.call({ action: 'set', folder: 'chaudiere', title: 'Chaudière', ico: '🔥', couleur: 'rouge' })
    assert.ok(!set.error, String(set.error))
    const idx = await index(instance)
    assert.deepEqual(idx.entries.filter((e) => e.path.startsWith('chaudiere/')).map((e) => [e.path, e.title]), [['chaudiere/resume.md', 'Résumé chaudière']])
    assert.deepEqual(plain(idx.folderSettings['chaudiere']), { title: 'Chaudière', ico: '🔥', couleur: 'rouge' })
    assert.deepEqual(await filesOf(instance, 'chaudiere'), ['chaudiere/assets/photo1.jpg', 'chaudiere/assets/photo2.jpg', 'chaudiere/facture.pdf'])
    assert.deepEqual(readdirSync(dir).sort(), ['.folder.md', 'assets', 'facture.pdf', 'resume.md'])
  })

  test('exclusion · .folder.md holds front matter only, whatever the agent set', () => {
    // Panne : l'outil écrit un corps dans .folder.md (B-36 : jamais de contenu).
    const text = readFileSync(join(instance.memory, 'chaudiere/.folder.md'), 'utf8')
    assert.match(text, /^---\n[\s\S]*\n---\n*$/)
  })

  test('E-3 · folder « chaudiere » opens on the summary page and the Attachments brick with the invoice and the two photos', async () => {
    // Panne : le dossier s'ouvre sans la page de texte ou sans la brique Pièces jointes (3 fichiers).
    const browser = await loadPlaywright().chromium.launch()
    try {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
      const filesResponse = page.waitForResponse((r) => r.url().includes('/api/files?folder=chaudiere') && r.ok())
      await page.goto(`${instance.url}/#/section/chaudiere`)
      await filesResponse
      await page.getByRole('heading', { name: 'Attachments' }).waitFor({ timeout: 20_000 })
      mkdirSync(shots, { recursive: true })
      await page.screenshot({ path: join(shots, 'E-3-chaudiere.png') })
      const body = await page.locator('body').innerText()
      assert.match(body, /Chaudière/)
      assert.match(body, /Résumé chaudière/)
      for (const name of ['facture.pdf', 'photo1.jpg', 'photo2.jpg']) assert.match(body, new RegExp(name.replace('.', '\\.')))
    } finally { await browser.close() }
  })
})

describe('B-41 · the shipped texts', () => {
  test('nominal · the migration instructions are shipped as the skill folders-migration, name the four old keys and the tool', () => {
    // Panne : la skill livrée disparaît, ou ne dit plus quelles clés partent vers .folder.md ni par quel outil.
    const text = readFileSync(join(root, 'skills/folders-migration/SKILL.md'), 'utf8')
    assert.match(text, /^---\nname: folders-migration\n/)
    for (const word of ['INDEX.md', 'title', 'ico', 'couleur', 'app', 'folder_settings', '.folder.md']) assert.ok(text.includes(word), word)
  })

  test('exclusion · page-author shows no INDEX.md or homonymous page in an example (code block)', () => {
    // Panne : la skill page-author remontre un index en exemple de dossier.
    const text = readFileSync(join(root, 'skills/page-author/SKILL.md'), 'utf8')
    const blocks = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0])
    for (const block of blocks) assert.doesNotMatch(block, /INDEX\.md/i)
  })
})
