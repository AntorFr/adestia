# Adestia — data

> Product documentation. On `epic/adestia-qualite`, the target of the epic's framing; on
> `main`, exactly what is built. Stable identifiers, never renumbered: `B-n` (needs), `P-n`
> (journeys), `E-n` (screens, `docs/ecrans.md`), `AD-n` (decisions, `ARCHITECTURE.md`).
>
> Written by the epic `adestia-qualite` (2026-10-15) from the server code at v0.88.0. `B-1`
> says every file on disk and its format stays unchanged: this document is the reference a
> refactoring tranche is checked against.

## Where data lives

Three roots, plus the extension folders. Nothing is held in a database.

- **The config file** — `adestia.config.yaml` in the working directory, or the path given by
  `adestia --config`. Read at boot by `loadConfigFile` / `parseConfig`; a missing file is a
  first run on defaults. `${VAR}` in a value is replaced from the environment; unknown keys
  refuse the boot. E-14 Configuration edits it in place through `settings-file.ts`,
  which writes only keys the catalogue `SETTING_GROUPS` declares (today three:
  `workspace.watch.enabled`, `workspace.watch.polling`, `workspace.watch.intervalMs`; `adestia-ajouts` adds `maxConcurrentTurns`, B-21) and
  keeps comments and layout through `yaml`'s document API. A read-only file (ConfigMap,
  `:ro` mount) is reported by `writability`, not written.
- **The data directory** — `dataDir`, default `./data`, overridden by `ADESTIA_DATA_DIR`
  (`/data` in the image, a declared volume). Everything the product writes for itself:
  conversations, credentials, its own state files, fetched clones. Never the agent's
  working directory.
- **The workspace** — `workspace.root`, default `./workspace`, overridden by
  `ADESTIA_WORKSPACE` (`/workspace` in the image, a declared volume); created at boot if
  missing. The agent's working directory. Inside it, by default: `pages/`
  (`workspace.pages`, the memory), `memory/` (`workspace.memory`), `planif/`
  (`workspace.planif`), and the engine's own instruction folders (`.claude/`, `.github/`,
  `.codex/`, `CLAUDE.md`, `AGENTS.md`).
  - **Memory stores** (`stores.ts`). The memory is the union of the stores declared in
    `workspace.stores` (`id`, `path`, `at`, `label`, `hue`, `default`); absent, one store
    `perso` at `workspace.pages`. A store's `path` is absolute or relative to the workspace;
    `at` mounts it under a logical folder; the default store is the root. A logical path
    never names its store. Stores outside the workspace (`foreignRoots`) are declared to
    the engine on every turn as extra roots (`additionalDirectories` for Claude Code,
    `--add-dir` for Copilot, `writableRoots` for Codex).
  - `workspace.umask`, when set, is applied to the process before the first `mkdir`, and
    is inherited by the engine and everything it spawns.
- **Plugins and skins** — `extensions.pluginsDir` (default `./plugins`, env
  `ADESTIA_PLUGINS_DIR`) and `extensions.skinsDir` (default `./skins`, env
  `ADESTIA_SKINS_DIR`), read-only to the product; the image ships `/app/plugins`,
  `/app/skins` and `/app/skills`. `extensions.sources` adds roots: a `dir` is read where it
  is, a `repo` is cloned into `<dataDir>/extensions/`.
- **Outside the three roots**, not chosen by Adestia: the engine CLI's own state under the
  process `HOME` for Claude Code (sessions, its own settings — the driver sets no home);
  the shell-tools socket in the OS temp directory when `<dataDir>/shell-tools.sock` would
  exceed 100 bytes; and the browser's `localStorage` (`adestia.theme`, `adestia.model`,
  `adestia.tabs`, `adestia.read`, `adestia.rail`, `adestia.order.domains`,
  `adestia.signatures`, `adestia.connect.hidden`), per browser, never sent to the server.

## Entities

Who acts: the **user** through a screen, the **agent** through its file tools and the shell
tools (`rename_conversation`, `new_id`, `find_pages`), the **owner** through the config file
and the environment, a **calling agent** through inbound MCP. No route tells the owner from
a user (see Rules of access).

