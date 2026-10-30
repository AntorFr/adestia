# The graphical bench

What a browser tells you and a unit test cannot: where a thing SITS, whether
it survives the dark, whether a new strip eats the panel below it. Two defects
of the tab strip were found here and by no other means — `CLAUDE.md` asks for
a run whenever a change touches what the shell draws, and Docker is available.

```sh
bench/run.sh                                   # the worked example
bench/run.sh bench/scenarios/my-change.mjs     # yours
```

It builds the image from an explicit path, boots it with a throwaway data
directory, drives headless Chromium in a container against it, and removes
everything it made. Screenshots land in `bench/shots/` (git-ignored).

## Without Docker: `bench/launch.mjs`

```sh
npm run build
node bench/launch.mjs --engine fake                               # the scripted engine
CLAUDE_CODE_OAUTH_TOKEN=… node bench/launch.mjs --engine claude   # a real Claude turn
```

Options: `--skin <id>`, `--locale en|fr`, `--seed <name>` (default `base`),
`--port <n>` (default: a free one), `--data <dir>` (default: a throwaway
directory under `os.tmpdir()`; a directory you name is kept). It prints
`listening on <url>` once `/api/health` answers `ok`, and runs until SIGTERM,
which stops it and removes its data. Browse the URL, or drive it by API
(`POST /api/conversations`, then `POST /api/turn`).

- **`--engine fake`** calls `start({ driverFactory })` with `bench/fake-engine.mjs`,
  a `Driver` that answers by script: the last message is matched against an
  ordered list of `{ when, events }` (events are `TurnEvent`s); no match echoes
  the message, `ping` answers `pong`. Same message, same events, every time.
  It is a bench tool only — the product has no fake mode and no config key for it.
- **`--engine claude`** starts the plain `packages/server/bin/adestia.js` with the
  token from the environment and refuses without `CLAUDE_CODE_OAUTH_TOKEN`.
- **Seeds**: `bench/seed/<name>.mjs` default-exports
  `async ({ workspace, dataDir, base, port, onClose }) => configYaml`. It writes
  pages, threads and plugin data the way the product stores them
  (`docs/donnees.md`) and returns the instance configuration as YAML; the
  launcher sets port, directories, locale and skin over it. Optional exports:
  `scripts` (fake-engine answers), `engine` (what the fake engine reports: MCP
  health, the credential `armed|absent|invalid`), `config` (`{ file:
  'writable'|'readonly'|'none' }`, below) and `ready({ url })` (runs once it
  answers, to start the turns that must be *running*). A file starting with `_`
  is shared code, not a seed.

| `--seed` | What it shows |
|---|---|
| `base` | The populated instance: 20+ pages in two stores (every core block, a lost and an ambiguous wikilink, a vocabulary the product refuses to save, an unreadable frontmatter, a stray `app:`, files, two collections), conversations (running, unread, idle, archived, long, medium, a thread with every bubble state), six MCP servers in every health, instructions and three catalogues (importable, empty, unreachable), four delegations from two callers, a brief, a stored credential, a refused plugin and a plugin delivering a skill. No settings route: E-14 says it does not expose its configuration. |
| `chat-permission` | E-17/E-18: isolated desk/phone threads, pending/signed/denied/expired signatures, questions with and without a lasting rule; `permissions.mode: ask` also supports the real-Claude proof. |
| `config-writable` | `base`, with the configuration file the screen reads and writes. |
| `config-readonly` | `base`, with the file read-only and the credential refused upstream. A process running as root can write a `0444` file: the screen then shows it writable. |
| `oidc` | `base` behind a sign-in; the provider is `bench/oidc-stub.mjs`. |
| `empty` | Nothing: no plugin, page, conversation, server, catalogue or credential. |
| `page-suivie` | The `base` instance plus `suivi/` pages (four in the main store, one in the second) for `scenarios/page-suivie.mjs`, which rewrites and deletes them on disk as the agent would; `BENCH_WATCH=off` in the environment turns `workspace.watch` off. |
| `plugins` | The ten bundled plugins active, each with data in its own format (`bench/seed/_plugins.mjs`): tasks and lists (late, today, later, closed, unassigned), planif notes (valid, disabled, invalid, with a last run; the clock stays off), journals (with entries, empty), a derived atelier workbook, trips (confirmed, suggested, dismissed, an idea without dates, a closed one), a watchlist (sources, a local feed the seed serves, a source that fails, kept items with transcripts, a pasted link, a dismissed one), a route with its trace, meals periods (with and without dates), a project planning (dated sub-pages, statuses, an unreadable date, an undated folder) and a page for the scan feature. `bench-noview` is an app with a tile and no view: `#/bench-noview` is E-20. The camera of E-30 is the browser's: launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`. No MCP server and no refused plugin, so no band sits over a screen; the trips' map key is a placeholder. |

