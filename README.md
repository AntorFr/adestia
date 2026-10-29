# Adestia

**A self-hosted web interface that pairs a chat with an AI agent and visual Apps —
built on top of coding-agent CLIs (Claude Code, GitHub Copilot CLI), so a monthly
subscription powers everything. No per-token API billing.**

One instance = one agent, one workspace, one subscription. Content lives as
markdown files that both the agent (with its native file tools) and you (in a
Notion-like block editor) can edit. Plugins and skins load at runtime from mounted
directories — no rebuild to extend an instance.

## Running it

With Docker — copy the example config, then start:

```sh
cp adestia.config.example.yaml adestia.config.yaml
mkdir -p workspace data plugins skins
docker compose up
```

`./plugins` and `./skins` in the clone already hold the shipped extensions; `mkdir -p` only creates what is missing.
The first `up` builds the image from the `Dockerfile`; the agent needs
`CLAUDE_CODE_OAUTH_TOKEN` (see `docker-compose.yml`), which compose reads from the
host's environment: `export CLAUDE_CODE_OAUTH_TOKEN=<token>` before `docker compose up`
(`claude setup-token` with the Claude CLI prints one; it may also be armed later from
Adestia's own interface, and the app starts without it). The compose file mounts
`adestia.config.yaml` read-only: saving from the Settings screen cannot write it
there; edit the file on the host (or drop the `:ro`).

Without Docker, from a clone (`data/` and `workspace/` are created in the
current directory; `-c <path>` points at another config file). To keep runtime data
in a scratch directory, build in the clone, then launch the binary by absolute
path from that scratch directory:

```sh
npm ci
npm run build --workspace @antorfr/adestia-server
npm run build:web --workspace @antorfr/adestia-web
cp adestia.config.example.yaml /path/to/adestia.config.yaml   # optional: without `-c`, the launcher reads ./adestia.config.yaml, and with no file at all it runs on defaults
cd /path/to/scratch
node /path/to/adestia/packages/server/bin/adestia.js -c /path/to/adestia.config.yaml
```

This serves `http://127.0.0.1:8730` and answers 200 on `/`. It leaves `data/` and `workspace/` in that directory: delete them when done. `extensions.pluginsDir` and `skinsDir` (`./plugins`, `./skins`) resolve from the current directory, so from an empty scratch directory the log says `0 of 0 plugin(s) active`: link or copy the clone's `plugins/` and `skins/` there (or set the two paths in the config) to load them. Without
`CLAUDE_CODE_OAUTH_TOKEN` it still starts: the app is there, but a real agent
turn fails (use the scripted engine below to look at it without one).

To look at the app without an agent or Docker (a scripted engine, seeded data):

```sh
npm ci && npm run build               # npm run build also builds the web shell
node bench/launch.mjs --engine fake    # prints `listening on <url>`; <url>/api/health answers ok
node bench/sweep.mjs                   # every screen, light and dark, desk and phone
```

The sweep needs Playwright and Chromium installed on the host (the runner image ships Playwright 1.63; nothing in the repo installs them). It takes them from the environment (it looks in `/usr/lib/node_modules`, then `npm root -g`); the `pages-*` scenarios look only in `/usr/lib/node_modules`, so a host with another global root must link it there for them: `ln -s "$(npm root -g)/playwright" /usr/lib/node_modules/playwright`); do not
add them to the repo. The launcher runs until SIGTERM (`kill <pid>`, or Ctrl-C), which
removes its throwaway data; in a script, start it in the background and keep its pid
(`$!`). Run it from the clone's root: the bundled plugins are found through `./plugins`, and from elsewhere the server starts with `0 of 0 plugin(s) active`. The seed brings its own two small plugins (`bench-notes`, `bench-degraded`), so the boot log says `2 of 2 plugin(s) active`, not the ten of `plugins/`: that is normal. Its boot log includes two plugins refused on purpose (`bench-refused`, a name mismatch, and `bench-invalid`, an invalid manifest; both part of the seed): not an error.

