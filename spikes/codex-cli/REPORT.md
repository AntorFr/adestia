# Spike 5 — OpenAI Codex CLI recon (hands-on)

**Date:** 2026-09-10 · **Binary:** `@openai/codex` **0.154.0** (pinned exact) · **Platform:** macOS arm64, Node v26.0.0 / npm 11.12.1
**Scope:** the CLI's whole observable surface. Sections 1–10 were established *without* an account, on a mock provider; §11 is a second pass against a **real ChatGPT account**, armed on the owner's explicit go-ahead through the device flow. Every run used `env -i` with `HOME` and `CODEX_HOME` pointed inside this spike folder.

**On the authenticated material:** the credential lives in `codex-home-real/` and the
captures in `raw-auth/`, both gitignored — they carry an account id, an email and plan
data. What is committed is this report, with those redacted.

Everything below is labeled **[EXECUTED]** (proven by running the binary — raw output in `raw/`) or **[HELP-TEXT]** (stated by the CLI's own help or its generated protocol schema; existence is proven, behavior is not).

**The headline:** `codex exec --json` is the poorer of two surfaces. `codex app-server`, a
JSON-RPC protocol with a *generated schema*, answers every capability in the Adestia
driver contract — including `interactivePermissions`, which `exec` structurally cannot
(§7). Copilot's spike ended with "`--acp` discovered, worth its own spike"; here the
equivalent is not only present, it is the one to build on. The recommendation is in §10.

---

## 1. Package identification [EXECUTED]

```
npm view @openai/codex version   → 0.154.0  (dist-tags: latest=0.154.0, alpha=0.154.0-alpha.6.1)
bin: { "codex": "bin/codex.js" }   engines: node >=16   license: Apache-2.0
```

- `npm install --save-exact @openai/codex@0.154.0` → **2 packages, 289 MB**: a 20 kB
  JS loader plus the platform package `@openai/codex-darwin-arm64` (one
  optionalDependency per platform; linux ones are **musl** triples).
- **Unlike Copilot, nothing is extracted at runtime.** The loader (`bin/codex.js`, read
  in full) resolves `vendor/<triple>/bin/codex` inside the platform package, spawns it,
  forwards SIGINT/SIGTERM/SIGHUP and mirrors the exit status. No cache directory, no
  download, no self-replacement path in the loader. It only *detects* the package
  manager to print the right update hint.
- `codex --version` → `codex-cli 0.154.0`, exit 0, no auth, no network.
- Two binaries ship in `vendor/`: `codex` and `codex-code-mode-host`.

**Self-update.** `codex update` exists as a subcommand, and `codex doctor` reports
`startup update check: true` with `update action: npm install -g @openai/codex`
(`raw/instructions-sandbox.txt`). So the startup check exists, but the update action is
a *command it tells you to run*, not an in-place swap of the npm-installed binary.
Config key `check_for_update_on_startup` exists (§9) — a driver should set it false
anyway, to avoid the network call. **Not verified:** whether a non-npm install path
self-replaces. Weaker risk than Copilot's, where the binary genuinely replaces itself.

## 2. Isolation — `CODEX_HOME` [EXECUTED]

`CODEX_HOME` is honored **completely**, and this is the cleanest result of the spike:
after twelve runs, `isolated-home/` (the fake `$HOME`) was **still empty**. No cache
dir, no `~/.local/state`, nothing. Copilot needed ~173 MB under `$HOME/Library/Caches`;
codex needs nothing outside `CODEX_HOME`.

Layout observed after a first `exec` run:

```
auth.json                     # the credential, plain JSON (§3)
config.toml                   # user config, incl. [mcp_servers.*] (§6)
installation_id               # a UUID minted on first run
sessions/YYYY/MM/DD/rollout-<ts>-<thread-id>.jsonl   # full transcript per thread
state_5.sqlite  logs_2.sqlite  goals_1.sqlite  memories_1.sqlite  queue_1.sqlite
thread_history_1.sqlite  thread-writer-locks/  shell_snapshots/  skills/.system/  tmp/
.tmp/plugins/                 # a git CLONE of a plugin marketplace — see below
```

**One trap, and it is a network one [EXECUTED].** On startup codex **clones a curated
plugin-marketplace git repository from the network** into `$CODEX_HOME/.tmp/plugins`
(`openai-curated`, `.agents/plugins/marketplace.json`, commit `d416fd5`). It is a
background fetch: absent at 2 s and 5 s, **present at 10 s** in a fresh home with no
turn running at all (`raw/marketplace-clone.txt`) — short `exec` runs simply exit
before it lands, which is why only the slow runs showed it. It happens *before and
independently of* authentication, and it is third-party content arriving on disk.

`-c marketplaces=[]` **stops it**; `--disable remote_plugin` does **not**
(`raw/marketplace-clone-off.txt`). A server-side driver should pass `-c marketplaces=[]`.

`--ephemeral` suppresses the rollout transcript files (0 written) but still creates the
sqlite state DBs and `installation_id` (`raw/misc-probes.txt`).

**Resident memory [EXECUTED, indicative]:** one idle `app-server` = 36 MB (node loader)
+ 47 MB (rust binary) ≈ **83 MB** measured right after `initialize`
(`measure-rss.mjs`). That is a floor, not a peak — Copilot's ~300 MB/process figure
that set `maxConcurrentTurns: 3` was measured under load, so the two numbers are not
comparable yet. Worth its own measurement before any concurrency claim.

## 3. Authentication — three findings, all different from Copilot [EXECUTED]

### 3a. The cheap probe is structured, not prose

```
codex login status        → exit 1, stdout empty, stderr: "Not logged in"
codex login status        → exit 0, stderr: "Logged in using an API key - sk-bogus***l-key"
```

Instant, no network. And over the app-server, better still — `account/read` returns
`{"account": null, "requiresOpenaiAuth": true}` as JSON (§7). Copilot's driver has to
regex three English sentences off stderr; here there is a typed answer.

### 3b. Arming is a file, and it needs no pty

`codex login --with-api-key` reads the key **from stdin** and writes
`$CODEX_HOME/auth.json`:

```json
{ "auth_mode": "apikey", "OPENAI_API_KEY": "<the key>" }
```

Default `cli_auth_credentials_store = "file"` (§9) — **there is no keychain question**,
so none of Copilot's pty machinery (`script`, the TTY-gated plaintext consent, the
"login succeeded but the token was not saved" trap) applies here. A driver can write
that two-key JSON itself, 0600, and never spawn the CLI to arm it.

