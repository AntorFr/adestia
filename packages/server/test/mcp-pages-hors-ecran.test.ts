/**
 * What the MCP and pages screen tests of packages/web/test/besoin-mcp-browser.test.ts,
 * besoin-pages-browser.test.ts and besoin-pages-ensemble-browser.test.ts proved through a browser and
 * that the server does: a removed server leaves the list (and the others stay), a CRLF page is read as its
 * LF twin by the index and by the page route, and a save that breaks the vocabulary is refused with its
 * diagnostic and leaves the page alone. Each test goes through the route; the screen tests keep what is
 * drawn. See docs/tests-ecran/web-mcp-pages.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { McpStore } from '../src/mcp-store.js'
import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

describe('removing an MCP server through its route', () => {
  async function instance() {
    const dataDir = await tmpDir('adestia-mcp-hors-ecran-')
    const deps: AppDependencies = {
      config: { ...parseConfig('auth:\n  mode: none\nmcp:\n  servers:\n    - name: agenda\n      url: https://agenda.example/mcp\n'), dataDir },
      driver: new ScriptedDriver([], { capabilities: [] }),
      plugins: [],
      pluginProblems: [],
      mcpStore: new McpStore(dataDir),
    }
    return buildApp(deps)
  }
  const names = async (app: Awaited<ReturnType<typeof instance>>) =>
    ((await app.inject({ url: '/api/mcp/servers' })).json() as { servers: { name: string }[] }).servers.map((s) => s.name)

  it('answers 200 to one DELETE, then lists the others without the server, and answers 404 to a second', async () => {
    const app = await instance()
    for (const name of ['rm-a', 'rm-b'])
      expect((await app.inject({ method: 'POST', url: '/api/mcp/servers', payload: { name, url: 'http://127.0.0.1:9/mcp' } })).statusCode).toBe(200)
    expect(await names(app)).toEqual(expect.arrayContaining(['agenda', 'rm-a', 'rm-b']))

    expect((await app.inject({ method: 'DELETE', url: '/api/mcp/servers/rm-a' })).statusCode).toBe(200)

    const left = await names(app)
    expect(left).not.toContain('rm-a')
    expect(left).toEqual(expect.arrayContaining(['agenda', 'rm-b']))
    expect((await app.inject({ method: 'DELETE', url: '/api/mcp/servers/rm-a' })).statusCode).toBe(404)
  })

  it('lists a server read in the configuration as not editable, and keeps it when asked to remove it', async () => {
    const app = await instance()
    const { servers } = (await app.inject({ url: '/api/mcp/servers' })).json() as { servers: { name: string; editable: boolean }[] }
    expect(servers.find((s) => s.name === 'agenda')?.editable).toBe(false)
    expect((await app.inject({ method: 'DELETE', url: '/api/mcp/servers/agenda' })).statusCode).toBe(404)
    expect(await names(app)).toContain('agenda')
  })
})

describe('the pages routes on a page whose lines end in \\r\\n', () => {
  async function pages(files: Record<string, string>) {
    const root = await tmpDir('adestia-pages-mcp-pages-')
    for (const [path, text] of Object.entries(files)) {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), text)
    }
    const app: FastifyInstance = Fastify()
    registerPages(app, { stores: resolveStores([{ id: 'perso', path: root }], root).stores })
    await app.ready()
    return { app, root }
  }
  const crlf = (text: string) => text.replace(/\n/g, '\r\n')
  const fiche = (id: string, status: string, role: string, cat: string) =>
    `---\ntitle: Fiche ${id}\nstatus: ${status}\nrole: ${role}\ncat: ${cat}\n---\n\nCorps ${id}.\n`

  it('indexes the status, role and cat of a CRLF page as those of its LF twin, and reads the same collection head', async () => {
    const files: Record<string, string> = {}
    for (const [dir, wrap] of [['lf', (t: string) => t], ['crlf', crlf]] as const) {
      files[`${dir}/a.md`] = wrap(fiche('A', 'ouverte', 'cuisine', 'bois'))
      files[`${dir}/b.md`] = wrap(fiche('B', 'fermée', 'jardin', 'bois'))
      files[`${dir}/c.md`] = wrap(fiche('C', 'ouverte', 'cuisine', 'métal'))
      files[`${dir}-coll/INDEX.md`] = wrap(`---\ntitle: Collection ${dir}\ntype: collection\nof: fiche${dir}\ngroupBy: cat\ninto: ${dir}-coll/membres\n---\n\nLes fiches.\n`)
      for (const [i, cat] of ['bois', 'métal', 'bois'].entries())
        files[`${dir}-coll/membres/m${i}.md`] = wrap(`---\ntitle: Membre ${i}\ntype: fiche${dir}\ncat: ${cat}\n---\n\nCorps.\n`)
    }
    const { app } = await pages(files)
    const { entries } = (await app.inject({ url: '/api/pages/index' })).json() as { entries: { path: string; fields: Record<string, unknown> }[] }
    const fields = (path: string) => entries.find((e) => e.path === path)?.fields
    for (const name of ['a', 'b', 'c']) {
      expect(fields(`crlf/${name}.md`), name).toBeDefined()
      expect(fields(`crlf/${name}.md`), name).toEqual(fields(`lf/${name}.md`))
    }
    expect(fields('crlf/a.md')).toMatchObject({ status: 'ouverte', role: 'cuisine', cat: 'bois' })
    expect(fields('crlf/b.md')).toMatchObject({ status: 'fermée', role: 'jardin' })
    expect(entries.filter((e) => e.path.startsWith('crlf/') && e.fields.status === 'ouverte').map((e) => e.path)).toEqual(['crlf/a.md', 'crlf/c.md'])

    const head = (dir: string) => ({ ...fields(`${dir}-coll/INDEX.md`) })
    expect(head('crlf')).toMatchObject({ type: 'collection', groupBy: 'cat', of: 'fichecrlf', into: 'crlf-coll/membres' })
    expect(Object.keys(head('crlf'))).toEqual(Object.keys(head('lf')))
    const members = (dir: string) => entries.filter((e) => e.path.startsWith(`${dir}-coll/membres/`)).map((e) => e.fields.cat)
    expect(members('crlf')).toEqual(['bois', 'métal', 'bois'])
    expect(members('crlf')).toEqual(members('lf'))
  })

  it('reads a CRLF page for the editor with the fields of its LF twin, and keeps the markdown as written', async () => {
    const lf = '---\ntitle: Fiche éditeur LF\nstatus: ouverte\nrole: cuisine\ncat: bois\n---\n\nCorps.\n'
    const { app } = await pages({ 'editeur-lf.md': lf, 'editeur-crlf.md': crlf(lf.replace('LF', 'CRLF')) })
    const read = async (path: string) => (await app.inject({ url: `/api/pages/${path}` })).json() as { fields: Record<string, unknown>; title: string; markdown: string }
    const cr = await read('editeur-crlf.md')
    const l = await read('editeur-lf.md')
    expect(cr.title).toBe('Fiche éditeur CRLF')
    expect(cr.fields).toEqual({ title: 'Fiche éditeur CRLF', status: 'ouverte', role: 'cuisine', cat: 'bois' })
    expect({ ...cr.fields, title: '' }).toEqual({ ...l.fields, title: '' })
    expect(cr.markdown).toContain('\r\n')
  })
})

describe('a page that breaks the vocabulary, through the route', () => {
  it('opens read-only with the sentence for a block that needs content, an unknown block named as written', async () => {
    const { app } = await (async () => {
      const root = await tmpDir('adestia-pages-vocab-')
      await writeFile(join(root, 'callout-vide.md'), '---\ntitle: Encadré vide\n---\n\n:::zorglub\nQuelque chose.\n:::\n\n:::callout\n:::\n')
      const app = Fastify()
      registerPages(app, { stores: resolveStores([{ id: 'perso', path: root }], root).stores })
      await app.ready()
      return { app, root }
    })()
    const page = (await app.inject({ url: '/api/pages/callout-vide.md' })).json() as { editable: boolean; diagnostics: { message: string }[]; markdown: string }
    expect(page.editable).toBe(false)
    expect(page.diagnostics.map((d) => d.message)).toContain('Block ":::callout" needs content.')
    expect(page.markdown).toContain(':::zorglub')
  })

  it('refuses a save carrying an empty callout with 422 and its diagnostic, and leaves the file as it was', async () => {
    const root = await tmpDir('adestia-pages-refus-')
    const before = '---\ntitle: Page à refuser\n---\n\nCorps.\n'
    await writeFile(join(root, 'refus.md'), before)
    const app = Fastify()
    registerPages(app, { stores: resolveStores([{ id: 'perso', path: root }], root).stores })
    await app.ready()

    const res = await app.inject({ method: 'PUT', url: '/api/pages/refus.md', payload: { markdown: `${before}\n:::callout\n:::\n` } })

    expect(res.statusCode).toBe(422)
    expect(res.json().diagnostics[0].message).toBe('Block ":::callout" needs content.')
    expect(await readFile(join(root, 'refus.md'), 'utf8')).toBe(before)
  })
})
