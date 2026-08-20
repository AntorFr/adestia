// Builds the shell's vendored ESM copies of the shared dependencies.
// These are the ONLY built artifacts of the shell; plugins are never bundled
// against them — they resolve the bare specifiers through the page import map.
//
// Two pitfalls proven in this spike:
//
// 1. react 19 ships CJS only, and esbuild's `export * from 'cjs-package'`
//    forwards NO named exports. The browser then fails with "The requested
//    module 'react' does not provide an export named 'useState'".
//    Fix: enumerate the CJS export names at build time and emit explicit
//    `export var X = m.X` statements (the esm.sh technique).
//
// 2. Building react-dom/client with `external: ['react']` leaves react-dom's
//    internal CJS `require("react")` as esbuild's dynamic-require shim, which
//    THROWS in the browser ("Dynamic require of 'react' is not supported").
//    Fix: build all vendor entries in ONE esbuild call with `splitting: true`;
//    react's module body lands in a single shared chunk imported by every
//    entry, so one evaluation / one instance is guaranteed by the module
//    graph itself — no externals, no runtime shims.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const entriesDir = join(here, 'entries');
const outDir = join(here, '..', 'shell', 'vendor');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(entriesDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function wrapperSource(pkg, extra = '') {
  const names = Object.keys(require(pkg))
    .filter(k => IDENT.test(k) && k !== 'default' && k !== '__esModule');
  return [
    `import m from ${JSON.stringify(pkg)};`,
    ...names.map(n => `export var ${n} = m.${n};`),
    `export default m;`,
    extra,
    '',
  ].join('\n');
}

// The eval counter lives INSIDE the react wrapper (not a footer, which would
// be appended to every output file): it proves the "react" import-map entry
// evaluates exactly once for the whole page, shell + plugin included.
writeFileSync(join(entriesDir, 'react.js'), wrapperSource('react',
  'globalThis.__REACT_EVAL_COUNT = (globalThis.__REACT_EVAL_COUNT || 0) + 1;'));
writeFileSync(join(entriesDir, 'react-dom-client.js'), wrapperSource('react-dom/client'));
writeFileSync(join(entriesDir, 'react-jsx-runtime.js'), wrapperSource('react/jsx-runtime'));

await build({
  entryPoints: [
    join(entriesDir, 'react.js'),
    join(entriesDir, 'react-dom-client.js'),
    join(entriesDir, 'react-jsx-runtime.js'),
  ],
  outdir: outDir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  chunkNames: 'chunk-[name]-[hash]',
  logLevel: 'info',
});

rmSync(entriesDir, { recursive: true, force: true });
console.log('vendor build done ->', outDir, readdirSync(outDir));