The permission/signature matrix runs with
`node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-permission.mjs` after the build.
It checks the sheet's Escape/focus return, the absence of Always without a rule, and
captures the ceremony and its fallback hint. For the real engine, start
`node bench/launch.mjs --engine claude --seed chat-permission --locale fr`, then run
`BENCH_URL=<printed-url> node bench/scenarios/chat-permission-live.mjs`. The latter sends
the file-creation prompt from the composer, answers any questions, compares the UTF-8
stream text to the stored transcript exactly, and compares live/stored prose after reload.
Its JSON report records the number of real questions; no question is also a valid outcome.

The chat states are asked for by typing their word (`bench/seed/_scripts.mjs`):
`fini`, `outil`, `erreur`, `permission` (waits), `signature`, `en cours`
(waits), `long contexte`, `contexte moyen`. A waiting turn ends when you stop it
(`POST /api/turn/stop`). `base` starts two of them itself: the conversation
« Conversation en cours » and a delegation from `courrier`.

`--engine claude` always has a configuration file (the binary reads one), so
`base` exposes `/api/settings` there. Seeds, not engines, decide the credential:
with `--engine claude` the real token is the one in the environment: the launcher
deletes the placeholder credential a seed stored (the Claude driver prefers a stored
credential to the environment, so it would answer `401 Invalid bearer token`).

**`oidc`** requires `--engine fake`; the launcher refuses `--engine claude --seed oidc`
before loading the seed, so the real Claude CLI cannot inherit disabled TLS verification.
The sign-in is real: `/auth/login` goes to the stub, which signs `alice` (group
`famille`, allowed) in; `GET <issuer>/__as?user=visiteur` makes the next
sign-in the visitor's, whom `allowedGroups` refuses. The product only talks to
an issuer over HTTPS, so the stub serves a self-signed certificate made by
`openssl` and the stub sets `NODE_TLS_REJECT_UNAUTHORIZED=0` (a browser
following the redirect must ignore certificate errors). The session secret is
fixed in the seed so a session of a refused group can be forged to reach the
« refused » gate.

**Checking the seeds**: `node bench/seed/check.mjs [--seed base,empty,…]` starts
each seed (for `plugins`, one measure per plugin — `plugins › voyages: …` — reading what its API answers), reads the screens' data through the API, sends every trigger message
and exits non-zero naming each measure that failed (`check: base › mcp: …`).

`bench/bench.mjs` finds Playwright under `/usr/lib/node_modules`, or else under
`npm root -g`.

## The plugins' screens, four skins × two languages: `bench/scenarios/plugins-matrix.mjs`

`npm run build`, then `node bench/scenarios/plugins-matrix.mjs` (Playwright from the environment, no
Docker). It launches `node bench/launch.mjs --engine fake --seed plugins --skin <s> --locale <l>` per
skin and language, takes E-22 to E-31 and each state the seed shows (19 per variant, light and dark,
desk and phone: 608 pictures in `bench/shots-plugins/` or `BENCH_OUT`), presses Escape on every window and
checks the focus, and reads each screen's text for the other language. `BENCH_SKINS=alfred,dobby` narrows
it; `BENCH_URL` (with `BENCH_SKIN`, `BENCH_LOCALE`) plays an instance already running. A full run takes
about 25 minutes when the four skins run side by side (one process each, `BENCH_SKINS=<skin>`). Exit 1
names each failing state.

## Every screen, both themes, both sizes: `bench/sweep.mjs`

```sh
npm run build
node bench/sweep.mjs [--skin <id>] [--locale en|fr] [--out <dir>] [--only E-4,E-9]
```

One command, no docker: Playwright and its Chromium come from the environment
(`npm root -g`, never from the repository). For each seed the screens need
(`base`, `config-writable`, `oidc`, `plugins`) it starts the launcher on the
scripted engine, then captures each screen of `docs/ecrans.md` (E-1 to E-31) in
`light` and `dark`, at 1440×900 and at a 390×844 touch viewport:
31 × 2 × 2 = 124 files in `<out>/<skin>/<E-n>-<name>-<theme>-<desk|phone>.png`
(`<skin>` is `default` without `--skin`; `--out` defaults to `bench/shots-sweep`,
ignored by git). Two to four minutes, depending on the machine.

