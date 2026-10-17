# Adestia — architecture

> Product documentation. On `epic/adestia-qualite`, the target of the epic's framing; on
> `main`, exactly what is built. Stable identifiers, never renumbered: `B-n` (needs), `P-n`
> (journeys, `docs/parcours.md`), `E-n` (screens, `docs/ecrans.md`), `AD-n` (decisions,
> this file), `R-n` (refactoring targets, this file).
>
> Written by the epic `adestia-qualite` (2026-10-15), a quality pass that changes **no
> behaviour**. Decisions taken BEFORE this epic live in `DESIGN.md` › Decision log, which is
> not renumbered; `AD-n` starts at `AD-1` with this epic. The map below is the code at
> v0.88.0.

## Overview

Adestia is a self-hosted web shell around a coding-agent CLI (Claude Code, Copilot CLI,
Codex CLI). The subscription pays for the agent; the shell gives it a chat, a workspace of
markdown pages it shares with its people, plugins and skins dropped into folders, scheduled
turns, and an inbound MCP door for other agents. One Node process serves one instance: a
Fastify server, a React shell built by Vite, and one driver spawning the CLI per turn.

## Map

### Packages

npm workspaces under `packages/`, each `@antorfr/adestia-<name>`.

| Package | Single responsibility | Imports |
|---|---|---|
| `content` | The markdown grammar: unified/remark pipeline, `:::` directives, block vocabulary, frontmatter read/write, field and reference syntax, validation | nothing of ours (leaf) |
| `drivers` | The driver contract (`contract.ts`) and the three adapters `claude-code/`, `copilot-cli/`, `codex-cli/`; `AskDesk`, signatures, MCP OAuth helpers | nothing of ours (leaf) |
| `schemas` | Plugin and skin manifests (`parsePluginManifest`, `parseSkinManifest`), wire types (`protocol.ts`), the settings catalogue (`settings.ts`) | nothing of ours (leaf) |
| `server` | The instance: boot, HTTP API, turns, auth, extensions, MCP in and out, schedule | `content`, `drivers`, `schemas` |
| `web` | The shell: SPA/PWA, chat, block editor, plugin loader | `content`; `schemas` and `drivers` as types only |

The server never imports `web`: `start.ts` › `findWebRoot` looks for
`packages/web/dist-web/index.html` on disk, and without it serves the API only.

Outside `packages/`:

- `plugins/` — the bundled plugins (todo, journal, planif, atelier, parcours, meals,
  voyages, scan, listening-post, project-management), plain ESM with an
  `adestia-plugin.json` manifest; tests under `plugins/*/test` and `plugins/test`.
- `skins/` — four bodies (alfred, dobby, nestor, skippy): `adestia-skin.json`, `skin.css`,
  an optional `skin.js` module, icon, web manifest fragment.
- `skills/` — the product's authoring contracts (`plugin-author`, `skin-author`,
  `page-author`, `persona-author`, `schedule-author`, `collections`), delivered to the agent.
- `bench/` — screenshot bench: `run.sh` builds the image and drives Chromium in docker,
  `bench.mjs` and `scenarios/`; `live-codex.sh` boots a real Codex engine. Without docker:
  `launch.mjs` (fake or real engine), `fake-engine.mjs`, `seed/`, `oidc-stub.mjs` and `sweep.mjs`
  (see the AD-2 and AD-3 detail below).
- `spikes/` — validation record (editor, concurrency, copilot-cli, codex-cli, esm-runtime,
  shell-tools-transport); not linted, not shipped.

### Server modules, by concern

`packages/server/src`, flat, with `routes/` and `config/` subfolders. Entry: `bin/adestia.js`
(owns the restart loop), `index.ts` (re-exports), `start.ts` › `start`, `app.ts` › `buildApp`.

- **Auth / OIDC** — `auth.ts` (`resolveIdentity`, `isPublicRoute`, modes `none|oidc|proxy`),
  `oidc.ts`, `oidc-routes.ts` (`registerOidc`, session cookie hook), `user-tokens.ts`
  (`UserTokens`, per-user rebound tokens), `routes/identity.ts` (`identityOf`).
- **Conversations and turns** — `turns.ts` (`TurnDesk`: admission, chaining, the single
  spawn site), `routes/turns.ts` (`registerTurns`, SSE, `sseFrame`), `conversations.ts`
  (`ConversationStore`, JSONL transcripts), `routes/conversations.ts`, `introduction.ts`
  (`frameShell`, the preamble), `screen.ts`.
- **Drivers and arming** — `drivers.ts` (`buildDriver`, `AVAILABLE_DRIVERS`), `secrets.ts`
  (`SecretStore`, `ArmingFlows`), `routes/arming.ts`.
- **MCP inbound and delegations** — `mcp-in.ts`, `mcp-routes.ts` (`registerMcp`, `/mcp`),
  `delegations.ts` (`DelegationChannel`), inline `/api/delegations` routes in `app.ts`,
  `callback.ts` (`registerCallback`, `/callback`).
