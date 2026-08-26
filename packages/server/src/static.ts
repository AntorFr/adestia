/**
 * Serving files: the shell bundle, and the plugin folders.
 *
 * Two rules from spike 2, both load-bearing:
 *
 * - **MIME types are not decoration.** Browsers enforce strict MIME checking
 *   on module scripts: served as `text/plain`, a perfectly good plugin fails
 *   to import with an error about MIME types that tells its author nothing.
 * - **Plugin files sit behind the session, like everything else.** Only what
 *   the browser needs before boot is public, and that list is explicit.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { DiscoveredPlugin } from './extensions.js'
import { MANIFEST_ROUTE, PREBOOT_ICONS, type WebManifest } from './webmanifest.js'

const MIME: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

export function mimeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Resolves a request path inside a root, or returns undefined.
 *
 * The manifest validator already refuses traversal in declared paths, but this
 * serves whatever a browser asks for — including paths no manifest ever named.
 * Belt and braces, on the one surface where a mistake reads files.
 */
export function safeJoin(root: string, requested: string): string | undefined {
  const decoded = decodeURIComponent(requested)
  if (decoded.includes('\0')) return undefined
  const target = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  return target
}

export interface StaticOptions {
  /** Built shell bundle (`dist-web`). Absent in dev, where Vite serves it. */
  readonly webRoot?: string | undefined
  readonly plugins: readonly DiscoveredPlugin[]
  /** The one active skin's folder, when the configured skin was found. */
  readonly skinDir?: string | undefined
  /** The merged web app manifest. Absent leaves the instance uninstallable. */
  readonly webManifest?: WebManifest | undefined
}

async function sendFile(reply: FastifyReply, path: string): Promise<FastifyReply> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return reply.code(404).send({ error: 'not found' })
    return reply
      .header('content-type', mimeFor(path))
      .header('content-length', info.size)
      .send(createReadStream(path))
  } catch {
    return reply.code(404).send({ error: 'not found' })
  }
}

export function registerStatic(app: FastifyInstance, options: StaticOptions): void {
  // Only ACTIVE plugins are reachable. An inactive plugin ships no code to the
  // browser at all — consistent with it having no tile and mounting no API.
  const active = new Map(
    options.plugins.filter((plugin) => plugin.active).map((plugin) => [plugin.manifest.id, plugin.dir]),
  )

  app.get<{ Params: { id: string; '*': string } }>(
    '/plugins/:id/*',
    async (request: FastifyRequest<{ Params: { id: string; '*': string } }>, reply) => {
      const dir = active.get(request.params.id)
      // 404 for both unknown and inactive: whether a plugin exists on disk is
      // not something an unauthenticated probe should be able to learn.
      if (!dir) return reply.code(404).send({ error: 'not found' })

      const path = safeJoin(dir, request.params['*'])
      if (!path) return reply.code(403).send({ error: 'forbidden' })
      return sendFile(reply, path)
    },
  )

  // Exactly one skin is reachable — the active one. Serving them all would
  // let a bookmark load a livery the instance did not choose.
  const skinDir = options.skinDir
  if (skinDir) {
    app.get<{ Params: { '*': string } }>('/skin/*', async (request, reply) => {
      const path = safeJoin(skinDir, request.params['*'])
      if (!path) return reply.code(403).send({ error: 'forbidden' })
      return sendFile(reply, path)
    })
  }

  const webRoot = options.webRoot

  /**
   * The web app manifest, merged at boot and served from the root.
   *
   * Generated rather than read from a file: it is the product's manifest with
   * a skin's names and colours over it, and the merge already happened where
   * the skin was loaded. Served here because a browser asks for it before the
   * bundle runs — the same reason the icons below are not left to the skin
   * module's client-side hooks.
   */
  const webManifest = options.webManifest
  if (webManifest) {
    app.get(MANIFEST_ROUTE, async (_request, reply) =>
      reply
        // The registered type. Served as `application/json`, Chrome accepts it
        // and Safari has historically not — a difference that costs the whole
        // install and shows up as nothing at all.
        .header('content-type', 'application/manifest+json; charset=utf-8')
        .send(JSON.stringify(webManifest)),
    )
  }

  /**
   * The pre-boot icons, served from the ACTIVE skin.
   *
   * Not left to the skin module's `setIcon`, which the loader does implement:
   * the browser asks for `/icon.svg` before a single line of the bundle runs,
   * so a client-side swap arrives after the tab has already drawn the default
   * — a flash of the wrong body's mark on every load. The predecessor learned
   * this and serves its icons from disk for the same reason.
   *
   * The rasters exist because the vector is not enough where it matters most:
   * an iPhone adding a page to its home screen reads `apple-touch-icon` — a
   * PNG, opaque, 180×180 — and ignores the manifest's icons entirely. A skin
   * ships them by CONVENTION, under the same names; one it does not ship falls
   * through to the product's own, which is the right answer rather than a
   * broken image.
   */
  for (const icon of PREBOOT_ICONS) {
    app.get(icon.route, async (_request, reply) => {
      if (skinDir) {
        const fromSkin = safeJoin(skinDir, icon.asset)
        if (fromSkin && (await stat(fromSkin).catch(() => undefined))?.isFile()) {
          return sendFile(reply, fromSkin)
        }
      }
      const fallback = webRoot ? safeJoin(webRoot, icon.route) : undefined
      if (!fallback) return reply.code(404).send({ error: 'not found' })
      return sendFile(reply, fallback)
    })
  }

  if (!webRoot) return

  app.get('/*', async (request, reply) => {
    const url = request.url.split('?')[0] ?? '/'
    if (url.startsWith('/api/') || url.startsWith('/plugins/') || url.startsWith('/skin/')) {
      return reply.code(404).send({ error: 'not found' })
    }

    const path = safeJoin(webRoot, url === '/' ? '/index.html' : url)
    if (!path) return reply.code(403).send({ error: 'forbidden' })

    try {
      const info = await stat(path)
      if (info.isFile()) return sendFile(reply, path)
    } catch {
      /* fall through */
    }

    // A missing ASSET must 404, never fall through to the shell. Serving HTML
    // where a module was expected turns "this file is not there" into "expected
    // a JavaScript module but the server responded with text/html" — an error
    // whose text points at MIME configuration and sends the reader nowhere near
    // the missing file. The import-map targets are exactly this shape.
    if (extname(path) !== '') {
      return reply.code(404).send({ error: 'not found' })
    }

    // Anything else is a client-side route: serve the shell so a deep link
    // opens the app rather than a 404 the user cannot interpret.
    return sendFile(reply, join(webRoot, 'index.html'))
  })
}
