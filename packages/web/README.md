# @antorfr/golem-web

The browser shell: the chat, the apps canvas, and the runtime plugin loader.

Two pieces carry the weight, and both are testable without a browser because
their environment is injected:

- **`chat/stream.ts`** — the SSE parser and the live turn state. Text arrives
  as deltas and the bubble grows, which is deficit #1 of the parity bar closed.
  The parser is incremental on purpose: a network chunk has no relationship to
  a frame boundary, and code that assumes otherwise works locally and corrupts
  long answers in production.
- **`plugins/loader.ts`** — the mechanism spike 2 proved, turned into product.
  Plugins are plain ESM in a mounted folder; shared dependencies come from the
  page's import map, which is a **versioned contract** (`IMPORT_MAP_CONTRACT`);
  stylesheets are listed in the manifest and owned by the shell; a plugin that
  throws loses its own contribution, never the page.

The web package declares its own `TurnEvent` rather than importing the driver
contract: the shell talks HTTP to something that speaks this protocol and never
needs to know what runs behind it. `test/protocol.test.ts` proves the two
declarations stay aligned.