- **Conversation** — a chat thread of one user. Stored as one JSONL file per conversation
  under that user's hashed directory (`ConversationStore`). From E-16 Chat rail the user
  creates it (first message, or **＋**) and archives it, nothing more; the agent renames it
  with `rename_conversation`; a turn appends to it. The server also answers a rename
  (`PATCH /api/conversations/:id`), an unarchive (`archived: false`) and a delete
  (`DELETE /api/conversations/:id`), which no screen reaches (`ARCHITECTURE.md` › Known
  defects, `deleteConversation`); an archived conversation is not listed. Carries the engine session it resumes
  (`session` line). Belongs to exactly one user; the workspace is shared, conversations are
  not.
- **Context-lost mark** (`adestia-ajouts`, B-22) — not an entity: one optional boolean
  `contextLost` on the **first** agent message the turn writes (the turn writes one per part), when the turn ran on a fresh engine session while the
  conversation carried an earlier one. Written by the server at the end of that turn; read by
  E-16 to draw the marker. Absent everywhere else.
- **Message / turn** — a message is one line of a conversation, `role` `user` or `agent`. A
  turn is one engine run started by a user message; it writes one agent message per part it
  said (`recordOutcome`), the last carrying `stopped`, `error`, `usage`. A message posted
  while a turn runs is filed at once with `after: <turn id>` and read back after that
  turn's answer (`inTurnOrder`). Turns started by the clock or a callback wake run in no
  conversation and write nothing to one.
- **Attachment** — a file a user drops in the composer or on a page. Stored outside the
  workspace in that user's inbox box (`AttachmentInbox`), one folder per upload batch; the
  message keeps only the text the user typed, the agent is told the paths in the prompt
  frame (`frameAttachments`). The agent reads it and may file a copy into the pages; the
  inbox copy is swept after `attachments.ttlMs`.
- **Page** — a markdown file with an optional YAML frontmatter (the first thing in the
  file, between `---` lines), in a store. Typed by its `type:` field; core fields `title`,
  `type`, `ico`, `id`, `couleur`, `status`, `domaine`, `cat`, `tags`, `date`
  (`CORE_FIELDS`, `packages/content`). Its body may hold blocks from the closed vocabulary
  (`:::callout`, `:::app`, `:::row`, `:::gallery`, `:::content`, `:::figures`, `:::table`,
  `:::list`, plus blocks an active plugin teaches; reserved attributes `id`, `w`, `from`,
  `title`, `ico`), and references `[[<type>#<id>]]` or paths. The user edits it in E-4 Page
  (`PUT /api/pages/*`, validated, canonicalised by the content pipeline, refused on
  a vocabulary error or a stale `revision`); the agent edits it with its own file tools,
  unvalidated; a plugin writes through `PagesService.write`. No route deletes a page.
  Addressed by its logical path (`#/page/<path without .md>`).
- **Collection** — a page with `type: collection` and `of:` (the `type` it gathers),
  optionally `groupBy`, `labels`, `into`. The shell draws it as a grid; nothing else is
  stored.
- **Section / folder** — any folder holding pages is a section (`#/section/<folder>`);
  dressed optionally by `INDEX.md` or `<folder>/<folder>.md`. Homonymous folders of two
  stores merge.
- **Curated brief** — `home/brief.json` in the memory (logical path, default store wins),
  written by the agent when asked; shape `{generatedAt, items: [{ico, title|titre,
  reason|raison, target|cible: {type, path, id}}]}`; read by E-2 Home.
- **Instruction file** — prose the engine reads: the authority file (`CLAUDE.md`,
  `AGENTS.md`, `.github/copilot-instructions.md`), skills (`<zone>/<name>/SKILL.md` and
  their assets), subagents (`.claude/agents/<name>.md`, `.github/agents/<name>.agent.md`).
  The zones are declared by the active driver (`instructionPaths`). The user reads and
  edits them on E-11 Instructions; a file carrying `MANAGED_MARKER` is refused for
  edit (409). The core rewrites its own and every active plugin's skills and subagents at
  each boot (`deliverSkills`, `deliverAgents`); the agent may edit any of them with its
  tools.