**`OPENAI_API_KEY` in the environment is IGNORED** for the built-in `openai` provider:
with the variable set and no `auth.json`, `login status` says "Not logged in" and a
turn fails with *"Missing bearer or basic authentication in header"*
(`raw/envkey-exec.txt`). Env-var arming *does* work for a **custom provider**, via
`model_providers.<id>.env_key` — proven, the mock received `Authorization: Bearer
mock-secret` from `MOCK_KEY` (§5). This inverts the Adestia driver README's assumption
that "a driver says which environment variable hands its credential to the CLI": for
codex the answer is a file.

### 3c. `login --with-api-key` does not validate — and a bad key fails LATE

A deliberately bogus key is accepted with **"Successfully logged in"**, exit 0, and
`login status` then reports a healthy session. The failure only appears on the first
turn, and it takes ~35 seconds: **5 websocket retries, a fallback to HTTPS, 5 more
retries**, then `turn.failed` (`raw/auth-probes.txt`). Copilot fails in under a second
with an empty stdout and a clean stderr sentence; codex talks to the network eleven
times first.

The three states, as the driver would see them:

| state | `login status` | a turn |
|---|---|---|
| nothing stored | exit 1, `Not logged in` | JSONL `error` ×11 then `turn.failed`, `Missing bearer or basic authentication in header` |
| bogus key stored | exit 0, "Logged in using an API key" | same shape, `auth error code: invalid_api_key`, `Incorrect API key provided: sk-…` |
| valid key | exit 0 | — (needs an account, §11) |

`auth error code: invalid_api_key` is a machine-usable marker inside the `turn.failed`
message; the messages themselves are prose and not a documented API — pin the version.

### 3d. The two login flows [EXECUTED — the device one to completion]

- **`codex login --device-auth` works with piped stdio, no pty.** Within a second it
  prints, **on stdout**, `https://auth.openai.com/codex/device` and a one-time code
  (`56EN-GUNGD` in our run), stated to expire in **15 minutes**
  (`raw/login-device-auth.txt`). This maps exactly onto Adestia's `device-code`
  AuthMode. **Trap:** the output carries ANSI escapes *even under `TERM=dumb` and
  `NO_COLOR=1`* — strip them before parsing.
  **Driven to completion** (§11): on approval it prints `Successfully logged in` and
  exits 0, having written `auth.json` **mode 0600 by itself**. Two traps a relaying
  driver must respect: the code is on **stdout** while the sign-in URL line is too, and
  **the process that printed the code is the one that polls for the token** — kill it
  and the user's approval goes nowhere (learned the hard way here: a code approved
  against a dead process produces no credential and no error, on either side).
- **`codex login` (default)** starts a **local callback server on `http://localhost:1455`**
  and prints an OAuth PKCE URL on stderr, ending with: *"On a remote or headless
  machine? Use `codex login --device-auth` instead."* (`raw/login-default-flow.txt`).
  Unusable from a server: it needs a browser that can reach *that machine's* port 1455.

