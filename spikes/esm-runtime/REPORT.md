# Spike 2 — Runtime ESM plugin views (no common bundling)

**Verdict: PROVEN.** A plugin living in a separate folder, written as plain
hand-authored ESM with **zero build step and zero bundler**, loads at runtime
into a React shell: the shell reads `manifest.json`, injects the
manifest-listed CSS, `import()`s the view, and mounts it with its own
`react-dom`. React is shared through the page **import map** as a **single
instance** — proven by module-namespace identity, by working hooks, and by an
evaluation counter. A ~450 kB heavy chunk loads **only on user action** via
`import(new URL('./heavy.js', import.meta.url))`, and bare specifiers keep
resolving inside that lazy sub-chunk.

All claims below marked *proven* were verified by executing the automated
suite against the machine's real Chrome (**Chrome 151.0.7922.138**, driven by
`puppeteer-core` `channel: 'chrome'` — no browser downloaded) with React
19.2.8, esbuild 0.28.2, Node v26.0.0. **16/16 assertions pass.**

## Layout

```
esm-runtime/
├── build/
│   ├── vendor.mjs        # esbuild → shell/vendor (the ONLY built artifact)
│   └── make-heavy.mjs    # generates the 450 kB heavy-data.js payload
├── shell/
│   ├── server.mjs        # zero-dependency static server (node:http)
│   ├── index.html        # import map: react, react-dom/client, react/jsx-runtime
│   ├── boot.js           # fetch manifest → inject CSS → import() view → mount
│   └── vendor/           # generated: 3 ESM entries + shared chunks
└── plugins/hello/        # SEPARATE folder, served under /plugins/hello/
    ├── manifest.json     # {"view": "./view.js", "styles": ["./style.css"]}
    ├── view.js           # hand-written ESM, imports bare "react", never bundled
    ├── style.css         # injected by the SHELL, never imported by a module
    ├── heavy.js          # lazy chunk; bare "react" + "react/jsx-runtime" + relative import
    └── heavy-data.js     # generated 450 kB payload (static import of heavy.js)
```

## How to run

```sh
cd spikes/esm-runtime
npm install               # local node_modules only
npm run vendor            # esbuild → shell/vendor/
node build/make-heavy.mjs # regenerate the 450 kB payload (gitignored)
npm test                  # starts server, drives installed Chrome, 16 assertions
# or interactively: npm run serve  →  http://127.0.0.1:4173/
```

## What is proven (by execution)

| # | Claim | How it was proven |
|---|---|---|
| 1 | Plugin view renders from a mounted folder with zero rebuild | `#hello-root` appears; `view.js` is byte-identical hand-written source, served as-is |
| 2 | React is ONE shared instance | `window.__REACT_SHELL === window.__REACT_PLUGIN` (module namespace identity) is `true`; `__REACT_EVAL_COUNT === 1` (counter inside the vendored module body); `/vendor/react.js` fetched exactly once |
| 3 | Hooks work across the boundary | `useState` inside the plugin component, rendered by the *shell's* `react-dom`, transitions state on click — with two React copies this throws "Invalid hook call" |
| 4 | Manifest-listed CSS is injected and applied | computed `color: rgb(0, 128, 0)` and border color on the plugin node come from `style.css`; `<link data-plugin="hello">` present |
| 5 | Heavy chunk is lazy | zero network requests matching `heavy` before the click; `heavy.js` + `heavy-data.js` fetched after; 450 058-byte payload rendered |
| 6 | Bare specifiers resolve inside lazy sub-chunks | `heavy.js` (itself loaded via `import(new URL(...))`) imports bare `react` and `react/jsx-runtime`; `window.__HEAVY_REACT === window.__REACT_SHELL` |
| 7 | Relative static imports inside a lazy chunk resolve against the chunk's own URL | `heavy.js` statically imports `./heavy-data.js`; both fetched from `/plugins/hello/` |
| 8 | No console or page errors | listener on `console`/`pageerror` collects nothing |

Negative proofs (also executed, exact Chrome messages captured):

- **Wrong MIME kills modules.** Serving a module as `text/plain` fails the
  import with: *"Failed to load module script: Expected a JavaScript-or-Wasm
  module script but the server responded with a MIME type of 'text/plain'.
  Strict MIME type checking is enforced for module scripts per HTML spec."*
- **No import map → bare specifiers fail.** On a page without the map,
  `import('react')` rejects with *"Failed to resolve module specifier 'react'"*.
