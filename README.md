# Adestia

**A self-hosted web interface that pairs a chat with an AI agent and visual Apps —
built on top of coding-agent CLIs (Claude Code, GitHub Copilot CLI, Codex CLI), so a monthly
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

This serves `http://127.0.0.1:8730` and answers 200 on `/`. It leaves `data/` and `workspace/` in that directory: delete them when done. `extensions.pluginsDir` and `skinsDir` (`./plugins`, `./skins`) resolve from the current directory, so from an empty scratch directory the log says `0 of 0 plugin(s) active`: link or copy the clone's `plugins/` and `skins/` there (`ln -s /path/to/adestia/plugins /path/to/adestia/skins .`, or set the two paths in the config) to load them. Without
`CLAUDE_CODE_OAUTH_TOKEN` it still starts: the app is there, but a real agent
turn fails (use the scripted engine below to look at it without one).

### The `web` plugin: a real browser for refused pages

Off until named: `extensions: { tools: [web] }` in `adestia.config.yaml`. The agent then has the browser tools
(minus the three that run code or read local files) and reads a page a plain fetch is refused, through a
headless Chrome started on demand and closed after the turn. The image carries it by default; build without it
with `docker build --build-arg WEB_BROWSER=none .`. Without Docker, install the plugin's one dependency and the
browser it pins, and point the instance at them:

```sh
(cd plugins/web && npm ci --omit=dev --ignore-scripts && PLAYWRIGHT_BROWSERS_PATH=/opt/browsers node node_modules/playwright-core/cli.js install chromium-headless-shell)
PLAYWRIGHT_BROWSERS_PATH=/opt/browsers node packages/server/bin/adestia.js   # with tools: [web] in the config
```

Not yet measured, since pods have no Docker: the image's extra size and whether Chrome's sandbox starts as the
`node` user. Play a real turn on the published image with `bench/web-reel.sh <image>` (see `bench/README.md`).

To look at the app without an agent or Docker (a scripted engine, seeded data):

```sh
npm ci && npm run build               # npm run build also builds the web shell
node bench/launch.mjs --engine fake    # prints `listening on <url>`; <url>/api/health answers ok
node bench/sweep.mjs                   # the screens it lists (not E-35, E-36 or E-37), light and dark, desk and phone
node bench/scenarios/plugins-reglages.mjs   # E-37, Settings → Plugins: list, switch, restart, the plugin appears (needs the build; starts two launchers, the second after a real restart; needs Playwright on the host; images in $BENCH_OUT)
node bench/scenarios/chargements.mjs   # takes several minutes (16 capture combinations); loading and Retry on E-3, E-4, E-8, E-9, E-11, E-13 (needs the build; images in $BENCH_OUT); the plugins' E-25 and E-28 are covered by plugins/*/test/chargement.test.js and, in a browser, by bench/tests/plugins-chargements-besoin.test.mjs, not by this scenario; to see them by hand, start the launcher from the clone's root (the atelier and parcours plugins come from `./plugins`) and open #/atelier or a parcours page
node bench/scenarios/page-suivie.mjs   # the open page follows the agent, B-17 (needs the build; BENCH_SKINS, BENCH_LOCALES narrow it)
node bench/scenarios/hors-ligne.mjs     # stops and restarts a real bench instance: the offline banner E-32 on E-2, E-4 and E-14 (needs the build; images in $BENCH_OUT)
BENCH_URL=<printed-url> node bench/scenarios/pages-matrix.mjs bench/scenarios/galerie.mjs   # the block gallery, E-34: Add block, search, empty search, insertion (needs the build and a launcher on `node bench/launch.mjs --engine fake --seed pages --skin alfred --locale en`, the skin and locale `pages-matrix.mjs` plays with `BENCH_URL`, read from `BENCH_SKIN` and `BENCH_LOCALE`, default `alfred` and `en`; images in $BENCH_OUT). Moving a block (B-23) has no scenario: its proof is `packages/web/test/move-block.test.ts` (the operation) and, in a browser, `packages/web/test/ensemble-pages-deplacer-browser.test.ts` (`Alt+↑/↓`, the long press and drag, the phone buttons)
node bench/scenarios/chat-ajouts.mjs   # the chat's loading, Retry and context-lost line, E-16 (needs the build; seed `chat-ajouts`; about 20 s per skin × language, `BENCH_SKINS` and `BENCH_LOCALES` narrow it, it always plays desk and phone; images in $BENCH_OUT, `bench/shots-chat-ajouts/`)
bench/run.sh bench/scenarios/copy-block.mjs   # the copy box of a reply, E-16 (AD-copie-1): a seeded reply with two copy fences and a sh block, the button then its copied state, light and dark, desk and phone (needs docker and the bench image that `bench/run.sh` builds; without docker, no pictures: `node bench/launch.mjs --engine fake --seed besoin-copie` for the seeded threads without the shots; bench.mjs runs a scenario module in the bench image, see its header)
BENCH_URL=<printed-url> node bench/scenarios/etat-projet-gabarit.mjs   # B-30: New from template → Project status → Create, then the page filled by its forms (needs the build and a launcher on `node bench/launch.mjs --engine fake --seed etat-projet-gabarit`; desk and phone, light and dark; images in $BENCH_OUT)
BENCH_URL=<printed-url> node bench/scenarios/reglages-blocs.mjs   # the block settings E-6 on a `figures` block; `saisie-formulaire.mjs` the same way plays the data form E-35 (each runs alone; needs the build and a launcher on `node bench/launch.mjs --engine fake --seed saisie`; desk and phone, light and dark; images in $BENCH_OUT)
```