## 4. `codex exec` — the flag surface [EXECUTED for the marked ones]

`codex exec [PROMPT]`, with `--json` (JSONL on stdout), `-o/--output-last-message
<FILE>`, `--output-schema <FILE>`, `-m/--model`, `-s/--sandbox
read-only|workspace-write|danger-full-access`, `-C/--cd`, `--add-dir`, `--worktree`,
`--ephemeral`, `--skip-git-repo-check`, `--ignore-user-config`, `--ignore-rules`,
`-c key=value` (dotted TOML override, repeatable), `-p/--profile`, `--enable/--disable
<FEATURE>`, `--image`, `--oss`/`--local-provider`, `--color`, and the subcommands
`exec resume [--last]`, `exec fork`, `exec review`.

Proven by running: `--json`, `-o`, `--output-schema`, `-s`, `-C`, `-c`, `--ephemeral`,
`--skip-git-repo-check`, `exec resume --last`.

**Notably absent from `exec`: `-a/--ask-for-approval`.** It is a top-level flag and an
`exec` run rejects it (`error: unexpected argument '-a' found`). See §7.

**Two traps for a driver spawning it:**
- With no `-` argument and a non-tty stdin, exec still announces *"Reading additional
  input from stdin…"* on stderr and waits. `< /dev/null` is enough to make it proceed,
  and adds nothing to the prompt (verified on the wire: exactly three input items).
  Without it, a server that leaves the pipe open hangs.
- Rust `tracing` lines (`2026-…Z ERROR codex_api::…`) are interleaved on **stderr**
  while JSONL goes to **stdout**. The split is clean; the stderr is noisy.

## 5. The mock provider — the whole path is CI-testable with no account [EXECUTED]

Same method as spike 3, and it works:

```
-c model_provider=mock
-c model_providers.mock.base_url=http://127.0.0.1:45188/v1
-c model_providers.mock.wire_api=responses
-c model_providers.mock.env_key=MOCK_KEY
-c model=mock-model
```

drives a **complete turn against `mock-provider.js`** — no OpenAI account, no network
(`raw/mock-responses-simple.txt`). Tool calls, sandbox denials, approvals, resume and
MCP were all exercised this way. The driver's parser, session plumbing, permission
handling and MCP materialization can all live in CI.

**`wire_api = "chat"` is dead in 0.154.0:** the CLI refuses to load the config —
*"`wire_api = \"chat\"` is no longer supported. set `wire_api = \"responses\"`"*. Only the
Responses wire API remains, so a mock must speak Responses SSE (`mock-provider.js` does).