- **MCP outbound** — `config/mcp.ts`, `mcp-store.ts` (`McpStore`, the shell-written layer),
  `mcp-signin.ts` (`McpSignIn`), `mcp-refresh.ts` (`FileRefreshStore`), `background.ts`
  (`BackgroundReach`), `routes/mcp-servers.ts` (`outboundServersOf`).
- **Schedule** — `schedule.ts` (`parseNote`, `isDue`, `stampField`), `clock.ts` (`Clock`).
- **Plugin host and extensions** — `extensions.ts` (`discoverPlugins`, `discoverSkins`,
  `registerPluginVocabulary`, `mcpServersFor`), `sources.ts` (`fetchSources`, git clones),
  `plugin-host.ts` (`runSetups`, `mountPluginApis`), `static.ts` (`registerStatic`).
- **Instructions and skills** — `skills.ts` (`collectSkills`, `deliverSkills`,
  `deliverAgents`, `MANAGED_MARKER`, `stamped`), `instructions.ts`,
  `routes/instructions.ts`, `instruction-catalogues.ts` (scan, `copyMarkedTree`),
  `instruction-catalogues-store.ts`, `instruction-catalogues-refresh.ts`,
  `routes/instruction-catalogues.ts`.
- **Pages, files, stores, watch** — `stores.ts` (`resolveStores`, `pagesService`,
  `foreignRoots`), `pages.ts` (`registerPages`, also `parseFrontmatter`, `splitFrontmatter`,
  `titleOf`), `files.ts` (`registerFiles`), `watch.ts` (`registerEvents`, `/api/events`),
  `io.ts`.
- **Config and settings** — `config.ts` (`parseConfig`, `ConfigError`, env overrides),
  `config/types.ts`, `config/values.ts`, `settings-file.ts`, `routes/settings.ts`,
  `routes/restart.ts`, `routes/instance.ts` (`/api/instance`, `buildVersion`).
- **Attachments** — `attachments.ts` (`AttachmentInbox`, `inboxDir`), `routes/upload.ts`.
- **Shell tools** — `shell-tools.ts` (`ShellToolsService`: `rename_conversation`, `new_id`,
  `find_pages`, unix socket plus bridge script).
- **PWA** — `webmanifest.ts` (`baseManifest`, `mergeSkinManifest`, `withInstanceName`),
  served by `static.ts`.

### Web areas

`packages/web/src`:

- `app/` — the shell: `App.tsx`, routing (`useRoute.ts`), home, sections, settings screens
  (`Settings`, `Configuration`, `Instructions`, `McpServers`, `Delegations`, `Preferences`),
  `Problems.tsx`, skin slot (`skin.ts`, `SkinSlot.tsx`), `i18n.ts`, `tokens.css`, `shell.css`.
- `chat/` — `Chat.tsx`, `Composer.tsx`, `useConversations.ts`, `stream.ts` (SSE client),
  `Signatures.tsx`, `tabs.ts`.
- `editor/` — Milkdown editor (`Editor.tsx`, `milkdown.ts`, `blockview.tsx`), `Reader.tsx`,
  page settings and listing helpers.
- `plugins/` — `contract.ts` (the plugin front-end contract, `PluginApi`), `loader.ts`,
  `words.ts` (plugin word tables), `Boundary.tsx`, `PageEditor.tsx`.
- `sw/` — the service worker (`sw.ts`, `policy.ts`, `register.ts`).

### Boot sequence

`start()`, in order: `loadConfigFile` → umask → workspace created if missing →
`resolveStores` → `fetchSources` → `discoverPlugins` / `discoverSkins` →
`registerPluginVocabulary`, `claimedTypeCollisions` → web manifest merge → `McpStore` primed,
`mcpServersFor` → `AskDesk` (ask posture) → `buildDriver` (or `driverFactory`) →
`ShellToolsService.start` → `interactivePermissions` check → stored credential loaded →
`runSetups` → if `skillsPath`: `collectSkills`, `deliverSkills`, `deliverAgents`,
`refreshCataloguesAtBoot` → `findWebRoot` → `UserTokens` → `buildApp` → `listen` → `Clock`.
Every problem before `listen` is either a boot-log line or a `ConfigError` that refuses to start.

### Driver contract

`packages/drivers/src/contract.ts`: `Driver` (`describe`, `env`, `runTurn`, and optional
`skillsPath`, `agentsPath`, `acceptsRoots`, `instructionPaths`), `TurnRequest`, `TurnEvent`.
Optional features are declared in `DriverDescriptor.capabilities` from `CAPABILITIES`;
`CAPABILITY_METHODS` names the interface each obliges (`AuthManagement`, `ModelSelection`,
`SubscriptionQuotas`, `McpStatus`) and `CAPABILITY_REQUIRES` their dependencies.
`conformance.ts` › `checkConformance` checks a driver against its descriptor (used by tests
only). `managed-credential.ts` › `ManagedCredential` holds the armed secret the same way in
all three drivers. One instance runs ONE driver: `config.driver.id` picks it in `buildDriver`,
and every turn — chat, scheduled, delegated, callback wake — goes through the one `TurnDesk`.

## Invariants

- **One instance = one agent, one workspace, one subscription.** One `driver.id`, one
  `workspace.root`, one stored credential per driver id.
