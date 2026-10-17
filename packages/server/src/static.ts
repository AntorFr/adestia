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

import { extname, relative, resolve, sep } from 'node:path'

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

// The route registration lives under `routes/`; kept importable from here.
export { registerStatic, type StaticOptions } from './routes/static.js'