- **Cross-origin plugins need CORS.** A module imported from another origin is
  blocked (*"No 'Access-Control-Allow-Origin' header is present"*) unless the
  plugin origin sends `Access-Control-Allow-Origin`. Same-origin (this spike's
  layout, and Demeura's `/plugins/<id>/web/*` design) needs nothing.

## Pitfalls hit (all reproduced, all fixed in `build/vendor.mjs`)

1. **`export * from` a CJS package exports nothing.** React 19 still ships
   CJS only. An esbuild wrapper `export * from 'react'` produced a bundle
   whose ESM interface had *only* `default` — the browser would fail with
   "does not provide an export named 'useState'". **Fix:** enumerate
   `Object.keys(require('react'))` at build time and emit explicit
   `export var useState = m.useState; …` (the esm.sh technique).
2. **`external: ['react']` poisons a CJS dependent.** Building
   `react-dom/client` with react external leaves react-dom's internal
   `require("react")` as esbuild's dynamic-require shim, which **throws at
   runtime** ("Dynamic require of 'react' is not supported"). esbuild cannot
   turn a CJS `require` of an external into a static ESM import. **Fix:**
   build all vendor entries in ONE esbuild call with `splitting: true` —
   react's module body lands in a single shared chunk that every entry
   imports relatively, so single evaluation is guaranteed by the module graph
   itself, no externals involved. (Import-map targets stay stable names; the
   hashed chunks are internal edges nobody references.)
3. **MIME table is load-bearing** (see negative proof). A naïve static server
   that defaults to `text/plain` or `application/octet-stream` breaks every
   module and stylesheet. `.js`/`.mjs` → `text/javascript`, `.css` →
   `text/css`, `.json` → `application/json`.
4. **`import(new URL(...))` works as-is** — dynamic import stringifies its
   argument, and relative resolution against `import.meta.url` keeps working
   for chunks that were themselves loaded dynamically. No gotcha found here.
5. **Path traversal:** WHATWG `URL` normalizes `/plugins/../x` before routing,
   and the server keeps a `startsWith(root)` guard as second belt. Both
   behaviors verified with `curl --path-as-is` (404/403, never a file leak).

## Implications for Demeura's manifest contract

- **The spike's manifest shape is sufficient for views:** `view` (module URL
  relative to the plugin base) + `styles: [...]` (URLs the shell turns into
  `<link>` elements it owns — inject *and* remove — tagged `data-plugin=<id>`).
  Nothing else was needed to mount a nontrivial React view.
- **The import map is a versioned, published contract.** Whatever set of bare
  specifiers the shell maps (`react`, `react-dom/client`, `react/jsx-runtime`,
  later the design system, sanitizer, content-engine primitives) is exactly
  what plugins may import bare; everything else must be vendored inside the
  plugin folder as relative imports. The manifest's `contract: N` should pin
  the guaranteed specifier set (and the React major), because a bare import
  outside the map fails only at load time, with a browser error the plugin
  author never saw at build time — this is the DOM-mount-test argument from
  DESIGN.md, re-confirmed.
- **`react/jsx-runtime` must be in the map from day one.** Hand-written
  `createElement` works (this spike), but any plugin author compiling JSX
  will emit `import { jsx } from 'react/jsx-runtime'`. It's 930 bytes; map it.
- **Import maps are page-global and static-ish** (one map, must be parsed
  before the first module resolution; Chrome now allows multiple/late maps
  but only for not-yet-resolved specifiers). So the shared-deps map belongs to
  the SHELL's boot HTML, not to plugins — a plugin can never inject its own
  bare names for itself retroactively. Corollary: plugin-vendored deps must be
  relative imports, which the spike shows work fine, including transitively
  from lazy chunks.
- **Serving rules for `/plugins/<id>/web/*`:** correct MIME types are
  mandatory (strict MIME checking), same-origin serving avoids the whole CORS
  question; if plugins are ever served from a CDN/other origin, that origin
  must send CORS headers AND the import map entries must be absolute URLs.
  Session-auth via cookies also survives same-origin module fetches trivially;
  cross-origin would additionally need `crossorigin` + credentials handling.
- **Vendoring recipe for the shell is settled:** one esbuild invocation,
  `format: 'esm'` + `splitting: true`, wrapper entries with build-time-
  enumerated named exports, `define: { 'process.env.NODE_ENV': '"production"' }`.
  Sizes for React 19.2.8: react entry 2.1 kB + shared chunks ~8.3 kB,
  react-dom/client 180.6 kB, jsx-runtime 0.9 kB (minified, pre-gzip).
- **The factory pattern is unconstrained by any of this.** The spike mounts a
  default-exported component; `(api) => contribution` is a shell-side calling
  convention on top of the same `import()`, nothing in the loading path cares.

## What was NOT tested (honest limits)

- Only Chrome was driven (151). Import maps are baseline across modern
  Safari/Firefox per public compat data, but that is *assumed here, not
  executed*.
- CSS *removal* on plugin deactivation (the shell owns the `<link>` nodes, so
  it's `link.remove()`, but no assertion covers it).
- Auth in front of `/plugins/` (DESIGN's session-auth serving) — out of scope.
- Multiple plugins / two bundle targets (launcher vs content engine) — single
  plugin, single target here.