The mock also captured **what codex puts on the wire**: `store: false`,
`reasoning: {summary: "auto"}`, `include: ["reasoning.encrypted_content"]`,
`prompt_cache_key` = the thread id, an `x-codex-turn-metadata` client-metadata header
carrying `installation_id / session_id / thread_id / turn_id / window_id`, and 9 tools:
`exec_command, write_stdin, request_user_input, view_image, multi_agent_v1, get_goal,
create_goal, update_goal, web_search`. (`request_user_input` is described as *"only
available in Plan mode"*.)

### The `exec --json` event schema [EXECUTED]

One JSON object per line on stdout. Observed set:

| type | payload |
|---|---|
| `thread.started` | `thread_id` — **emitted first, before any model call** |
| `turn.started` | — |
| `item.started` / `item.completed` | `item: {id, type, …}` |
| `item.completed` (`type: agent_message`) | `text` |
| `item.completed` (`type: command_execution`) | `command`, `aggregated_output`, `exit_code`, `status` |
| `item.completed` (`type: error`) | `message` (e.g. unknown-model metadata warning) |
| `error` | `message` — retries and transport failures |
| `turn.completed` | `usage: {input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens}` |
| `turn.failed` | `error.message` |

Driver-relevant facts:
- **The thread id arrives at the START** (`thread.started`), unlike Copilot where it is
  harvested from the last line. Correlation is available before the work happens.
- `turn.completed.usage` is the **turn total across model calls** (11/7 for one call,
  32/16 for a two-call tool turn) — `usageMetrics` is satisfied by exec alone.
- **No token deltas during the turn.** `liveTurnUsage` is not available on this surface
  (it is on the other one, §7).
- Auth failures **do** appear in the JSONL here (as `error` + `turn.failed`), unlike
  Copilot's mute stdout — but only after the ~35 s retry storm.

## 6. Sessions, MCP, instructions [EXECUTED]

**Sessions.** `exec resume --last` reuses the same `thread_id` and **replays history**:
the second model call carried `[developer, user(env), user("first question"),
assistant("hello from the mock"), user("second question")]`
(`raw/session-probes.txt`). One rollout file per thread, appended, under
`sessions/YYYY/MM/DD/`. The rollout also stores cwd, originator, cli_version, the model
provider and **the full base instructions and every message** — privacy-relevant.
`prompt_cache_key` is the thread id, so cache locality follows the thread.
There is **no `--session-id` to choose an id at creation** (Copilot has one); ids are
UUIDv7 minted by the CLI and read from `thread.started`.

**MCP.** `codex mcp add <name> -- <cmd>` / `--url <url>` writes `[mcp_servers.<name>]`
into `$CODEX_HOME/config.toml` — a driver can write that TOML directly instead of
shelling out. `mcp list --json` / `mcp get --json` return typed records with
`transport` (`stdio` | `streamable_http`), `enabled`, `auth_status`
(`unsupported` | `unknown`), and per-server timeouts. HTTP servers accept
`bearer_token_env_var`, `http_headers`, `env_http_headers`, `http_headers_helper`, and
`codex mcp login/logout` handles OAuth servers (`--oauth-client-id`,
`--oauth-client-registration auto|cimd|dcr`, `--oauth-resource`) — which lines up with
Adestia's `signIn: 'oauth'` servers.

**Per-turn materialization is possible without touching config.toml**: servers passed in
`thread/start.config.mcp_servers` were started and reported (§7). That is what the
"core mints a token per turn" design needs.

**Instructions.** `AGENTS.md` in the working root **reaches the model** (marker found on
the wire); `CLAUDE.md` does **not** — *unless* `project_doc_fallback_filenames =
["CLAUDE.md"]`, which makes it reach the model too (`raw/misc-probes.txt`). So a
workspace written for Claude Code can be read by codex with **one config line**, which
softens DESIGN.md's "assisted migration" story considerably for this direction.

## 7. `codex app-server` — the surface the driver should be built on [EXECUTED]

`codex app-server --stdio` speaks **newline-delimited JSON-RPC 2.0**. It ships its own
schema: `codex app-server generate-json-schema --out <dir>` (39 files, 4.2 MB) and
`generate-ts` for TypeScript bindings. Distilled method list:
`raw/app-server-surface.txt` — **99 client requests, 10 server→client requests, 81
notifications**.

Everything below was driven from `drive-app-server.mjs` / `probe-appserver-queries.mjs`
**with no account**:

| Adestia capability | app-server answer | status |
|---|---|---|
| `modelSelection` | `model/list` returns the full catalog **unauthenticated** — id, displayName, description, `supportedReasoningEfforts`, `defaultReasoningEffort`, inputModalities, `hidden` | **[EXECUTED]** |
| `authManagement` | `account/read` → `{account, requiresOpenaiAuth}`; `account/login/start` / `cancel` / `logout`; `account/chatgptAuthTokens/refresh` as a server→client request | read **[EXECUTED]**, login **[HELP-TEXT]** |
| `usageMetrics` | `thread/tokenUsage/updated` with `{total, last}` per turn | **[EXECUTED]** |
| `liveTurnUsage` | same notification, pushed **during** the turn | **[EXECUTED]** |
| `subscriptionQuotas` | `account/rateLimits/read` + `account/rateLimits/updated`, **pushed after every turn** — two windows with `usedPercent` and `resetsAt` | **[EXECUTED, authenticated]** (§11) |
| `mcpStatus` | `mcpServer/startupStatus/updated` (`starting` → `ready` / `failed` + full error) and `mcpServerStatus/list` (tools, resources, `authStatus`) | **[EXECUTED]** |
| `interactivePermissions` | server→client `item/commandExecution/requestApproval` — **the turn waits for the answer** | **[EXECUTED]** |
| streaming | `item/agentMessage/delta`, `item/reasoning/*Delta`, `item/commandExecution/outputDelta` | deltas **[EXECUTED]** |

### The approval round trip, both ways [EXECUTED]

With `approvalPolicy: 'on-request'` and a model asking for an escalated command, the
server sends:

```json
{"method":"item/commandExecution/requestApproval",
 "params":{"kind":"command","threadId":…,"turnId":…,"itemId":"call_mock_1",
           "reason":"The spike wants to see the approval event.",
           "command":"/bin/zsh -lc 'echo escalated-command-ran'","cwd":…}}
```

and blocks on the reply. Decision vocabulary (from
`CommandExecutionRequestApprovalResponse.json`): **`accept` · `acceptForSession` ·
`decline` · `cancel`** (+ `acceptWithExecpolicyAmendment` and
`applyNetworkPolicyAmendment` object forms). Both proven end to end:

- `{"decision":"accept"}` → the command runs, `item/completed` with `status: "completed"` and a real pid.
- `{"decision":"decline"}` → `status: "declined"`, and the model is told
  `exec_command failed: … Rejected("rejected by user")`; the turn continues.

`cancel` (deny **and** interrupt the turn) and `acceptForSession` map onto product
decisions Adestia already has words for. This is a real return channel — the thing
DESIGN.md says "Copilot in programmatic mode has no return channel at all".

### And `codex exec` structurally cannot do it [EXECUTED]

`exec` rejects `-a`, and forcing the policy through config does not help:

```
$ codex exec -c approval_policy=on-request …
ERROR codex_core::tools::router: error=approval policy is Never; reject command —
  you cannot ask for escalated permissions if the approval policy is Never
```

The refusal appears **only as a stderr tracing line**, never as a JSONL event
(`raw/mock-responses-escalate-onrequest.txt`). So on the exec surface,
`interactivePermissions` must be declared absent — the same honest "absent" the Copilot
driver declares.

### Other useful protocol facts [EXECUTED]

- `thread/start` accepts `cwd`, `model`, `modelProvider`, `approvalPolicy`, `sandbox`,
  `baseInstructions`, `developerInstructions`, `ephemeral`, **and an arbitrary `config`
  object** — per-thread overrides with no file on disk.
- `turn/start` overrides model, effort, sandbox, `outputSchema`, service tier per turn;
  `turn/interrupt` and `turn/steer` exist (steering a running turn).
- `permissionProfile/list` → `:read-only`, `:workspace`, `:danger-full-access`.
- `config/read` returns the whole effective config (101 keys, §9).
- Unauthenticated calls fail **cleanly**: `{"code":-32600,"message":"codex account
  authentication required to read rate limits"}` — a typed error, not prose.
- **`CODEX_HOME` must already exist** for `app-server` (it refuses to start otherwise);
  `exec` creates it. One `mkdir` in the driver.
- `--listen` also offers `unix://` and `ws://` with capability-token or signed-JWT auth
  — an out-of-process daemon shape, if that is ever wanted. **[HELP-TEXT]**

## 8. The observability hole worth knowing about [EXECUTED]

**A command the sandbox blocks produces no item event at all — on either surface.**

With `-s read-only` and a model calling `echo written > file`:
- the model is told, correctly: `Process exited with code 1 … zsh:1: operation not
  permitted: mock-wrote-this.txt`;
- the client stream shows **nothing**: no `command_execution` in `exec --json`
  (`raw/sandbox-read-only.txt`), no `commandExecution` notification over app-server
  (`raw/app-server-write.log`) — while the *same* command that succeeds emits
  `item.started` + `item.completed` on both.

So a trace rendered from the event stream silently omits blocked commands: the user
sees the agent go quiet, not the agent being refused.

**Re-checked against a real model, and it is worse than the mock suggested (§11).** Asked
to run `echo hi > sandbox-probe.txt` under `-s read-only`, gpt-6 announced *"I'll run the
command exactly as provided"*, ran it, was refused by the sandbox, and reported
*"The command failed because the sandbox denied writing to `sandbox-probe.txt`"*. The
client stream — on **both** surfaces — carried nothing but those two agent messages: item
types seen were `userMessage` and `agentMessage` only, zero `commandExecution`, zero
approval request, while the token counter moved twice (15 359 → 30 801) proving a tool
round trip happened. The agent talks about a command the interface never showed. That is
a defect to report upstream, and until it is fixed a driver cannot render a faithful
trace of refusals.

## 9. Config surface [EXECUTED — `config/read`, 101 keys]

The ones a driver cares about, with their defaults on a fresh home:

| key | default | why it matters |
|---|---|---|
| `cli_auth_credentials_store` | `"file"` | no keychain prompt, no pty (§3b) |
| `check_for_update_on_startup` | null (doctor: true) | turn off for a pinned deployment |
| `marketplaces` | — | `-c marketplaces=[]` stops the startup clone (§2) |
| `project_doc_fallback_filenames` | `[]` | set to `["CLAUDE.md"]` to read the other dialect (§6) |
| `shell_environment_policy` | all null | `inherit`, `exclude`, `include_only`, `set` — env filtering for spawned commands |
| `sandbox_mode`, `approval_policy`, `permissions`, `default_permissions` | null | the permission posture |
| `mcp_servers`, `mcp_oauth_credentials_store`, `mcp_oauth_callback_port/url` | — | §6 |
| `model`, `model_provider`, `model_providers`, `model_reasoning_effort`, `model_catalog_json` | null | §5, §7 |
| `otel`, `analytics`, `notify`, `feedback` | null | telemetry taps, off by default |
| `history` | `{persistence: "save-all"}` | what the rollout keeps |
| `sqlite_home`, `log_dir` | null | where the state DBs land |
| `features` | 8 flags, e.g. `remote_plugin: true`, `memories: false` | `--enable/--disable <FEATURE>` |

`codex doctor` is a ready-made health check: `--json` emits a versioned report
(`schemaVersion`, `overallStatus`, `codexVersion`, `checks`) covering auth, sandbox,
MCP count, updates, connectivity, state-DB integrity and rollout inventory; exit 1 when
a check fails. Raw human form in `raw/instructions-sandbox.txt`.

## 10. Driver-contract implications (an Adestia `codex-cli` driver)

**Build it on `app-server`, not on `exec`.** It is marked `[experimental]` in the help,
and that is the one real argument against — but it is the only surface that can honour
`interactivePermissions`, `liveTurnUsage`, `modelSelection` and `mcpStatus`, it ships a
*generated schema* (so drift is detectable mechanically, and TS types are one command
away), and it fails with typed JSON-RPC errors instead of English sentences. Building on
`exec` means declaring four capabilities absent and parsing prose for the fifth.

Concretely, per capability:

- **`authManagement`** — `account/read` answers armed-ness *and* the plan in 5 ms with
  no network (§11.2); `login status` is the exec-side equivalent. Two arming modes, and
  they store different things: `api-key` writes `{auth_mode: "apikey", OPENAI_API_KEY}`
  (a driver can write that file itself, 0600, without spawning anything), while the
  relayed `device-code` flow yields `{auth_mode: "chatgpt", tokens: {id_token,
  access_token, refresh_token, account_id}, last_refresh}` — three tokens and a clock,
  not one opaque string. Do **not** offer the default `codex login`: it wants a browser
  on the CLI's own machine. Two things to respect: a pasted key is **never validated at
  arming** (`armed` means "a key is on disk", and the truth arrives ~35 s into the first
  turn), and the device-flow process **is** the poller — killing it silently voids the
  user's approval.
- **`usageMetrics` / `liveTurnUsage`** — `thread/tokenUsage/updated` (`total` + `last`)
  during the turn; `turn.completed.usage` on the exec surface. Fields are token counts
  only: no currency. **`cost` should not be declared** — nothing observed reports money,
  and on a ChatGPT plan the meaningful number is a percentage of a window, not a price.
  Budget for a **~15 k-token preamble on every turn** (§11.5) before showing anyone a
  per-turn figure.
- **`contextBreakdown`** — not observed. `model_context_window` and
  `model_auto_compact_token_limit` exist in config, and `thread/compacted` is a
  notification, but no live "weight of the next message" was seen. Leave undeclared
  until proven.
- **`subscriptionQuotas`** — the strongest capability this engine offers. Two real
  windows (5 h and 7 days) with `usedPercent` + `resetsAt`, **pushed after every turn**
  as `account/rateLimits/updated` (§11.3) — no polling, no server-side TTL cache, no
  `stale` flag to apologise with. `account/rateLimitResetCredit/consume` even lets a
  product spend a granted reset.
- **`modelSelection`** — `model/list`, with display names and per-model reasoning
  efforts, and **entitlement-filtered once authenticated** (six models unauthenticated,
  five on the tested plan — §11.4). An unavailable model is refused server-side with a
  readable 400, so the driver need not police names, only surface the refusal. The
  reasoning efforts are a second axis the contract does not have yet.
- **`mcpStatus`** — the `mcpServer/startupStatus/updated` notification is the reliable
  tap (thread-scoped servers appear **only** there); `mcpServerStatus/list` covers
  config-file servers with their tools and `authStatus`. Expect a server nobody
  configured: authenticated threads start a built-in `codex_apps` (§11.5).
- **`interactivePermissions`** — `item/commandExecution/requestApproval` +
  `accept | acceptForSession | decline | cancel`. Also
  `item/fileChange/requestApproval`, `item/permissions/requestApproval`,
  `mcpServer/elicitation/request` and `item/tool/requestUserInput` (Plan mode).

**Process hygiene for the spawn site:** `CODEX_HOME=<driver dir>` (create it first),
`-c marketplaces=[]`, `-c check_for_update_on_startup=false`, `--ignore-user-config`
where the operator's own config must not leak in, `NO_COLOR=1`, and `< /dev/null` on
the exec path. Nothing lands outside `CODEX_HOME`. **On shutdown, do not SIGKILL:** the
npm entry point is a node loader that forwards SIGINT/SIGTERM/SIGHUP to the rust binary
but obviously cannot forward a KILL — observed once, leaving an orphaned `codex login`
running after the loader died. Signal the loader, or kill the process group.

**Testability:** the whole path — events, sessions, approvals, MCP, sandbox denials —
runs in CI against `mock-provider.js` with zero credentials. Same guarantee as the
Copilot driver, obtained the same way — and §11.5 verified the mock's event stream is
identical to the real one, so the guarantee is not a hope.

**The one thing that would block shipping** is §8: a command the sandbox refuses is
absent from the stream, confirmed on the real path. A driver built today would show the
agent saying "the command failed" over an empty trace. It needs an upstream fix, or a
workaround nobody has found here.

## 11. The authenticated pass [EXECUTED, real ChatGPT account, 2026-09-10]

Armed through `codex login --device-auth` on the owner's explicit go-ahead. Three short
exec turns and one app-server turn — about 60 k tokens total, 2 % of the 5-hour window.
Raw captures in `raw-auth/` (gitignored).

### 11.1 `auth.json` for a ChatGPT login — a different shape from an API key

```json
{ "auth_mode": "chatgpt",
  "OPENAI_API_KEY": null,
  "tokens": { "id_token": "<1796 chars>", "access_token": "<1684 chars>",
              "refresh_token": "<196 chars>", "account_id": "<uuid>" },
  "last_refresh": "2026-09-10T09:39:52Z" }
```

Written **0600 by the CLI itself**. `login status` → `Logged in using ChatGPT`, exit 0.
So a driver managing this credential is managing *three* tokens with a refresh clock, not
one opaque string — and `account/chatgptAuthTokens/refresh` on the protocol (a
**server→client** request) says the CLI may ask its client to do the refreshing. Not
exercised; the one thing in this section still open.

### 11.2 The cheapest "am I armed?" call is free and instant

`account/read` → **5 ms**, no network:

```json
{ "account": { "type": "chatgpt", "email": "<redacted>", "planType": "plus" },
  "requiresOpenaiAuth": true }
```

It answers armed-ness *and* the plan in one call. Compare the unauthenticated form —
`{"account": null, "requiresOpenaiAuth": true}` — and compare Copilot, where the only
honest answer costs a network round trip and comes back as prose. **`authStatus` is a
solved problem on this engine.** The remaining unknown is the signature of an *expired*
credential, which needs a token left to rot.

### 11.3 `subscriptionQuotas` arrives without being asked for

`account/rateLimits/read` (670 ms) — and, better, `account/rateLimits/updated` is
**pushed after every single turn**, no polling, no TTL cache to invent:

```json
{ "limitId": "codex",
  "primary":   { "usedPercent": 1, "windowDurationMins": 300,   "resetsAt": 1789051222 },
  "secondary": { "usedPercent": 0, "windowDurationMins": 10080, "resetsAt": 1789638022 },
  "credits": { "hasCredits": false, "unlimited": false, "balance": "0" },
  "planType": "plus", "spendControlReached": false, "rateLimitReachedType": null }
```

Two windows — **5 hours** (300 min) and **7 days** (10080 min) — each a percentage and a
unix reset time. That maps onto Adestia's normalized `{id, label, utilizationPct,
resetsAt}` with nothing left over, and `usedPercent` was observed climbing 1 → 2 across
two turns. DESIGN.md's "never promise real-time" caution does **not** apply here the way
it does to Copilot's daily-aggregate billing API: this is per-turn and free.

Also present: `rateLimitResetCredits` — grantable "full reset" tokens with `status`,
`grantedAt`, `expiresAt` and a human title, plus `account/rateLimitResetCredit/consume`
to spend one. A product could offer that button; no other engine here has one.

`account/usage/read` (923 ms) is a *history* source, not a quota one: `lifetimeTokens`,
`peakDailyTokens`, `longestRunningTurnSec`, streak counts and per-day token buckets.

### 11.4 `model/list` is entitlement-filtered once authenticated

Unauthenticated it returned **six** models; authenticated on this plan, **five** —
`gpt-5.2` is gone. So the list is not a static catalog the client ships: it is what the
account may actually use, which is exactly what `modelSelection` needs to avoid lying.

And a model the plan does not have fails **server-side, cleanly**:

```
{"type":"error","status":400,"error":{"type":"invalid_request_error",
 "message":"The 'definitely-not-a-model' model is not supported when using Codex with a ChatGPT account."}}
