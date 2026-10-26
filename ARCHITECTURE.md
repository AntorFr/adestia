# Adestia — architecture

> Product documentation. On `epic/adestia-qualite` (the epic's integration branch, where its tranches merge), it describes the epic's target; on
> `main`, exactly what is built. An epic is a group of features delivered together; a tranche is one of them. Stable identifiers, never renumbered: `B-n` (needs), `P-n`
> (journeys, `docs/parcours.md`), `E-n` (screens, `docs/ecrans.md`), `AD-n` (decisions,
> this file), `R-n` (refactoring targets, this file).
>
> Written by the epic `adestia-qualite` (2026-10-15), a quality pass that changes **no
> behaviour**. Decisions taken BEFORE this epic live in `DESIGN.md` › Decision log, which is
> not renumbered; `AD-n` starts at `AD-1` with this epic. The map below is the code as first
> documented at the git tag `v0.88.0` (the packages' `version` fields stay `0.0.0`), updated for the completed charter, pages, chat, plugins, tests and server tranches; the repository's later tags (`git tag`) mark releases, not this map.

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
  `oidc.ts`, `routes/oidc.ts` (`registerOidc`, session cookie hook), `user-tokens.ts`
  (`UserTokens`, per-user rebound tokens), `routes/identity.ts` (`identityOf`).
- **Conversations and turns** — `turns.ts` (`TurnDesk`: admission, chaining, the single
  spawn site), `routes/turns.ts` (`registerTurns`, SSE, `sseFrame`), `conversations.ts`
  (`ConversationStore`, JSONL transcripts), `desk.ts` (`buildDesk`: the `TurnLimiter` and the `TurnDesk`), `turn-limiter.ts`, `unattended.ts`, `routes/conversations.ts`, `introduction.ts`
  (`frameShell`, the preamble), `screen.ts`.
- **Drivers and arming** — `drivers.ts` (`buildDriver`, `AVAILABLE_DRIVERS`), `secrets.ts`
  (`SecretStore`, `ArmingFlows`), `routes/arming.ts`.
- **MCP inbound and delegations** — `mcp-in.ts`, `routes/mcp.ts` (`registerMcp`, `/mcp`; `mcp-routes.ts` re-exports it),
  `delegations.ts` (`DelegationChannel`), `routes/delegations.ts` (`/api/delegations`),
  `callback.ts` (`wakePrompt`, `verifySettled`), `routes/callback.ts` (`registerCallback`, `/callback`).
- **MCP outbound** — `config/mcp.ts`, `mcp-store.ts` (`McpStore`, the shell-written layer),
  `mcp-signin.ts` (`McpSignIn`), `mcp-refresh.ts` (`FileRefreshStore`), `background.ts`
  (`BackgroundReach`), `routes/mcp-servers.ts` (`outboundServersOf`).
- **Schedule** — `schedule.ts` (`parseNote`, `isDue`, `stampField`), `clock.ts` (`Clock`).
- **Plugin host and extensions** — `extensions.ts` (`discoverPlugins`, `discoverSkins`,
  `registerPluginVocabulary`, `mcpServersFor`), `sources.ts` (`fetchSources`, git clones),
  `plugin-host.ts` (`runSetups`), `routes/plugin-host.ts` (`mountPluginApis`), `static.ts` (`mimeFor`,
  `safeJoin`), `routes/static.ts` (`registerStatic`, the catch-all, mounted last).
- **Frontmatter** — `frontmatter.ts` (`splitFrontmatter`, `parseFrontmatter`, `field`; the server's own reader, distinct from `content/src/frontmatter.ts`, AD-7).
- **Instructions and skills** — `skills.ts` (`collectSkills`, `deliverSkills`,
  `deliverAgents`, `MANAGED_MARKER`, `stamped`), `instructions.ts`,
  `routes/instructions.ts`, `instruction-catalogues.ts` (scan, `copyMarkedTree`),
  `instruction-catalogues-store.ts`, `instruction-catalogues-refresh.ts`,
  `routes/instruction-catalogues.ts`.
- **Pages, files, stores, watch** — `stores.ts` (`resolveStores`, `pagesService`,
  `foreignRoots`), `pages.ts` (`titleOf`, `revisionOf`, `safePagePath`), `routes/pages.ts` (`registerPages`),
  `files.ts` (`kindOf`, `attachmentsOf`), `routes/files.ts` (`registerFiles`), `watch.ts`
  (`ChangeFeed`), `routes/watch.ts` (`registerEvents`, `/api/events`),
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
  `Canvas.tsx` (screen dispatch), `CanvasHeader.tsx` (breadcrumbs and phone return),
  `ScreenEdges.tsx` (phone handles), `BackButton.tsx`; `Home` composes `Brief` and `Domains`.
  `paths.ts` holds path naming/index rules, `request.ts` the injected request helpers;
  `Problems.tsx`, skin slot (`skin.ts`, `SkinSlot.tsx`), `i18n.ts`, `tokens.css`, `shell.css`.
- `chat/` — `Chat.tsx` wires `ChatHeader.tsx`, `TabStrip.tsx`, `ConversationList.tsx` and
  `Thread.tsx` (`Bubble.tsx`, `StatusDot.tsx`); `ModelPicker.tsx`, `ContextPill.tsx`,
  `Composer.tsx` (uploads and fold), `AskPrompt.tsx`, `Signatures.tsx` (shared sheet).
  `useConversations.ts` holds the open-store, turn and tab-action hooks; `conversations.ts`
  is the HTTP store client, `messages.ts` the shared `toMessage`, `stream.ts` the SSE client
  (`events.ts`), `useCadence.ts` the live display cadence, `tabs.ts` browser persistence.
- `editor/` — Milkdown editor (`Editor.tsx`, `milkdown.ts`, `blockview.tsx`), `Reader.tsx`,
  page settings and listing helpers. `Reader.tsx` keeps the page and prose frames;
  `reader/` holds the recursive walk, directive dispatch and block renderers by kind.
  `useAutosave.ts` owns the document baseline and save cadence, `useEditorSurface.ts`
  the mounted writing surface, `usePageDrop.ts` the reading drop target; `SaveStatus.tsx`
  draws the save result.
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
`McpStatus`) and `CAPABILITY_REQUIRES` their dependencies.
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
- **One spawn site.** Every turn goes through `TurnDesk`, under one `TurnLimiter` cap (`turn-limiter.ts`; the clock's and the callback's headless turn is `unattended.ts` › `makeRunUnattended`).

## Boundaries

- **Server / web** — HTTP JSON and SSE (`/api/events`, turn streams) only; the web bundle
  is static files. Shared shapes are `schemas` types, imported type-only by the web.
- **Core / driver** — the `Driver` contract. The core owns secrets and writes skill files;
  a driver only names paths (`skillsPath`, `agentsPath`) and how to hand secrets over (`env`).
- **Shell / plugin** — `web/src/plugins/contract.ts` on the front; on the server
  `plugin-host.ts` mounts each plugin's `api.mjs` under `/api/plugin/<id>/`, behind the
  same auth hook, and hands it only the secrets its manifest declares (`secretsFor`).
- **Shell / skin** — CSS custom properties on `:root[data-skin=<id>]`, plus an optional
  module mounted in `SkinSlot`. The shell also hands that module the instance's locale
  (`SkinFactoryContext.locale`, AD-5), an optional input; a skin that ignores it works unchanged.
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
  visual check (`bench/run.sh` with docker; `bench/launch.mjs` and `bench/sweep.mjs` without). CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, the build, a start of the built server and a docker image build.

## Decisions of adestia-qualite

### AD-1 — No behaviour change
*(Applied to `adestia-qualite` only; `adestia-correctifs` lifts it for the register of AD-17, and nothing else.)*
Every refactoring keeps routes, API shapes, configuration keys, file formats
(`docs/donnees.md`) and MCP tools. The existing suite is the witness; a refactoring with no
test around it gets a characterization test first. A defect found on the way is written in
the "Known defects" section of this file, not fixed. (`.agent/status.md` keeps no register of its own: it points here and lists only the defects still visible in the code.)
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
  whose selector is absent, or that shows `.adestia-gate__card--fatal` or a loading state, fails the sweep
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
(`B-8`, `B-10`). The shell hands a skin its locale (`SkinFactoryContext.locale`,
`packages/web/src/app/skin.ts`) and the bundled skins use it (`skins/nestor/skin.js`), by `B-8`.
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

#### Detail of the documentation tranche (AD-6, B-4, B-5)

The tranche changes no code: it only writes and deletes Markdown, plus the dead comments
nobody else owns (none: R-7 belongs to serveur and plugins). It runs last, on the final
screens, and carries four things.

**1. `.agent/status.md` says the state, and nothing else.** Under 150 lines, in this order:
the current version and what it is (tag, deployed or not, per body); *Known defects* (the
section of this file is the source; status points at it and adds only what is not yet
there); *Half-built* (functions that exist and are reached by no screen, written as one
line each); *Traps still true* (each in two lines: the symptom, the cause); *Where to
look* (pointers to the docs above, to `CHANGELOG.md`, to `bench/README.md`). A version
paragraph leaves status.md for `CHANGELOG.md` whole, its "Reste / pièges encore vrais" tail
too when the trap is gone; a trap still true (checked against the code, not recopied) is
rewritten short in *Traps*. status.md stays in French (`.agent` is French).

**2. `CHANGELOG.md` is the history.** English, one `## vX.Y.Z — date` per version from the
oldest the status file knows (v0.61.0) to the current one (the latest git tag: no `package.json`
carries a version), oldest first; what status.md names from before v0.61.0 sits in an
"Earlier than v0.61.0" section at the top; each entry keeps
the paragraph's first sentence (what changed for the user) and the *why* it carried, and
drops the recipe and the deployment chatter. Versions with no entry (tagged by mistake, e.g.
v0.87.3) get a line saying so. The paragraphs are moved, not re-derived: a version whose date
or content is not in status.md is not invented. The epic's own changes enter as one
`## Unreleased — adestia-qualite` entry, written from the merged tranches' commit messages.

**3. `DESIGN.md` is ranged, not rewritten.** (a) *Decision log*: entries in one order,
oldest first, by the date each opens with; entries with no date keep their place after the
dated entry they follow. Reordering moves blocks whole. (b) *What is built, and what is
not*, *Spikes* and the header line "implemented unless marked not built yet" are replaced
by a short pointer to `docs/parcours.md`, `docs/ecrans.md`, `ARCHITECTURE.md` and
`CHANGELOG.md`, each *not built yet* item that is built now deleted and each that is not
moved to *Half-built* in status.md. Reasons stay: nothing in the principles and the
per-subject sections is cut (AD-6, rejected: ADR files).

**4. The rest is read against the code.** README (what it is, launch, test, launch on the
fake engine, capture screens: the commands the banc tranche documented), CLAUDE.md (package
map and commands, as built), this file (map, every R-n *Outcome* filled, defects), the four
`docs/` files (every Q-n `closed` or `kept: reason`), `plugins/README.md`, `spikes/README.md`
(the pointer to the list of open spikes goes: DESIGN.md's *Spikes* is a record, not a list of open
work), `packages/*/README.md`, `packages/schemas/CHANGELOG.md`. Closed work leaves
`.agent`: a `mission-*.md` and its `questions-*.md` go when the work shipped (the chantier
is in status.md or CHANGELOG), `migrate-frame.mjs` stays only if the migration it did is
still undone (`questions-migration-contenu.md` says), else goes with them. Git keeps them.

**What counts as a contradiction** (the bar of the fresh-context documentation pass, made by a `relecteur-depot` agent that reads the code): a command that does not run, a
file or symbol the text names and the repository lacks, a number (count of skins, of
plugins, of tests) the code contradicts, a "not built" the code builds, a decision and its
reversal both standing. Style is not one.

**Verification, by search:** a search for the stale phrases about the number of skins and about open spikes, over every `*.md`, empty;
`git grep -n "not built" -- DESIGN.md` empty outside quoted history. The committed
regression test `bench/tests/doc-besoin.test.mjs` checks relative Markdown link targets
(excluding package tests, nested spike documents and skills) and collects `var(--x` uses in CSS
under `packages/web/src` and `plugins/*/web`, subtracts definitions in CSS, skins and
scripts, and reports any remainder. Run it with
`node --test bench/tests/doc-besoin.test.mjs` to check B-4 and B-5. Skin declarations
and JS/TSX inline parameters count as definitions outside those stylesheets;
this does not mean the CSS-only difference is empty.

### AD-7 — Out of this epic, because they change behaviour
*Reopened for one point by `adestia-correctifs` (AD-15, AD-17 pages): the CRLF divergence below is repaired there, `pages.ts` and `schedule.ts` aligned on `content`, with a test written first and a CHANGELOG line. The rest of this decision stands.*

Unifying the frontmatter parsers (`content/src/frontmatter.ts` accepts CRLF; `pages.ts`
› `splitFrontmatter`, its `parseScalar`, and `schedule.ts` › `frontmatterOf` /
`stampField` do not, and read scalars differently); unifying `copyMarkedTree` with
`skills.ts` › `readSkillAssets` / `deliverSkills` and the other directory walkers
(symlinks, dotfiles, modes, stale files — the catalogue security defects are the
arbitration of `homelab-sdlc-maj-consignes`); wiring `deleteConversation` into the UI.
Written as known defects. *Rejected*: doing them here under AD-1's cover. *Reversed if*:
the owner (Monsieur, the repository's owner) schedules them into this epic.

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

### AD-12 — The chat's code: one message conversion, one request path, three hooks
Three decisions of the chat tranche, none changing a behaviour.
(a) `toMessage` lives once, in `chat/messages.ts`, as `toMessage(stored, { signatures })`
with `signatures` defaulting to `true` (the chat's behaviour). `Delegations.tsx` imports it
and passes `{ signatures: false }`, which keeps today's drift as a written defect (AD-7:
whether a delegated conversation should show signature cards is a behaviour).
(b) Every `fetchImpl(` of `chat/` goes through `app/request.ts` (AD-11). Six sites do not
use `requestJson` and take `requestRaw`: two stream (the turn POST and the attach GET hand
the caller a `Response` to read as it comes), four do not (the upload, the stop, the
archive and the delete read only the status or a single body, and need any HTTP status
back whole). `request.ts` gains one additive function, `requestRaw(fetchImpl, path, init?, t?)` →
`{ ok: true, response } | { ok: false, error }` (never throws; any HTTP status is a
`response`). The upload keeps the server's `error` and the joined list of refused
files; an HTTP refusal without an `error` now uses the translated
`request failed (%n)` fallback with the response status (Q-4). A thrown network
failure becomes that fallback with status 0 when `t` is supplied to `requestRaw`,
replacing the raw `Error.message`. Without `t`, `requestRaw` keeps the network
message; `live.ts` uses this form without displaying its error. `requestJson`
keeps a non-empty network `Error.message` even with `t`, using its translated
fallback only when that message is absent. Upload response-parsing errors still
show their raw message (`Composer.tsx` › `useUploads`).
(c) The three giants split by lifetime, not by line count: `useConversations` into the
store of open conversations (`useOpenConversations`: state, load, reconcile), the live turn
(`useTurn`: send, stop, hold, attach, cadence) and the tab/list actions (`useTabActions`:
open, shut, archive, reorder, drafts) behind the same returned object (the three are local to `useConversations.ts`, only `useConversations` is exported), so `Chat` and the
tests see no change; `Chat` into `Chat` (state and wiring), `ChatHeader`, `TabStrip`,
`ConversationList`, `Thread`; `Composer` into `Composer`, `useUploads` (local to `Composer.tsx`) and the existing
`ComposerFold` and `AttachmentTray`. Exports that tests import keep their names and paths.
*Rejected*: a state library or a reducer rewrite (a new abstraction, a risk to the live
turn); extending `requestJson` to streams (its result type is JSON by contract); leaving
`stream.ts` on bare `fetchImpl` (the criterion says one path). *Reversed if*: a hook cannot
be cut without moving state that two of them write, then that state stays in the first and
the target R-12 reads "kept: reason" for that hook.

### AD-13 — The pages' code: one paths module, one ready signal, cuts by lifetime
Four decisions of the pages tranche; none changes a behaviour.
(a) `app/paths.ts` holds `prettify` and `folderOf` once (the three `prettify` bodies and the
two `folderOf` are identical, checked). The two `isIndexPage` are **not** the same rule —
`app/sections.ts` requires the `.md` extension (`/(^|\/)index\.md$/i`, or a homonymous
folder), `editor/listing.ts` strips an optional `.md` first — and a path without extension
is the only input where they differ. Both rules are kept, **named for what they answer**:
`isIndexFile(path)` (sections, routing, owners: the file of an index) and
`isIndexPath(path)` (the reader's listings: the address of an index, extension or not), both
in `paths.ts`, each with a test pinning its rule on `index.md`, `INDEX.MD`, `a/index`,
`a/a.md`, `a/a`, `a/b.md`. *Rejected*: one `isIndexPage` with the wider rule (a path without
extension would start counting as an index in sections: a behaviour change); one with the
narrower (the reader's lists would change). *Reversed if*: a test over the real corpus shows
no path where they differ, then they merge.
(b) Home's loading state needs a signal the shell does not give: `useInstance` returns
`ready`, false until the plugins are loaded **and** the first index request has answered
(answer or failure — a failed index is "ready, empty", as today). It is additive; nothing else
of the hook changes. E-2 draws the shared spinner row in place of the mosaic and the empty
state while `ready` is false; the greeting, the hero and the ask bar do not wait.
(c) The giants split by lifetime, as the chat tranche does for its own giants. `App` into `App` (gates, state,
wiring), `CanvasHeader` (the phone's back to the chat, the breadcrumb, the driver label, the
cog slot) and `Canvas` (the dispatch order of `docs/ecrans.md` › Navigation, kept readable as
one function and tested as one). `Home` into `Home` (composition), `Brief` (the brief, its
age and its refresh) and `Domains` (the mosaic and Arrange). `Editor` into `Editor` (wiring),
`useAutosave` (the 1.6 s cadence, the revision, the 409 conflict, the refusal) and the
status line. `Reader` is not one giant function (its longest is 114 lines) but a 1153-line
file: its blocks leave for `editor/reader/` by kind (list and file list, table, figures,
written and contributed rows), `Reader.tsx` keeping the page frame. Exports that tests import
keep their names and paths (re-exported from the old file when the code moves).
*Rejected*: a reducer or a state library for the editor (a new abstraction on the save path);
cutting by line count. *Reversed if*: a hook cannot be cut without moving state two of them
write — then that state stays in the first and the target R-12 reads "kept: reason".
(d) Three additions to the charter, additive and written here because the pages are their
first user: a **chip** (`.adestia-chip`, a toggle button with `aria-pressed`, pill radius,
for the facet pills of E-3 and E-7), an **inline empty state** (`.adestia-empty--inline`: the
empty state's icon at 16 px beside its sentence, for a note inside a block of a page), and
the icon names the screens need beyond `docs/charte.md` § 2 (`grip-vertical`, `eye`, `code`,
`file-question`, `folder-open`, `search-x`). The editor's block bars are built
by Milkdown as DOM, not React: `editor/dom-icon.ts` draws a sprite icon from its name (the
AD-9 markup) so the bars use the same set. *Rejected*: restyling the facet pills as
`.adestia-btn` (a pressed state the button does not have); a chip owned by the charter tranche
(it is already built — AD-13 adds, never edits, its files).
(e) A word is moved, never invented, by `B-8`: where today's string is French the French
table keeps it **byte for byte** and the English key is a literal translation; where it is
English the English stays and the French is a literal translation. The one string sent to the
agent (`Rafraîchis ma une`) keeps its French form on a French instance. *Reversed if*: the owner (Monsieur)
wants the voice of the agent prompts changed — that is a behaviour of the conversation.

### AD-14 — The plugins' tranche: tokens by name, a copied sheet, tables per plugin, a lint and a CSS test
(a) **No second vocabulary.** A plugin stylesheet reads the shell's tokens by name; an alias is a
custom property whose whole value is `var(--<shell token>)` and none survives. A parameter that
carries a meaning (a type colour, a hue, a derived mix) is defined once in the sheet that uses it,
from tokens or hues, never from a literal. `plugins/test/css.test.js` (node:test, run by
`npm run test:plugins`) holds the rules of the plugins' tokens section of `docs/ecrans.md` (its rules are written in the header of `css.test.js` and, screen by screen, in the rows of E-22 to E-31 and « The plugins' screens, as built » of `docs/ecrans.md`; `docs/charte.md` is not touched by it). A second test in the same file compares its `CHECKED` list to the `plugins/*/web/` folders, so a plugin added without its name fails:
an undefined token, an alias, a literal colour outside a `var()` fallback, `999px`, an
`outline: none` without a ring. It reads the token list from `tokens.css`, so a token removed
there fails here. *Rejected*: a lint plugin for CSS (a dependency for six rules a test states).
(b) **The sheet is a copy, by classes.** The shared dialog reaches plugins as CSS classes and a
three-line contract (AD-4); each plugin that opens a sheet carries its own ~30 lines of behaviour
(`web/sheet.js`; an effect in meals' React view) — AD-8's rule, applied: a plugin loads from its own
folder or another repository and imports no shell code. *Rejected*: a `data-adestia-sheet` helper
shipped by the shell (a second contract, AD-8; the charter tranche also declines it). The two
full-screen modes (atelier's step mode, the scan camera) are not sheets: they keep their full
screen and take the sheet's behaviour contract and z-index family.
(c) **Words: one table per plugin, English keys.** Atelier gets the table it lacked
(`web/words.js`), `t` injected into its engine like `crumbs` and `href`; its `fr` values are
today's French, so a French instance reads the same words (B-1). Parcours and project-management
get the same. Messages of `regles.js` / `convert.js` go to the CLI and MCP tools, not to the
screen, and stay French; the agent prompts stay as written. The class test `plugins/test/words.test.js` (it already
reads the tables the way the shell does, the atelier's included once it has one) gains the *tu* rule, with a short list of the plugins still to correct that each task empties.
(d) **Lint.** `eslint.config.js` (the serveur tranche's file, extended here) drops `plugins/**` from
`ignores` and gains a block for `plugins/**/web/**/*.js` (browser globals; the `react-hooks` rules apply, since
journal, todo, listening-post and meals call hooks through `createElement`) and one for the
plugins' other `.mjs`/`.js` (node globals); the vendored `plugins/scan/web/decoder.js` (448 KB, third-party) joins the ignores with
the reason. `npm run lint` covers `plugins`. A finding is fixed, or turned off for the rule with
its reason written beside it (the file's own convention); no `eslint-disable` without a reason.
(e) **Kept.** The native `confirm()` of the atelier (resetting a layout) and the `window.alert` of
voyages (a refused gesture) stay: a sheet would make the answer asynchronous, a change of flow (Q-20,
*kept: the flow would change*; written under Known defects). In plugin sheets only `820px` is a breakpoint; 520, 560, 640, 720 and 900 px are kept
(*kept: moving a width changes the layout between phone and desktop, a redesign the mandate does
not ask for*). Plugin buttons, fields and empty states do not adopt the charter's classes, except
backs, exits and the sheet's close button.
*Rejected*: moving the aids copied on purpose (`address.js`, word tables) into a shared module —
AD-8. *Reversed if*: the plugin contract grows a helper surface in `PluginApi`.


## Decisions of adestia-correctifs

The second pass. `adestia-qualite` was not allowed to change behaviour (AD-1) and wrote what it
found under *Known defects*; this epic repairs those, behaviour included. Its needs are
`B-13` to `B-16` in `docs/parcours.md`; its work is the register below.

### AD-15 — A correction makes the behaviour right, it does not invent one
The right behaviour is read in `docs/parcours.md` and `docs/ecrans.md`; where they are silent,
in what the product already does elsewhere. Every changed behaviour gets a `CHANGELOG.md`
entry and, where a journey or a screen states it, its text is corrected in the same task.
*Rejected*: choosing the richer behaviour when the docs are silent — that is a new function, and
goes to the closing recommendations. *Reversed if*: a defect has no right answer in the docs and
none elsewhere in the product; it is then kept under Known defects with that reason.

### AD-16 — Reproduce first, then fix, then pin
Each defect of the register starts with a test (or a bench scenario for a screen) that fails on
the defect, written before the fix. A defect that cannot be reproduced is not "fixed": it
leaves the register as *not reproduced*, with the attempt written in Known defects. A fixed
defect leaves Known defects and `.agent/status.md` in the same commit, and the tranche's task names it.
*Rejected*: fixing from the description — several entries say "seen in the code; behaviour not
yet reproduced" (frontmatter CRLF) or "whether it predates the epic is unknown" (MCP counts).

### AD-17 — The register: every defect has a tranche, or a written reason
| Tranche | Defects (Known defects, kept parts of `docs/ecrans.md`, non-blockers) |
|---|---|
| chat | refused turn (429) silent (P-2 step 4); `📎` text emoji in `stamped()`; native model select says `Auto`; delegations drop signatures; the chat race (below); chat nits left open by the tests (`adestia-composer--busy` without a rule, unused `.adestia-sheet__close`, double `.adestia-sheet__origin`, the `upload failed` fallback through `t()`) |
| pages | root page breadcrumb invents a folder; E-6 settings overlap the banner at 1440 px; page diagnostic mixes languages; frontmatter CRLF divergence (`pages.ts`, `schedule.ts` against `content`) |
| shell | Nestor's `↑` send glyph; MCP server counts disagree (tile against badge); Skippy's banner wraps on the phone; E-14 switch apart from its title on the phone; E-19 detail in English under `fr`; token field without `autoComplete`; "Invalid plugin manifest" in English; the duplicate `.adestia-icon--spin` block; `CataloguePopin` `refresh()` no longer shows a thrown error |
| server | conformance never asserted at boot; saving the configuration loosens its file mode; `user-tokens.json` comment against content; `register*` re-exports left in old files |
| plugins | `confirm()` of the atelier and `alert` of the voyages replaced by the shared sheet (Q-20, kept by `adestia-qualite` because "the flow would change": the answer becomes asynchronous; this is the one deliberate flow change, bounded to two gestures, and `docs/ecrans.md` Q-20 and the atelier and voyages journeys are rewritten with it. If the tranche proves risky it is narrowed and the reason written under Known defects); planif and veille sentences in English; E-28 walking map keeps its pre-walk size; E-30 focus lost on phone; E-25 "1 pièces"; the emojis kept in plugins; the amber of project-management meaning two things; `:::content` `on` without a localised date |
| debt | R-2 one-line aliases of the drivers and R-6 exports kept only for tests (removed, tests import the module that owns the symbol); bench duplicates (`launch(seed)`, `loadPlaywright`); fake-engine options with no caller; `doc-besoin.test.mjs` into CI; the two duplicate guards on `DESIGN.md`; typed lint rules switched on if the repo passes them; `.agent/migrate-frame.mjs` lint errors |

Kept on purpose, with their reason, and still under Known defects: the open page is **not**
refreshed after an agent write (P-5 step 7 states that it is not, to protect unsaved text; refreshing
it is a new behaviour, so a closing recommendation); the workbook's, the cards' and the server's
own words that are author or engine data (E-25 piece names, E-26 card types, E-23 and E-27 sentences
built by the server unless a table keyed by them already exists).

A row may be narrowed — a risky correction kept for later, written under Known defects with its
reason — never dropped without a line.
*Rejected*: one tranche per defect (36 tranches, each paying the same full-suite cost); one tranche
per Known defects bullet order (it mixes areas that review differently).

### AD-18 — What stays out: functions, not defects
The "Lacks" cells that name an absent function are not repaired: loading states of E-3, E-4, E-9,
E-10, E-11, E-13, E-16, E-25, E-28; an offline screen and banner (E-21); a retry for E-8; a
confirmation before Remove (E-10); the empty states of E-4 and E-7; a delete command for
conversations (`deleteConversation` has no screen); the half-built items of `.agent/status.md`
(`ask` posture, usage view, Copilot permission feedback, `adestia init`). They go to the closing
recommendations, posted in this epic's discussion at the end of the framing.
*Reversed if*: Monsieur retains one; it comes back as a new idea.

### AD-19 — The chat race is already in `main`; it is written as a change
Before v0.95.0 `send` held a second message only while `turning` was set, which happens after the
POST; the Stop button reads `live.running`, up from the keystroke. A message sent in that gap
left as a fresh turn and was never drawn as held (`main` of 2026-10-16, `useConversations.ts`).
Commit `c549a5d` (v0.95.0) holds it. The chat tranche writes it in the `CHANGELOG.md` as an
assumed behaviour change and pins it with the browser test that already exists.

### AD-20 — Proof: four skins, two languages, both themes, both widths
A screen change is judged on bench captures under the four skins, `en` and `fr`, light and dark,
desk and phone (`node bench/sweep.mjs --skin <id>`, run with `BENCH_LOCALE`/`--locale`). The
previous pass swept the default skin in English only. A task that touches no screen says so.
Real engines: Claude by the pod's token; Copilot and Codex by their fakes, their real trial is
Monsieur's before deployment.

### AD-24 — Plugins tranche: one flow change, two small repairs of words, three of drawing, one of marks
Written from the code as it stands, not from the register's wording; each repair is reproduced by a
test or a capture **before** it is fixed (AD-16), and a defect that does not reproduce leaves the register as
`not reproduced` with its reason (B-14).

(a) **Q-20 — the two native dialogs become the plugin's own copy of the shared sheet.** The atelier
(`wbreset`, "Drop your layout and go back to Alfred's?") and the voyages (`vgesture`: "Gesture refused" and
"Gesture impossible") each already carry `web/sheet.js` (AD-14 b: `makeSheet(t)`, `role="dialog"`, scrim, Escape,
Tab kept inside, focus returned). Both gain a *message* form of that sheet, no new component and no new
contract. **Atelier**: a question, two buttons: *Cancel* (focused first, since the gesture destroys the
layout; Escape and the scrim also cancel) and *Discard my layout* / *Abandonner mon calepinage* (accent, destructive wording; the plugin's own word *calepinage* stays, the question keeps its table entry); confirming does what the
`if (confirm(...))` branch did, cancelling does nothing — the same two outcomes as today. **Voyages**: the refusal or the
failure is the sheet's body, one button *Close* (Escape and the scrim too); the card stays where it was and
`paintVoyage()` runs when the sheet is closed, not before (the native alert blocked the repaint; the sheet must not
let a half-updated board show under it). This is the epic's one deliberate flow change: the answer is now asynchronous, so
the gesture's code continues in the button's handler. It is written in `CHANGELOG.md`, in `docs/ecrans.md` (E-25, E-26, Q-20
and the "kept" cell of both rows), in P-11 and in the atelier/voyages lines of the journeys. *Narrowing*: if the atelier's
bench mode (`.atelier-full`, one z-index above the sheet) hides the sheet, the sheet takes the higher z-index
inside that mode only; if that cannot be done without touching the drawing, the task stops and says so (it does not choose); the narrowing — the atelier gesture kept native, written under Known
defects with the reason, the voyages one still landing — is then a decision taken and traced outside the task. *Rejected*: a shell helper in `PluginApi` (`api.confirm`) — a new
contract surface, AD-8; a toast for the voyages (it would vanish before being read).

(b) **Words the plugins compose themselves.** The planif and listening-post ("veille") screens, and every other plugin's `t()` call, are read
by `plugins/test/words.test.js` (it already fails on a missing French entry; its `TU_A_CORRIGER` list is **already empty**, so
that part of the register is closed — the task writes that down and does not invent an exception). What the task does is
reproduce what the sentence list *cannot* see: a phrase built by string concatenation or a template with an English word
around a `t()` (`${t('Gesture refused: ')}…`, `"⚠ %distance m from the route"`, `until %when`, the planif "clock off" line), under
`fr` on the bench, and give each one an entry, or a `%`-parameter, so the whole sentence is in the table. The
sentences built by the server (E-23, E-27) are not touched (AD-17 keeps them).
"1 pièces" (E-25): the table gets a singular entry (`'%n piece': '%n pièce'`, keeping `'%n pieces'` plural) and the
callers choose with the count the way `Cut the column (%n piece)` already does; zero reads "0 pièce", as the French does. The date of
`:::content{on=…}` (`editor/reader/ContentBlock.tsx`) is drawn through the shell's locale (`Intl.DateTimeFormat`, the
format the reader's other dates use); a value that is not a date is drawn as written, as today.

(c) **Drawing.** *E-28*: `carte.js` `taille()` reads the box's current client height when the walking mode is on
(`pc-full` / the class the walk sets) instead of the 0.62 ratio capped at 420 px, and redraws on the mode change and on
resize; outside the walk it returns what it returns today. *E-30*: when the scanner closes and its `opener` is no longer connected
(the composer folded its buttons), the focus goes to the composer's field; the plugin does it in `scanner.js` with
`document.querySelector` on the shell's composer field role, and the chat tranche's fold is what makes that element
stable for the browser test (hence the dependency, an ordering one: the fix itself reads only "the opener is gone"). *Amber*: the colour `--warning` means one thing in project-management: the owner's `Amber`
assessment (`.pm-timeline__span--amber`, `.pm-subproject__ico--amber`, the Amber chips). **Inferred lateness**
(`.pm-timeline__span--late`, the late milestone rules) leaves `--warning` and is drawn by shape — a dashed outline in `--text-muted` over the
same raised surface, plus the existing hover word — so a skin that flattens hues still tells the two apart, and the
colour keeps the owner's word only. `plugins/test/css.test.js` gains the rule: in `pm.css`, `--warning` appears only in selectors that name
`amber`. *Rejected*: moving lateness to `--danger` (it would read as the owner's `Red`).

(d) **The emojis kept in plugins.** The charter kept them under B-1 ("replacing adds icons to the contract"); B-1 is lifted for
the register, and no icon is added: the sprite's closed list is enough. Two kinds, kept apart. *Content marks* are the
author's or the engine's data and stay: `journal.ico`, an item's `ico`, the trip item types of `voyages`, a manifest tile `ic:`,
the `⛰` of a route card. *Chrome companions* — an emoji the plugin itself puts beside a word or on a control — go: `🖐` in
the voyages hints and the tray foot and `🧭 Follow`, `🥾 Walking mode` lose their emoji (the word carries the meaning); `📄 page`
chip → `file-text`; `📝`/`📎` marks of the todo rows → `pen-line`/`paperclip` with their title kept; `🗄 n` of the journal →
`archive`; `⚠ …` of listening-post and parcours → `triangle-alert`; `Done 🎉` of the atelier loses the emoji; the `🎧`/`🎬` fallback glyph of
listening-post is content (the media type) and stays. The `✦` of "extract" / "what's new?" and the `✓` of ticks are typographic glyphs of the plugins'
own vocabulary, not emoji: kept, and written as such in `docs/ecrans.md`. Each replaced mark keeps a text name (`title` or visible word); an
icon never stands alone (charter, backs). A test in `plugins/test/` lists the chrome companions it forbids in `web/*.js` string
literals (an allow-list of the content marks above, by file) — written first, red on `main`.

(e) **Order of the tests.** For (a) a node:test on each plugin's sheet (cancel / confirm / Escape, focus back) and on `vgesture`
with a fake `call`; for (b) a `words` test per concatenated sentence; for (c) a jsdom test of `taille()` in walk mode, the scanner
close test, and `css.test.js`; for (d) the emoji test. The bench scenario (`bench/scenarios/plugins-*.mjs`) takes the screens of
E-23 to E-31 touched here, **before and after** for E-28, under the four skins × `en`/`fr` × light/dark × desk/phone (AD-20).

*Reversed if*: the atelier's sheet cannot sit over its bench mode (see the narrowing above).

## Refactoring targets

Each target: what, where, why it costs, the tranche that owns it, and its outcome
(`closed`, or `kept: reason`), filled by that tranche.

| R | What and where | Why it costs | Tranche | Outcome |
|---|---|---|---|---|
| R-1 | MCP `Authorization: Bearer` header selection copied in `claude-code/driver.ts`, `copilot-cli/driver.ts`, `codex-cli/driver.ts` | three copies of a security-relevant rule | serveur | closed: `drivers/src/mcp-headers.ts`, pinned by a test written first |
| R-2 | Driver helpers duplicated: device-code `beginAuth`/`completeAuth`/`cancelAuth` (codex, copilot), `truncate` ×3 (`*/events.ts`), `health` ×2, `usageOf` ×3, `classifyAuthError`/`explainAuthProblem` ×2 (`*/auth.ts`) | drift between engines | serveur | closed: `engine-aids.ts` and `device-code.ts`; the engines pass their own tables |
| R-3 | `start()` (464 lines) and `buildApp` (287 lines) mix concerns; `TurnLimiter`, `runUnattended`, inline `/api/delegations` routes and the `adestiaRunTurn` monkey-patch live in `app.ts`; routes registered both from `routes/` and top-level files (`pages.ts`, `mcp-routes.ts`, `static.ts`, `files.ts`, `watch.ts`, `callback.ts`) | no single place says what is mounted | serveur | closed: every route is registered from `routes/`; the top-level files keep only their helpers and a re-export (`mcp-routes.ts` is a pure re-export); `app.ts` mounts, `turn-limiter.ts` and `unattended.ts` hold the rest; `start()` is named stages, order pinned by `start-order.test.ts` |
| R-4 | `field()` duplicated in `instruction-catalogues.ts` and `instructions.ts`; `routes/instruction-catalogues.ts` `sourceOf` / `fetchClone` / `cacheDir` duplicate `catalogueSource` / `fetchCatalogueClone` / `catalogueClone` of `instruction-catalogues-refresh.ts` | pure extraction, behaviour kept | serveur | closed: `field()` once in `frontmatter.ts`; the catalogue route calls the refresh module |
| R-5 | `pages.ts` doubles as a frontmatter library for `instructions.ts`, `instruction-catalogues.ts`, `schedule.ts`, `shell-tools.ts` | a route module as a dependency; move without changing the parser (AD-7) | serveur | closed: `server/src/frontmatter.ts`, bodies untouched; the CRLF divergence stays (AD-7) |
| R-6 | Dead interface removed; test-only helpers removed from production indexes; remaining public types, test imports and boot entry points named below | surface limited to its consumers | serveur | closed: 178 entries remain, all named below |
| R-7 | Comments pointing to absent documents: `technique.md` (server sources and tests), `ATELIER-3.md` (`plugins/atelier/web`), `PARCOURS.md` and "D44 côté cerveau" (`plugins/parcours/web`) | dead references | serveur (server), plugins (plugins) | server: closed; plugins: closed — no comment under `plugins/` names `ATELIER-3.md`, `PARCOURS.md` or "D44 côté cerveau" any more (`git grep` finds none) |
| R-8 | `eslint.config.js` claims floating promises and thrown-away errors are caught, which its rules cannot do (no type-aware rule, `caughtErrors: 'none'`); `plugins/` not linted; lint not in CI | a claim the gate does not keep | serveur (CI, claim), plugins (plugins lint) | server: closed — claim rewritten, `npm run lint` in CI; plugins: closed — `npm run lint` (`eslint packages plugins`) covers `plugins/` and is clean |
| R-9 | Test support rewritten per file: the fake `Driver` in 10 test files, `git()` in 5, `mkdtemp` in 39 | each new test copies one | tests | closed: `packages/server/test/support/` holds the three, and every file that rewrote them imports them |
| R-10 | `web/test/page-editor.test.tsx` "tells the plugin when it takes the file…" reported flaky; turn-counting waits (`setImmediate`) in `callback.test.ts`, `mcp.test.ts`, `restart.test.ts`; fixed sleeps in `watch`, `pages`, `shell-tools`, `background` tests | races dressed as delays (CLAUDE.md) | tests | closed: no `setImmediate` is left in `callback`, `mcp`, `restart` tests (a wake or a call is a deferred the fake resolves; a negative case is proved by a sentinel that does wake, or by `app.close()`), and the sleeps of `watch` (chokidar's own `ready`, through the test's watcher factory), `pages` (`utimes`), `shell-tools` and `background` (a faked `Date`) are gone. Page-editor flake: its waits (`findBy*`, `waitFor`) spend a one-second wall-clock budget on a chain of promises the test resolves itself, and a loaded machine runs it out; reproduced under `yes` load on the neighbour test "saves with the revision…" (`[data-mounted]` not there in time). The file now drains the chain with an async `act`, no budget left |
| R-11 | Web: about 40 `fetchImpl(` call sites and 14 hand-rolled live guards, `failure()` (`CataloguePopin.tsx`) and `json()` (`chat/conversations.ts`) local to one file; `toMessage` duplicated in `useConversations.ts` and `Delegations.tsx`, drifted (the second drops `signatures`, kept as defect); `prettify` ×3, `folderOf` ×2, `isIndexPage` ×2 with different rules (`app/sections.ts`, `app/collections.ts`, `editor/nodes.ts`, `editor/listing.ts`) | one idea, several answers | charte (the shared request helper), pages, chat for `chat/` | closed for the charter's part: `packages/web/src/app/request.ts` (`requestJson`, `jsonInit`) is the one way the shell's settings and entry code talks to the server (it never throws, the fallback message is said in the locale, `fetchImpl` stays injected); `failure()` of `CataloguePopin.tsx` is absorbed, and `Gates`/`signin.ts`/`useInstance.ts`, `Settings`, `Preferences`, `McpServers`, `Instructions`, `CataloguePopin`, `Configuration` and `Delegations` call it, the restart included (a refusal keeps its parsed body in `data`: how many turns run). No raw `fetchImpl(` is left in those files. closed for the pages' part: `app/paths.ts` holds `prettify`, `folderOf`, `isIndexFile` and `isIndexPath` once (AD-13 a), and `Home`, `usePage`, `live` (`requestRaw`), `PageEditor`, `Attachments`, `Editor` and the reader's file list go through `requestJson`/`requestRaw`. closed for the chat: every network call uses `requestJson` or `requestRaw` (including streams, stop and upload); `json()` is absorbed. `messages.ts` defines `toMessage` once; Delegations passes `{ signatures: false }`, preserving the written defect (AD-12). |
| R-12 | Giant components: `App` 571 lines, `useConversations` 456; files `Reader.tsx` 1153, `Editor.tsx` 703, `Instructions.tsx` 591, `Home.tsx` 546, `Chat.tsx` 542, `Configuration.tsx` 456 | unreadable, untestable in parts | pages (App, Reader, Editor, Home); chat (Chat, useConversations, Composer); charte (Instructions, Configuration, McpServers) | closed for the charter's part: `Instructions.tsx` (591 → 146 lines), `Configuration.tsx` (456 → 160) and `McpServers.tsx` are each a short screen over parts in `app/instructions/`, `app/configuration/` and `app/mcp/` (list, editor, name sheet, model and hook for the first; fields, restart bar and hooks for the second; list, detail, health and declaration hook for the third), none over 190 lines, and the exports the tests import are kept. closed for the pages: `App` wires gates/state into `CanvasHeader`, `Canvas` and `ScreenEdges`; `Home` composes `Brief` and `Domains`; `Editor` wires `useAutosave`, `useEditorSurface`, `usePageDrop` and `SaveStatus`; `Reader.tsx` keeps the frame and exports over `reader/` renderers by kind. No function in App, Home, Editor or Reader exceeds 250 lines. closed for the chat: `Chat` delegates to `ChatHeader`, `TabStrip`, `ConversationList` and `Thread`; `useConversations` wraps `useOpenConversations`, `useTurn`, `useTabActions`; `Composer` extracts `useUploads`. No function in `chat/` exceeds 250 lines (`node bench/long-functions.mjs packages/web/src/chat`), with no kept exception; existing exports and behaviours remain (AD-12). |
| R-13 | `copilot-cli/driver.ts` › `SHELL_TOOL_CLI_SOURCE`, a whole JS program in a template string | untyped, unlinted | serveur (real file read at build, behaviour kept) | closed: `copilot-cli/shell-tool.mjs`, copied under `dist/` by the drivers `build`, bytes pinned by a test |
| R-14 | `server/test/catalogues-ui-ensemble.test.ts` skips itself without Playwright or a built web shell, so it never runs in a plain `npm test` | a suite that looks green and never ran | tests | closed: the suite runs in `npm test` (the shell is built in its `beforeAll` when `dist-web` is absent; without Playwright it skips and says `no playwright` in its title and in a `console.warn`); its first case, stale since Catalogues moved into the Instructions page (E-11/E-12), was corrected by the tester |
| R-15 | `zod` imported dynamically by `server/src/drivers.ts` but declared in no `package.json` | works only by hoisting | serveur | closed: `zod` declared in `packages/server/package.json` |

### How the server tranche meets its targets (R-1 to R-8, R-13, R-15)

Written before the code, so that each task of `adestia-qualite-serveur` is held to the same
rules. The server outcomes above are filled.

- **Same bytes, one home.** A shared helper takes the strictest copy's behaviour only if the
  copies are identical; where two copies differ (R-2's `truncate` ×3, `usageOf` ×3, `health` ×2
  are suspects), the helper takes the difference as a parameter and each engine passes its own.
  A difference found is written in the "Known defects" section of this file, never harmonised (AD-1).
- **A characterization test before a move, when none exists.** R-1 (the Bearer rule: which
  servers get the user's token, which get the instance's, which get none) and R-3 (the boot
  order that `start.ts` comments carry) have thin cover today: each gets a test that pins
  today's behaviour first, run green before the move and unchanged after it.
- **R-3, what "mounted" means.** Every route is registered from a module under `routes/`;
  `buildApp` only calls them, in today's order. `buildApp` keeps its signature (the tests call
  it). `adestiaRunTurn` stops being an untyped property: a typed decoration the boot reads, the
  same behaviour. `TurnLimiter` and `runUnattended` (now `makeRunUnattended`) move to their own modules; `start()` becomes
  a sequence of named steps whose order is the order of today's code, and no step function
  exceeds 150 lines.
- **R-2, one definition, the differences as parameters.** `drivers/src/engine-aids.ts` holds
  `truncate`, `health`, `usageOf` and `classifyAuthError`/`explainAuthProblem`; `device-code.ts`
  holds the `beginAuth`/`completeAuth`/`cancelAuth` run. The copies agreed except where an engine
  speaks its own language, and that stays the engine's: Codex's startup words (`ready`, `starting`)
  versus Copilot's pass-through status words are two tables given to `health`; each engine's
  counters, error fragments and sentences are its own tables; Copilot's consent text and token
  check, Codex's pasted-credential path, are hooks of the flow. No difference was a defect.
- **R-5, a move, not a merge.** `splitFrontmatter` and `parseFrontmatter` move out of `pages.ts`
  into their own module with their bodies untouched; `instructions.ts`, `instruction-catalogues.ts`,
  `schedule.ts` and `shell-tools.ts` import from it. The CRLF divergence stays (AD-7; repaired later by `adestia-correctifs`, see the note under AD-7).
- **R-6, how exports are counted.** `scripts/unused-exports.mjs` lists every named export of
  `packages/*/src` except `packages/web` (the web exports belong to the screen tranches) that no other file under those sources imports, re-exports through an
  index, or names; it prints `file:name`. A name used only by `test/` counts as unused by
  production. Remaining hits are package public-contract types, internal exports kept
  for their tests under the R-6 arbitration, or runtime entry points outside the graph;
  each is named below. Every other hit is un-exported or deleted.
  Run `node scripts/unused-exports.mjs`: sorted entries go to stdout, the count to stderr.
  The baseline before export removal is **292** entries. The TypeScript module graph uses
  `tsconfig.base.json` source aliases and counts type imports, aliases and re-exports
  (including `export *`). Each barrel has its own entries; its re-export consumes the
  original module's export. All package sources, including web, supply importers; web
  exports are omitted from the report. Namespace imports and literal dynamic imports or
  `require` calls conservatively consume the target's whole surface; import types with a
  qualifier consume its first name. Tests, `bin/`, bench scripts, plugins and computed
  module paths are outside the graph: check their runtime uses before removing a hit.

  The final inventory is **178** entries: public contract types below,
  test-only exports retained under the R-6 arbitration, and the boot entry points.
  No measurement rule or test was changed.

  Public contract types (each row names the package index):

  | Index | Types without another production importer |
  |---|---|
  | `packages/content/src/index.ts` | `AttributeSpec`, `BlockClaim`, `BlockContent`, `BlockContext`, `DiagnosticSeverity`, `FieldGroup`, `FieldKind`, `FrontmatterRead`, `Reference`, `Resolution` |
  | `packages/drivers/src/index.ts` | `ArmedToken`, `ArmingFlow`, `AuthMode`, `AuthPrompt`, `AuthSource`, `AuthState`, `AuthStatus`, `Capability`, `ClaudeCodeOptions`, `CodexDriverOptions`, `ConformanceIssue`, `ContentBlock`, `CopilotDriverOptions`, `ExchangeOptions`, `McpOAuth`, `McpServerConfig`, `McpServerHealth`, `ModelInfo`, `ModelUsageEntry`, `OAuthFlowOptions`, `PendingAsk`, `Pkce`, `QueryFn`, `QueryHandle`, `QueryParams`, `QuotaReport`, `QuotaWindow`, `RawMessage`, `SdkMessage`, `ShellToolParam`, `SignatureRequest` |
  | `packages/schemas/src/index.ts` | `PluginBlockAttribute`, `PluginKind`, `PluginMcpServer`, `PluginTile`, `SettingGroup`, `SettingKind`, `SettingSource`, `ValidationIssue` |
  | `packages/server/src/index.ts` | `ActivationConfig`, `AdestiaConfig`, `AgentFile`, `AppDependencies`, `ArmingFlow`, `AttachmentLimits`, `AttachmentOwner`, `AttachmentsConfig`, `AuthConfig`, `AuthMode`, `AuthOutcome`, `ClockOptions`, `Conversation`, `ConversationMeta`, `DelegationPort`, `DiscoveredPlugin`, `DiscoveredSkin`, `DiscoveryProblem`, `DriverConfig`, `ExtensionSource`, `ExtensionsConfig`, `FileKind`, `FilesOptions`, `HostProblem`, `Identity`, `Job`, `JobSeed`, `JobState`, `JsonRpcRequest`, `LoginState`, `McpConfig`, `McpDependencies`, `McpInConfig`, `McpServer`, `McpServerConfig`, `McpServerView`, `McpSource`, `McpTool`, `MissionPaths`, `OidcConfig`, `PageContent`, `PageInfo`, `PagesOptions`, `PermissionsConfig`, `PluginApiContext`, `PluginDiscovery`, `PluginPayload`, `ProxyAuthConfig`, `RequestLike`, `ScheduleConfig`, `ScheduleState`, `ScheduledNote`, `ScreenView`, `SessionPayload`, `SignaturesConfig`, `SkillAsset`, `SkillFile`, `SkinPayload`, `StartOptions`, `StartedInstance`, `StaticOptions`, `StoredAttachment`, `StoredMessage`, `StoredSecret`, `WatchConfig`, `WorkspaceConfig`, `WorkspaceFile` |

  Internal exports kept for their tests (the index export of `isKnownBlock` is also
  retained because those tests import the package index):

  | Module | Exports | Importing tests |
  |---|---|---|
  | `packages/content/src/frontmatter.ts` | `splitFrontmatter` | `packages/content/test/frontmatter.test.ts` |
  | `packages/content/src/index.ts` | `isKnownBlock` | `packages/server/test/extensions.test.ts`, `packages/web/test/loader.test.ts` |
  | `packages/content/src/reference.ts` | `formatReference`, `isValidId` | `packages/content/test/reference.test.ts` |
  | `packages/content/src/validate.ts` | `frontmatterOf` | `packages/content/test/roundtrip.test.ts` |
  | `packages/content/src/validate.ts` | `isEditable` | `packages/content/test/validate.test.ts` |
  | `packages/drivers/src/claude-code/oauth.ts` | `CLIENT_ID`, `ONE_YEAR_SECONDS`, `REDIRECT_URI`, `TOKEN_URL`, `authorizeUrl`, `createPkce`, `exchangeCode`, `splitPastedCode` | `packages/drivers/test/oauth.test.ts` |
  | `packages/drivers/src/codex-cli/auth.ts` | `apiKeyDocument` | `packages/drivers/test/codex.test.ts` |
  | `packages/drivers/src/codex-cli/driver.ts` | `quotaReportOf` | `packages/drivers/test/codex.test.ts` |
  | `packages/drivers/src/codex-cli/events.ts` | `describeItem`, `usageOf` | `packages/drivers/test/codex.test.ts` |
  | `packages/drivers/src/codex-cli/login.ts` | `readPrompt`, `saidSuccess`, `stripAnsi` | `packages/drivers/test/codex.test.ts` |
  | `packages/drivers/src/codex-cli/protocol.ts` | `SpawnedProcess` | `packages/drivers/test/codex.test.ts` |
  | `packages/drivers/src/conformance.ts` | `assertConformance` | `packages/drivers/test/conformance.test.ts` |
  | `packages/drivers/src/conformance.ts` | `checkConformance` | `packages/drivers/test/claude-code.test.ts`, `packages/drivers/test/codex.test.ts`, `packages/drivers/test/conformance.test.ts`, `packages/drivers/test/copilot.test.ts` |
  | `packages/drivers/src/contract.ts` | `CAPABILITIES` | `packages/drivers/test/conformance.test.ts` |
  | `packages/drivers/src/copilot-cli/events.ts` | `toolTargetOf` | `packages/drivers/test/copilot.test.ts` |
  | `packages/drivers/src/copilot-cli/login.ts` | `harvestToken`, `ptyLogin` | `packages/drivers/test/copilot.test.ts` |
  | `packages/drivers/src/signatures.ts` | `signatureRequest` | `packages/drivers/test/signatures.test.ts` |
  | `packages/server/src/app.ts` | `buildVersion`, `sseFrame` | `packages/server/test/app.test.ts` |
  | `packages/server/src/attachments.ts` | `safeName` | `packages/server/test/attachments.test.ts` |
  | `packages/server/src/callback.ts` | `registerCallback` | `packages/server/test/callback.test.ts` |
  | `packages/server/src/clock.ts` | `readState`, `writeState` | `packages/server/test/schedule.test.ts` |
  | `packages/server/src/config.ts` | `DEFAULT_SESSION_TTL_MS` | `packages/server/test/auth.test.ts`, `packages/server/test/oidc-routes.test.ts`, `packages/server/test/oidc.test.ts` |
  | `packages/server/src/conversations.ts` | `isSafeId` | `packages/server/test/conversations.test.ts` |
  | `packages/server/src/delegations.ts` | `titleFor` | `packages/server/test/delegations.test.ts` |
  | `packages/server/src/files.ts` | `kindOf` | `packages/server/test/files.test.ts` |
  | `packages/server/src/files.ts` | `registerFiles` (re-export of `routes/files.ts`) | `packages/server/test/files.test.ts`, `packages/server/test/mono-store-witness.test.ts`, `packages/server/test/pages-stores.test.ts` |
  | `packages/server/src/introduction.ts` | `CONTRACT_NAME` | `packages/server/test/introduction.test.ts` |
  | `packages/server/src/io.ts` | `inFlight` | `packages/server/test/io.test.ts` |
  | `packages/server/src/mcp-routes.ts` | `registerMcp` | `packages/server/test/mcp.test.ts` |
  | `packages/server/src/mcp-store.ts` | `MCP_MASK` | `packages/server/test/mcp-servers.test.ts` |
  | `packages/server/src/oidc.ts` | `identityFrom`, `isAllowed` | `packages/server/test/oidc.test.ts` |
  | `packages/server/src/pages.ts` | `registerPages` (re-export of `routes/pages.ts`) | `packages/server/test/mono-store-witness.test.ts`, `packages/server/test/pages-stores.test.ts`, `packages/server/test/pages.test.ts` |
  | `packages/server/src/plugin-host.ts` | `mountPluginApis` | `packages/server/test/plugin-host.test.ts`, `packages/server/test/plugin-secrets.test.ts` |
  | `packages/server/src/schedule.ts` | `GRACE_MINUTES`, `MIN_PERIOD_MINUTES`, `parseAt`, `parseEvery`, `parseNote` | `packages/server/test/schedule.test.ts` |
  | `packages/server/src/secrets.ts` | `ARMING_TTL_MS` | `packages/server/test/secrets.test.ts` |
  | `packages/server/src/settings-file.ts` | `coerce`, `replaceContents` | `packages/server/test/settings-file.test.ts` |
  | `packages/server/src/shell-tools.ts` | `ulid` | `packages/server/test/shell-tools.test.ts` |
  | `packages/server/src/static.ts` | `registerStatic` (re-export of `routes/static.ts`) | `packages/server/test/static.test.ts` |
  | `packages/server/src/watch.ts` | `EventsOptions`, `registerEvents` (re-exports of `routes/watch.ts`) | `packages/server/test/watch.test.ts` |

  Runtime entry points outside the graph: `packages/server/src/start.ts` exports
  `start` for `bench/launch.mjs` (a computed dynamic import of the built module),
  and `start` / `loadConfigFile` for `packages/server/bin/adestia.js`. Both are
  also imported by the server boot tests. Plugins use their own modules and
  the host HTTP protocol, not the removed package re-exports; web source imports
  are already included in the measurement.
- **R-8, a claim the gate keeps.** `eslint.config.js` is rewritten to say what its rules do
  (no type-aware rule, so no floating-promise check; `caughtErrors: 'none'`, so an ignored caught
  error is allowed). Turning on type-aware rules would fire on deliberate fire-and-forget
  calls and is **kept: a cost out of proportion to a quality pass**, noted for the
  recommendations. `npm run lint` joins the CI job beside `typecheck` and `test`.
- **R-13, a real file.** The Copilot shell-tool CLI becomes a real `.mjs` file beside the driver;
  the driver writes the same bytes it writes today, found whether it runs from `src/` (tests) or
  from `dist/` (the image). The program is linted with the rest.
- **R-15.** `zod` is declared in `packages/server/package.json` at the version the lockfile
  already resolves, and the lockfile is edited to match; no other package moves.

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

- **P-5 step 7: the open page does not refresh after an agent write.**
  `app/useInstance.ts` refetches only the index on the change feed; it deliberately
  leaves the open page alone to protect unsaved editor text. The revision check
  reports a conflict on save. This predates the pages tranche; automatic refresh
  of the open page needs a separate behaviour decision. Carry it into the epic's
  closing recommendations; the browser bench must not require that refresh.
- **Nestor's send control still uses the `↑` glyph**, supplied by its skin.
  Kept during the pages tranche; the skin's control remains for a separate fix.
- **The chat's native model select says `Auto` (`chat/ModelPicker.tsx`)**, outside the pages tranche.
- **E-6's block settings can overlap the banner at 1440 px.** Observed during the
  pages review; left unchanged by the typography and documentation correction.
- **A page diagnostic can mix languages on a French instance.** Its translated
  frame draws the server's diagnostic text as received, outside the screen's
  translation table; left for a separate API/diagnostic translation decision.

- **A root page's breadcrumb can invent a folder**: `app/trail.ts` derives the parent
  with `path.slice(0, path.lastIndexOf('/'))`. Without a slash it drops the last
  character instead of returning the empty parent that `app/paths.ts`'s `folderOf`
  returns. Kept separate to preserve behaviour; correcting the breadcrumb needs its own fix.

- **MCP server counts disagree**: the Settings tile can say “6 servers” while the MCP
  breadcrumb badge says “7 servers”. Observed during the charter review; whether it
  predates this epic is unknown. Kept under B-1, pending a separate behaviour investigation.

- **P-2 step 4: a refused turn (429) can stay silent.** `chat/stream.ts` yields
  the refusal as a live error. `chat/Thread.tsx` draws its error line only while
  that live state is present; `useConversations.ts` › `consume` clears it when
  rereading the stored conversation succeeds, losing the refusal message.
  P-2 says the chat explains the
  refusal; this predates the tranche and stays under AD-7. Overall acceptance
  must carry this discrepancy: `bench/tests/chat-p2-gestes-besoin.test.mjs`
  checks HTTP 429 and the freed composer, without requiring an error line.
- **Attachment names still carry a text emoji in the optimistic user bubble.**
  `chat/useConversations.ts` › `stamped()` appends `📎` and the attachment names
  to the message text kept in the open conversation's state. The held bubbles
  and attachment controls use the `paperclip` icon, but this text emoji remains
  unchanged under AD-7.
- **Delegations drop signatures**: `app/Delegations.tsx` calls the shared
  `chat/messages.ts` › `toMessage` with `{ signatures: false }`, while the chat keeps
  `stored.signatures` by default (AD-12, preserved under AD-7). To be confirmed
  that a delegation transcript can carry signatures.
- **Native dialogs in plugins**: `plugins/atelier/web/app.js` asks `confirm()` before resetting a
  layout and `plugins/voyages/web/app.js` shows `window.alert` for a refused gesture; unstyled,
  unlocalised by the browser's own words, not closeable like a sheet. Replacing them changes the flow
  (the answer is asynchronous), so it was kept by `adestia-qualite`; `adestia-correctifs-plugins` repairs it (AD-24 a).
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
- **Skippy's status banner wraps onto two lines on the phone**, found by the sweep at phone
  width; not fixed by this epic.
- **E-14: the switch sits apart from its title on the phone**, the row wrapping between them.
  Seen in the sweep; kept for a separate layout correction.
- **E-19 detail in English under the French locale** when the server sent no code: the detail
  is then the raw server text, which no catalogue translates.
- **A catalogue token field has no `autoComplete`**, so a browser may offer to fill or save it
  as a password.
- **E-23 (planif) says the server's sentences in English.** A note's problem (`carries both
  \`every\` and \`at\``, `the note is empty — its body is the prompt`, `below the 15-minute floor`…) is
  built by `plugins/planif/api.mjs` and `schedule.ts` and drawn as received; no table holds it, and
  `words.test.js` cannot see a sentence that comes from data. Same for E-27's failure reason of a
  source (`muet: fetch failed`, the fetch's own text). Translating them is a change to what the API
  answers or a table keyed by those sentences: left.
- **E-28's walking map keeps its pre-walk size.** In walking mode the map's box fills the screen, but
  `carte.js` draws the SVG at `taille()` (at most 420 px high, the width it had), so on a phone the
  map takes the top quarter and the rest is blank; it is drawn full again only on leaving. Found by
  the matrix, not caused by the tranche; fixing it changes the drawing engine.
- **E-30 on a phone: the focus is lost when the reader closes.** The composer folds its buttons on a
  narrow screen and drops the item that opened the reader; the plugin's `opener` is then no longer in
  the document and nothing takes the focus. The shell's fold would have to hand it back; the matrix
  notes it (`NOTE … focus not returned`) rather than failing on it.
- **E-25's piece sheet shows the workbook's own words under `en`**: edge names such as `about-droit`
  and piece references come from the workbook data, which the plugin does not translate.
- **E-25 says « 1 pièces »** in French: the table's `%n piece` entry is « %n pièces », as the French
  read before the atelier had a table (B-1), so a plate of one piece gets a plural.
- **E-26's card sheet names the item's type with the data's own word** (`trajet`, `resto`) under `en`:
  the type is an identifier of `voyage.json`, drawn as it is written.
