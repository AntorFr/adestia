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
  `bench.mjs` and `scenarios/`; `live-codex.sh` boots a real Codex engine.
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
  visual check (docker). CI (`.github/workflows/ci.yml`) runs typecheck and tests.

## Decisions of adestia-qualite

### AD-1 — No behaviour change
Every refactoring keeps routes, API shapes, configuration keys, file formats
(`docs/donnees.md`) and MCP tools. The existing suite is the witness; a refactoring with no
test around it gets a characterization test first. A defect found on the way is written in
`.agent/status.md` › Known defects, not fixed.
*Why*: a quality pass is reviewable only if its diff means "same thing, written better".
*Rejected*: "fix while we're there" — it mixes a behaviour change into a diff nobody reviews
as one. *Reversed if*: a defect blocks a refactoring outright; it then becomes its own feature.

### AD-2 — A launcher on the fake engine, outside the product
One term: **the fake engine**, a scripted fake driver handed to the server through
`start({ driverFactory })`. A script under `bench/` starts the server on the fake engine
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
| R-9 | Test support rewritten per file: the fake `Driver` in 9 test files, `git()` in 5, `mkdtemp` in 39 | each new test copies one | tests | |
| R-10 | `web/test/page-editor.test.tsx` "tells the plugin when it takes the file…" reported flaky; turn-counting waits (`setImmediate`) in `callback.test.ts`, `mcp.test.ts`, `restart.test.ts`; fixed sleeps in `watch`, `pages`, `shell-tools`, `background` tests | races dressed as delays (CLAUDE.md) | tests | |
| R-11 | Web: about 40 `fetchImpl(` call sites and 14 hand-rolled live guards, `failure()` (`CataloguePopin.tsx`) and `json()` (`chat/conversations.ts`) local to one file; `toMessage` duplicated in `useConversations.ts` and `Delegations.tsx`, drifted (the second drops `signatures`, kept as defect); `prettify` ×3, `folderOf` ×2, `isIndexPage` ×2 with different rules (`app/sections.ts`, `app/collections.ts`, `editor/nodes.ts`, `editor/listing.ts`) | one idea, several answers | charte (the shared request helper), pages, chat for `chat/` | |
| R-12 | Giant components: `App` 571 lines, `useConversations` 456; files `Reader.tsx` 1153, `Editor.tsx` 703, `Instructions.tsx` 591, `Home.tsx` 546, `Chat.tsx` 542, `Configuration.tsx` 456 | unreadable, untestable in parts | pages (App, Reader, Editor, Home); chat (Chat, useConversations, Composer); charte (Instructions, Configuration, McpServers) | |
| R-13 | `copilot-cli/driver.ts` › `SHELL_TOOL_CLI_SOURCE`, a whole JS program in a template string | untyped, unlinted | serveur (real file read at build, behaviour kept) | |
| R-14 | `server/test/catalogues-ui-ensemble.test.ts` skips itself without Playwright or a built web shell, so it never runs in a plain `npm test` | a suite that looks green and never ran | tests | |
| R-15 | `zod` imported dynamically by `server/src/drivers.ts` but declared in no `package.json` | works only by hoisting | serveur | |

### How the server tranche meets its targets (R-1 to R-8, R-13, R-15)

Written before the code, so that each task of `adestia-qualite-serveur` is held to the same
rules. The outcome column above stays blank until the documentation tranche fills it.

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
  same behaviour. `TurnLimiter` and `runUnattended` move to their own modules; `start()` becomes
  a sequence of named steps whose order is the order of today's code, and no step function
  exceeds 150 lines.
- **R-5, a move, not a merge.** `splitFrontmatter` and `parseFrontmatter` move out of `pages.ts`
  into their own module with their bodies untouched; `instructions.ts`, `instruction-catalogues.ts`,
  `schedule.ts` and `shell-tools.ts` import from it. The CRLF divergence stays (AD-7).
- **R-6, how exports are counted.** `scripts/unused-exports.mjs` lists every named export of
  `packages/*/src` except `packages/web` (the web exports belong to the screen tranches) that no other file under those sources imports, re-exports through an
  index, or names; it prints `file:name`. A name used only by `test/` counts as unused by
  production. What remains after the tranche is a type that is part of a package's public
  contract (the `index.ts` of a package), each named in this section when it is known; every
  other hit is un-exported or deleted.
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

## Known defects (found, not fixed by this epic)

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
