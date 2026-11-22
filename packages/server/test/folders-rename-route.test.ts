/**
 * AD-39: `POST /api/folders/rename` `{path, name}` renames the last segment of
 * a folder and mends the path links of every writable page. Attendus écrits
 * en dur depuis le critère de la tâche.
 */
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import type { DiscoveredPlugin } from '../src/extensions.js'
import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
afterEach(async () => {
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

const FRONT = '---\ntitle:   "Spacé"  \ntags: [a,   b]\nlien: "[[old/page]]"\n---\n'

async function instance(options: { plugins?: DiscoveredPlugin[]; configured?: string[] } = {}) {
  const ws = await tmpDir('adestia-rename-')
  const perso = join(ws, 'perso')
  const archive = join(ws, 'archive')
  await mkdir(join(perso, 'old', 'sub'), { recursive: true })
  await mkdir(join(perso, 'older'), { recursive: true })
  await mkdir(join(perso, 'voisin'), { recursive: true })
  await mkdir(join(archive, 'lecture'), { recursive: true })
  await writeFile(join(perso, 'old', 'page.md'), '---\ntitle: P\n---\nCorps\n')
  await writeFile(join(perso, 'old', 'sub', 'deep.md'), '---\ntitle: D\n---\nVoir [frere](../page.md) et [[old/page]]\n')
  await writeFile(join(perso, 'older', 'page.md'), '---\ntitle: O\n---\n')
  await writeFile(join(archive, 'lecture', 'froid.md'), '---\ntitle: F\n---\n')
  await writeFile(join(archive, 'lecture', 'lien.md'), '---\ntitle: L\n---\nVoir [[old/page]]\n')
  await chmod(archive, 0o555)
  await chmod(join(archive, 'lecture'), 0o555)
  locked.push(archive, join(archive, 'lecture'))
  const app = Fastify()
  registerPages(app, {
    stores: resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'archive', path: 'archive', at: 'archive' },
      ],
      ws,
    ).stores,
    locale: 'fr',
    plugins: options.plugins ?? [],
    configured: options.configured ?? [],
  })
  await app.ready()
  const rename = (path: unknown, name: unknown) =>
    app.inject({ method: 'POST', url: '/api/folders/rename', payload: { path, name } })
  const page = (p: string) => app.inject({ url: `/api/pages/${p}` })
  return { ws, perso, archive, app, rename, page }
}

const read = (p: string) => readFile(p, 'utf8')
const exists = (p: string) => stat(p).then(() => true, () => false)

describe('POST /api/folders/rename — nominal', () => {
  it('moves pages and sub-folders to the new path, none under the old one', async () => {
    const { rename, page } = await instance()
    const res = await rename('old', 'nouveau')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ path: 'nouveau', unrewritten: 1 })
    expect((await page('nouveau/page.md')).statusCode).toBe(200)
    expect((await page('nouveau/sub/deep.md')).statusCode).toBe(200)
    expect((await page('old/page.md')).statusCode).toBe(404)
    expect((await page('old/sub/deep.md')).statusCode).toBe(404)
  })

  it('renames only the last segment of a nested folder', async () => {
    const { rename, perso } = await instance()
    const res = await rename('old/sub', 'dessous')
    expect(res.json()).toEqual({ path: 'old/dessous', unrewritten: 0 })
    expect(await exists(join(perso, 'old', 'dessous', 'deep.md'))).toBe(true)
  })

  it('rewrites wikilinks keeping label and anchor, frontmatter byte for byte', async () => {
    const { rename, perso } = await instance()
    const body = 'a [[old/page]] b [[old/page:Mon étiquette]] c [[old/page#ancre]] d [[old/sub/deep:x]]\n'
    await writeFile(join(perso, 'voisin', 'w.md'), FRONT + body)
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'w.md'))).toBe(
      FRONT + 'a [[nouveau/page]] b [[nouveau/page:Mon étiquette]] c [[nouveau/page#ancre]] d [[nouveau/sub/deep:x]]\n',
    )
  })

  it('rewrites markdown links: absolute, relative, fragment, query', async () => {
    const { rename, perso } = await instance()
    await writeFile(
      join(perso, 'voisin', 'm.md'),
      '[a](/old/page) [b](../old/page) [c](/old/page#h) [d](/old/page?q=1) [e](/old/page.md#h) ![i](/old/img.png)\n',
    )
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'm.md'))).toBe(
      '[a](/nouveau/page) [b](../nouveau/page) [c](/nouveau/page#h) [d](/nouveau/page?q=1) [e](/nouveau/page.md#h) ![i](/nouveau/img.png)\n',
    )
  })

  it('rewrites a link in a page inside the renamed folder (relative from its old place, and absolute)', async () => {
    const { rename, perso } = await instance()
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'nouveau', 'sub', 'deep.md'))).toBe(
      '---\ntitle: D\n---\nVoir [frere](../page.md) et [[nouveau/page]]\n',
    )
  })

  it('rewrites links in a page whose folder also sits at a deeper level', async () => {
    const { rename, perso } = await instance()
    await mkdir(join(perso, 'a', 'b'), { recursive: true })
    await writeFile(join(perso, 'a', 'b', 'p.md'), '[x](../../old/page) [[old/page]]\n')
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'a', 'b', 'p.md'))).toBe('[x](../../nouveau/page) [[nouveau/page]]\n')
  })
})