`--engine claude` runs a real turn instead (needs `CLAUDE_CODE_OAUTH_TOKEN`).
For the pages state matrix (four skins, both languages, both themes, desktop
and phone), run `node bench/scenarios/pages-matrix.mjs` after the build (without argument it captures `pages-states.mjs`); the pictures land in `bench/shots-pages/` (`BENCH_OUT` moves them) and success is the list of captures with no error. Pass
`bench/scenarios/pages-editor.mjs` as its argument for the editor states;
`node bench/scenarios/pages-editor-narrow.mjs` checks the 360 px layout (it prints `overflow=0` per state).

See [bench/README.md](bench/README.md). The map of the code, the decisions (AD-n) and the
needs and screens they cite (B-n, P-n, E-n: `docs/parcours.md`, `docs/ecrans.md`; the Q-n are the numbered audit list at the end of `docs/ecrans.md`) are in
[ARCHITECTURE.md](ARCHITECTURE.md).

Either way, with no config file at all Adestia runs a single-user instance on
<http://127.0.0.1:8730> with no authentication. Every setting is documented in
[adestia.config.example.yaml](adestia.config.example.yaml).

The agent CLI is **not** bundled: which engine runs is the operator's
configuration, and its credentials come from the environment or are armed from
Adestia's own interface.

## What it does today

- **Chat that streams**, with a tool trace, a live token counter, and threads
  that survive a reload with everything the interface drew — tool calls,
  interruptions, context weight. The agent's half is
  rendered as the markdown it is, through the same renderer a page is read
  with, so a workspace path it names opens that page; what you typed stays
  exactly as you typed it.
- **Pages both hands write**: markdown files with a closed vocabulary of typed
  blocks, edited in a Notion-like editor or by the agent with its own file
  tools. One grammar renders, edits and validates them, so a save cannot change
  what a page means. A save is refused if the agent wrote underneath you.
  Home shows a loading row
  while the plugins and page index arrive; pages, their editor and properties
  use shared controls and the instance language (English or French).
  A page's other files — the plan as a PDF, the photo of the dish — sit next to
  it on disk, display in it, and are listed under it as attachments. What a
  page's status says is finished folds away rather than crowding the live ones.
- **Extensions at runtime**: drop a plugin folder in, name it in the config,
  restart. No image rebuild. Shared React comes from the page's import map;
  the shell owns the stylesheets; a broken plugin costs its own view and says
  why.
- **Three engines** behind one contract — Claude Code, GitHub Copilot CLI and
  Codex CLI. The interface is built from declared capabilities and never from
  a driver's name, so the second and third engines changed no UI code.
- **Settings as an app**, not a dialog over whatever you were reading: its own
  tile, its own address, one page per subject — the agent's credential (armed
  from the interface, held server-side at 0600 and never sent to a browser),
  the MCP servers and what each is doing, the theme, and the instructions you
  gave the agent, edited on a screen rather than in a box.
- **Instruction catalogues**: declare a git repository of skills, agents or
  instructions from Instructions › Catalogues, browse what it holds (found by
  the shape of the files, wherever they sit), and import item by item. An
  import is a copy in the folder the active engine reads, marked as delivered
  and read-only, with its repository and ref shown on its card. *Refresh*
  re-fetches a repository and re-copies what was imported from it (the same
  happens at boot, within a 20 s ceiling); removing an
  item removes only its copy, while *Remove catalogue* (on the repository list)
  forgets the repository and withdraws everything imported from it. A skill's links and special files are never
  copied, and a repository address or ref starting with `-` is refused. An item whose kind the active engine has no
  folder for is listed but cannot be imported. The list lives in
  `<dataDir>/instruction-catalogues.json`, not in the config file.
- **Three ways in**: none (local), a trusted proxy header, or any OIDC issuer.
  No local accounts, ever.
- **Contracts the agent reads**: `plugin-author` and `skin-author` ship with
  the product, so asking the agent for a plugin produces a valid one; and
  `persona-author` has it interview you for its own name and voice on a fresh
  instance, instead of guessing one.

- **Scheduled turns**: notes whose body runs as a prompt on a cadence, with a
  missed occurrence lost rather than replayed. Give one a deadline and it
  becomes a **mission** — a watch that ends itself once its goal is met, or
  escalates when the deadline passes. The `schedule-author` contract tells a mission to write only its own `done:`;
  this is an agent instruction, with no server-side write gate (see
  `docs/parcours.md`, P-12).
- **Attachments** the agent reads with its own tools, framed as data — a file
  that says "ignore your instructions" is reported, not obeyed.