- **Instruction catalogue and import** — a git repository declared from E-12 Catalogue
  pop-in (`id`, `repo`, `ref`, optional `token`) and the items imported from it. Stored in
  `instruction-catalogues.json`; the clone in `<dataDir>/catalogues/<id>/`; each import is
  a stamped copy written in the driver's zone for its kind (`landedAt`, which may differ
  from `itemPath` on a name collision: `<catalogue>-<slug>`). Re-copied by the Refresh
  button and at every boot (`refreshCataloguesAtBoot`, 20 s ceiling); withdrawn by the
  user, or with the catalogue. `copyMarkedTree` copies regular files and
  directories only: symbolic links and special entries are skipped. A repository
  or ref beginning with `-` (after leading whitespace) is refused by `sources.ts`.
- **MCP server (outbound)** — a server the agent may call. Four origins merged per turn:
  the config's `mcp.servers`, an active plugin's manifest, the screen's own file
  `mcp-servers.json` (only these are editable, from E-10 MCP servers; a name already
  held elsewhere is refused), and the CLI's own config (untouched). Secrets are masked
  (`MCP_MASK`) before reaching the browser.
- **Per-person MCP sign-in** — for a server with `signIn: oauth`: one dynamic client
  registration per server for the instance, one rotating refresh key per (server, person),
  in `mcp-signin.json`. The user connects from the connect card in E-16 Chat rail or from E-10 MCP servers. Per-person
  OIDC refresh tokens for `reboundAudience` live in `user-tokens.json`.
- **Delegation thread** — a conversation opened by a calling agent through `ask_<name>`
  (`DelegationChannel`). Stored like a conversation, under the caller's plain name;
  `task_id` is the conversation id. The calling agent creates and continues it; the
  E-13 Delegations reads it, read-only. In-flight jobs live in memory only.
- **Schedule note and mission** — a markdown file in `planif/` whose body is the prompt of
  an unattended turn; frontmatter `title`, `every` (`30m`, `2h`, `1d`, floor 15 min) or
  `at` (`06:30, 12:30`), `enabled`; a mission adds `until: YYYY-MM-DD`, closed by the agent
  writing `done:` or by the product stamping `expired:`. Written by the owner by hand in the
  workspace or by the agent (skill `schedule-author`; no screen writes one, no write gate
  today); read by the clock (`schedule.enabled`) and the planif plugin (E-23 Planif).
  A mission's log is `memory/missions/<note id>.md`, written by the agent. Run times are
  in `schedule-state.json`.
- **Agent credential** — the engine's token or document, armed from E-15 Cog menu
  (`/api/auth/driver`), stored in `secrets/<driver id>.token`, loaded at boot and handed to
  the CLI by environment variable (`CLAUDE_CODE_OAUTH_TOKEN`, `COPILOT_GITHUB_TOKEN`) or,
  for Codex, written to `codex-home/auth.json`. The browser only sees a state and a date.
- **Skin** — a folder with `adestia-skin.json` (styles, module, icon, scheme, web manifest
  fragment) in a skins root; chosen by `extensions.skin`. Read-only.
- **Plugin and its data** — a folder with `adestia-plugin.json` in a plugins root or a
  source; active per `extensions.apps|features|tools`. Its API is mounted under
  `/api/plugin/<id>/` and receives `workspaceRoot`, `dataDir`, `pages` (a `PagesService`),
  `scheduleEnabled` and only the secrets it declared. Its data lives in pages (most
  plugins, through `PagesService`) or in `<dataDir>/<plugin id>/` (`listening-post`:
  `queue.json`), and atelier and voyages keep the state of their screens' gestures beside the
  file they draw (`workbook-state.json`, `workbook-layout.json`, `voyage-state.json`); the bundled plugins' files are listed in Files on disk. The planif plugin (E-23 Planif) reads `<workspace>/planif` (hard-coded, not
  `workspace.planif`) and `schedule-state.json`.

## Files on disk

`D` = data directory, `W` = workspace root, `S` = a store's directory. "default" mode means
created under the process umask. `userhash` = `sha256(userId)` hex, first 16 characters
(`userDirectory`); `userId` is `local` in `none` mode, the proxy header value, or the OIDC
subject.