describe('POST /api/folders/rename — links left alone', () => {
  it('leaves code, fences, frontmatter, older/, type#id, schemes and bare anchors', async () => {
    const { rename, perso } = await instance()
    const text =
      FRONT +
      'inline `[[old/page]]` et `[x](/old/page)`\n\n```md\n[[old/page]]\n[x](/old/page)\n```\n\n' +
      '[[older/page]] [y](/older/page) [z](https://ex.com/old/page) [[task#42]] [w](#old) [[old]]\n'
    await writeFile(join(perso, 'voisin', 'k.md'), text)
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'k.md'))).toBe(text)
  })

  it('does not rewrite a page with no match (modification time kept)', async () => {
    const { rename, perso } = await instance()
    const file = join(perso, 'voisin', 'n.md')
    await writeFile(file, 'Rien ici old\n')
    const before = (await stat(file)).mtimeMs
    await new Promise((resolve) => setTimeout(resolve, 20))
    await rename('old', 'nouveau')
    expect((await stat(file)).mtimeMs).toBe(before)
  })
})

describe('POST /api/folders/rename — read-only store', () => {
  it('keeps the link of a read-only page and counts each page once', async () => {
    const { rename, archive } = await instance()
    await chmod(join(archive, 'lecture'), 0o755)
    await writeFile(join(archive, 'lecture', 'deux.md'), '[[old/page]] [[old/sub/deep]] [a](/old/page)\n')
    await chmod(join(archive, 'lecture'), 0o555)
    const res = await rename('old', 'nouveau')
    expect(res.json()).toEqual({ path: 'nouveau', unrewritten: 2 })
    expect(await read(join(archive, 'lecture', 'lien.md'))).toBe('---\ntitle: F\n---\nVoir [[old/page]]\n'.replace('F', 'L'))
    expect(await read(join(archive, 'lecture', 'deux.md'))).toBe('[[old/page]] [[old/sub/deep]] [a](/old/page)\n')
  })

  it('does not count a read-only page that holds no link to the folder', async () => {
    const { rename } = await instance()
    // lien.md holds one link, froid.md none: the count is 1, not 2.
    expect((await rename('old', 'nouveau')).json().unrewritten).toBe(1)
  })

  it('counts a page whose write fails, and the rename stands', async () => {
    const { rename, perso, page } = await instance()
    await mkdir(join(perso, 'verrou'))
    await writeFile(join(perso, 'verrou', 'p.md'), '[[old/page]]\n')
    await chmod(join(perso, 'verrou'), 0o555)
    locked.push(join(perso, 'verrou'))
    const res = await rename('old', 'nouveau')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ path: 'nouveau', unrewritten: 2 })
    expect(await read(join(perso, 'verrou', 'p.md'))).toBe('[[old/page]]\n')
    expect((await page('nouveau/page.md')).statusCode).toBe(200)
  })
})

