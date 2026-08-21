/**
 * Vendors the shared dependencies the import map publishes.
 *
 * Two traps spike 2 hit, both solved here — see spikes/esm-runtime/REPORT.md:
 *
 * 1. React ships CJS, and `export * from 'react'` through esbuild yields a
 *    module whose only export is `default`. The browser then fails with "does
 *    not provide an export named 'useState'". Fix: enumerate the CJS exports
 *    at build time and emit explicit named re-exports.
 * 2. Building `react-dom/client` with react `external` leaves react-dom's
 *    internal `require("react")` as a dynamic-require shim that THROWS at
 *    runtime. Fix: one esbuild call with `splitting: true`, so react's module
 *    body lands in a shared chunk every entry imports — single evaluation
 *    guaranteed by the module graph itself.
 */

import { createRequire } from 'node:module'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const out = fileURLToPath(new URL('../public/vendor/', import.meta.url))

/** `export var x = m.x` for every named export the CJS module actually has. */
function wrapper(specifier) {
  const namedExports = Object.keys(require(specifier)).filter(
    (name) => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name),
  )
  return [
    `import m from ${JSON.stringify(specifier)}`,
    ...namedExports.map((name) => `export var ${name} = m.${name}`),
    'export default m',
  ].join('\n')
}

const entries = {
  'react.js': 'react',
  'react-dom.js': 'react-dom',
  'react-dom-client.js': 'react-dom/client',
  'react-jsx-runtime.js': 'react/jsx-runtime',
}

// Staged inside the package, not in the OS temp dir: esbuild resolves bare
// specifiers from the entry point's location, and a file in /tmp sees no
// node_modules at all.
const staging = fileURLToPath(new URL('../.vendor-staging/', import.meta.url))
await mkdir(staging, { recursive: true })
try {
  const entryPoints = []
  for (const [file, specifier] of Object.entries(entries)) {
    const path = join(staging, file)
    await writeFile(path, wrapper(specifier))
    entryPoints.push(path)
  }

  await build({
    entryPoints,
    outdir: out,
    bundle: true,
    format: 'esm',
    // Non-negotiable: this is what keeps ONE react instance in the page.
    splitting: true,
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  console.log(`vendored ${entryPoints.length} shared modules into public/vendor/`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