The scenarios need Playwright and Chromium installed on the host (the runner image ships Playwright 1.63; nothing in the repo installs them); `BENCH_SIZES` (only where a scenario says so), `BENCH_SKINS`, `BENCH_LOCALES` and `BENCH_OUT` narrow or move a run. It takes them from the environment (it looks in `/usr/lib/node_modules`, then `npm root -g`); the `pages-*` scenarios look only in `/usr/lib/node_modules`, so a host with another global root must link it there for them (`chargements.mjs`, `page-suivie.mjs` and the sweep search both places, as above): `ln -s "$(npm root -g)/playwright" /usr/lib/node_modules/playwright`); do not
add them to the repo. The launcher runs until SIGTERM (`kill <pid>`, or Ctrl-C), which
removes its throwaway data; in a script, start it in the background and keep its pid
(`$!`). Run it from the clone's root: the bundled plugins are found through `./plugins`, and from elsewhere the server starts with `0 of 0 plugin(s) active`. The seed brings its own two small plugins (`bench-notes`, `bench-degraded`), so the boot log says `2 of 2 plugin(s) active` (`3 of 3` with `--seed pages`, which adds `project-management`), not the eleven of `plugins/`: that is normal. Its boot log includes two plugins refused on purpose (`bench-refused`, a name mismatch, and `bench-invalid`, an invalid manifest; both part of the seed): not an error.

`--engine claude` runs a real turn instead (needs `CLAUDE_CODE_OAUTH_TOKEN`).
For the pages state matrix (four skins, both languages, both themes, desktop
and phone), run `node bench/scenarios/pages-matrix.mjs` after the build (without argument it captures `pages-states.mjs`); the pictures land in `bench/shots-pages/` (`BENCH_OUT` moves them) and success is the list of captures with no error. Pass
`bench/scenarios/pages-editor.mjs` as its argument for the editor states;
`node bench/scenarios/pages-editor-narrow.mjs` checks the 360 px layout (it prints `overflow=0` per state).