describe('POST /api/folders/rename — refusals write nothing', () => {
  it('422 for a folder an active app absorbs, with a reason', async () => {
    const app = { manifest: { id: 'todo', kind: 'app', description: 't', absorbs: ['old'] }, dir: '/x', active: true } as unknown as DiscoveredPlugin
    const { rename, perso } = await instance({ plugins: [app] })
    const res = await rename('old', 'nouveau')
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toEqual(expect.any(String))
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
    expect(await exists(join(perso, 'nouveau'))).toBe(false)
  })

  it('an INACTIVE app does not hold its folder', async () => {
    const app = { manifest: { id: 'todo', kind: 'app', description: 't', absorbs: ['old'] }, dir: '/x', active: false } as unknown as DiscoveredPlugin
    const { rename } = await instance({ plugins: [app] })
    expect((await rename('old', 'nouveau')).statusCode).toBe(200)
  })

  it('422 for a sub-folder of an absorbed folder', async () => {
    const app = { manifest: { id: 'todo', kind: 'app', description: 't', absorbs: ['old'] }, dir: '/x', active: true } as unknown as DiscoveredPlugin
    const { rename, perso } = await instance({ plugins: [app] })
    expect((await rename('old/sub', 'autre')).statusCode).toBe(422)
    expect(await exists(join(perso, 'old', 'sub'))).toBe(true)
  })

  it('422 for a configured folder, and for one that holds a configured folder', async () => {
    const { rename, perso } = await instance({ configured: ['old'] })
    const res = await rename('old', 'nouveau')
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toEqual(expect.any(String))
    expect(await exists(join(perso, 'old'))).toBe(true)
    const nested = await instance({ configured: ['old/sub'] })
    expect((await nested.rename('old', 'nouveau')).statusCode).toBe(422)
  })

  it('422 for a folder held by several stores, nothing written anywhere', async () => {
    const { ws, rename, perso } = await instance()
    const other = join(ws, 'second')
    await mkdir(join(other, 'old'), { recursive: true })
    const app2 = Fastify()
    registerPages(app2, {
      stores: resolveStores([{ id: 'perso', path: 'perso' }, { id: 'second', path: 'second' }], ws).stores,
      locale: 'fr',
    })
    await app2.ready()
    const res = await app2.inject({ method: 'POST', url: '/api/folders/rename', payload: { path: 'old', name: 'nouveau' } })
    expect(res.statusCode).toBe(422)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
    expect(await exists(join(other, 'old'))).toBe(true)
    void rename
  })
})

