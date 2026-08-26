# @antorfr/golem-web

The browser shell: the chat, the apps canvas, and the runtime plugin loader.

Two pieces carry the weight, and both are testable without a browser because
their environment is injected:

- **`chat/stream.ts`** — the SSE parser and the live turn state. Text arrives
  as deltas and the bubble grows, which is deficit #1 of the parity bar closed.
  The parser is incremental on purpose: a network chunk has no relationship to
  a frame boundary, and code that assumes otherwise works locally and corrupts
  long answers in production.
- **`chat/useCadence.ts`** — how often a growing answer is redrawn as markdown.
  Rendering the agent's half means re-parsing it from the top on every delta,
  because a `**` typed now decides what a `**` typed earlier meant; at a few
  characters per delta that is quadratic, and it was measured rather than
  guessed. The cadence makes the cost proportional to how LONG a turn runs
  instead of to the square of how much it says.
- **`plugins/loader.ts`** — the mechanism spike 2 proved, turned into product.
  Plugins are plain ESM in a mounted folder; shared dependencies come from the
  page's import map, which is a **versioned contract** (`IMPORT_MAP_CONTRACT`);
  stylesheets are listed in the manifest and owned by the shell; a plugin that
  throws loses its own contribution, never the page.

A chat message is rendered by `editor/Reader.tsx`, the same file a page is
read through — `Prose` rather than `Reader`, because a message is a fragment
and not a document: no frontmatter, no plugin blocks, and relative to the
workspace root. One grammar, one switch, so a link written in a message and
the same link written in a page cannot mean two things.

The web package declares its own `TurnEvent` rather than importing the driver
contract: the shell talks HTTP to something that speaks this protocol and never
needs to know what runs behind it. `test/protocol.test.ts` proves the two
declarations stay aligned.

Two build steps run beside Vite, both writing files no source tree should
carry: `build/vendor.mjs` emits the import map's shared modules, and
`build/sw.mjs` emits the service worker AFTER the shell, because it needs the
names Vite gave the entry chunks. Its cache is named for a hash of the built
`index.html`, so it rotates exactly when the shell changes — a constant would
leave every past build's chunks in a cache nothing evicts, and a timestamp
would rotate on builds that changed nothing.

`src/sw/policy.ts` is where the worker's whole judgement lives, pure and
tested: what it must not touch (`/api/`, the sign-in bounce, anything but a
GET), what answers from the cache (only content-addressed `/assets/*`), and
what may enter it. The rasters in `public/` are rendered from `icon.svg` — the
same picture, at the sizes an installer needs — and committed rather than
generated, so the build needs no rasteriser.