```

surfaced as a JSONL `error` + `turn.failed`, exit 1. The client only *warns* first
(`Model metadata for X not found`) and lets the server refuse — so a driver need not
validate model names itself, but must surface a 400 as a user-readable refusal rather
than a crash.

### 11.5 The real event stream matches the mock — plus one built-in MCP server

A simple turn on the real path emitted exactly what the mock produced: `thread.started`,
`turn.started`, `item.completed(agent_message)`, `turn.completed(usage)` on exec; and on
app-server `thread/started` → `turn/started` → `item/started|completed(userMessage,
agentMessage)` → `item/agentMessage/delta` ×n → `thread/tokenUsage/updated` →
`account/rateLimits/updated` → `turn/completed`. **The mock is a faithful stand-in**, which
is what makes the CI story real.

Two additions only an account reveals:
- `mcpServer/startupStatus/updated` for **`codex_apps`**, a built-in MCP server that
  appears (starting → ready) on an authenticated thread. A driver's MCP inventory will
  see a server it did not configure.
- **Every turn carries a ~15 k-token preamble** (`input_tokens: 15291`, of which
  `cached_input_tokens: 12160`) for a prompt whose answer was the word "pong". Instructions,
  skills and environment context are not free, and the cache absorbs about 80 % of it.
  Worth knowing before promising anyone a cheap turn.

### 11.6 Still open

1. **Token refresh** — does the CLI renew `access_token` from `refresh_token` on its own,
   or does `account/chatgptAuthTokens/refresh` mean the client must? The difference
   decides whether a driver needs a refresh loop.
2. **The signature of an expired credential** — distinguishable from a malformed one?
3. **Concurrency and memory under load** — the 83 MB idle figure says nothing about a
   running turn; spike 4's method applied here would give the `maxConcurrentTurns`
   number for this engine.
4. **`app-server` stability** — it is labeled experimental; how fast does the protocol
   move between releases, and does `generate-json-schema` diffing catch it?
5. **The blind spot (§8)** — confirmed real; needs filing upstream.

## 12. Annex — artifacts (all under `spikes/codex-cli/`)

| File | Content |
|---|---|
| `raw/help.txt`, `raw/cmd-*.txt` | `--help` (134 lines) + all 25 subcommand help pages |
| `raw/auth-probes.txt` | the three auth states, `auth.json` shape, logout |
| `raw/envkey-exec.txt` | proof `OPENAI_API_KEY` alone does not arm the built-in provider |
| `raw/login-device-auth.txt`, `raw/login-default-flow.txt` | both login flows as a headless driver sees them |
| `raw-auth/real-exec.txt`, `raw-auth/real-appserver.json` | the authenticated pass (§11) — **local only**, carries account data |
| `raw/mock-responses-simple.txt`, `-toolcall.txt` | exec JSONL: plain turn, tool-call turn |
| `raw/mock-responses-escalate-onrequest.txt` | exec forces `approval policy = Never` |
| `raw/mock-chat-simple.txt` | `wire_api = "chat"` refused in 0.154.0 |
| `raw/app-server-{simple,toolcall,escalate,escalate-denied,write}.log` | full JSON-RPC transcripts |
| `raw/app-server-queries.json` | `model/list`, `account/read`, `config/read`, `skills/list`, … in full |
| `raw/app-server-surface.txt` | 99 + 10 + 81 protocol method names |
| `raw/mcp-probes.txt`, `raw/mcp-status.json` | MCP config surface and health reporting |
| `raw/session-probes.txt` | resume, history replay, `-o`, `--output-schema` on the wire |
| `raw/sandbox-read-only.txt` | the blocked write, and what the model was told |
| `raw/instructions-sandbox.txt` | AGENTS.md vs CLAUDE.md, full `codex doctor` |
| `raw/misc-probes.txt`, `raw/marketplace-clone*.txt` | fallback docs, `--ephemeral`, the startup clone |
| `raw/doctor.json` | machine-readable health report |
| `mock-provider.js`, `mock-mcp-server.js` | localhost mocks, no dependencies |
| `run.sh`, `probe-*.sh`, `probe-*.mjs`, `drive-app-server.mjs` | every probe, re-runnable |
| `package.json` / `package-lock.json` | exact pin `@openai/codex@0.154.0` |

`node_modules/`, `isolated-home/`, `codex-home*/`, `work*/`, `raw-auth/` and the
generated schema are gitignored (289 MB + 4.2 MB, plus the real credential and the
account data behind §11).

### How to reproduce

```bash
cd spikes/codex-cli && npm ci
./run.sh -- --version                       # 0.154.0, no auth, no network
./capture-help.sh                           # every help page into raw/
./probe-auth.sh                             # the three auth states (bogus keys only)
./probe-mock.sh responses simple            # a full turn against the local mock
./probe-mock.sh responses toolcall          # …with a tool call
node drive-app-server.mjs --script escalate # the approval round trip
node drive-app-server.mjs --script escalate --deny
node probe-login-device.mjs                 # device flow: URL + code, no pty, never completed
node probe-appserver-queries.mjs            # model/list, account/read, config/read…
node probe-mcp-status.mjs                   # MCP health, servers injected per thread
# §11 needs a real account — ./login-real.sh, then:
#   ./probe-real-exec.sh && node probe-real-appserver.mjs && python3 summarise-real.py
./probe-sessions.sh ./probe-sandbox-write.sh read-only ./probe-misc.sh
./run.sh -- app-server generate-json-schema --out ../raw/app-server-schema
python3 dump-protocol-surface.py
```