| Path | Format | Mode | Writer | Readers | Written when |
|---|---|---|---|---|---|
| `D/conversations/<userhash>/<uuid>.jsonl` | JSONL, append-only. Lines: `{"type":"meta","id","title","updatedAt"}` at creation and on rename; `{"type":"meta","id","archived":bool}` on (un)archive; `{"type":"session","sessionId","at"}`; `{"type":"message","id","role":"user"\|"agent","text","at",…}` with optional `tools:[{name,target?,ok?}]`, `signatures:[{id,kind:"consent"\|"grant",url,expiresAt?}]`, `stopped`, `error`, `usage:{contextTokens?,outputTokens?}`, `turn`, `after`, `contextLost:true`. Later meta lines win field by field. After `compact`: one meta line (with `updatedAt` of the last message, `archived`, `sessionId` if any), one session line without `at`, then messages in reading order | default | `ConversationStore` (chat routes, turns, `rename_conversation`) | `ConversationStore`, `ShellToolsService` | each message, turn end, rename, archive; rewritten whole by `compact` at the end of a turn that called `rename_conversation`; removed by delete |
| `D/delegations/conversations/<caller>/<uuid>.jsonl` | same JSONL; `<caller>` is the `x-adestia-caller` header if it matches `^[a-z][a-z0-9_-]{0,31}$`, else `agent`; title = first line of the request, cut at 60 characters | default | `DelegationChannel` | `DelegationChannel` (`ask_*`, E-13 Delegations) | each ask and its answer |
| `D/inbox/<userhash>/<batch uuid>/<safe name>` | the uploaded bytes; name via `safeName` | default | `AttachmentInbox.store` | the agent (box declared as a root) | upload |
| `D/inbox/<userhash>/owner.txt` | two lines: display name (or id), then user id | default | `AttachmentInbox.store` | a person tidying | every upload batch that stored a file |
| (sweep) | a batch older than `attachments.ttlMs` (default 24 h, `0` never) by its own mtime is deleted; top-level folders not named like a box are deleted whole when old; an empty box and its `owner.txt` stay | — | `AttachmentInbox.sweep` | — | at each upload, before storing |
| `D/secrets/<driver id>.token` | the credential, trimmed, one line + `\n`; `savedAt` is the file's mtime | 0600 | `SecretStore.write` (arming; Codex refresh via `onCredentialRefreshed`) | `SecretStore.read` at boot | arming, re-store; deleted on disarm |
| `D/secrets/mcp-refresh.json` | `{"<tokenUrl>\|<clientId>": "<refresh token>"}`, 2-space indent + `\n` | 0600 | `FileRefreshStore` | `FileRefreshStore`, drivers' `McpTokens` | each rotation of a config/plugin server's refresh token |
| `D/secrets/mcp-refresh.json.broken` | the previous file, set aside | as it was | `FileRefreshStore` | a person | when the file parsed to something not a map |
| `D/mcp-servers.json` | `{"servers":[McpServerConfig…]}` — `name`, `cliName?`, `identity?`, `signIn?`, `background?`, `command?`, `args?`, `url?`, `env?`, `headers?`, `auth?{tokenUrl,clientId,clientSecret?,refreshToken?,scope?,audience?}`, secrets in clear; 2-space indent + `\n` | 0600 | `McpStore.save` | `McpStore.list` (boot, routes, each turn via cache) | add / edit / delete on E-10 MCP servers |
| `D/mcp-signin.json` | `{"registrations":{"<server>":{clientId,clientSecret?,authorizationEndpoint,tokenEndpoint,redirectUri}},"keys":{"user\|<server>\|<userhash>":"<refresh token>"}}`, 2-space + `\n` | 0600 | `McpSignIn` | `McpSignIn` | first sign-in to a server, each completed sign-in, each rotation |
| `D/user-tokens.json` | `{"<subject>":{"refreshToken","accessToken?","expiresAt?"}}` (`expiresAt` epoch ms, already early by 60 s), 1-space indent, no final newline. Access tokens are written too, despite the module note | 0600 (temp created 0600) | `UserTokens` | `UserTokens` | login (`remember`), each refresh, drop on a refused refresh. Only in `oidc` mode with `reboundAudience` |
| `D/instruction-catalogues.json` | `{"catalogues":[{"id","repo","ref","token?","imports":[{"itemPath","kind":"instruction"\|"skill"\|"agent","landedAt"}]}]}`, 2-space + `\n`; `token` in clear | 0600 | `InstructionCataloguesStore` | same; `start.ts` (imports kept from the sweep) | declare, import, withdraw, delete a catalogue |
| `D/catalogues/<id>/` | shallow git clone at `ref` (`git init`, `fetch --depth 1`, `reset --hard FETCH_HEAD`) | default | `fetchSources` | `scanCatalogue`, `materializeItem` | first listing of items, Refresh, boot. Not removed when the catalogue is deleted |
| `D/extensions/<sourceName(repo)>/` | shallow git clone at `ref`; name derived from the whole URL | default | `fetchSources` | plugin and skin discovery | every boot; a failed fetch keeps the cached copy |
| `D/schedule-state.json` | `{"lastRun":{"<note id>": <epoch ms>}}`, 2-space, no final newline | default | `writeState` (`Clock`) | `Clock`, planif plugin (E-23) | when a note is first seen, runs, or is reported missed |
| `D/shell-tools.sock` | unix socket, newline-delimited JSON-RPC (MCP subset) behind a `bridge/hello` token | 0600 (chmod after listen) | `ShellToolsService.start` | engines through the bridge | boot; unlinked at close and before listening. Falls back to `<tmpdir>/adestia-<sha256(dataDir)[:8]>.sock` past 100 bytes |
| `D/shell-tools-bridge.mjs` | fixed JS source (`BRIDGE_SOURCE`), no secret | default | `ShellToolsService.start` | engines (stdio MCP server) | every boot |
| `D/copilot-home/` | Copilot CLI home (`COPILOT_HOME`): its config, sessions, SQLite; plus `adestia-mcp.json` `{"mcpServers":…}` with tokens (0600) and `adestia-tool.mjs` (shell transport) | CLI's / 0600 / default | Copilot CLI, `CopilotDriver` | Copilot CLI | per turn |
| `D/codex-home/` | Codex CLI home (`CODEX_HOME`): `auth.json` (0600, from the stored credential), sessions, state | CLI's / 0600 | Codex CLI, `materialize` | Codex CLI | arming, boot, per turn |
| `D/<plugin id>/…` | plugin-owned; among the bundled plugins only `listening-post/queue.json` = `{"version":1,"dropped":{},"dismissed":{}}`, 1-space, no final newline, atomic | default | the plugin's API (`lib/store.mjs`) | the plugin | a link dropped, a candidate dismissed or restored on E-27 Listening post |
| `S/**/*.md` (default `W/pages`) | page: markdown, frontmatter optional | default | pages route (canonical serialisation), `PagesService.write`, the agent | pages routes, `find_pages`, plugins, the watcher | save; agent and plugin writes |
| `S/**/<other files>` | any (images, PDF…); served read-only by `/api/files` | default | the agent, plugins | files routes | outside the product's routes |
| `S/**/assets/workbook.json` | atelier workbook, JSON (contract: plugin skill `workbook-json`); found under any `assets/` | default | the agent — its file tools, or the atelier MCP server (`mcp/serveur.mjs`, 1-space indent + `\n`); never the screen | atelier API, E-25 Atelier | when the agent is asked |
| `S/**/assets/workbook-state.json`, `workbook-layout.json` | beside a workbook: `{"fait":{"<step key>":"<ISO time>"}}` and `{"poses":{…},"bandes":{…}}`; 2-space indent, no final newline | default | atelier API (`POST /state`, `POST /layout`, through `PagesService.write`) | atelier API, E-25 Atelier | a step ticked or a band moved on E-25 Atelier |
| `S/**/assets/voyage.json` | trip, JSON (contract: plugin skill `voyage-json`) | default | the agent; the plugin never writes it | voyages API, E-26 Voyages | when the agent is asked |
| `S/**/assets/voyage-state.json` | beside a trip: `{"items":{"<item id>":{…gesture, "ts":"<ISO time>"}}}`; 1-space indent, no final newline | default | voyages API (`POST /state`, through `PagesService.write`) | voyages API, E-26 Voyages | a card confirmed, moved or dismissed on E-26 Voyages |
| `S/**/assets/<name>.parcours.json` | walk, JSON (contract: plugin skill `parcours-json`): `reperes[]` written by the agent, the `trace` block by a router the agent runs. The GPX is not stored: `GET /api/plugin/parcours/gpx` builds it on each download | default | the agent | parcours API, E-28 Parcours map | when the agent is asked |
| `S/**/assets/veille.json`, `veille/assets/<slug>.transcript.txt` | listening-post sources (JSON, contract: plugin skill `veille-json`); transcripts, one `[hh:mm:ss] text` per line | default | the agent (sources by hand; transcripts through the plugin's `tools/listening-post.mjs transcris`) | listening-post API, E-27 Listening post | when the agent is asked |
| `S/home/brief.json` | `{generatedAt, items:[…]}` (see Entities); invalid JSON reads as absent | default | the agent | `/api/home/brief` | when the agent is asked |
| `W/planif/<id>.md` | schedule note, frontmatter read line by line as strings | default | the owner by hand, the agent; the product writes only `expired: YYYY-MM-DD` (`stampField`) | `Clock`, planif plugin (E-23) | expiry stamp is written before the final turn |
| `W/.claude/settings.local.json` | Claude Code's own settings JSON; "Always" adds the engine's suggested rule (`destination: 'localSettings'`) to its permissions | the CLI's | the Claude Code CLI, from its own suggestion that Adestia hands back untouched (`claude-code/driver.ts`, `updatedPermissions`); Adestia never writes it. Codex writes its own `.rules` file instead | the Claude Code CLI, every turn | "Always" on E-17 Permission question, under `permissions: ask` |
| `W/memory/missions/<note id>.md` | markdown log, free form | default | the agent | the agent | each mission run |
| `W/<skills zone>/<name>/SKILL.md` + assets | `.claude/skills` (Claude Code), `.github/skills` (Copilot), `.codex/skills` (Codex). `MANAGED_MARKER` inserted after the frontmatter by `stamped`. Names: core skills as shipped (`collections`, `page-author`, `persona-author`, `plugin-author`, `schedule-author`, `skin-author`), `this-instance`, `memory-stores` (several stores only), `<plugin id>-<name>` | default; assets keep their source mode | `deliverSkills` | the engine, E-11 Instructions | every boot: managed folders not wanted any more are removed, wanted ones emptied and rewritten; hand-written folders untouched |
| `W/.claude/agents/<plugin id>-<name>.md` | subagent markdown, stamped | default | `deliverAgents` (Claude Code only; other drivers declare no `agentsPath`) | the engine, E-11 Instructions | every boot; a hand-written file of the same name is kept and logged |
| catalogue imports in a zone | stamped copy of the item (skill: whole folder, `SKILL.md` stamped, other files byte for byte); single-file zone (`CLAUDE.md`, `AGENTS.md`) only if absent | default | `materializeItem` | the engine, E-11 Instructions | import, Refresh, boot; spared by the boot sweep via `instruction-catalogues.json` |
| `W/<instruction zone files>` | prose; `CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md`, plus agent and skill files not managed | default | the user (`writeInstruction`), the agent | the engine | E-11 Instructions save |
| `adestia.config.yaml` | YAML; the product writes only catalogue keys | as the file is, but a rename replaces it with a default-mode file | `applyChanges` / `replaceContents` | `loadConfigFile` | E-14 Configuration save; boot and restart read it |

## Rules of access

- `auth.mode: none` — every request is the fixed user `local`; `host` defaults to
  `127.0.0.1`, and a non-loopback bind logs a warning.
- `auth.mode: proxy` — the identity is the `proxy.userHeader` header (default `remote-user`),
  groups from `proxy.groupsHeader`; a missing or doubled header is 401. The product trusts
  whatever reaches it.
- `auth.mode: oidc` — identity in the HMAC-signed cookie `adestia_session` (lifetime
  `sessionTtlMs`, default 12 h; secret `sessionSecret`, else random per process, so a
  restart signs everyone out); `allowedGroups`, when set, refuses the others with 403.
- Every signed-in identity can use every route: there is no owner/user distinction and no
  group check beyond `allowedGroups` — arming the credential, editing MCP servers, settings,
  catalogues, instructions, restarting, reading every delegation.
- Conversations are per user: the hashed directory is the only partition, applied by every
  chat route through `identityOf`; attachments are partitioned the same way.
- `/mcp` (and `/mcp/`) is outside the session gate and gated by its own bearer `mcp.token`
  (constant-time compare); `mcp.enabled` without a token refuses the boot. The caller name
  that separates delegation threads is self-declared by a header, so it separates threads,
  it does not authenticate callers.
- `/callback` is public and grants nothing: a content-free `{from, job_id}` that only wakes
  the agent after the named outbound server confirms the job.
- A plugin API receives only the secrets its manifest declares, but also the absolute
  `dataDir` and `workspaceRoot`, and runs in the server process.
- In `permissions.mode: open` (the default) the engine runs unasked — Claude Code with
  `bypassPermissions`, Copilot with `--allow-all-tools`, Codex with `danger-full-access` —
  in the workspace, as the same OS user as the server, with `process.env` plus its
  credential. As a fact of that process model it can read whatever that user can read:
  every file of the data directory (0600 does not stop the same user), the config file, and
  every environment variable, including values the config pulls in with `${VAR}`. *To be
  verified*: whether any engine applies a sandbox of its own in this posture, and what a
  given deployment (container, mounts, network policy) leaves reachable.
- The engine is handed only short-lived tokens per turn (`callerToken`, `serverTokens`);
  delegated turns get none.

## Robustness and evolution

- **Readers that tolerate damage.** `ConversationStore.read` skips a line that does not
  parse (a crash mid-append). `McpStore.list` and `InstructionCataloguesStore.list` read an
  unreadable or corrupt file as empty and drop entries that do not validate — the next save
  writes back only what parsed. `McpSignIn` and `UserTokens` read absent or corrupt as
  empty, and their next write replaces the file. `readState` (schedule) reads corrupt as no
  runs, so every note is re-dated rather than run. `FileRefreshStore` tells three cases
  apart: absent (empty), corrupt (moved to `.broken`), unreadable (refuses to write).
  `SecretStore.read` reads an error or an empty file as no credential. `readSchedule` skips
  an unreadable note and disables one it cannot parse, with its `problem`. The brief reads
  invalid JSON as absent. The config file is the exception: invalid YAML or values refuse
  the boot, and E-14 Configuration refuses to write a file that no longer parses.
- **Atomic writes (temporary file then `rename`).** `SecretStore.write`, `McpStore.save`,
  `FileRefreshStore.save`, `McpSignIn`, `UserTokens`, `InstructionCataloguesStore`,
  `writeState`, `ConversationStore.compact`, the pages route and `PagesService.write`
  (temporary `.<name>.<uuid>.tmp` beside the target, same store), `replaceContents` for the
  config (falls back to an in-place write on `EBUSY`/`EXDEV`, a single-file mount), and
  `listening-post`'s queue. Not atomic: conversation appends (by design), inbox files and
  `owner.txt`, the `expired` stamp, delivered skills and agents, catalogue imports,
  instruction saves, the bridge, Codex's `auth.json`, Copilot's `adestia-mcp.json`.
- **No schema version, no migration.** No file the server writes carries a version, and no
  code migrates a stored format. Versions exist only outside the server's data:
  `schemaVersion` in plugin and skin manifests (validated at discovery) and `version: 1` in
  `listening-post`'s `queue.json` (written, never read). Formats have changed by being
  read leniently (later meta lines win, the brief accepts `titre`/`raison`/`cible`), not
  by migration.
- **The rule for this epic.** A refactoring keeps every path, file name, key, line type,
  indentation, final newline and file mode above byte-compatible, and keeps each reader's
  tolerance as it is — defects included, written down rather than fixed.
