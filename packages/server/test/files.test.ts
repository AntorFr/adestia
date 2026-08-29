import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { attachmentsOf, kindOf, registerFiles, safeFilePath } from '../src/files.js'

let root: string
let app: FastifyInstance

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-files-'))
  app = Fastify()
  registerFiles(app, { root })
  await app.ready()
})

const write = async (path: string, content = 'x') => {
  await mkdir(join(root, path, '..'), { recursive: true })
  await writeFile(join(root, path), content)
}

describe('safeFilePath', () => {
  it('accepts any file in the tree, markdown or not', () => {
    expect(safeFilePath('/w/pages', 'diy/plan.pdf')).toBe('/w/pages/diy/plan.pdf')
    expect(safeFilePath('/w/pages', 'diy/assets/photo.jpg')).toBe('/w/pages/diy/assets/photo.jpg')
  })

  it('refuses traversal', () => {
    expect(safeFilePath('/w/pages', '../../etc/passwd')).toBeUndefined()
    expect(safeFilePath('/w/pages', 'diy/../../secrets.env')).toBeUndefined()
  })

  it('refuses the workspace plumbing', () => {
    // `.git/config` carries the remote URL, and a token often rides in it.
    expect(safeFilePath('/w/pages', '.git/config')).toBeUndefined()
    expect(safeFilePath('/w/pages', 'diy/.claude/settings.json')).toBeUndefined()
  })

  it('refuses the root itself', () => {
    expect(safeFilePath('/w/pages', '')).toBeUndefined()
    expect(safeFilePath('/w/pages', '/')).toBeUndefined()
  })
})

describe('kindOf', () => {
  it('says what an interface should draw', () => {
    expect(kindOf('photo.JPG')).toBe('image')
    expect(kindOf('plan.pdf')).toBe('pdf')
    expect(kindOf('trace.gpx')).toBe('data')
    expect(kindOf('archive.zip')).toBe('file')
  })

  it('does not call an SVG an image', () => {
    // Not a classification quibble: `image` is what gets rendered in place,
    // and an SVG rendered in place runs its script with the session.
    expect(kindOf('logo.svg')).toBe('file')
  })
})

describe('attachmentsOf', () => {
  it('takes the page folder and its assets, never a sibling page', async () => {
    await write('diy/garage.md', '# Garage')
    await write('diy/plan.pdf')
    await write('diy/assets/avant.jpg')
    await write('diy/assets/deep/apres.jpg')

    const files = await attachmentsOf(root, 'diy/garage.md')
    expect(files.map((file) => file.path)).toEqual([
      'diy/assets/avant.jpg',
      'diy/assets/deep/apres.jpg',
      'diy/plan.pdf',
    ])
  })

  it('leaves another page’s folder to that page', async () => {
    await write('diy/garage.md', '# Garage')
    await write('diy/cuisine/devis.pdf')

    expect(await attachmentsOf(root, 'diy/garage.md')).toEqual([])
  })

  it('works for a page at the root', async () => {
    await write('notes.md', '# Notes')
    await write('scan.png')

    expect((await attachmentsOf(root, 'notes.md')).map((file) => file.path)).toEqual(['scan.png'])
  })
})

describe('GET /api/files', () => {
  it('lists what is attached to a page', async () => {
    await write('diy/garage.md', '# Garage')
    await write('diy/plan.pdf', 'PDF')

    const body = await app.inject({ url: '/api/files?page=diy/garage.md' }).then((r) => r.json())
    expect(body.files).toHaveLength(1)
    expect(body.files[0]).toMatchObject({ path: 'diy/plan.pdf', name: 'plan.pdf', kind: 'pdf', bytes: 3 })
  })

  it('never lists pages as attachments', async () => {
    await write('diy/garage.md', '# Garage')
    await write('diy/cuisine.md', '# Cuisine')

    const body = await app.inject({ url: '/api/files?page=diy/garage.md' }).then((r) => r.json())
    expect(body.files).toEqual([])
  })

  it('answers nothing rather than something for a path it refuses', async () => {
    const body = await app.inject({ url: '/api/files?page=../../etc/passwd' }).then((r) => r.json())
    expect(body.files).toEqual([])
  })
})

describe('GET /api/files/*', () => {
  it('hands over an image in place', async () => {
    await write('diy/assets/avant.jpg', 'JPEGBYTES')

    const response = await app.inject({ url: '/api/files/diy/assets/avant.jpg' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(response.headers['content-disposition']).toBe('inline; filename="avant.jpg"')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.body).toBe('JPEGBYTES')
  })

  it('refuses to render anything it does not know as inert', async () => {
    // The whole point: same origin, same session. An HTML or SVG file rendered
    // in place would run its script as the logged-in user.
    await write('diy/report.html', '<script>alert(1)</script>')
    await write('diy/logo.svg', '<svg onload="alert(1)"/>')

    for (const path of ['diy/report.html', 'diy/logo.svg']) {
      const response = await app.inject({ url: `/api/files/${path}` })
      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect(response.headers['content-disposition']).toMatch(/^attachment;/)
    }
  })

  it('forces a download when asked, even for an image', async () => {
    await write('diy/assets/avant.jpg', 'JPEGBYTES')

    const response = await app.inject({ url: '/api/files/diy/assets/avant.jpg?download=1' })
    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-disposition']).toBe('attachment; filename="avant.jpg"')
  })

  it('cannot be made to write a second header field through a file name', async () => {
    await write('diy/we"ird.pdf', 'PDF')

    const response = await app.inject({ url: `/api/files/diy/${encodeURIComponent('we"ird.pdf')}` })
    expect(response.headers['content-disposition']).toBe('inline; filename="we_ird.pdf"')
  })

  it('answers 304 when the browser already has it', async () => {
    await write('diy/plan.pdf', 'PDF')

    const first = await app.inject({ url: '/api/files/diy/plan.pdf' })
    const tag = first.headers['etag'] as string
    expect(tag).toMatch(/^W\//)

    const again = await app.inject({ url: '/api/files/diy/plan.pdf', headers: { 'if-none-match': tag } })
    expect(again.statusCode).toBe(304)
  })

  it('refuses traversal and the plumbing', async () => {
    await write('diy/plan.pdf', 'PDF')

    // Written encoded: a literal `../` is collapsed by the router before any
    // handler sees it, so it is the escaped form that actually reaches this
    // check — and it is the escaped form an attacker sends.
    expect((await app.inject({ url: '/api/files/%2e%2e%2f%2e%2e%2fetc/passwd' })).statusCode).toBe(400)
    expect((await app.inject({ url: '/api/files/.git/config' })).statusCode).toBe(400)
    expect((await app.inject({ url: '/api/files/diy/%2e%2e%2f%2e%2e%2fsecrets.env' })).statusCode).toBe(400)
  })

  it('is a 404 for a folder or a file that is not there', async () => {
    await write('diy/plan.pdf', 'PDF')

    expect((await app.inject({ url: '/api/files/diy' })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/files/diy/nope.pdf' })).statusCode).toBe(404)
  })
})