See [bench/README.md](bench/README.md). The map of the code, the decisions (AD-n) and the
needs and screens they cite (B-n, P-n, E-n: `docs/parcours.md`, `docs/ecrans.md`; the Q-n are the numbered audit list in the « Known incoherences » section of `docs/ecrans.md`) are in
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
- **Folder settings in `.folder.md`**: a folder's title, icon, colour, owning plugin (`app`), attachments switch and replacement page (`page`) live in `<folder>/.folder.md`, front matter only. The server reads it into the page index (`folderSettings`), `PUT /api/folders/settings` and the agent's `folder_settings` tool write it, and the file never shows as a page, a count or a file. `INDEX.md` and `<folder>/<folder>.md` are ordinary pages. The Attachments brick is switched off today by `attachments: false` in that file (or by the agent's tool); the settings screen (E-39) is a later slice; see `docs/donnees.md`, *What `adestia-dossiers` changes*.
- **A + to create**: beside Ask on the home and in the header of a folder, it lists what can be
  created here. That is **New folder** (a name reduced to a slug, then the empty folder, which shows as a tile)
  and one line per creation an enabled plugin declares in its manifest (`creations`): Project status,
  Journal and Liste de tâches for the official plugins; turning a plugin off removes its line. Nothing is offered where the folder is read-only. To see it:
  `npm run build`, then `node bench/launch.mjs --engine fake --seed plugins` (the seed that enables the official plugins).
- **Pages both hands write**: markdown files with a closed vocabulary of typed
  blocks, edited in a Notion-like editor or by the agent with its own file
  tools. One grammar renders, edits and validates them, so a save cannot change
  what a page means. In editing, a block moves with the **Move up** / **Move down** buttons, `Alt+↑/↓`
  or a long press on its grip then a drag, and **Add block** (or **Browse** in the `/` menu) opens a gallery
  of the core blocks and those of the enabled plugins. A block's settings (gear) offer its look as small pictures, and **Edit data** opens a form to add, reorder and remove the rows of a `figures`, `timeline`, `list` or `table` block (**Raw** shows the lines; see `docs/ecrans.md`, E-6 and E-35). A save is refused if the agent wrote underneath you. The page you have open follows the
  agent: in reading it refreshes by itself; while you edit, a banner "The page changed." offers
  **Reload** and never touches what you typed (nothing moves if `workspace.watch.enabled` is false).
  Home shows a loading row
  while the plugins and page index arrive; pages, their editor and properties
  use shared controls and the instance language (English or French).
  A page's other files — the plan as a PDF, the photo of the dish — sit next to
  it on disk, display in it, and are listed under it as attachments; a folder's own files (and those of its `assets/`) form an **Attachments** brick in its view, except the data files an enabled plugin declares (a disabled plugin hides nothing) (`dataFiles` in its manifest). What a
  page's status says is finished folds away rather than crowding the live ones.
- **Extensions at runtime**: drop a plugin folder in, name it in the config
  (or switch it on from Settings → Plugins, which writes the same file),
  restart. No image rebuild. Shared React comes from the page's import map;
  the shell owns the stylesheets; a broken plugin costs its own view and says
  why.
- **Three engines** behind one contract — Claude Code, GitHub Copilot CLI and
  Codex CLI. The interface is built from declared capabilities and never from
  a driver's name, so the second and third engines changed no UI code.
- **Settings as an app**, not a dialog over whatever you were reading: its own
  tile, its own address, one page per subject — the agent's credential (armed
  from the interface, held server-side at 0600 and never sent to a browser),
  the MCP servers and what each is doing, the plugins the instance found (switch
  one on or off, then restart), the theme, and the instructions you
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
- **Copy boxes in the chat**: when the agent writes a text for you to paste elsewhere (an email, a message), it sets it in a fenced block `copy`; the reply draws a framed box with a copy button (`copy-block` skill, AD-copie-1). Any other code block, and a `copy` block on a page, stays plain code.
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
  that says "ignore your instructions" is reported, not obeyed. Pasting
  spreadsheet cells puts a Markdown table in the message instead of the
  picture of the selection; a screenshot pasted alone is still attached.
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

The cap is set from the Settings screen (field "Simultaneous turns", 1 to 16; the table stops
at 8, so size 16 by the same 300 MB a turn) or in `maxConcurrentTurns` of the config file. It
applies at the next restart, not live. Under Docker with the read-only config mount above, the
screen cannot save it: edit the file on the host.

Set the `limit` from the table, not from what the pod uses at rest: an idle
Adestia is a few hundred megabytes, and it is the burst that kills it. Raise
`maxConcurrentTurns` and the memory limit together, never one alone.

## Screen-test duration, before and after