- **The screen next to the chat**, joined to each message as a hint: the route
  and its breadcrumb, never what the page renders, and nothing at all from the
  home canvas or from a phone folded onto the conversation.
- **Inbound MCP**, so another agent can delegate work here asynchronously.
- **Skins**: tokens and a few narrow hooks, one active at a time.
- **Installs like an app.** The manifest is served, not shipped: `name:` in
  the config, or failing that the active skin, renames and recolours it — so
  two instances are two icons under two names rather than two "Adestia"s on one
  home screen. A skin's raster icons are
  served the way its favicon already is — including the opaque 180×180 an
  iPhone demands and the manifest cannot give it. The service worker is
  network-first on everything whose name outlives its content, so an installed
  instance never runs last week's bundle; offline it opens to its own
  interface, saying the server is unreachable, instead of the browser's error
  page.

## Sizing (read this before deploying)

**Each concurrent agent turn spawns a CLI process costing ~300 MB of RSS.**
That is measured, not estimated (`spikes/concurrency/REPORT.md`), and it is the
constraint that sizes the box — not CPU, and not the API, which stayed happy at
8 simultaneous turns.

Budget **server baseline + (`maxConcurrentTurns` × 300 MB)**:

| `maxConcurrentTurns` | Memory to provide |
|---|---|
| 1 | ~0.6 GB |
| 3 *(default)* | ~1.2 GB |
| 8 | ~2.6 GB |

Two rules follow, and both bite in production:

- **The cap and the memory limit must agree.** A cap of 8 behind a 1 GB limit
  is not a conservative deployment — it is a deployment that starts eight
  processes and gets killed. Adestia refuses a turn past its cap with HTTP 429. The chat says why, in the
  user's language, and keeps that line until the next send or another conversation;
  the composer is freed.
- **An OOM kill loses the turn in flight**, along with anything the agent had
  not yet written to disk. There is no retry: the turn died with the process,
  and replaying it behind the user's back would be worse than losing it.

On Kubernetes this is explicit deployment config, so state it:

```yaml
resources:
  requests:
    memory: 1Gi        # server + idle
  limits:
    memory: 2Gi        # server + 3 concurrent turns, with headroom
```

Set the `limit` from the table, not from what the pod uses at rest: an idle
Adestia is a few hundred megabytes, and it is the burst that kills it. Raise
`maxConcurrentTurns` and the memory limit together, never one alone.

## Status

**Early, and running.** The screens are checked in a real browser (`bench/`) and
the agent drivers against real CLIs, not only by tests; which version each deployment
runs is not recorded here. Pushing and pulling the workspace's own instructions
to a remote is still unbuilt (catalogues above only read repositories).
Concurrency measurements are recorded in `spikes/concurrency/REPORT.md`.
See [.agent/status.md](.agent/status.md) for current defects and unfinished work,
[CHANGELOG.md](CHANGELOG.md) for release history, and [DESIGN.md](DESIGN.md) for
the principles and decision log.

## Contributing

Node 22 or later (`engines` in `package.json`). After `npm ci`, check that
`node_modules/micromark-extension-directive` exists: a missing grammar shows as
escaped `\:::` in the content tests, and looks like a serialiser bug
(`CLAUDE.md`).

```sh
npm ci
npm test          # no account or network needed; takes 7 minutes or more (the browser suites dominate), so do not cut it short; the catalogue screens suite builds the shell on first run and skips (npm test stays green) when Playwright is not found through require/NODE_PATH, then `npm root -g`
npm run typecheck
npm run lint      # also run by CI
npm run build
```

The web shell dispatches screens in `app/Canvas.tsx`; `CanvasHeader.tsx` owns the
breadcrumb and phone return. `Home.tsx` composes `Brief` and `Domains`; the page
editor delegates saving to `editor/useAutosave.ts` and reading to `editor/reader/`.
Shared path rules and requests live in `app/paths.ts` and `app/request.ts`.

Every driver is exercised against a fake binary, which is a property of the
driver contract rather than a convenience: a driver whose behaviour is only
testable against a live account is a driver tested by its first user.

Work happens in an isolated git worktree and comes back to `main` before it is
tagged. `CLAUDE.md` covers the install traps of a worktree, how to commit, and
when to look at the interface.

## License

[MIT](LICENSE)
