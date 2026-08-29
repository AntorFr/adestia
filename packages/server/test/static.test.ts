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
  root = await mkdtemp(join(tmpdir(), 'adestia-static-'))
  for (const id of ['on', 'off']) {
    await mkdir(join(root, 'plugins', id, 'web'), { recursive: true })
    await writeFile(join(root, 'plugins', id, 'web', 'app.js'), 'export default () => null\n')
    await writeFile(join(root, 'plugins', id, 'web', 'app.css'), '.x{}\n')
  }
  await writeFile(join(root, 'secret.txt'), 'not yours\n')

  await mkdir(join(root, 'web', 'assets'), { recursive: true })
  await writeFile(join(root, 'web', 'index.html'), '<!doctype html><title>Adestia</title>')
  await writeFile(join(root, 'web', 'assets', 'app.js'), 'console.log(1)\n')
  await writeFile(join(root, 'web', 'icon.svg'), '<svg>PRODUCT-ICON</svg>')

  await writeFile(join(root, 'web', 'icon-180.png'), 'PRODUCT-180')
  await writeFile(join(root, 'web', 'icon-192.png'), 'PRODUCT-192')

  await mkdir(join(root, 'skin-dressed', 'assets'), { recursive: true })
  await writeFile(join(root, 'skin-dressed', 'assets', 'icon.svg'), '<svg>SKIN-ICON</svg>')
  await writeFile(join(root, 'skin-dressed', 'assets', 'icon-180.png'), 'SKIN-180')
  await mkdir(join(root, 'skin-bare'), { recursive: true })
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
    expect(response.body).toContain('<title>Adestia</title>')
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
    expect(response.body).toContain('<title>Adestia</title>')
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

describe('the favicon', () => {
  const withSkin = async (dir?: string) => {
    const app = Fastify()
    registerStatic(app, {
      plugins: [],
      webRoot: join(root, 'web'),
      ...(dir ? { skinDir: join(root, dir) } : {}),
    })
    await app.ready()
    return app
  }

  it('comes from the active skin when it ships one', async () => {
    // Server-side on purpose: the browser asks for this before a single line
    // of the bundle runs, so a client-side swap flashes the wrong body's mark
    // on every load.
    const app = await withSkin('skin-dressed')
    const response = await app.inject({ method: 'GET', url: '/icon.svg' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('SKIN-ICON')
  })

  it("falls back to the product's own when the skin ships none", async () => {
    const app = await withSkin('skin-bare')
    const response = await app.inject({ method: 'GET', url: '/icon.svg' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('PRODUCT-ICON')
  })

  it('serves the product icon on an instance with no skin at all', async () => {
    const app = await withSkin()
    const response = await app.inject({ method: 'GET', url: '/icon.svg' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('PRODUCT-ICON')
  })

  it('serves the raster an iPhone asks for, from the skin or the product', async () => {
    // iOS reads `apple-touch-icon` and ignores the manifest's icons: without
    // a PNG at this address, an installed instance wears a screenshot.
    const dressed = await withSkin('skin-dressed')
    const fromSkin = await dressed.inject({ method: 'GET', url: '/icon-180.png' })
    expect(fromSkin.statusCode).toBe(200)
    expect(fromSkin.headers['content-type']).toBe('image/png')
    expect(fromSkin.body).toContain('SKIN-180')

    // Per FILE, not per skin: a livery may ship the vector and one size and
    // still get the product's for the rest.
    const missing = await dressed.inject({ method: 'GET', url: '/icon-192.png' })
    expect(missing.statusCode).toBe(200)
    expect(missing.body).toContain('PRODUCT-192')
  })

  it('404s an icon size neither the skin nor the product ships', async () => {
    const app = await withSkin('skin-dressed')
    expect((await app.inject({ method: 'GET', url: '/icon-512.png' })).statusCode).toBe(404)
  })
})

describe('the web app manifest', () => {
  const withManifest = async (manifest?: Record<string, unknown>) => {
    const app = Fastify()
    registerStatic(app, {
      plugins: [],
      webRoot: join(root, 'web'),
      ...(manifest ? { webManifest: manifest } : {}),
    })
    await app.ready()
    return app
  }

  it('is served with the type Safari requires', async () => {
    // `application/json` is accepted by Chrome and has historically not been
    // by Safari — a difference that costs the whole install and shows up as
    // nothing at all.
    const app = await withManifest({ name: 'Skippy', start_url: '/' })
    const response = await app.inject({ method: 'GET', url: '/manifest.webmanifest' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/manifest+json')
    expect(JSON.parse(response.body)).toEqual({ name: 'Skippy', start_url: '/' })
  })

  it('404s rather than serving the shell when the instance has none', async () => {
    // The catch-all would otherwise answer HTML, and a manifest parsed as
    // HTML fails with a message about JSON that names nothing.
    const app = await withManifest()
    const response = await app.inject({ method: 'GET', url: '/manifest.webmanifest' })
    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain('<title>')
  })
})
