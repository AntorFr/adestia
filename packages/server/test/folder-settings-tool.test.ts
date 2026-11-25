/**
 * AD-43: the `folder_settings` shell tool goes through the settings module —
 * the route's rules, no copy. `get` reads with the `revision`, `set` writes
 * only what it is given, a stale revision or a missing page is refused and the
 * file stays as it was.
 */
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConversationStore } from '../src/conversations.js'
import { ShellToolsService } from '../src/shell-tools.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

async function setup() {
  const ws = await tmpDir('adestia-ftool-')
  await mkdir(join(ws, 'perso', 'a'), { recursive: true })
  await mkdir(join(ws, 'archive', 'vieux'), { recursive: true })
  await writeFile(join(ws, 'perso', 'a', 'note.md'), '---\ntitle: Note\n---\n\nCorps.\n')
  await writeFile(join(ws, 'archive', 'vieux', 'ancien.md'), '---\ntitle: Ancien\n---\n\nx\n')
  await chmod(join(ws, 'archive', 'vieux'), 0o555)
  await chmod(join(ws, 'archive'), 0o555)
  locked.push(join(ws, 'archive', 'vieux'), join(ws, 'archive'))
  const stores = resolveStores(
    [
      { id: 'perso', path: 'perso' },
      { id: 'archive', path: 'archive', at: 'archive' },
    ],
    ws,
  ).stores
  const data = await tmpDir('adestia-ftool-data-')
  const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
  closers.push(() => service.close())
  const call = (args: Record<string, string>) => service.dispatch({ userId: 'chloe', conversationId: 'c' }, 'folder_settings', args)
  const ok = async (args: Record<string, string>) => {
    const out = await call(args)
    if (!out.ok) throw new Error(out.error)
    return JSON.parse(out.text) as { folder: string; settings: Record<string, unknown>; revision?: string }
  }
  const file = join(ws, 'perso', 'a', '.folder.md')
  return { ws, call, ok, file, service }
}

describe('folder_settings — the agent sets a folder', () => {
  it('a set writes a colour and the next get reads it back with its revision', async () => {
    const { ok, file } = await setup()
    expect(await ok({ action: 'get', folder: 'a' })).toEqual({ folder: 'a', settings: {} })
    const set = await ok({ action: 'set', folder: 'a', couleur: 'vert' })
    expect(set.settings).toEqual({ couleur: 'vert' })
    expect(await readFile(file, 'utf8')).toContain('couleur: vert')
    const got = await ok({ action: 'get', folder: 'a' })
    expect(got.settings).toEqual({ couleur: 'vert' })
    expect(got.revision).toBeTruthy()
    expect(got.revision).toBe(set.revision)
  })

  it('a stale revision is refused and the file is left byte for byte', async () => {
    const { ok, call, file } = await setup()
    await ok({ action: 'set', folder: 'a', couleur: 'vert' })
    const stale = (await ok({ action: 'get', folder: 'a' })).revision as string
    await writeFile(file, '---\ncouleur: rouge\n---\n') // someone else wrote
    const before = await readFile(file, 'utf8')
    const out = await call({ action: 'set', folder: 'a', title: 'Mon A', revision: stale })
    expect(out.ok).toBe(false)
    expect(await readFile(file, 'utf8')).toBe(before)
    // a revision that never existed is refused too, even on a folder with no file yet
    const fresh = await call({ action: 'set', folder: 'a', title: 'x', revision: 'nope' })
    expect(fresh.ok).toBe(false)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('the revision a get returned lets the set through', async () => {
    const { ok } = await setup()
    await ok({ action: 'set', folder: 'a', couleur: 'vert' })
    const { revision } = await ok({ action: 'get', folder: 'a' })
    const done = await ok({ action: 'set', folder: 'a', title: 'Mon A', revision: revision as string })
    expect(done.settings).toEqual({ couleur: 'vert', title: 'Mon A' })
  })

  it('a page absent from the folder is refused, nothing is written', async () => {
    const { ok, call, ws } = await setup()
    for (const page of ['absent.md', 'note', '../a/note.md', 'sub/x.md']) {
      const out = await call({ action: 'set', folder: 'a', page })
      expect(out.ok, page).toBe(false)
    }
    expect(await readdir(join(ws, 'perso', 'a'))).not.toContain('.folder.md')
    expect((await ok({ action: 'set', folder: 'a', page: 'note.md' })).settings).toEqual({ page: 'note.md' })
  })

  it('keeps what it was not given, removes a key given empty, keeps keys it does not know', async () => {
    const { ok, file } = await setup()
    await writeFile(file, '---\ntitle: Mon A\ncouleur: vert\nfutur: garde\n---\n')
    const set = await ok({ action: 'set', folder: 'a', ico: 'home' })
    expect(set.settings).toMatchObject({ title: 'Mon A', couleur: 'vert', ico: 'home' })
    await ok({ action: 'set', folder: 'a', couleur: '' })
    const text = await readFile(file, 'utf8')
    expect(text).not.toContain('couleur')
    expect(text).toContain('futur: garde')
    expect(text).toContain('title: Mon A')
    expect((await ok({ action: 'set', folder: 'a', attachments: 'false' })).settings).toMatchObject({ attachments: false })
  })

  it('refuses bad input with words: action, folder, hue, attachments, unknown folder, read-only folder', async () => {
    const { call, ws } = await setup()
    const refused = async (args: Record<string, string>) => {
      const out = await call(args)
      expect(out.ok, JSON.stringify(args)).toBe(false)
    }
    await refused({ action: 'delete', folder: 'a' })
    await refused({ action: 'get', folder: '' })
    await refused({ action: 'set', folder: 'a', couleur: 'fuchsia-fluo' })
    await refused({ action: 'set', folder: 'a', attachments: 'peut-être' })
    await refused({ action: 'set', folder: 'a', title: 'a\nb: c' })
    await refused({ action: 'get', folder: 'inconnu' })
    await refused({ action: 'set', folder: 'inconnu', title: 'T' })
    await refused({ action: 'set', folder: '.cache', title: 'T' })
    await refused({ action: 'set', folder: 'archive/vieux', title: 'T' })
    expect(await readdir(join(ws, 'perso', 'a'))).not.toContain('.folder.md')
    expect(await readdir(join(ws, 'archive', 'vieux'))).not.toContain('.folder.md')
  })

  it('tolerates slashes around the folder path', async () => {
    const { ok } = await setup()
    expect((await ok({ action: 'set', folder: '/a/', title: 'T' })).folder).toBe('a')
  })

  it('is listed with its parameters, and find_pages no longer speaks of the INDEX', async () => {
    const { service } = await setup()
    const specs = service.specs()
    const tool = specs.find((spec) => spec.name === 'folder_settings')
    expect(tool?.params.filter((param) => !param.optional).map((param) => param.name)).toEqual(['action', 'folder'])
    expect(specs.find((spec) => spec.name === 'find_pages')?.description).not.toMatch(/INDEX/)
  })
})