The tests that load a page in a browser take about 100 minutes, one file after the other (the whole attested
suite plays only two of the `bench/tests` files and runs vitest in parallel, so ~35 minutes, `.sdlc.yaml`: the two figures are not comparable). What is not display is now also proved by tests without a
browser (`docs/tests-ecran/`), but **no screen test has been lightened or removed yet**: the lines classified
`effet` or `scindé` all say `gardé` in the column « À l'écran » (none says `allégé` or `retiré`). The lightening comes after, test by test, once its
out-of-screen test is replayed. The figures below are therefore two measures of the same screen tests: their
difference (about 4 minutes in all, -206 s to +190 s per cluster) is the spread between two runs of unchanged tests, not a gain per cluster. Seconds are the
rounded sum of each file's measured time, so they can differ by one from `avant.md`.

| Cluster | Before (`main`, `docs/tests-ecran/avant.md`) | After (measured on the feature branch, screen tests unchanged) | Difference |
|---|---|---|---|
| web-chat-charte | 1297 s (21 min 37 s) | 1295 s (21 min 35 s) | -2 s |
| web-hors-ligne-acces | 282 s (4 min 42 s) | 252 s (4 min 12 s) | -29 s |
| web-mcp-pages | 454 s (7 min 34 s) | 372 s (6 min 12 s) | -81 s |
| bench-chat | 583 s (9 min 43 s) | 378 s (6 min 18 s) | -206 s |
| bench-pages | 1523 s (25 min 23 s) | 1426 s (23 min 46 s) | -97 s |
| bench-plugins-shell | 1222 s (20 min 22 s) | 1413 s (23 min 33 s) | +190 s |
| serveur | 900 s (15 min 0 s) | 873 s (14 min 33 s) | -27 s |
| **total** | **6260 s (104 min 20 s)** | **6009 s (100 min 9 s)** | **-252 s** |

- **Command**: `node scripts/mesurer-tests-ecran.mjs --sortie <dir>` after `npm ci` and `npm run build`, one file at a time,
  the attested suite's options (`BENCH_FULL_SWEEP=1 ADESTIA_PATIENCE=4`, `--maxWorkers=1` for vitest, `node --test` for `.mjs`).
  The time is that of the whole command, startup included. `--grappe <name>` measures one cluster.
- **Machine**: a pod of 18 cores (`nproc`) with Playwright and Chromium, like `avant.md` (any machine with 18 cores, Playwright and Chromium gives comparable figures).
- **Same reds as before**: the files that were red or skipped on `main` still are (listed in `avant.md`); their time is
  counted anyway, and the command then exits 1 while still printing the table (expected on `main`; `avant.md` lists the causes). Per-file times: `docs/tests-ecran/avant.md`; the screen tests kept are the display ones.

## Publishing the image

Pushing a `v*` tag runs `.github/workflows/docker-publish.yml`, which publishes
`ghcr.io/antorfr/adestia`. A stable build usually takes about 5 minutes; each job is
capped at `timeout-minutes: 120`, so a frozen build is cut after 120 minutes and can
be replayed, instead of blocking the delivery until the forge's own 360-minute limit.

## Status

**Early, and running.** The screens are checked in a real browser (`bench/`) and
the agent drivers against real CLIs, not only by tests; which version each deployment
runs is not recorded here; the ⚙ menu shows it: an image says its own (`ADESTIA_VERSION`), an installation from the sources the last `## vX.Y.Z` heading of `CHANGELOG.md` (a branch shows its own, with no suffix), and nothing if neither exists. Pushing and pulling the workspace's own instructions
to a remote is still unbuilt (catalogues above only read repositories).
Concurrency measurements are recorded in `spikes/concurrency/REPORT.md`.
See [.agent/status.md](.agent/status.md) for current defects and unfinished work,
[CHANGELOG.md](CHANGELOG.md) for release history, and [DESIGN.md](DESIGN.md) for
the principles and decision log.

## Contributing

Node 22 or later (`engines` in `package.json`). After `npm ci`, check that
`node_modules/micromark-extension-directive` exists **and is not empty** (`ls node_modules/micromark-extension-directive/package.json`): a missing grammar shows as
escaped `\:::` in the content tests, and looks like a serialiser bug
(`CLAUDE.md`).