The table at the top of the script is the one place that knows a screen: its
seed, route, the gesture that opens it and the **selector that proves it is that
screen**. A capture whose selector never shows, or that shows `.adestia-gate__card--loading`
or `.adestia-gate__card--fatal` where the screen is not one (E-21 is: offline, the cached
shell opens on the fatal gate), is a failure: the sweep goes on, prints
`FAIL E-n name theme size: why`, and exits 1 naming each. A new screen is a new
row; a screen whose markup changes is a selector to update.

How the states that have no file to live in are reached: E-1 is the sign-in gate
of a shell whose session has ended (a fresh visit is bounced to the provider, which
signs Alice straight back in), so the shell is loaded signed in and its one
`/api/instance` request is answered with what the server answers without a session;
E-17 types `permission` and stops the turn afterwards; E-21 waits for the service
worker to cache the shell, then cuts the network and reloads; E-30 runs Chromium on a
fake camera (`--use-fake-device-for-media-stream`).

## What is real and what is not

Everything is the real product — the image, the server, the shell, its
reducer, its components — except the **engine**. The image ships no agent CLI
on purpose (an operator adds one), so a turn cannot really run. A proxy in
front of the app answers the turn endpoints with an SSE stream the scenario
paces by hand: exactly the events the server would have relayed. A scenario
must therefore never be trusted about what the DRIVER does; it is trustworthy
about everything the browser does with what a driver sends.

**Unless you ask for the real engine.** `BENCH_REAL_ENGINE=1` stops the proxy
from answering `/api/turn/attach` and lets it through, so the turn runs on
whatever engine the server actually has; `emit` and `endTurn` then refuse
rather than quietly doing nothing, and `bench.real` tells a scenario which
world it is in. What that needs — a real CLI, a real credential — is what the
image deliberately lacks, so the server is booted on the HOST instead and only
the browser stays in its container:

```sh
bench/live-codex.sh [scenario] [out]   # the codex driver, watched in a browser
bench/live-codex-api.sh                # the same instance, driven through the API
```

Both build a throwaway instance in a temp directory and copy the credential
into it, 0600, reading the spike's own home and never writing back to it. The
first removes everything on the way out; the second deliberately KEEPS its
directory so the log survives the run, which also leaves that copy of the
credential on disk — `WORK=… bench/live-codex-api.sh` if you want to know
where. Use the first to look at a turn, the second when the question is "what
did the driver do?" rather than "what does it look like?". A change to a driver
is not looked at until somebody has watched a real turn arrive.

State the store owns — a finished turn, a thread as it comes back after a
reload — is seeded by writing the conversation JSONL into the mounted data
directory, which is the same thing the server would have written.

## The traps, each paid for once

- **`waitUntil: 'networkidle'` never resolves.** An attached turn holds its SSE
  connection open for the whole turn. Wait for a selector instead.
- **`docker build .` from the primary checkout builds `main`.** Worktrees are
  where changes live; build by explicit path (`run.sh` does).
- **Two runs at once destroy each other.** Everything is named
  `adestia-bench-*`, fixed — so the second run's container clashes with the
  first's, and whichever exits first takes the other's container down with it
  on the way out. It does not fail cleanly: the survivor's scenario keeps
  going against a dead server and photographs empty blocks. One run at a time,
  including two skins of the same scenario.
- **No bold, no italic, in the screenshots?** The container has no font with
  those faces. Check `getComputedStyle` before believing your eyes: a
  `<strong>` at `font-weight: 700` is correct and will look right on a Mac.
- **`/api/models` and `/api/home/brief` answer 404.** Both are correct here:
  no CLI means no model catalogue, and no mounted plugins means no brief. The
  proxy prints every upstream 4xx/5xx by name so a REAL missing asset cannot
  hide behind the browser's "Failed to load resource".
- **`fullPage: true` photographs the fold and nothing below it.** The shell's
  canvas scrolls inside ITSELF, so the document is never taller than the
  viewport and playwright has nothing extra to capture. Open a tall viewport
  (`bench.open({ height: 2400 })`) when the point of the shot is what sits
  below the fold.
