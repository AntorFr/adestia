import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'
import Fastify from 'fastify'

import { mimeFor, registerStatic, safeJoin } from '../src/static.js'
import type { DiscoveredPlugin } from '../src/extensions.js'

let root: string

const plugin = (id: string, active: boolean): DiscoveredPlugin => ({
  manifest: { schemaVersion: 1, id, kind: 'app', description: 'x' },
  dir: join(root, 'plugins', id),
  active,
})

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-static-'))
  for (const id of ['on', 'off']) {
    await mkdir(join(root, 'plugins', id, 'web'), { recursive: true })
    await writeFile(join(root, 'plugins', id, 'web', 'app.js'), 'export default () => null\n')
    await writeFile(join(root, 'plugins', id, 'web', 'app.css'), '.x{}\n')
  }
  await writeFile(join(root, 'secret.txt'), 'not yours\n')

  await mkdir(join(root, 'web', 'assets'), { recursive: true })
  await writeFile(join(root, 'web', 'index.html'), '<!doctype html><title>Golem</title>')
  await writeFile(join(root, 'web', 'assets', 'app.js'), 'console.log(1)\n')
})

const build = async () => {
  const app = Fastify()
  registerStatic(app, {
    plugins: [plugin('on', true), plugin('off', false)],
    webRoot: join(root, 'web'),
  })
  await app.ready()
  return app
}

describe('mime types', () => {
  it('serves modules as javascript', () => {
    // Browsers enforce strict MIME checking on module scripts: served as
    // text/plain, a perfectly good plugin fails to import with an error that
    // tells its author nothing.
    expect(mimeFor('/web/app.js')).toContain('text/javascript')
    expect(mimeFor('/web/app.mjs')).toContain('text/javascript')
    expect(mimeFor('/web/app.css')).toContain('text/css')
  })

  it('falls back to a binary type rather than guessing', () => {
    expect(mimeFor('/x.unknown')).toBe('application/octet-stream')
  })
})

describe('safeJoin', () => {
  it('resolves a path inside the root', () => {
    expect(safeJoin('/srv/p', '/web/app.js')).toBe('/srv/p/web/app.js')
  })

  it('refuses traversal', () => {
    expect(safeJoin('/srv/p', '/../../etc/passwd')).toBeUndefined()
  })

  it('refuses encoded traversal', () => {
    // %2e%2e%2f survives naive prefix checks; decoding before the check is
    // the whole point.
    expect(safeJoin('/srv/p', '/%2e%2e%2f%2e%2e%2fetc/passwd')).toBeUndefined()
  })

  it('refuses a null byte', () => {
    expect(safeJoin('/srv/p', '/app.js%00.png')).toBeUndefined()
  })
})

describe('plugin files', () => {
  it('serves an active plugin with the right type', async () => {
    const app = await build()
    const response = await app.inject({ url: '/plugins/on/web/app.js' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/javascript')
    await app.close()
  })

  it('does not serve an inactive plugin', async () => {
    // An inactive plugin ships no code to the browser at all — consistent with
    // having no tile and mounting no API.
    const app = await build()
    expect((await app.inject({ url: '/plugins/off/web/app.js' })).statusCode).toBe(404)
    await app.close()
  })

  it('answers the same 404 for unknown and inactive', async () => {
    // Whether a plugin exists on disk is not something a probe should learn.
    const app = await build()
    expect((await app.inject({ url: '/plugins/ghost/web/app.js' })).statusCode).toBe(404)
    await app.close()
  })

  it('never leaks a file outside a plugin folder', async () => {
    // Two shapes, because they take different paths through the stack:
    // a literal `../` is normalized by the router before it ever reaches the
    // handler (harmless, but it must not resolve to the file either), while an
    // ENCODED one arrives intact and is stopped by safeJoin. Only the second
    // is the real attack, and only the second exercises our own guard.
    const app = await build()
    for (const url of [
      '/plugins/on/../../secret.txt',
      '/plugins/on/%2e%2e%2f%2e%2e%2fsecret.txt',
      '/plugins/on/..%2f..%2fsecret.txt',
    ]) {
      const response = await app.inject({ url })
      expect(response.body, url).not.toContain('not yours')
    }
    await app.close()
  })

  it('answers 403 to an encoded escape rather than serving something else', async () => {
    const app = await build()
    const response = await app.inject({ url: '/plugins/on/%2e%2e%2f%2e%2e%2fsecret.txt' })
    expect(response.statusCode).toBe(403)
    await app.close()
  })
})

describe('the shell', () => {
  it('serves index.html at the root', async () => {
    const app = await build()
    const response = await app.inject({ url: '/' })
    expect(response.body).toContain('<title>Golem</title>')
    await app.close()
  })

  it('serves built assets', async () => {
    const app = await build()
    expect((await app.inject({ url: '/assets/app.js' })).statusCode).toBe(200)
    await app.close()
  })

  it('serves the shell for a client-side route', async () => {
    // A deep link must open the app, not a 404 the user cannot interpret.
    const app = await build()
    const response = await app.inject({ url: '/pages/garage' })
    expect(response.body).toContain('<title>Golem</title>')
    await app.close()
  })

  it('404s a missing asset instead of answering with the shell', async () => {
    // Serving HTML where a module was expected produces "expected a JavaScript
    // module but the server responded with text/html" — an error whose text
    // points at MIME configuration, nowhere near the actually missing file.
    const app = await build()
    const response = await app.inject({ url: '/vendor/react.js' })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain('<title>')
    await app.close()
  })

  it('never swallows an API path', async () => {
    // The catch-all is registered last, but an unknown /api/ route must still
    // answer as an API — serving HTML there breaks every client.
    const app = await build()
    const response = await app.inject({ url: '/api/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain('<title>')
    await app.close()
  })
})