- **The agent and the people edit the same markdown.** Pages are files under the stores;
  the agent uses its own file tools, the shell uses `/api/pages`; no database, no MCP
  indirection for the agent's own memory.
- **A skin is a declaration of tokens, never structural rules on the shell** (header of
  `tokens.css`). Structural rules in a skin's `skin.css` apply only to markup its own
  module draws (hero, crest, console band). Stated, not enforced by code.
- **A plugin is self-contained.** It receives the shell through `PluginApi` and imports
  nothing of the shell; its helpers (`address.js`, word tables) are copied on purpose (AD-8).
  Since this epic, the shell's tokens and a small documented set of component classes
  (button, sheet, empty state, field) are part of the plugin contract, additive and
  versionless like the tokens already are (AD-4); a plugin uses them by class name, still
  without importing shell code.
- **No route distinguishes owner from user.** No role check exists in the server: every
  identity the auth hook resolves may call every `/api` route.
- **The config file is the single source of truth.** The settings screen writes it in
  place through `settings-file.ts` (yaml document API, comments kept), only keys declared by
  `SETTING_GROUPS`; environment variables override secrets and deployment values.
- **Delivered skills are stamped and rewritten at every boot.** `stamped` adds
  `MANAGED_MARKER`; `deliverSkills` removes only marked files no longer delivered, and
  spares catalogue imports.
- **No schema version or migration exists for data files** (conversations, `mcp-servers.json`,
  secrets, schedule state, catalogue state), so their formats are byte-stable; the reference
  is `docs/donnees.md`. Manifests alone carry `schemaVersion`.
- **Nothing durable outside `dataDir`, the workspace and the config file** that the product
  writes. Copilot and Codex homes live under `dataDir`; the claude-code engine inherits the
  process environment and keeps its own session files in its default home. The shell-tools
  socket may fall back to the OS temp directory (not durable).
- **One spawn site.** Every turn goes through `TurnDesk`, under one `TurnLimiter` cap.

## Boundaries

- **Server / web** — HTTP JSON and SSE (`/api/events`, turn streams) only; the web bundle
  is static files. Shared shapes are `schemas` types, imported type-only by the web.
- **Core / driver** — the `Driver` contract. The core owns secrets and writes skill files;
  a driver only names paths (`skillsPath`, `agentsPath`) and how to hand secrets over (`env`).
- **Shell / plugin** — `web/src/plugins/contract.ts` on the front; on the server
  `plugin-host.ts` mounts each plugin's `api.mjs` under `/api/plugin/<id>/`, behind the
  same auth hook, and hands it only the secrets its manifest declares (`secretsFor`).
- **Shell / skin** — CSS custom properties on `:root[data-skin=<id>]`, plus an optional
  module mounted in `SkinSlot`. **TARGET** (AD-5): the shell also hands that module the
  instance's locale, an extra optional input; a skin that ignores it works unchanged.
- **Instance / calling agent** — `/mcp`, mounted only when `mcp.enabled` and `mcp.token` are
  set, gated by that bearer; delegations run in their own `DelegationChannel`, never in a
  person's conversations. `/callback` grants nothing and verifies with the peer.

## Cross-cutting

- **Errors** — at boot, `ConfigError` refuses to start; extension refusals are
  `DiscoveryProblem`s (with an optional `code` and `params`), logged and reported by
  `/api/instance`, and drawn in the shell's Problems band (`app/Problems.tsx`, one sentence
  per code). A route answers `{ error }` with an HTTP status.
- **Logging** — one `log(message)` function from `start()` (default `console.log`), threaded
  into modules; Fastify's own logger is off.
- **Configuration** — `config.ts` › `parseConfig` (YAML, `${VAR}` substitution, `ADESTIA_*`
  env overrides, unknown keys refused); the editable subset is `schemas/src/settings.ts`
  › `SETTING_GROUPS`.
- **i18n** — `app/i18n.ts` (`Locale` `en|fr`, `translator`, `resolveLocale`); plugins ship
  their own word tables, resolved by `plugins/words.ts`, and `plugins/test/words.test.js`
  checks every bundled plugin's French entries. Skins have no words through the locale today.
- **Tests** — `vitest.config.ts` runs `packages/*/test`, aliasing every `@antorfr/*` to its
  `src/index.ts`; `npm run test:plugins` runs `node --test` over the plugins; `bench/` is the
  visual check (`bench/run.sh` with docker; `bench/launch.mjs` and `bench/sweep.mjs` without). CI (`.github/workflows/ci.yml`) runs typecheck, tests, the build, a start of the built server and a docker image build (not lint).

## Decisions of adestia-qualite

### AD-1 — No behaviour change
Every refactoring keeps routes, API shapes, configuration keys, file formats
(`docs/donnees.md`) and MCP tools. The existing suite is the witness; a refactoring with no
test around it gets a characterization test first. A defect found on the way is written in
this file's « Known defects », not fixed.
*Why*: a quality pass is reviewable only if its diff means "same thing, written better".
*Rejected*: "fix while we're there" — it mixes a behaviour change into a diff nobody reviews
as one. *Reversed if*: a defect blocks a refactoring outright; it then becomes its own feature.