```sh
npm ci
npm test          # no account or network needed; takes 7 minutes or more (the browser suites dominate), so do not cut it short; the browser suites time out at 5 s when the machine is busy (the attested suite plays them with `ADESTIA_PATIENCE=4`, which scales their waits, and `--testTimeout=30000`; set both yourself on a loaded machine: `ADESTIA_PATIENCE=4 npx vitest run --testTimeout=30000`; `ADESTIA_PATIENCE` is an integer, 1 by default, that multiplies the waits of the tests that import `patience()`): a red `Test timed out` is a load symptom, so rerun that file alone (`npx vitest run <file>`) and run `npm run test:plugins` by itself after a red vitest, since `npm test` chains it behind vitest and skips it on a failure; the catalogue screens suite builds the shell on first run and skips (npm test stays green) when Playwright is not found through require/NODE_PATH, then `npm root -g`
npm run typecheck
npm run lint      # part of the attested suite (`attester --publier`, see CLAUDE.md)
npm run build
```

While working, play the local level instead of the whole suite: `scripts/suite-locale.sh` (about 10 minutes: install,
typecheck, lint, vitest without the browser test files, plugins; no build, guards or boot), and
`scripts/rejouer.sh "<test name>"` to replay named tests only (names as `resultats.xml` of an earlier run carries them, `<file> > <describe> > <test>` or just the test name; `etape > lint` replays a step; it needs `npm ci` first, and fails on a name that matches no test).
Both write `resultats.xml` with the suite's test names. `scripts/suite-attestee.sh` (about 35 minutes) stays the proof (AD-preuve-1; the local level, AD-preuve-5). `local:`, `rejouer:`, `ecrans:` and `fiche:` are read by the chain on `main` only (they take effect after the merge); the scripts themselves run anywhere.

