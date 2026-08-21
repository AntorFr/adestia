/**
 * Pre-bundles the zxing decoder INTO the plugin folder.
 *
 * Two reasons it lands here rather than in the shell's import map: it is used
 * by one plugin, and it is ~140 kB that only browsers without BarcodeDetector
 * ever download. The import map is for what EVERY plugin may assume; this is
 * the other case the design names — a heavy dependency vendored as relative
 * imports inside the plugin that needs it.
 *
 * The output is committed, because a plugin folder must work when it is
 * dropped somewhere with no build step.
 */

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

await build({
  entryPoints: [fileURLToPath(new URL('../src/decoder.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../web/decoder.js', import.meta.url)),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
})
console.log('decoder bundled into web/decoder.js')