### AD-2 — A launcher on the fake engine, outside the product
One term: **the fake engine**, a scripted fake driver handed to the server through
`start({ driverFactory })`. Built (B-2): a script under `bench/` (`bench/launch.mjs`) starts the server on the fake engine
with a seeded workspace and data directory; the real-Claude mode is the plain binary with
`CLAUDE_CODE_OAUTH_TOKEN` in the environment.
*Rejected*: a `fake` driver id in the configuration (a product surface added for tests);
the docker bench only (night agents have no docker). *Reversed if*: `start()` stops
accepting `driverFactory`.

### AD-3 — Captures without docker
The bench's Playwright is resolved from the environment (the runner image ships Playwright
1.63 and Chromium under `/opt/ms-playwright`, global npm root), against the local launcher;
`bench/run.sh` with docker stays for machines that have it.
*Rejected*: Playwright as a devDependency — its browser revision would not match the one
installed, and it downloads browsers on every dev machine. *Reversed if*: the runner image
stops shipping Playwright.

#### Detail of AD-2 and AD-3 — the bench launcher (tranche `adestia-qualite-banc`)

- **Launcher.** `node bench/launch.mjs [--engine fake|claude] [--skin <id>] [--locale en|fr]
  [--seed <name>] [--port <n>] [--data <dir>]`. It needs a built server (`npm run build`) and
  prints `listening on <url>` once `/api/health` answers `ok`; it runs until SIGTERM and removes
  its throwaway workspace and data directory (under `os.tmpdir()`, unless `--data` is given).
  `--engine fake` calls `start({ configPath, cwd, driverFactory })` with the fake engine;
  `--engine claude` starts the plain binary (`packages/server/bin/adestia.js`) with
  `CLAUDE_CODE_OAUTH_TOKEN` taken from the environment, and refuses to start without it. It also
  deletes the placeholder credential the seed stored (`secrets/claude-code.token`): the Claude
  driver prefers a stored credential to the environment.
  The `oidc` seed requires the fake engine: the launcher refuses it with real Claude before
  loading the seed, whose local identity provider disables TLS certificate verification.
  Nothing is added to the product: no configuration key, no driver id (AD-1, AD-2).
- **Fake engine.** `bench/fake-engine.mjs` is a `Driver` (`packages/drivers/src/contract.ts`)
  whose `runTurn` answers by script: the last user message is matched against an ordered list
  of `{ when, events }`, the events being `TurnEvent`s (text deltas, tool use and result,
  permission request, error); no match echoes the message. Deterministic: no clock, no random
  id, no delay unless a script asks for one. The scripts that seed the chat states of
  `docs/ecrans.md` live beside the seeds.