Between the local level and the suite sit two levels that play only the screen tests of the screens the work
touches (AD-niveaux-1 to 3): `node scripts/niveaux.mjs ecrans <base>` plays those screen tests alone (`scripts/suite-ecrans.sh`: the server and web builds, then one vitest run on exactly the files listed, space-separated, in the environment variable `ADESTIA_JOUER_ECRANS` (`niveaux.mjs ecrans` sets it from `--liste`; unset or empty, the script plays nothing); no typecheck, lint or plugins, and no install of its own: run `npm ci` first when you play it by hand, the chain does it through `installation:`),
`fiche` plays the whole suite minus the screen tests of untouched screens, and
`node scripts/niveaux.mjs --lister ecrans|fiche <base>` prints what each would play and plays nothing (no `npm ci` needed: the script reads imports with its own scanner, as `--verifier` and `--liste` do); `node scripts/niveaux.mjs --liste ecrans <base>` (the chain's `ecrans_liste`) prints only the sorted screen-test files `ecrans` would play, one per line, nothing when only docs changed. With an empty change (`<base>` = `HEAD`), or a server-only or doc-only one, no screen is touched: `ecrans` installs, builds and plays nothing, writes a `resultats.xml` with zero test cases, prints `1..0` and exits 0 (a `vide` run for the chain); `fiche` still plays the files that drive the whole shell. A screen-test file that `scripts/ecrans.json` does not declare is always played (AD-niveaux-2), so on a tree where `--verifier` is red for such a file, even an empty change plays it. That is the case of `main` today (`--verifier` exits 1: `besoin-coller-tableau-browser`, `besoin-copie-bords-browser`, `besoin-copie-browser`, `besoin-lanceur-port` and `charte-browser-lanceur` are undeclared), so `--lister ecrans HEAD` lists those five and an empty change builds and plays them rather than printing `1..0`; `.agent/status.md` says the same. The local level is `scripts/suite-locale.sh` alone and always leaves the screen files out.
`.sdlc.yaml` declares the install once (`tests.installation: npm ci`, played by the chain before `ecrans:` and `rejouer:`, which no longer start with `npm ci &&`; `scripts/rejouer.sh` assumes it is done) and the selection and play tooling (`tests.outillage`: `niveaux.mjs`, `ecrans.json`, the `suite-*` scripts, `rejouer.sh`, `rejouer-plan.mjs`), taken from `origin/main` so that a branch cannot lighten its own level.
`<base>` is a commit, the fork point from `main` (`git merge-base origin/main HEAD`); the changed files are `git diff <base> HEAD`, read against `scripts/ecrans.json`. Measured
on a throwaway clone with its install done (`ecrans` figures: the pod that built this level, 2026-11-18, `npm ci` not counted, as the chain now plays `installation:` apart; `fiche` figures: the earlier machine below), one commit on top of `<base>` (Intel i5-13500, 18 threads, an idle machine, faster than the chain's pod, so these figures sit below the `~10 min` of the local level measured there;
`npm ci` adds 14 s; the chain's pod is slower, the suite takes about 35 minutes there):

| `<base>` → the change | screens touched | `ecrans` | `fiche` |
|---|---|---|---|
| a screen file (`packages/web/src/app/McpServers.tsx`) | the screens whose page imports it | 12m40s | 14m59s |
| a shared file (`packages/web/src/app/useRoute.ts`) | all (33 when measured, 35 today) | 20m34s | 21m22s\* |
| server only (`packages/server/src/app.ts`) | none | 0m01s (under a second: nothing installed, built or played) | 9m30s |

Some paths that the import graph cannot place are placed by name (AD-ecrans-places-1 to 6), so that they no longer play every screen: `plugins/web/**`, `plugins/README.md`, `Dockerfile`, `bench/**/*.md` and the bench scenarios, tests and shell scripts touch none; the root `package.json` touches E-15 if its `version` field changes (it has none today: the version the menu shows comes from `ADESTIA_VERSION` or `CHANGELOG.md`, which is off-screen),  none for its metadata fields, every screen otherwise; `scripts/ecrans.json` touches the screens whose entries, folders or tests it changes; `components.css` touches the screens whose sources cite the class block of a changed rule; `packages/web/src/app/i18n.ts` touches the screens citing a changed key. What a place does not understand (an unparsable file, a change in the code of `i18n.ts`, a rule or a key cited by no screen) plays every screen, as does the bench runtime (`launch.mjs`, `fake-engine.mjs`, `oidc-stub.mjs`, `sweep.mjs`, `bench.mjs`, `bench/seed/`, `bench/lib/`) and any other bench file not named (`restart-loop.mjs`, `bench/Dockerfile`, `reader-equivalence.mjs`…). `node scripts/niveaux.mjs --lister ecrans <base>` shows the result; it reads `git diff <base> HEAD`, so commit your change first and pass `HEAD~1` to try it on the last commit (uncommitted edits are not seen).

`ecrans_liste` (`node scripts/niveaux.mjs --liste ecrans <base>`, no install, no `node_modules`) answers in about 0.5 s on that machine whatever the change (one `git diff`, one walk of the import graph).

The first row was measured before `Canvas.tsx` (E-20) and `App.tsx` (E-32) were declared as entries, so it did not count the screen tests of those two screens; a change to `McpServers.tsx` now plays them too, and the figure is a little higher.

\* A shared file leaves no screen test aside, so `fiche` played the whole suite there: 21m22s is the suite's own
duration on this machine. That run ended with one red, `besoin-hors-ligne-bords` (the « B-19 » 502 case), which passes
alone (4/4 in 17 s): a timing flake under load, unrelated to the change, not a level's fault.

A test that loads a page in a browser checks what the user sees; what the server does is proved by its route, without a browser. Every screen test is classified in `docs/tests-ecran/` (rule: `docs/tests-ecran/README.md`; AD-ecran-1), and `node scripts/tests-ecran.mjs` checks the inventories. A new browser test file joins a cluster there, or that check fails.

The web shell dispatches screens in `app/Canvas.tsx`; `CanvasHeader.tsx` owns the
breadcrumb and phone return. `Home.tsx` composes `Brief` and `Domains`; the page
editor delegates saving to `editor/useAutosave.ts` and reading to `editor/reader/`.
Shared path rules and requests live in `app/paths.ts` and `app/request.ts`.

Every driver is exercised against a fake binary, which is a property of the
driver contract rather than a convenience: a driver whose behaviour is only
testable against a live account is a driver tested by its first user.

Work happens in an isolated git worktree and comes back to its target branch (`main`, or the
integration branch of an epic) before it is tagged there. `CLAUDE.md` covers the install traps of a worktree, how to commit, and
when to look at the interface.

## License

[MIT](LICENSE)