describe('POST /api/folders/rename — errors', () => {
  it('409 for a name taken by a folder, by a page file, in the other store', async () => {
    const { rename, perso } = await instance()
    expect((await rename('old', 'older')).statusCode).toBe(409)
    expect((await rename('old', 'voisin')).statusCode).toBe(409)
    await writeFile(join(perso, 'idee.md'), '---\ntitle: I\n---\n')
    expect((await rename('old', 'idee')).statusCode).toBe(409)
    expect((await rename('old', 'archive')).statusCode).toBe(409)
    expect((await rename('old', 'lecture')).statusCode).toBe(200) // a sibling name elsewhere is not a clash
    expect(await exists(join(perso, 'older', 'page.md'))).toBe(true)
  })

  it('409 for a name that exists in the other store at the same level', async () => {
    const { ws, perso } = await instance()
    await mkdir(join(ws, 'second', 'pris'), { recursive: true })
    const app = Fastify()
    registerPages(app, {
      stores: resolveStores([{ id: 'perso', path: 'perso' }, { id: 'second', path: 'second' }], ws).stores,
      locale: 'fr',
    })
    await app.ready()
    const res = await app.inject({ method: 'POST', url: '/api/folders/rename', payload: { path: 'old', name: 'pris' } })
    expect(res.statusCode).toBe(409)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('409 renaming to its own name', async () => {
    const { rename } = await instance()
    expect((await rename('old', 'old')).statusCode).toBe(409)
  })

  it.each([
    ['uppercase', 'Nouveau'],
    ['space', 'a b'],
    ['empty', ''],
    ['slash', 'a/b'],
    ['dot-dot', '..'],
    ['underscore', 'a_b'],
    ['double dash', 'a--b'],
    ['81 chars', 'a'.repeat(81)],
    ['number', 12],
    ['null', null],
  ])('400 for a name: %s, nothing moved', async (_label, name) => {
    const { rename, perso } = await instance()
    expect((await rename('old', name)).statusCode).toBe(400)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('accepts exactly 80 characters', async () => {
    const { rename } = await instance()
    expect((await rename('old', 'a'.repeat(80))).statusCode).toBe(200)
  })

  it.each([['empty', ''], ['dot-dot', 'old/../old'], ['trailing slash', 'old/'], ['number', 3]])(
    '400 for a path: %s',
    async (_label, path) => {
      const { rename } = await instance()
      expect((await rename(path, 'nouveau')).statusCode).toBe(400)
    },
  )

  it('400 without a body', async () => {
    const { app } = await instance()
    expect((await app.inject({ method: 'POST', url: '/api/folders/rename' })).statusCode).toBe(400)
  })

  it('404 for an unknown folder, a page file, and a path above the stores', async () => {
    const { rename, perso } = await instance()
    expect((await rename('absent', 'nouveau')).statusCode).toBe(404)
    expect((await rename('old/absent', 'nouveau')).statusCode).toBe(404)
    await writeFile(join(perso, 'idee.md'), 'x')
    expect((await rename('idee', 'nouveau')).statusCode).toBe(404)
    expect((await rename('old/page.md', 'nouveau')).statusCode).toBe(404)
  })

  it('403 for a folder under a read-only parent, nothing written', async () => {
    const { rename, archive } = await instance()
    const res = await rename('archive/lecture', 'chaud')
    expect(res.statusCode).toBe(403)
    expect(await exists(join(archive, 'lecture', 'froid.md'))).toBe(true)
  })

  it('403 when the folder is writable but its parent is not', async () => {
    const { rename, perso } = await instance()
    await chmod(perso, 0o555)
    locked.push(perso)
    const res = await rename('old', 'nouveau')
    expect(res.statusCode).toBe(403)
    await chmod(perso, 0o755)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('403 when the parent is writable but the folder is not', async () => {
    const { rename, perso } = await instance()
    await chmod(join(perso, 'old'), 0o555)
    locked.push(join(perso, 'old'))
    expect((await rename('old', 'nouveau')).statusCode).toBe(403)
    expect(await exists(join(perso, 'nouveau'))).toBe(false)
  })
})

describe('POST /api/folders/rename — link shapes', () => {
  it('keeps a title, angle brackets, a definition, nested emphasis and a block body', async () => {
    const { rename, perso } = await instance()
    const file = join(perso, 'voisin', 's.md')
    await writeFile(
      file,
      '[t](/old/page "Titre") [u](</old/page#h>) [**g**](/old/sub/deep)\n\n[ref]: /old/page\n\n- liste [[old/page]]\n> cité [[old/page:é]]\n',
    )
    await rename('old', 'nouveau')
    expect(await read(file)).toBe(
      '[t](/nouveau/page "Titre") [u](</nouveau/page#h>) [**g**](/nouveau/sub/deep)\n\n[ref]: /nouveau/page\n\n- liste [[nouveau/page]]\n> cité [[nouveau/page:é]]\n',
    )
  })

  it('does not touch a link written in an indented code block or a tilde fence', async () => {
    const { rename, perso } = await instance()
    const file = join(perso, 'voisin', 'c.md')
    const text = 'Texte\n\n    [[old/page]]\n    [x](/old/page)\n\n~~~\n[[old/page]]\n~~~\n'
    await writeFile(file, text)
    await rename('old', 'nouveau')
    expect(await read(file)).toBe(text)
  })

  it('rewrites a name containing the old one as a substring only on whole segments', async () => {
    const { rename, perso } = await instance()
    const file = join(perso, 'voisin', 'x.md')
    await writeFile(file, '[[x/old/page]] [a](/x/old/page) [[old-2/page]] [[old]] [b](/old)\n')
    await rename('old', 'nouveau')
    expect(await read(file)).toBe('[[x/old/page]] [a](/x/old/page) [[old-2/page]] [[old]] [b](/nouveau)\n')
  })
})
