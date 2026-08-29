/**
 * Builds the service worker, AFTER the shell — it needs the shell's output.
 *
 * Two things are computed here rather than written by hand, because both are
 * facts about a build and neither survives being remembered:
 *
 * 1. **The cache name.** It is a hash of the built `index.html`, so it changes
 *    exactly when the shell does. A constant would leave every past build's
 *    content-addressed chunks in a cache nothing ever evicts; a timestamp
 *    would rotate the cache on builds that changed nothing.
 * 2. **The precache list.** The entry chunks are content-addressed, so their
 *    names are only knowable once Vite has emitted them. Lazy chunks are
 *    deliberately absent: the editor alone is ~450 kB, and paying for it on
 *    the install of a chat is the wrong trade.
 */

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const dist = fileURLToPath(new URL('../dist-web/', import.meta.url))

const html = await readFile(new URL('index.html', `file://${dist}`), 'utf8')

/** Everything the shell's own HTML names: the entry module and its stylesheet. */
const entries = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])

/**
 * The import map's targets, which no `src` attribute names.
 *
 * They are resolved by the browser's module loader, so they never appear in
 * the HTML as a URL a regex could find — and an offline boot without React is
 * a white page.
 */
const vendor = (await readdir(new URL('vendor/', `file://${dist}`)))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `/vendor/${name}`)

const precache = ['/', '/icon.svg', ...entries, ...vendor.sort()]

const version = createHash('sha256').update(html).update(vendor.join(',')).digest('hex').slice(0, 12)

await build({
  entryPoints: [fileURLToPath(new URL('../src/sw/sw.ts', import.meta.url))],
  outfile: `${dist}sw.js`,
  bundle: true,
  // A classic worker, not a module one: module service workers are still
  // unsupported by Firefox, and this file has one import to inline.
  format: 'iife',
  target: 'es2022',
  minify: true,
  define: {
    __SW_VERSION__: JSON.stringify(version),
    __SW_PRECACHE__: JSON.stringify(precache),
  },
})

console.log(`service worker built (cache adestia-${version}, ${precache.length} precached)`)
