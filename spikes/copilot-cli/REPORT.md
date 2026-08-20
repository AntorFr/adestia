# Spike 3 — GitHub Copilot CLI recon (hands-on, unauthenticated)

**Date:** 2026-08-20 · **Binary:** `@github/copilot` **1.0.80** (pinned exact) · **Platform:** macOS arm64, Node v26.0.0 / npm 11.12.1
**Scope:** everything observable locally *without* GitHub authentication. No login was attempted, no machine credentials touched — every run used `env -i` with `HOME` and `COPILOT_HOME` pointed inside this spike folder.

Everything below is labeled **[EXECUTED]** (proven by running the binary — raw output in `raw/`) or **[HELP-TEXT]** (stated by the CLI's own help; existence of the flag is proven, behavior is not).

---

## 1. Package identification [EXECUTED]

```
npm view @github/copilot version   → 1.0.80  (dist-tags: latest=1.0.80, prerelease=1.0.81-5)
bin: { "copilot": "npm-loader.js" }
```

- Installed with `npm install --save-exact @github/copilot@1.0.80` → 3 packages: the loader + platform package `@github/copilot-darwin-arm64` (**334 MB** in `node_modules`). One optionalDependency per platform (linux/darwin/win32 × x64/arm64 + musl).
- The npm package is a **loader**: on first run it extracts a ~173 MB runtime into `$HOME/Library/Caches/copilot/pkg/<platform>/<version>/` (macOS path; observed). The bundled runtime reports **Node.js v24.18.1** in its logs regardless of system Node.
- `copilot --version` → `GitHub Copilot CLI 1.0.80.` + `Run 'copilot update' to check for updates.` — exit 0, works with no auth.
- Build metadata in package.json: `gitCommit: a3a2697`.

**Version-pinning warning [HELP-TEXT + EXECUTED hint]:** the CLI **self-updates by default** (`copilot update`, plus an automatic startup check). Auto-update is disabled by default only in CI (detected via `CI`, `BUILD_NUMBER`, `RUN_ID`, `SYSTEM_COLLECTIONURI`). A driver that pins the npm version **must also set `COPILOT_AUTO_UPDATE=false` or pass `--no-auto-update`**, otherwise the binary can silently replace itself via the cache directory. All spike runs after the first used `CI=1`.

## 2. Isolation behavior — `COPILOT_HOME` [EXECUTED]

`COPILOT_HOME` is honored exactly as DESIGN.md hopes:

- `copilot mcp add testsrv -- echo hello` wrote `$COPILOT_HOME/mcp-config.json` (nothing outside it), and that server was picked up by the next `-p` session (visible as `session.mcp_server_status_changed` JSONL events).
- Observed `$COPILOT_HOME` layout after a few runs:
  ```
  config.json                  # managed; "User settings belong in settings.json." + firstLaunchAt
  mcp-config.json              # user MCP servers
  logs/process-<ts>-<pid>.log  # one per process
  session-store.db(+wal,shm)   # SQLite (see §6)
  session-state/<uuid>/        # per session: workspace.yaml, checkpoints/, rewind-file-snapshots/, files/, research/
  ```
- **Every run creates a session-state dir — even runs that fail unauthenticated.** 3 failed auth probes → 3 orphan session dirs. A driver should expect and garbage-collect these.
- Pollution outside `COPILOT_HOME` (but inside `$HOME`): `~/Library/Caches/copilot/pkg/…` (~173 MB runtime extraction) and `~/.local/state/gh/device-id`. A driver-owned `COPILOT_HOME` is **not** sufficient for full isolation; the cache lands in the OS cache dir of whatever `$HOME` the process sees.
- Config help also documents `trustedFolders` in config — relevant if the driver runs in fresh workspaces (no trust prompt was hit in `-p` mode with `--allow-all-tools`).

## 3. Authentication probes — the three exact error states [EXECUTED]

All three: **exit code 1**, error as **plain text on stderr**, **stdout completely empty even with `--output-format json`**. The driver's "invalid" detection must parse stderr, not JSONL.

### 3a. No credentials at all (`raw/unauth-p-text.txt`, `raw/unauth-p-json.stderr.txt`)
```
Error: No authentication information found.

Copilot can be authenticated with GitHub using an OAuth Token or a Fine-Grained Personal Access Token.

To authenticate, you can use any of the following methods:
  • Start 'copilot' and run the '/login' command
  • Set the COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN environment variable
  • Run 'gh auth login' to authenticate with the GitHub CLI
```

### 3b. Classic PAT supplied (`COPILOT_GITHUB_TOKEN=ghp_…`) (`raw/unauth-classic-token.stderr.txt`)
```
Error: Classic Personal Access Tokens (ghp_) are not supported by Copilot.

The COPILOT_GITHUB_TOKEN environment variable contains a classic PAT.
Please use a Fine-Grained Personal Access Token or another authentication method.

To fix this, you can:
  • Replace the token in COPILOT_GITHUB_TOKEN with a fine-grained PAT
  • Unset COPILOT_GITHUB_TOKEN and run 'gh auth login' to authenticate
  • Unset COPILOT_GITHUB_TOKEN and start 'copilot', then use the '/login' command
```
**DESIGN.md correction:** the design says classic `ghp_` tokens are "silently ignored → validate token shape at arming or fail mute". In 1.0.80 they are **loudly rejected** with the message above. Driver-side shape validation is still nice UX, but the failure is no longer mute.

### 3c. Well-formed but invalid fine-grained PAT (`github_pat_…`) (`raw/invalid-finegrained-token.stderr.txt`)
```
Error: Authentication token found but could not be validated.

  Failed to fetch PAT user login (401): GitHub returned: Bad credentials

Your token may still be valid. Check your network connection and try again.
```
Note: this state required a live network round-trip to GitHub (401). The message hedges ("may still be valid… check your network"), so the driver must treat it as *indeterminate-invalid*, not proof of revocation.

Auth check fires **before** model validation: `-p hi --model definitely-not-a-model` produced error 3a, not a model error (`raw/bogus-model.txt`).

Login mechanics [HELP-TEXT, `raw/cmd-login.txt`]: `copilot login` supports `--web-flow` (default on desktops) and `--device-code` (default on SSH/CI/headless), `--host` for GHE-cloud/data-residency. Token precedence: `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN`. Accepted: fine-grained PATs ("Copilot Requests" permission), Copilot CLI OAuth app tokens, `gh` CLI OAuth tokens. Stored in the system credential store, **falling back to a plain-text file under `~/.copilot/`** when no keychain is available (containers!).

## 4. Flags — confirmed matrix

### Proven by execution

| Flag / feature | Result |
|---|---|
| `--version`, `-v` | exit 0, no auth needed |
| `--help` (273 lines) + 10 `help <topic>` pages + all subcommand `--help` | exit 0, no auth needed (`raw/help*.txt`, `raw/cmd-*.txt`) |
| `-p, --prompt <text>` | non-interactive run; fails fast (exit 1) when unauthenticated |
| `--output-format json` | JSONL, one object per line on stdout — **full schema captured, see §5**. Choices exactly `"text"` and `"json"` |
| `-s, --silent` | stdout = agent response only |
| text mode (default) | stdout = response; the stats block (`Changes +0 -0 / Duration / Resume copilot --resume=<id>`) goes to **stderr** |
| `--resume=<session-id>` | reuses the same `sessionId` in the `result` event and **replays history** (mock provider saw 4 messages on turn 2) |
| `--session-id <uuid>` | sets the UUID of a *new* session (row appears in session-store.db with that id) |
| `--allow-all-tools` | accepted; help says required for non-interactive mode; with it, a model-requested `bash` tool call executed with no prompt |
| `copilot mcp list --json` | works unauthenticated → `{"mcpServers": {}}` |
| `copilot mcp add <name> [--json] -- cmd…` | writes `$COPILOT_HOME/mcp-config.json`; server is loaded next session |
| `COPILOT_HOME` env | fully honored (all state under it) |
| `COPILOT_MODEL` env | honored; value passed through as the wire model (seen by mock provider) |
| BYOK: `COPILOT_PROVIDER_BASE_URL` (+`COPILOT_MODEL`) | **activates without any GitHub auth**, exactly as `help providers` claims — full agent loop ran against a localhost mock |

### Present in `--help` (existence proven, behavior not exercised)

`--continue` · `-r/--resume` without value (interactive picker) · `--add-dir` (repeatable) · `--allow-tool[=…]` / `--deny-tool[=…]` (patterns `shell(cmd:*)`, `write(path?)`, `<mcp-server>(tool?)`, `url(…)`; deny always beats allow) · `--allow-url/--deny-url/--allow-all-urls` · `--allow-all-paths` / `--disallow-temp-dir` · `--allow-all` / `--yolo` (= all three allow-alls) · `--available-tools/--excluded-tools` (model-visible tool filter, distinct from permissions) · `--model <model>` (`auto` supported) · `--effort/--reasoning-effort` (none/minimal/low/medium/high/xhigh/max) · `--context default|long_context` · `--max-ai-credits` (min 30, soft cap) · `--attachment` · `--share[=path]` / `--share-gist` · `--stream on|off` · `--log-dir` (default `~/.copilot/logs/`) / `--log-level` · `--no-auto-update` · `--additional-mcp-config <json|@file>` (augments `~/.copilot/mcp-config.json` per-session) · `--disable-builtin-mcps` (currently: github-mcp-server) / `--disable-mcp-server <name>` · `--add-github-mcp-tool/-toolset`, `--enable-all-github-mcp-tools` · `--agent <agent>` · `--mode interactive|plan|autopilot`, `--plan`, `--autopilot`, `--max-autopilot-continues` (default 5) · `-C <dir>` · `-n/--name` · `--no-custom-instructions` · `--no-remote` / `--no-remote-export` · `--secret-env-vars` · `--acp` (Agent Client Protocol server!) · `-i/--interactive <prompt>` · subcommands `login/mcp/plugin/plugins/skill/update/init/completion`.

Env vars documented in `help environment` (`raw/help-topic-environment.txt`): `COPILOT_ALLOW_ALL`, `COPILOT_AUTO_UPDATE`, `COPILOT_HOME`, `COPILOT_MODEL`, `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN`, `COPILOT_OFFLINE`, the full `COPILOT_PROVIDER_*` BYOK family, `GH_HOST`/`COPILOT_GH_HOST`, proxy vars, `COPILOT_OTEL_*` + standard `OTEL_*` (OpenTelemetry exporters incl. a local JSONL file exporter — a second potential telemetry tap for the driver).

## 5. `--output-format json` — observed JSONL schema [EXECUTED, via BYOK mock]

Captured by pointing `COPILOT_PROVIDER_BASE_URL` at a local mock OpenAI endpoint (`mock-provider.js`, `mock-toolcall.js`) — **no GitHub auth involved**. Caveat: schema observed under BYOK on 1.0.80; the GitHub-routed path should emit the same client-side events but this is unverified (see §9).

**Envelope** (every line): `{"type": "...", "data": {...}, "id": "<uuid>", "timestamp": "ISO8601", "parentId": "<uuid>", "ephemeral": true?}` — `ephemeral:true` marks transient/streaming events; the terminal `result` line has no `data`/`id`/`parentId`.

**Event types observed** (`raw/byok-jsonl.stdout.txt`, `raw/byok-toolcall.stdout.txt`):

| type | ephemeral | data highlights |
|---|---|---|
| `session.mcp_server_status_changed` | yes | `serverName`, `status: pending/failed`, `error` |
| `session.mcp_servers_loaded` | yes | per-server `status`, `transport` |
| `session.skills_loaded` | yes | builtin skills list |
| `session.tools_updated` | yes | `model` |
| `session.background_tasks_changed` | yes | shell/background task tracking |
| `user.message` | no | `content` + `transformedContent` (prompt is wrapped with `<current_datetime>` and `<system_reminder>`) |
| `assistant.turn_start` / `assistant.turn_end` | no | `turnId` |
| `model.call_start` | yes | `turnId`, `model` |
| `assistant.message_start` / `assistant.message_delta` | yes | `messageId`, `deltaContent` |
| `assistant.message` | no | `messageId`, `model`, `content`, `toolRequests[]`, `apiCallId` |
| `assistant.tool_call_delta` | yes | streamed tool-call args |
| `tool.execution_start` | no | `toolCallId`, `toolName`, `arguments`, `shellToolInfo` |
| `tool.execution_partial_result` | yes | `partialOutput` |
| `tool.execution_complete` | no | `success`, `result.content/detailedContent/contents[]` (typed, e.g. `shell_exit` with `exitCode`, `cwd`), `toolTelemetry` |
| `assistant.idle` | yes | — |
| `result` (final line) | — | `sessionId`, `exitCode`, `usage: {premiumRequests, totalApiDurationMs, sessionDurationMs, codeChanges:{linesAdded, linesRemoved, filesModified[]}}` |

Driver-critical facts:
- The **last stdout line is `{"type":"result", …, "sessionId": …, "exitCode": …}`** — the reliable place to harvest the session id and completion status in json mode. In text mode the session id appears in the stderr stats block (`Resume copilot --resume=<id>`).
- **Fatal pre-session errors (auth) never appear in JSONL** — plain text on stderr, empty stdout (§3). The tolerant-parser + plain-text-fallback plan in DESIGN.md is validated.
- Built-in tools sent to the model (captured from the wire, 18): `bash, read_bash, stop_bash, list_bash, view, create, edit, web_fetch, fetch_copilot_cli_documentation, skill, sql, session_store_sql, read_agent, list_agents, write_agent, grep, glob, task`.

## 6. Local session store — a real usage-metrics source [EXECUTED]

`$COPILOT_HOME/session-store.db` is SQLite. Tables: `sessions`, `turns`, `assistant_usage_events`, `checkpoints`, `session_files`, `session_refs`, `dynamic_context_items`, `forge_*`, `search_index*`, `schema_version`.

`assistant_usage_events` columns (verified populated after the mock run): `session_id, turn_index, agent_id, parent_tool_call_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, total_nano_aiu, request_multiplier, duration_ms, time_to_first_token_ms, inter_token_latency_ms, initiator, api_endpoint, reasoning_effort, finish_reason, content_filter_triggered, token_details_json, created_at`.

`total_nano_aiu` (AI-credit units, nano) + `request_multiplier` + per-call token counts = **per-turn usage is recorded locally per session**, far richer than the `result` line's `premiumRequests`. With a driver-owned `COPILOT_HOME`, reading this DB (read-only, after run) is a legitimate `usageMetrics` source without any billing-API token. Caveats: schema is undocumented for external use (pin binary version, tolerate drift via the `schema_version` table); token/credit fields were 0/empty under BYOK — populating them with real values needs an authenticated GitHub-routed run (§9).

`sessions`/`turns` also store cwd, repository (`AntorFr/golem` was auto-detected from the git remote), branch, and full user/assistant message text — relevant to privacy expectations.

## 7. Models [HELP-TEXT — printed without auth, not validated against the API]

`help config` prints the full accepted values for the `model` setting (1.0.80): `claude-sonnet-5, claude-fable-5, claude-opus-5, claude-opus-4.8, claude-opus-4.8-fast, claude-opus-4.7, claude-sonnet-4.6, claude-opus-4.6, claude-sonnet-4.5, claude-opus-4.5, claude-haiku-4.5, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5-mini, mai-code-1-flash-picker, gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash, gemini-3.1-pro-preview, grok-4.5, kimi-k3`, plus `auto`.

This is the *client's* static catalog — per-plan availability, entitlement filtering, and per-model pricing/multipliers are only visible authenticated (`/model` picker). Client-side rejection of unknown model names could not be tested (auth check fires first, §3).

## 8. Driver-contract implications (Golem `copilot-cli` driver)

**authManagement**
- Three distinguishable invalid states, all: exit 1, empty stdout, prose on stderr (§3). Detection = stderr matching on stable first lines: `Error: No authentication information found.` / `Error: Classic Personal Access Tokens (ghp_) are not supported` / `Error: Authentication token found but could not be validated.` Pin to binary 1.0.80; these strings are not a documented API.
- State 3c requires network; a network outage looks similar ("could not be validated") — the health check should distinguish 401-in-message vs other causes before declaring the token dead.
- Arming via `COPILOT_GITHUB_TOKEN` fine-grained PAT confirmed as the headless path; precedence over stored credentials is documented. `ghp_` rejection is loud now (design's "fail mute" mitigation can be downgraded to plain UX validation).
- Keychain fallback writes tokens **plain-text under `~/.copilot/`** — in containers, assume the token lands on disk inside `COPILOT_HOME`; treat that dir as secret material.

**modelSelection**
- `--model` / `COPILOT_MODEL` both work as inputs; static catalog above; `auto` exists; `--effort` and `--context` are additional knobs the contract could expose later. Actual availability must be discovered authenticated (or by tolerating server-side rejection at run time).

**usageMetrics**
- Three taps, in order of richness: (1) `assistant_usage_events` in the driver-owned session-store.db (per-call tokens + nano-AIU + multiplier + latency), (2) JSONL `result.usage` (premiumRequests, durations, codeChanges) per run, (3) the OTel exporter (`COPILOT_OTEL_FILE_EXPORTER_PATH` JSONL file exporter) for streaming metrics. The Billing API (separate token, daily aggregates) remains the only *quota/budget* source; none of these give real-time remaining budget — consistent with DESIGN's "never promise real-time". `--max-ai-credits` (min 30, soft cap) gives the driver a per-session spend guard.

**sessions**
- `--session-id <uuid>` lets the driver *choose* ids at creation (proven) — good for correlation; `--resume=<id>` replays history (proven). `result.sessionId` / stderr `Resume` line confirm ids post-run. Failed runs still leave session-state dirs → GC needed.

**MCP**
- Materialization path proven: write `mcp-config.json` into driver-owned `COPILOT_HOME` (or use `copilot mcp add`); a per-session overlay exists via `--additional-mcp-config @file`. Workspace `.mcp.json` / `.github/mcp.json` and plugin servers load too — name-conflict policy needs a behavioral check. `mcpStatus` capability maps directly onto `session.mcp_server_status_changed` / `session.mcp_servers_loaded` JSONL events (proven emitted, including failure reasons). The built-in github-mcp-server can be disabled (`--disable-builtin-mcps`).

**process hygiene**
- Always run with: `COPILOT_HOME=<driver dir>`, `COPILOT_AUTO_UPDATE=false` (or `CI=1`), `--no-auto-update`, `NO_COLOR=1`, and expect a ~173 MB cache extraction under `$HOME/Library/Caches/copilot` (or the Linux equivalent) on first run — provision image layers accordingly.
- Permission policy surface confirmed as designed: `--allow-tool`/`--deny-tool` pattern grammar documented in `help permissions` (deny > allow, `shell(git:*)` stem matching, `write(path)` trailing-component matching, `url()` protocol-aware).

**bonus discovered**
- `--acp` (Agent Client Protocol server) exists — potentially a far better integration surface than JSONL scraping; worth its own spike.
- BYOK (`COPILOT_PROVIDER_*`) means the driver's full JSONL parser, permission handling, session and MCP plumbing can be **integration-tested in CI against a mock provider with zero GitHub credentials** (this spike's method, `mock-provider.js` / `mock-toolcall.js`).

## 9. Requires an authenticated session (user to-do, later)

1. **JSONL schema under GitHub routing** — confirm the event set matches the BYOK-observed one for a real `-p` run, including any auth/quota warning events; capture `result.usage` with non-zero `premiumRequests`/credits.
2. **`assistant_usage_events` populated for real** — verify `total_nano_aiu`, `request_multiplier`, cache/reasoning token fields on GitHub-routed models.
3. **Model availability** — `/model` picker list + per-model pricing/multipliers for the actual plan; behavior on `--model <unavailable>` (error message + exit code).
4. **Valid-auth status probe** — cheapest authenticated "am I armed?" check; the stderr/exit signature of an *expired* (vs malformed) token.
5. **`--resume` across processes with real history** — compaction behavior, `summary_count`, checkpoint semantics.
6. **GitHub MCP server** — default toolset contents, `--add-github-mcp-toolset` effects.
7. **Quota/billing** — AI-credits Billing API with a billing-scope token; footer/`/usage` semantics; legacy premium-requests vs AI-credits mode detection.
8. **Device-flow relay** — `copilot login --device-code` UX capture for the relayed-arming design.
9. **Enterprise knobs** — managed-settings server policy fetch (log line seen: "server policy fetch skipped: no authenticated GitHub host available"), `GH_HOST`/data-residency.

## 10. Annex — raw outputs & artifacts (all under `spikes/copilot-cli/`)

| File | Content |
|---|---|
| `raw/help.txt` | full `--help` (273 lines) |
| `raw/help-topic-{billing,commands,config,environment,limits,logging,monitoring,permissions,providers,sandbox}.txt` | all help topics |
| `raw/cmd-{login,mcp,mcp-add,mcp-get,mcp-list,mcp-remove,plugin,plugins,skill,update,init,completion}.txt` | subcommand help |
| `raw/unauth-p-text.txt`, `raw/unauth-p-json.{stdout,stderr}.txt` | exact no-auth error (state 3a), proof stdout is empty in json mode |
| `raw/unauth-classic-token.stderr.txt` | classic-PAT rejection (state 3b) |
| `raw/invalid-finegrained-token.stderr.txt` | invalid fine-grained PAT (state 3c) |
| `raw/bogus-model.txt` | auth precedes model validation |
| `raw/mcp-list.txt`, `raw/mcp-add.txt` | unauthenticated mcp subcommands |
| `raw/byok-jsonl.stdout.txt` | full JSONL transcript, simple turn |
| `raw/byok-toolcall.stdout.txt` | full JSONL transcript with real tool execution |
| `raw/byok-resume.stdout.txt` | resume proof (same sessionId, history replayed) |
| `raw/byok-text.{stdout,stderr}.txt`, `raw/byok-silent.stdout.txt` | text/silent mode stream split |
| `raw/tools-list.txt` | 18 built-in tool names captured from the wire |
| `mock-provider.js`, `mock-tools.js`, `mock-toolcall.js` | localhost OpenAI-compatible mocks (no deps) |
| `package.json` / `package-lock.json` | exact pin `@github/copilot@1.0.80` |

`node_modules/`, `isolated-home/`, `copilot-home/`, `work/` are gitignored (334 MB + 173 MB of local state).

### How to reproduce

```bash
cd spikes/copilot-cli && npm ci
mkdir -p isolated-home copilot-home work
# unauthenticated error state:
cd work && env -i HOME="$PWD/../isolated-home" COPILOT_HOME="$PWD/../copilot-home" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" TERM=dumb NO_COLOR=1 CI=1 \
  ../node_modules/.bin/copilot -p "hi" --allow-all-tools --output-format json; echo "exit=$?"
# JSONL schema without auth (mock BYOK):
node ../mock-provider.js & sleep 1
env -i HOME="$PWD/../isolated-home" COPILOT_HOME="$PWD/../copilot-home" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" TERM=dumb NO_COLOR=1 CI=1 \
  COPILOT_PROVIDER_BASE_URL="http://127.0.0.1:45123/v1" COPILOT_MODEL="mock-model" \
  ../node_modules/.bin/copilot -p "Say exactly: hello" --allow-all-tools --output-format json
```
