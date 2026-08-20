import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { registerPages, revisionOf, safePagePath, titleOf } from '../src/pages.js'

let root: string
let app: FastifyInstance

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-pages-'))
  app = Fastify()
  registerPages(app, { root })
  await app.ready()
})

const write = async (path: string, content: string) => {
  await mkdir(join(root, path, '..'), { recursive: true })
  await writeFile(join(root, path), content)
}

const read = async (path: string) => {
  const response = await app.inject({ url: `/api/pages/${path}` })
  return response.json()
}

describe('safePagePath', () => {
  it('accepts a markdown file in the tree', () => {
    expect(safePagePath('/w/pages', 'notes/garage.md')).toBe('/w/pages/notes/garage.md')
  })

  it('refuses traversal', () => {
    expect(safePagePath('/w/pages', '../../etc/passwd')).toBeUndefined()
    expect(safePagePath('/w/pages', '/../.claude/settings.json')).toBeUndefined()
  })

  it('refuses anything that is not markdown', () => {
    // A general-purpose file writer behind a session cookie is a different and
    // far more dangerous thing than a page editor.
    expect(safePagePath('/w/pages', 'notes/hook.sh')).toBeUndefined()
    expect(safePagePath('/w/pages', '.claude/hooks/guard.py')).toBeUndefined()
  })

  it('refuses the root itself', () => {
    expect(safePagePath('/w/pages', '')).toBeUndefined()
  })
})

describe('titles', () => {
  it('prefers the frontmatter title', () => {
    expect(titleOf('---\ntitle: Le garage\n---\n\n# Autre\n', 'x.md')).toBe('Le garage')
  })

  it('falls back to the first heading, then the file name', () => {
    expect(titleOf('# Heading\n', 'notes/x.md')).toBe('Heading')
    expect(titleOf('just text\n', 'notes/rangement.md')).toBe('rangement')
  })
})

describe('listing', () => {
  it('walks the tree and reports titles', async () => {
    await write('a.md', '---\ntitle: First\n---\n\nBody.\n')
    await write('sub/b.md', '# Second\n')
    const { pages } = (await app.inject({ url: '/api/pages' })).json()
    expect(pages.map((p: { path: string; title: string }) => [p.path, p.title])).toEqual([
      ['a.md', 'First'],
      ['sub/b.md', 'Second'],
    ])
  })

  it('leaves the workspace plumbing out of the user list', async () => {
    // .claude, .git and friends belong to the agent, not to the page list.
    await write('.claude/CLAUDE.md', '# instructions\n')
    await write('visible.md', '# visible\n')
    const { pages } = (await app.inject({ url: '/api/pages' })).json()
    expect(pages.map((p: { path: string }) => p.path)).toEqual(['visible.md'])
  })

  it('is empty rather than failing when nothing exists yet', async () => {
    expect((await app.inject({ url: '/api/pages' })).json()).toEqual({ pages: [] })
  })
})

describe('reading', () => {
  it('returns the markdown with a revision', async () => {
    await write('a.md', '# Hello\n')
    const page = await read('a.md')
    expect(page.markdown).toBe('# Hello\n')
    expect(page.editable).toBe(true)
    expect(page.revision).toMatch(/^\d+-\d+$/)
  })

  it('opens a broken page read-only with its diagnostics', async () => {
    // Never a refusal (loses the file), never a rewrite (loses the content).
    await write('bad.md', ':::mystery\nx\n:::\n')
    const page = await read('bad.md')
    expect(page.editable).toBe(false)
    expect(page.diagnostics[0].message).toContain('Unknown block')
    expect(page.markdown).toContain(':::mystery')
  })

  it('404s a page that does not exist', async () => {
    expect((await app.inject({ url: '/api/pages/ghost.md' })).statusCode).toBe(404)
  })
})

describe('writing', () => {
  const save = (path: string, markdown: string, revision?: string) =>
    app.inject({
      method: 'PUT',
      url: `/api/pages/${path}`,
      payload: { markdown, ...(revision ? { revision } : {}) },
    })

  it('creates a page', async () => {
    const response = await save('new.md', '# New\n')
    expect(response.statusCode).toBe(200)
    expect(await readFile(join(root, 'new.md'), 'utf8')).toBe('# New\n')
  })

  it('refuses a save that breaks the vocabulary', async () => {
    const response = await save('x.md', ':::mystery\nx\n:::\n')
    expect(response.statusCode).toBe(422)
    expect(response.json().diagnostics[0].message).toContain('Unknown block')
  })

  it('does not cry reformat over a trailing blank line', async () => {
    // Editors routinely end a document with one; flagging it would make the
    // warning fire on every save, and a warning that always fires is one
    // nobody reads when it finally matters.
    const response = await save('x.md', '# Title\n\n')
    expect(response.json().normalized).toBe(false)
  })

  it('normalizes to house style and says so', async () => {
    const response = await save('x.md', '* one\n* two\n')
    expect(response.json().normalized).toBe(true)
    expect(await readFile(join(root, 'x.md'), 'utf8')).toBe('- one\n- two\n')
  })

  it('accepts a save carrying the current revision', async () => {
    await write('a.md', '# One\n')
    const { revision } = await read('a.md')
    expect((await save('a.md', '# Two\n', revision)).statusCode).toBe(200)
  })

  it('refuses a save when the agent wrote underneath the editor', async () => {
    // The other author here writes without warning. Overwriting blind is how
    // one of the two hands loses its work in silence.
    await write('a.md', '# One\n')
    const { revision } = await read('a.md')

    await new Promise((resolve) => setTimeout(resolve, 10))
    await write('a.md', '# The agent was here\n')

    const response = await save('a.md', '# My edit\n', revision)
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toContain('changed since it was opened')
    // And the agent's write survives untouched.
    expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# The agent was here\n')
  })

  it('requires a revision to overwrite an existing page', async () => {
    await write('a.md', '# One\n')
    expect((await save('a.md', '# Two\n')).statusCode).toBe(409)
  })

  it('never writes outside the pages tree', async () => {
    // A literal `../` is normalized away by the router before it reaches the
    // handler (it stops matching the route at all); an ENCODED one arrives
    // intact and is what safePagePath actually has to stop.
    for (const path of ['../escape.md', '%2e%2e%2fescape.md', '..%2fescape.md']) {
      const response = await save(path, '# nope\n')
      expect(response.statusCode, path).not.toBe(200)
    }
    await expect(readFile(join(root, '..', 'escape.md'), 'utf8')).rejects.toThrow()
  })

  it('answers 400 to an encoded escape rather than writing it', async () => {
    expect((await save('%2e%2e%2fescape.md', '# nope\n')).statusCode).toBe(400)
  })

  it('leaves no temporary file behind', async () => {
    // The write is atomic because the agent may be reading at that moment; a
    // stray .tmp would also show up in the agent's own view of its workspace.
    await save('a.md', '# One\n')
    const { pages } = (await app.inject({ url: '/api/pages' })).json()
    expect(pages.map((p: { path: string }) => p.path)).toEqual(['a.md'])
  })
})

describe('revisionOf', () => {
  it('changes when the file changes', () => {
    expect(revisionOf({ mtimeMs: 1000, size: 10 })).not.toBe(revisionOf({ mtimeMs: 1000, size: 11 }))
    expect(revisionOf({ mtimeMs: 1001, size: 10 })).not.toBe(revisionOf({ mtimeMs: 1000, size: 10 }))
  })
})