- **The answer vanishes at settle.** The shell reads the thread back from the
  store the moment a turn ends, and keeps only what the store holds — on a
  real server the desk has filed the turn by then. The bench's engine is a
  proxy in front of the server, so nothing files anything: a scenario that
  ends its turn without appending the agent's lines to the thread file
  photographs a bare question. Append them first, exactly as
  `recordOutcome` would (`sommeil-du-telephone.mjs` shows the lines).
- **A block's bar is invisible until its block is hovered.** `⚙`, `✕` and the
  grip live on a bar at `opacity: 0; pointer-events: none` until
  `:hover`/`:focus-within`. A bare `click` on the gear times out on an element
  playwright reads as invisible, and the error says nothing about hovering:
  `hover` the `.adestia-edblock` first.
- **A permanent stream loops.** `/api/turn/attach` is answered once and then
  `204`, because the shell re-attaches after every turn it finishes.

### Chat tranche scenarios

After `npm run build`, run the rail's state captures on the host:

```sh
node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-rail.mjs
```

The runner starts and stops one fake-engine instance per skin and locale, and
passes `BENCH_URL`, `BENCH_OUT` and `BENCH_LOCALE` to the scenario. Optional
`--skin alfred`, `--locale fr` and `--out bench/shots-chat` narrow a replay or
choose its output directory. A subsequent chat scenario can export its own
`seed` name; otherwise the runner uses `base`.

`chat-rail.mjs` captures finished, interrupted and failed turns, expanded tool
traces, MCP connection prompts, an empty and a long list, keyboard focus, a live
turn and an attachments-only held message. Each locale gets light and dark at
1440, 390 and 360 px. Its header lists the rail strings to inspect; seeded
conversation titles, model names, tool names/targets and message/error content
are deliberately left in their original language. `rail-report.json` records the
header controls' measured bounds, the brand's visible/content widths, the full context
count's text bounds and minimum 24 × 24 px target, and the current
conversation's text contrast on its composed background. A current-list capture
keeps the selected row visible before scrolling the long list. The running/held states go through the fake
engine and the real composer and upload route. `bench/run.sh
bench/scenarios/chat-rail.mjs` also runs one locale/skin through the Docker
bench with a scenario-local scripted stream; it replays the model catalogue and
disconnected MCP identity in the browser because that instance has no engine CLI
or sign-in server configured. Docker is optional; the host matrix uses the real
seeded server and its fake driver.

## The open page follows the agent: `bench/scenarios/page-suivie.mjs`

`npm run build`, then `node bench/scenarios/page-suivie.mjs` (Playwright from the environment, no
Docker). Pictures land in `bench/shots-page-suivie/` (`BENCH_OUT` moves them). Per skin × language it
launches `node bench/launch.mjs --engine fake --seed page-suivie --data <dir> …` and plays the agent
itself: it writes and deletes the page files on the instance's disk, as a real turn would. Reading:
the rewrite shows with no action, the deletion shows E-8; a page of the second store (`?store=famille`)
does the same. Editing: the banner rises, the typed text stays, the user's own save lifts nothing and
raises nothing, **Reload** loads the agent's version, and a deletion gives the banner then E-8 at
**Reload**. With the watch off (`BENCH_WATCH=off` in the seed) neither mode moves. Light and dark,
desk and phone. `BENCH_SKINS`, `BENCH_LOCALES` and `BENCH_SIZES=desk` narrow the run (about 20 s per
variant). The bench no longer assumes the open page stays put: the refresh is the product's.

## Loading and failure of the shell's screens: `bench/scenarios/chargements.mjs`

`npm run build`, then `node bench/scenarios/chargements.mjs` (Playwright from the environment, no
Docker). Pictures land in `bench/shots-chargements/` (`BENCH_OUT` moves them). It launches `node bench/launch.mjs --engine fake --seed base --skin <s> --locale <l>` per
skin and language and, with `page.route`, holds the one read a screen waits for (E-3, E-4, E-9, E-11,
E-13: the loading row must show before the data), then answers it 500 (E-4/E-8, E-11, E-13: message and
Retry, and Retry brings the data; E-3 and E-9: no button). Light and dark, desk and phone. A line per
failed check; success is none. `BENCH_SKINS=alfred,dobby` and `BENCH_LOCALES=fr` narrow the run (about 40 s per skin × language); `BENCH_URL` (with `BENCH_SKIN`, `BENCH_LOCALE`) plays an instance already running.