- **Seeds.** `bench/seed/<name>.mjs` default-exports `async ({ workspace, dataDir, base, port, onClose }) => config`:
  it writes pages, thread files, plugin data and `.mcp` entries the way the product itself
  stores them (`docs/donnees.md`), and returns the YAML of the instance configuration. Seeds are
  data written to disk, never a route added or a mock of a module. One seed per instance
  configuration the screens need (`docs/ecrans.md`, "Seeded data for captures"): `base`,
  `empty`, `config-writable`, `config-readonly`, `oidc` (with a stub identity provider,
  `bench/oidc-stub.mjs`, so E-1's sign-in and refused gates are real), and `plugins`.
  A seed may also export `scripts` (fake-engine answers, `bench/seed/_scripts.mjs`), `engine`
  (MCP health and credential state the fake engine reports), `config` (`file: writable |
  readonly | none` — `none` is answered 404 on `/api/settings` by the launcher, since `start()`
  always has a `configPath`) and `ready({ url })` (the turns that must be running). The seeds
  are checked by `bench/seed/check.mjs`, which names each measure in default.
- **Sweep.** `node bench/sweep.mjs [--skin <id>] [--locale en|fr] [--out <dir>] [--only E-n]`
  starts, for each seed it needs, the launcher as a child process, and drives Chromium from the
  environment: Playwright is imported from the global npm root (`npm root -g`), never from the
  repository (AD-3). It captures each screen at 1440×900 and at a 390×844 touch viewport, in
  `light` and `dark`, to `<out>/<skin>/<E-n>-<name>-<theme>-<viewport>.png` (default `<out>` is
  `bench/shots-sweep`, ignored by git). A screen table in the script lists, per `E-n`, the
  route, the gesture that opens it and the **selector that proves it is that screen**; a capture
  whose selector is absent, or that shows `.adestia-fatal` or a loading state, fails the sweep
  and names the screen. The sweep exits non-zero on any failure and prints a count.
- **docker.** `bench/run.sh` and `bench/bench.mjs` are untouched except that the Playwright
  import falls back from `/usr/lib/node_modules` to the global root. Scenarios keep working.

### AD-4 — The charter extends the inherited livery
The base palette is the one inherited in `tokens.css` (decision of 2026-08-24). Failing
contrasts are fixed by lightness only, or by a `*-text` twin token; the dark palette is
written once; one type scale, one radius set; icons are Lucide, bundled; shared components
are first CSS classes of the shell (so vanilla-JS plugins can use them), with thin React
wrappers in the shell. The tokens and a small documented set of these classes (button,
sheet, empty state, field) become part of the plugin contract, additive and versionless like
the tokens already are; a plugin still imports no shell code. The `plugin-author` skill
(`skills/plugin-author`) documents these classes — tranche charte.
*Rejected*: a new palette (two products under one name); CSS-in-JS or a third-party
component library (a new dependency for what classes do). *Reversed if*: a measured
contrast cannot reach AA by lightness or a twin token.

### AD-5 — Every word through the locale, skins included
The skin owns its words in both languages and the shell hands it the locale: an additional,
optional input to the skin module, the one contract change of this epic, and only for words
(`B-1`). It is additive: a skin that ignores it works unchanged, including skins from
`extensions.skinsDir` or `extensions.sources`. The skin keeps its persona's register and voice
(`B-8`, `B-10`). Today skins speak French whatever the locale (`nestor`, `dobby` greetings)
because the shell hands a skin no locale; the epic fixes it by `B-8`.
*Rejected*: leaving skin words out of i18n — an `en` instance greets in French
(`skins/nestor/skin.js`, `skins/dobby/skin.js`). *Reversed if*: skins stop drawing text.

### AD-6 — Documentation layout
`docs/` for the product (`parcours.md`, `ecrans.md`, `donnees.md`, `charte.md`);
`ARCHITECTURE.md` for the map and `AD-n`; `DESIGN.md` kept as the record of principles and
the pre-epic decision log (ordered chronologically, its "what is built / not built" parts
replaced by pointers); `CHANGELOG.md` for the history of versions; `.agent/status.md` for
the state only; `.agent` mission and questions files of closed work removed (git keeps them).
*Rejected*: rewriting `DESIGN.md` into ADR files — 3000 lines of reasons for no reader
gain. *Reversed if*: `DESIGN.md` stops being read as a whole.

### AD-7 — Out of this epic, because they change behaviour
Unifying the frontmatter parsers (`content/src/frontmatter.ts` accepts CRLF; `pages.ts`
› `splitFrontmatter`, its `parseScalar`, and `schedule.ts` › `frontmatterOf` /
`stampField` do not, and read scalars differently); unifying `copyMarkedTree` with
`skills.ts` › `readSkillAssets` / `deliverSkills` and the other directory walkers
(symlinks, dotfiles, modes, stale files — the catalogue security defects are the
arbitration of `homelab-sdlc-maj-consignes`); wiring `deleteConversation` into the UI.
Written as known defects. *Rejected*: doing them here under AD-1's cover. *Reversed if*:
Monsieur schedules them into this epic.

### AD-8 — Plugin helpers stay copied
`address.js` (journal, voyages, atelier) and the per-plugin word tables (`WORDS` / `FR`)
stay copies. *Why*: a plugin is self-contained and loads from its own folder or another
repository; a shared helper would be a second contract. *Rejected*: a shared plugin helper
module. AD-8 is about JS helpers: the shell's tokens and component classes (AD-4) are CSS
the plugin reads by name, not code it imports. *Reversed if*: the plugin contract grows a
helper surface in `PluginApi`.

### AD-9 — Lucide as an inline sprite, vendored
The icons are Lucide (ISC), the subset the screens use, vendored in
`packages/web/src/app/icons.ts` as path data and mounted once at boot as a hidden `<svg>`
sprite; any markup of the page — the shell's React or a plugin's vanilla JS — draws one with
`<svg class="adestia-icon"><use href="#adestia-i-<name>"/></svg>`. No runtime dependency, no
file to fetch (the instance may be offline, or behind a strict CSP; the service worker
needs nothing more), no base-path trap. The data is copied from the `lucide-static` package
at build-of-the-task time, with its licence in the header of the file.
*Rejected*: `lucide-react` (React only; plugins are not React); an external `icons.svg`
(`<use>` of an external file is subject to the base path and the cache, and fails offline
the first time); a CDN. *Reversed if*: the subset grows past a hundred icons (then a
build-time sprite from `lucide-static`).

### AD-10 — The dark palette is written once, with `light-dark()`
Each colour token of the base palette is one declaration, `light-dark(<light>, <dark>)`,
and `color-scheme` (`light dark`, or forced by `data-theme`) picks. This removes the
duplicate dark block (Q-19) without JavaScript: the media query and the attribute cannot
share one selector list, but a function of the scheme can. *Rejected*: a script that
always writes `data-theme` (a first paint in the wrong theme, a behaviour change); a CSS
preprocessor (a build step for one file). *Reversed if*: the supported browsers (the
service worker's audience: current evergreen) lose `light-dark()`.

### AD-11 — One request helper for the web
`packages/web/src/app/request.ts` exports `requestJson<T>(fetchImpl, path, init?)` →
`{ ok: true, status, data: T } | { ok: false, status, error, data? }` and `jsonInit(method,
body)`. It never throws (a network error is `{ ok: false, status: 0 }`); `error` is the
server's `error` field or a **translated** fallback (`request failed (404)` in the locale, Q-4).
It is what every `fetchImpl(` call site of the web becomes; a call site keeps its own
meaning for failure (silent, inline message), only the plumbing moves. `fetchImpl` stays
the injected dependency (tests). The 14 live guards stay in each effect (they belong to the
component's lifetime); a `useRequest`-style hook is *not* introduced (a new abstraction,
none of the sites share a shape).
*Rejected*: a hook layer over every fetch (a new abstraction); a client class. *Reversed
if*: the charte tranche finds a third of the sites sharing one loading/error shape.

## Refactoring targets

Each target: what, where, why it costs, the tranche that owns it, and its outcome
(`closed`, or `kept: reason`), filled by that tranche.

| R | What and where | Why it costs | Tranche | Outcome |
|---|---|---|---|---|
| R-1 | MCP `Authorization: Bearer` header selection copied in `claude-code/driver.ts`, `copilot-cli/driver.ts`, `codex-cli/driver.ts` | three copies of a security-relevant rule | serveur | |
| R-2 | Driver helpers duplicated: device-code `beginAuth`/`completeAuth`/`cancelAuth` (codex, copilot), `truncate` ×3 (`*/events.ts`), `health` ×2, `usageOf` ×3, `classifyAuthError`/`explainAuthProblem` ×2 (`*/auth.ts`) | drift between engines | serveur | |
| R-3 | `start()` (464 lines) and `buildApp` (287 lines) mix concerns; `TurnLimiter`, `runUnattended`, inline `/api/delegations` routes and the `adestiaRunTurn` monkey-patch live in `app.ts`; routes registered both from `routes/` and top-level files (`pages.ts`, `oidc-routes.ts`, `mcp-routes.ts`, `static.ts`, `files.ts`, `watch.ts`, `callback.ts`) | no single place says what is mounted | serveur | |
| R-4 | `field()` duplicated in `instruction-catalogues.ts` and `instructions.ts`; `routes/instruction-catalogues.ts` `sourceOf` / `fetchClone` / `cacheDir` duplicate `catalogueSource` / `fetchCatalogueClone` / `catalogueClone` of `instruction-catalogues-refresh.ts` | pure extraction, behaviour kept | serveur | |
| R-5 | `pages.ts` doubles as a frontmatter library for `instructions.ts`, `instruction-catalogues.ts`, `schedule.ts`, `shell-tools.ts` | a route module as a dependency; move without changing the parser (AD-7) | serveur | |
| R-6 | Dead or test-only exports: `SubscriptionQuotas` (no implementer), `assertConformance` in the production index, `formatReference`, `isValidId`, `isEditable` (tests only); about 140 exports used only in their own file | surface nobody uses | serveur | |
| R-7 | Comments pointing to absent documents: `technique.md` (server sources and tests), `ATELIER-3.md` (`plugins/atelier/web`), `PARCOURS.md` and "D44 côté cerveau" (`plugins/parcours/web`) | dead references | serveur (server), plugins (plugins) | |
| R-8 | `eslint.config.js` claims floating promises and thrown-away errors are caught, which its rules cannot do (no type-aware rule, `caughtErrors: 'none'`); `plugins/` not linted; lint not in CI | a claim the gate does not keep | serveur (CI, claim), plugins (plugins lint) | |
| R-9 | Test support rewritten per file: the fake `Driver` in 10 test files, `git()` in 5, `mkdtemp` in 39 | each new test copies one | tests | closed: `packages/server/test/support/` holds the three, and every file that rewrote them imports them |
| R-10 | `web/test/page-editor.test.tsx` "tells the plugin when it takes the file…" reported flaky; turn-counting waits (`setImmediate`) in `callback.test.ts`, `mcp.test.ts`, `restart.test.ts`; fixed sleeps in `watch`, `pages`, `shell-tools`, `background` tests | races dressed as delays (CLAUDE.md) | tests | closed: no `setImmediate` is left in `callback`, `mcp`, `restart` tests (a wake or a call is a deferred the fake resolves; a negative case is proved by a sentinel that does wake, or by `app.close()`), and the sleeps of `watch` (chokidar's own `ready`, through the test's watcher factory), `pages` (`utimes`), `shell-tools` and `background` (a faked `Date`) are gone. Page-editor flake: its waits (`findBy*`, `waitFor`) spend a one-second wall-clock budget on a chain of promises the test resolves itself, and a loaded machine runs it out; reproduced under `yes` load on the neighbour test "saves with the revision…" (`[data-mounted]` not there in time). The file now drains the chain with an async `act`, no budget left |
| R-11 | Web: about 40 `fetchImpl(` call sites and 14 hand-rolled live guards, `failure()` (`CataloguePopin.tsx`) and `json()` (`chat/conversations.ts`) local to one file; `toMessage` duplicated in `useConversations.ts` and `Delegations.tsx`, drifted (the second drops `signatures`, kept as defect); `prettify` ×3, `folderOf` ×2, `isIndexPage` ×2 with different rules (`app/sections.ts`, `app/collections.ts`, `editor/nodes.ts`, `editor/listing.ts`) | one idea, several answers | charte (the shared request helper), pages, chat for `chat/` | closed for the charter's part: `packages/web/src/app/request.ts` (`requestJson`, `jsonInit`) is the one way the shell's settings and entry code talks to the server (it never throws, the fallback message is said in the locale, `fetchImpl` stays injected); `failure()` of `CataloguePopin.tsx` is absorbed, and `Gates`/`signin.ts`/`useInstance.ts`, `Settings`, `Preferences`, `McpServers`, `Instructions`, `CataloguePopin`, `Configuration` and `Delegations` call it, the restart included (a refusal keeps its parsed body in `data`: how many turns run). No raw `fetchImpl(` is left in those files. kept: the `fetchImpl(` calls of `chat/`, `editor/`, `plugins/PageEditor.tsx`, `usePage.ts` and `live.ts`, `json()` in `chat/conversations.ts`, `toMessage` ×2 (the second still drops `signatures`, a defect kept) and `prettify`/`folderOf`/`isIndexPage` — the chat and pages tranches' |
| R-12 | Giant components: `App` 571 lines, `useConversations` 456; files `Reader.tsx` 1153, `Editor.tsx` 703, `Instructions.tsx` 591, `Home.tsx` 546, `Chat.tsx` 542, `Configuration.tsx` 456 | unreadable, untestable in parts | pages (App, Reader, Editor, Home); chat (Chat, useConversations, Composer); charte (Instructions, Configuration, McpServers) | closed for the charter's part: `Instructions.tsx` (591 → 146 lines), `Configuration.tsx` (456 → 160) and `McpServers.tsx` are each a short screen over parts in `app/instructions/`, `app/configuration/` and `app/mcp/` (list, editor, name sheet, model and hook for the first; fields, restart bar and hooks for the second; list, detail, health and declaration hook for the third), none over 190 lines, and the exports the tests import are kept. kept: `App`, `useConversations`, `Reader`, `Editor`, `Home`, `Chat` — the pages and chat tranches' |
| R-13 | `copilot-cli/driver.ts` › `SHELL_TOOL_CLI_SOURCE`, a whole JS program in a template string | untyped, unlinted | serveur (real file read at build, behaviour kept) | |
| R-14 | `server/test/catalogues-ui-ensemble.test.ts` skips itself without Playwright or a built web shell, so it never runs in a plain `npm test` | a suite that looks green and never ran | tests | closed: the suite runs in `npm test` (the shell is built in its `beforeAll` when `dist-web` is absent; without Playwright it skips and says `no playwright` in its title and in a `console.warn`); its first case, stale since Catalogues moved into the Instructions page (E-11/E-12), was corrected by the tester |
| R-15 | `zod` imported dynamically by `server/src/drivers.ts` but declared in no `package.json` | works only by hoisting | serveur | |

## Detail of R-9, R-10 and R-14 (tests tranche)

The tranche changes no production file (B-1): everything below lives in `packages/*/test`.

**Shared support (R-9).** One directory, `packages/server/test/support/`, never matched by
vitest's `include` (no `.test.` in the names), imported by relative path:

| Module | Exports | Replaces |
|---|---|---|
| `support/driver.ts` | `ScriptedDriver` (events, then `{ capabilities, hold, instructionPaths }` as constructor options; `describe()` and `runTurn()` as the existing `ScriptedDriver` of `app.test.ts`), `RESULT`, `driverWith(overrides)` returning a `Driver` from a partial one, and `scriptedDriver(script)` (a driver that records its `requests`; the `delegations` helper) | the fake `Driver` of `app`, `oidc-routes`, `start` (and its `SkilledDriver` / `AgentDriver` subclasses), `instruction-catalogue-materialize`, `instruction-catalogue-materialize-review`, `mcp-servers`, `settings-route`, `restart`, `delegations` (its `scriptedDriver()`) and `turns` (its inline `{ runTurn }` objects) tests; the grep of the tranche's exit is the list |
| `support/git.ts` | `git(cwd, ...args)` with the fixed author and committer (`T <t@example.org>`), and `gitRepo(dir, files)`: `git init -b main`, write the files, one commit, return the HEAD sha | the `git()` of `catalogues-ensemble`, `catalogues-ui-ensemble`, `instruction-catalogues-api`, `instruction-catalogues`, `sources` tests, and their repository set-up |
| `support/tmp.ts` | `tmpDir(prefix)`: `mkdtemp` under `os.tmpdir()`, remembered; `cleanTmp()`: removes everything remembered (`rm -rf`, force); each file registers `afterEach(cleanTmp)` (`afterAll` when the tree is built once in a `beforeAll`: `extensions`, `static`, `mono-store-witness`) | the 37 test files that call `mkdtemp` and each their own `rm` |

A test that needs a fake behaviour the module lacks extends the module (an option), never
re-declares a driver. `packages/drivers/test` keeps its own fakes: R-9 aims at the server.
A file whose fake is genuinely not a `Driver` stays as it is and is named in this table's
outcome (`kept: reason`) if its name matched the grep of the tranche's exit.

**Signals, not delays (R-10).** The rule is `CLAUDE.md`'s « A handshake waits for a SIGNAL »,
applied file by file:

- `callback.test.ts`: `runTurn` is a `vi.fn` owned by the test; it resolves a deferred
  (`woke`) on its first call, and the test awaits `woke` instead of `settle()`. An assertion
  that the wake did **not** happen awaits the last step the handler takes before that branch
  (the `fetchImpl` stub resolving its own deferred), then asserts.
- `mcp.test.ts`: the fake channel resolves a deferred when it is pulled (`runTurn`), the test
  awaits it. Same rule for the negative cases.
- `restart.test.ts`: the `restart` stub resolves a deferred; the guard's refusal (409) has no
  later step to signal, so the negative cases assert on the response and then on
  `await app.close()` having completed, which flushes what the app scheduled.
- A case where no signal can exist without touching production is not turned into a longer
  delay: it keeps its wait, and R-10's outcome says `kept: <file>, <why>`.
- Clock waits become a clock the test owns: `background.test.ts` (5 ms), `shell-tools.test.ts`
  (10 ms, `tokenTtlMs: 1`) use `vi.useFakeTimers()` and `vi.setSystemTime` /
  `vi.advanceTimersByTime`; `pages.test.ts` (10 ms, so the revision differs) sets the file's
  mtime explicitly with `utimes`; `watch.test.ts` (`wait(500)`) waits on the stream's own
  frames, and a "nothing arrives" case writes a sentinel after and asserts the sentinel is
  the next frame. The `deadline` timer of `nextBatch` bounds a wait, it is not a wait, and
  stays.
- `web/test/page-editor.test.tsx` › "tells the plugin when it takes the file…": the cause of
  the flake is found first (run the test file under CPU load, thirty times; the suspect is
  `waitFor`'s default one-second budget on an editor that mounts lazily). The fix waits on the
  cause (`[data-mounted]`, as its neighbour test does), not on a longer budget; the cause is
  written in R-10's outcome.

**The catalogue screens suite (R-14).** `catalogues-ui-ensemble.test.ts` keeps its two
conditions and gains a way to meet them:

- Playwright is found by a plain `require` (the packages' `node_modules`, `NODE_PATH`), then
  through `npm root -g` (the pod keeps it in `/usr/lib/node_modules`); the hard-coded
  `/usr/lib` and `/usr/local/lib` are gone, so a `PATH` and `NODE_PATH` that hide it do hide it.
  The bench (`bench/bench.mjs`, `bench/sweep.mjs`) resolves it the same way (`/usr/lib/node_modules`, then `npm root -g`)
  in its own code, and the two stay separate copies: the bench is
  `.mjs` outside the packages.
- A missing built shell is no longer a reason to skip when Playwright is there: a `beforeAll`
  runs `npm run build:web --workspace @antorfr/adestia-web` once (generous timeout) when
  `packages/web/dist-web/index.html` is absent. *Rejected*: building in the `test` script
  (every run pays, including those that never reach this suite) and a vitest `globalSetup`
  (hides the cost from the file that needs it). The build child gets `NODE_ENV=production`:
  under vitest it would inherit `test`, vite would emit `react/jsx-dev-runtime`, which the
  shell does not keep external, and the page would die on a CJS `require("react")`. *Reversed if*: the build exceeds a minute in
  the pod, then a `pretest` is the honest place.
- Without Playwright the suite still skips, and now says it twice: in the title, as today,
  and with one `console.warn` line at collection naming the missing piece. A skipped run is
  not a seen screen.
- `catalogues-ensemble.test.ts` has no such condition and is unchanged but for the support
  imports.

**Five greens.** `npm test` runs five times in a row in the pod (a shell loop, output kept
outside the tree); a red names the flake, which is fixed by signal, never retried.

## Known defects (found, not fixed by this epic)

- **MCP server counts disagree**: the Settings tile can say “6 servers” while the MCP
  breadcrumb badge says “7 servers”. Observed during the charter review; whether it
  predates this epic is unknown. Kept under B-1, pending a separate behaviour investigation.

- **Catalogue ref or repo starting with `-`** reaches git as an option: `sources.ts` passes
  `source.ref` to `git fetch … origin <ref>` with no `--` separator. Arbitration of
  `homelab-sdlc-maj-consignes`.
- **`copyMarkedTree` follows symbolic links** (`instruction-catalogues.ts`): a non-directory
  entry is read with `readFile`, which reads the link's target. Same arbitration.
- **Delegations drop signatures**: `app/Delegations.tsx` › `toMessage` omits
  `stored.signatures`, which `chat/useConversations.ts` › `toMessage` keeps. To be confirmed
  that a delegation transcript can carry signatures.
- **Frontmatter CRLF divergence**: `content` accepts `\r\n` fences, `pages.ts` and
  `schedule.ts` only `\n` — a CRLF page has fields in the editor and none in the index or the
  schedule. Seen in the code; behaviour not yet reproduced.
- **Conformance never asserted at boot**: `checkConformance` runs only in
  `drivers/test/conformance.test.ts`; `start()` trusts the descriptor.
- **`deleteConversation`** exists in `chat/conversations.ts` and is reached by no screen.
- **Saving the configuration loosens its mode**: `settings-file.ts` writes through a temporary
  file and a rename, so a config file kept at 0600 comes back in the umask's default mode.
- **`user-tokens.json` holds access tokens too**, with their expiry, where the module comment
  says refresh tokens only.
