# Adestia — founding design

> **Status: built and running.** Decisions taken 2026-08-20/21 with the product
> owner, after a full review of the predecessor (`AntorFr/agent-pods/images/agent-gw`)
> and a six-probe analysis pass. This document records the WHY; the code records the
> WHAT, and where the two disagree the code is right and this file is a bug.
>
> Everything below is implemented unless marked **not built yet**.

## What Adestia is

A self-hosted web product that pairs a **chat with an AI agent** and **Apps** — visual
modules the agent can act on and the user can see and manipulate. The agent runtime is
a **coding-agent CLI** (Claude Code, GitHub Copilot CLI, more later): Adestia builds
everything on top of a CLI so that a **monthly subscription** powers the whole product,
never per-token API billing.

One instance = **one agent, one workspace, one subscription** (the deployer's).
Humans who talk to that agent share its capacity.

## Lineage

Adestia is a from-scratch rewrite of `agent-gw`, which was built for one homelab and
proved the concepts. What survives is philosophy, not code:

- **Content / presentation / behaviour strictly separated.** Content is markdown +
  frontmatter + a *closed* vocabulary of typed blocks. Rendering is code. **Zero LLM
  in the display path.**
- **Discovery by manifest.** The core knows no plugin or skin by name. A broken
  plugin costs its view, never the gateway. Refusals are loud, never silent.
- **No local user database, ever.** Identity comes from outside (OIDC, proxy header)
  or nobody asks (local mode).

What the blank page deliberately breaks: the single global session and turn lock,
non-streamed turns, hard coupling to the Claude Python SDK, build-time plugin
bundling, configuration scattered over ~30 env vars, and content writable by the
agent only.

## Product principles

1. **Files are the source of truth.** Pages, notes, planif entries, app data: markdown
   (+ frontmatter) and JSON sidecars on the filesystem. The agent reads and writes them
   with its **native file tools** — no MCP indirection for its own memory. Git/ZFS/DR
   come free. No SQLite in the content path.
2. **Both hands write.** The user edits pages in a Notion-like block editor; the agent
   edits the same files. Both are constrained by the **same closed block vocabulary**
   (schema-validated). Visual uniqueness is guaranteed because *nobody* can touch the
   pixel.
3. **The CLI is a replaceable engine.** Adestia defines its own **driver interface**;
   each CLI gets an adapter. Anything a CLI may or may not offer (auth arming, usage
   metrics, MCP injection, permission events) is a **declared capability**: the UI
   renders what the driver declares, degrades honestly otherwise — never a lying zero.
4. **Extensible at runtime.** Plugins and skins are dropped into mounted directories
   and discovered at startup. **No image rebuild** to extend an instance. Presence is
   not activation: config decides what is active.
5. **Auth is a mode, not a feature.** `none` (local, single implicit user, binds to
   localhost by default), `oidc` (generic issuer, roles from a groups claim),
   `proxy` (trusted Remote-User header). Multi-user means per-user conversations and
   roles; the workspace/content remains the agent's shared space.
6. **Declarative instance config.** One config file (YAML) drives the instance:
   driver, auth mode, enabled plugins, skin, planif, limits. Env vars override
   secrets and deploy-specific values only.
7. **What the agent may do is bounded by walls, not prompts — and asking is a
   posture, not a policy.** (Rewritten 2026-08-26; see the decision log.) The
   container bounds what exists, MCP servers carry their own authorization
   where an act lands, and the person's instructions say what to check in chat
   first — a good-faith convention, honest about being one. On top of that,
   `permissions.mode` chooses between `open` (nothing is asked) and `ask`,
   where the ENGINE's own judgement decides what needs a person and Adestia only
   carries the question. Adestia never judges: no lists, no rules, no gates.
8. **Extension schemas are designed first.** The plugin/skin manifests and every
   contribution point are formal, versioned JSON Schemas (`schemaVersion`) from day
   one. One source of truth, three consumers: the loader validates with it, the
   authoring skills teach with it, the public docs are generated from it. The schemas
   will churn early — that is them learning — but they are always *written down*.
9. **The agent authors its own extensions.** v1 ships authoring contracts
   (`plugin-author`, `skin-author` skills) so the instance's agent can scaffold a
   conformant plugin or skin. Dogfooding as design validation: if the skill cannot
   describe how to build a plugin cleanly, the data model is wrong.

## Architecture overview

```
┌────────────────────────── Adestia instance ──────────────────────────┐
│  web (React SPA/PWA)                                               │
│   chat ▸ streamed turns, attachments,                              │
│          quota surfaces (per driver capability)                    │
│   apps ▸ core views + plugin views (runtime ESM, import map),      │
│          settings among them — credential, MCP, look, prose        │
│   editor ▸ Notion-like block editor over markdown files            │
├─────────────────────────────────────────────────────────────────────┤
│  server (Node/TS)                                                  │
│   auth (none|oidc|proxy)   conversations (per user)                │
│   content API (md files, frontmatter index, block schema)          │
│   plugin host (discovery, validation, APIs, agent contracts)       │
│   planif clock   MCP-in (async jobs)   attachments inbox           │
│   secret store (driver tokens, 0600, never sent to browser)        │
├─────────────────────────────────────────────────────────────────────┤
│  driver layer (capability-declared)                                 │
│   claude-code adapter (Agent SDK TS)  copilot-cli adapter (JSONL)  │
├─────────────────────────────────────────────────────────────────────┤
│  filesystem                                                          │
│   workspace/ (agent home: content, memory, CLI config)             │
│   data/ (server state, conversation index, inbox, secrets)         │
│   plugins/  skins/  adestia.config.yaml                              │
└─────────────────────────────────────────────────────────────────────┘
```

- **Streaming:** SSE for turn events and a light event bus (file watcher → live app
  refresh). Plain POST for actions. Proxy-friendly, no WebSocket dependency.
- **Concurrency:** one CLI session per conversation; turns run concurrently across
  conversations behind a configurable global cap (subscription limits are real).
- **Conversation store:** rich JSONL transcripts under `data/` (text, tool events,
  attachments, interruption markers) + per-user index — replay must be faithful, not
  text-only.
- **One spawn site.** Every agent turn goes through a single spawn path that applies
  the driver env contract; agent-gw had two and forgetting one broke a whole channel
  silently.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (Node ≥ 22, **npm workspaces** monorepo) | one language for core, front and third-party plugins; Claude Agent SDK is first-class TS; Copilot CLI is itself npm. npm workspaces rather than pnpm: it ships with Node, so contributors and CI need nothing installed — the extra tool earned nothing here |
| Server | Fastify | TS-native, fast, encapsulated plugin system that maps well to Adestia's plugin host |
| Frontend | React 18+ + Vite | the block-editor ecosystem and the plugin-author audience are there |
| Block editor | **Milkdown** (ProseMirror + remark) — decided by spike 1, see `spikes/editor/VERDICT.md` | byte-identical round-trip proven; same remark grammar as the renderer (one grammar, two consumers — drift eliminated structurally); wrapped behind a Adestia editor interface, Tiptap spike kept as proven fallback |
| Content pipeline | unified/remark + directives (`:::block`) + wikilinks, schema-validated at the mdast level (shared by renderer, editor and agent skill); DOMPurify in depth | ONE parser both sides — two parsers means drift; replaces Markdoc from agent-gw |
| Drivers v1 | `claude-code` (Agent SDK TS), `copilot-cli` (pinned binary, JSONL) | the two requested engines; Copilot's `--acp` (Agent Client Protocol) to evaluate as an alternative transport |
| Testing | **Unit tests from the first package** (Vitest) + spike harnesses promoted to permanent suites: content-engine round-trip conformance, driver fake-binary suites (BYOK mock provider for Copilot), plugin DOM-mount tests | tests are scaffolding laid with the foundation, not retrofitted; every markdown/editor/driver dependency bump re-runs the conformance gates |
| Packaging | Docker image + compose; `npx` for bare-metal local | the two self-hosting front doors; Helm stays in the deployer's own charts (out of the product) |
| License / repo | MIT, public from day one (github.com/AntorFr/adestia), docs in English | early adopters follow from the first commit; npm scope `@antorfr` |

## Driver contract

The driver interface has a **mandatory core** and **optional capabilities**. The UI
is generated from the capability descriptor — no driver name ever reaches the front.

**Core:** session lifecycle (create/resume/expire), one streamed turn as an event
sequence (`text-delta`, `tool-use`, `permission-request`, `result`), interrupt,
`env()` → dict merged UNDER the turn's own env at the single spawn site, capability
descriptor, version/capability probing at startup (never assume a flag set).

**Core, and all of the same shape: the driver NAMES its own paths, the core
does the writing.** `skillsPath()` (where agent contracts are delivered),
`instructionPaths()` (prose it reads), `authorityPaths()` (files deciding what
it may do). Only the driver knows its harness, and only the core should hold a
filesystem writer — a driver is never handed one it could point anywhere. Each
is optional: a CLI without the concept returns nothing and the product adapts,
rather than the product assuming one CLI's layout is universal. This matters
more than it looks: the two supported CLIs keep the same natures under
different names, and their zones overlap without being identical.

**`authManagement`** (arm / refresh the CLI's subscription token from the UI):
- State machine, per driver, single active arming session:
  `idle → starting → awaiting-input → exchanging → armed | error`, with session TTL.
- `authStatus()` → `{state: absent|armed|invalid|unknown, savedAt?, expiresAt?,
  source: managed|cli-native}`. "No managed token" is a legitimate state, not an
  error: a CLI living on its own credentials must work.
- `beginAuth()` → interaction descriptor `{sessionId, mode, authorizeUrl?,
  inputLabel?, consent?, ttl}` with `mode` an extensible enum (`url+code` for
  Claude setup-token, `device-code` for Copilot login, `api-key`, `none`) — the
  front renders the flow without knowing the CLI. `completeAuth(sessionId,
  secret)`, `cancelAuth(sessionId)`.
- `consent` is a sentence the user must tick before the flow may finish, for
  the case where the CLI itself stops on a human question mid-login (Copilot
  asks whether it may store the token unencrypted, which is the only form Adestia
  can harvest). A driver answering that on the user's behalf would be deciding
  for them; leaving it unanswered hangs the login until the code expires. So it
  is relayed, generically: the front shows the sentence and gates the button,
  and still never learns which CLI asked.
- Secrets are persisted by the **core** (0600 file in data dir), redelivered via
  `env()`; the browser only ever sees state, never the token.
- Expiry is **reactive first-class**: drivers emit `authInvalidated(reason)` on an
  upstream refusal; `expiresAt` is optional (Claude has no reliable date; Copilot
  PATs have no documented auto-refresh). A periodic health check may feed a
  "re-arm required" state.
- The pty/TUI scripting a driver needs (Claude `setup-token` screen-scrape and its
  `\r` quirks) is internal to the driver. Conformance requires a **fake-binary test
  suite** replaying the CLI's observed behaviour.

**`usageMetrics`** ("track token usage *if the CLI exposes it*" — hence capability):
- Guaranteed baseline for drivers that have it: per-turn `{tokens in/out/cache,
  durations, perModel}` (Claude: `ResultMessage`, always emitted).
- **`contextTokens` ≠ turn totals** — two named concepts. Context weight = what the
  next message re-pays (input+cache of the LAST call); the harness makes one API
  call per tool step, summing is a lie agent-gw already documented.
- Optional sub-capabilities: `cost` (null-honest, API billing only),
  `contextBreakdown` (live totals/max/percentage — needs a connected SDK client;
  UI thresholds derive from the model's real window, not hard-coded 60k/120k),
  `subscriptionQuotas` (normalized windows `{id, label, utilizationPct, resetsAt}`
  with mandatory `stale`/`fetchedAt` + server-side TTL cache — upstream endpoints
  are rate-limited and sometimes undocumented), `taskUsage` (sub-agent metrics),
  `liveTurnUsage` (the turn's event stream carries cumulative usage-delta events
  *while the turn runs* — feasible on Claude, where streamed responses report
  climbing output-token counts and the harness makes one API call per tool step;
  unknown on Copilot until proven against its JSONL).

**`modelSelection`** (switch models from the composer, as the predecessor does):
`listModels()` where the CLI can enumerate its offering; the chosen model is a
per-conversation (and per-turn) option passed at the single spawn site. Where
enumeration is impossible, the driver degrades to a config-declared list or the
selector hides — the product never hardcodes a model list (it would lie at the
first catalog change). v1: Claude Code enumerates; Copilot CLI has `--model`,
programmatic enumeration to verify in the hands-on spike.

**Instruction delivery** (core responsibility, not a capability). Design
assumption: **one driver per workspace lifetime**. The user's instructions live in
the **native dialect of the chosen CLI** (`CLAUDE.md` + `.claude/` for Claude
Code; `AGENTS.md` / `.github/copilot-instructions.md` / `applyTo` files for
Copilot CLI — which incidentally also reads `CLAUDE.md`) and Adestia never
normalizes or translates them: realistically nobody hand-writes instructions —
people ask the agent to, and the agent writes its own dialect. Consequently,
switching driver on an existing workspace is not a config flip but an **assisted
migration**: the author of the files is also their translator — the new agent
rewrites the instructions in its own dialect on request. `adestia init` scaffolds
per driver (it lays down the files that driver's CLI actually reads). The one
harness-neutral layer is Adestia's own: **plugin agent-contracts**, which the driver
compiles into its best native form (Claude skills, Copilot instruction sections),
degrading to plain instruction text as the guaranteed floor — a plugin must work
on both engines without being rewritten.

**v1 drivers:**
- `claude-code` — Agent SDK TS. Arming: `setup-token` flow (url+code). Usage: full
  (per-turn, context breakdown, subscription windows via RateLimitEvent / OAuth
  usage endpoint with cache+stale fallback).
- `copilot-cli` — verified hands-on (spike 3, binary 1.0.80 pinned; full facts in
  `spikes/copilot-cli/REPORT.md`): headless `copilot -p --output-format json`
  (JSONL event schema captured via a local BYOK mock provider — which also makes
  the whole driver CI-testable with zero GitHub credentials), sessions via
  `--resume/--session-id` (the driver may choose ids), permission policy via
  `--allow-tool/--deny-tool`, MCP via `mcp-config.json` under a driver-owned
  `COPILOT_HOME`. Arming: `COPILOT_GITHUB_TOKEN` with a fine-grained PAT —
  classic `ghp_` tokens are **loudly rejected** as of 1.0.80 (shape validation
  is UX polish now, not a mute-failure guard) — or relayed device flow; the
  three unauthenticated error states are stderr prose with empty stdout (never
  JSONL). No auto-refresh → reactive invalidation + health check. The binary
  **self-updates by default** → the driver pins (`COPILOT_AUTO_UPDATE=false`).
  Usage taps, richest first: driver-owned `session-store.db` (per-call tokens +
  AI-credit units), the JSONL `result.usage` line, the OTel file exporter; the
  AI Credits billing API stays the only quota source (daily aggregates,
  separate billing-scope token) — never promise real-time. Discovered: `--acp`
  (Agent Client Protocol server) — candidate transport to evaluate vs JSONL.

## MCP configuration

Outbound MCP servers (what the agent can call) come from **three sources, one
materialization**:

1. **Operator layer** — the `mcp:` block of `adestia.config.yaml`: stdio
   (`command`) or HTTP (`url`) servers, env with `${VAR}` secret interpolation
   resolved server-side. The product's canonical surface.
2. **Plugin layer** — a plugin manifest may declare (or ship) MCP servers as a
   facet: active plugin = server wired, inactive = nothing, same rule as plugin
   APIs.
3. **Workspace-native layer** — the CLI's own MCP config (`.mcp.json`, …) is the
   user's and the agent's business: Adestia neither parses nor translates it (same
   doctrine as instructions).

**Materializing 1+2 is a core driver responsibility** (like instruction
delivery). The core merges the two layers before a driver exists and HANDS the
result over: a driver is never given a discovery mechanism, so "where does this
server come from" keeps one answer. Name conflicts are reported by name and the
operator layer wins — a plugin is something you dropped in a folder, the config
is something you wrote. `headers` is the operator's alone and absent from the
manifest schema: a plugin carrying a bearer would put a credential in a folder
anybody can drop into.

Per driver, materialization differs and the asymmetry is load-bearing:

- **Claude** receives the map as an argument to each turn. Nothing on disk.
- **Copilot** receives a FILE, handed over with `--additional-mcp-config`,
  written into the driver-owned home. Its own `mcp-config.json` — the user's —
  is never touched. The file is `0600` and the flag takes a path rather than
  inline JSON, because inline would put every bearer into `ps` output.

**A server may authenticate itself.** A hub is a resource server: it validates
short-lived JWTs, so a static bearer in a config file works for an hour and
then stops. A server therefore declares an OAuth identity (`auth: {tokenUrl,
clientId, clientSecret, scope?, audience?}`) and the product mints, caches and
refreshes it, writing `Authorization` at the SPAWN SITE — once per turn, which
is precisely what a config file cannot express. Consequences that are decisions
rather than details:

- **No relay process.** The predecessor needed one stdio subprocess per addon
  whose only job was to hold a mutable token, because a CLI config file can
  only hold a constant. Adestia builds its map per turn, so the need disappears
  rather than the relay being ported. Copilot's file is rewritten per turn for
  the same reason.
- **Cached by identity, not by server.** Addons of one hub share credentials;
  nine addons cost one token exchange, not nine tokens expiring at nine
  different moments. Concurrent turns await the same exchange instead of
  racing it, which matters wherever a provider rotates what it returns.
- **`client_secret_basic`.** The credentials-in-body variant is refused by some
  providers with a bare `invalid_client`, which reads as a wrong secret and
  sends somebody rotating a valid credential.
- **A server whose token cannot be minted is OMITTED**, never called
  unauthenticated: a wall of 401s reads to an agent as a broken tool, an absent
  server reads as an absent server. A provider being down costs those servers,
  never the turn, and a refusal is never cached.

MCP tools run like any other tool (their own servers carry the authorization). Server health
is a driver capability (`mcpStatus`), reported off the session — both CLIs
announce their servers when a session opens, and probing would mean opening one
to ask. Health is five states plus `unknown`, never a boolean: `needs-auth` is
a job for a person, not a failure, and rendering it as "down" sends somebody to
debug a network while a server waits to be logged into. `unknown` is the honest
answer before a first turn, where an empty list would tell somebody who just
configured three servers that they have none.

**Not built: the per-user rebound.** A user-scoped addon (somebody's own
calendar or mail) needs a token carrying the CALLER's identity, not the
instance's. The insertion point is the same line that writes the header; only
the token's source differs. What is missing sits earlier: the shell must be an
OIDC client that requested `offline_access`, must keep per-user refresh tokens,
and `TurnRequest` must carry a per-turn env. In `proxy` auth mode this is
structurally impossible — the session lives with the reverse proxy, and the
product holds no token to refresh.

Inbound MCP (the instance exposing `ask_<agent>`) is a separate subsystem, already
in v1 scope — with no default allowed-hosts baked into the product (the
predecessor's lesson: one deployment's DNS in a public image helps nobody).

## Shell tools — the agent acting on its own instance

The instance hands its agent tools that act on the PRODUCT itself — first
`rename_conversation` and `new_id` (`server/src/shell-tools.ts`). The doctrine
below was argued across several sessions and each piece carries the argument
that forced it; a future tool gets designed by walking these rules, not by
reopening them.

**Three surfaces, never confused.** An instance is reachable three ways: the
PUBLIC surface (UI + `/api/*`, through the ingress, user auth); the EXTERNAL
MCP surface (`ask_<agent>`, through the ingress, deliberately — other agents
are its audience); and the instance's OWN ORGANS, which only its agent may
reach. The organs live on a **unix socket**, not on a port: the app's listener
is published by an ingress, and an agent-only endpoint protected by nothing
but a bearer token on a published listener is a service door on the façade.
A socket cannot be mis-exposed; it does not exist on the network.

**One registry, readers generated.** A tool is a name, a description, a
string-typed schema, a handler — one entry. Every surface is derived from the
registry (the MCP tool list, the schema validation, the in-process host), so
a new tool is an entry, never a mechanism. Handlers never learn the transport.

**The target is implicit — the agent expresses meaning, never addresses.**
A tool call carries a title or nothing; WHICH conversation it lands on is
resolved server-side, from context minted at the spawn site (the only place
that holds `userId` and `conversationId` together). In-process the context
travels by closure; over the socket it travels as an opaque per-turn token the
bridge announces and the server resolves from its own table. `sessionId` plays
no role anywhere: the session↔conversation mapping is "one current, sometimes
none", stale under drift, absent on turn one — the token design bypasses it
entirely. This is also why the model never needs to know any id exists.

**Transports: hosted where possible, bridged everywhere else.** The
claude-code driver is handed a LIVE MCP server instance (`toolsHost`,
injected at boot like `query` is): handlers run in the server process, beside
the store, no token on the path. Every external-binary engine gets the same
tools as one more stdio MCP server: a generic ~40-line bridge (written by the
server under its data dir, secret-free) that pipes stdio to the socket and
announces the turn token from its env. The bridge belongs to the SERVER, not
to a driver — a driver's translation layer only wraps it into its engine's
config shape, which for copilot is five lines in a file it already writes.
Measured before committed (spikes/shell-tools-transport, executed): engines
respawn stdio servers on every turn, resumed ones included, so the env token
is fresh by construction; engines open several socket connections per turn;
a dead socket degrades to a failed server without hurting the turn; the SDK
instance really runs handlers in the calling process, and it keeps state
across turns — so per-turn context is closed over at spawn, never held on
the instance.

**A third transport, when a registry filters MCP away.** A locked-down org
validates every MCP server its CLI is handed against a corporate registry and
drops the ones it does not know — the instance's own server included, so the
agent never sees its tools and the turn is not even told why.
`driver.shellToolsTransport: shell` (copilot only; claude-code hosts them
in-process and has nothing to escape) writes a small CLI under the driver's
home and arms the socket path and the turn's token in the CHILD'S ENVIRONMENT
instead, so the tools ride the ordinary execute tool. The registry then has
nothing to filter: no MCP server is declared at all. Everything above the last
hop is unchanged — same socket, same one dispatch, same per-turn token, same
handlers — which is why this is an escape hatch per instance and not a second
design. What it costs is DISCOVERY: no engine enumerates the tools any more,
so the workspace's own instructions have to say the CLI exists and how it is
called (`node "$ADESTIA_TOOL_BIN" list`, then `call <name> '<json>'`). That
prose belongs to the operator, like every other instruction: the core writes
none.

**Tools answer.** Every call returns synchronously — success text or a
failure worded for the agent — because the agent is the conversational
surface: "I could not rename it, the title was empty" must come from the
agent in the same breath, not from a toast the shell shows nobody asked for.
This requirement is what eliminated the tempting cheaper design (a structured
"signal" block in the agent's output, parsed by the turn pipeline, which
already holds the context): a signal cannot answer, and the event stream is
one-way — there is no channel to inject a result into a running turn. The
signal transport remains a documented contingency for an environment that
forbids BOTH exec and MCP, and nothing else.

**Tool or convention is a product decision, per capability.** A tool
encapsulates an evolvable, server-authoritative behavior (`new_id`: the
canonical ULID scheme can change without re-teaching any agent); a convention
costs nothing and works everywhere (semantic slugs in a workbook stay
hand-minted where the domain says so). The rule that falls out: **the author
of an object mints its id** — server-created records get server UUIDs,
agent-authored content uses the tool or the domain's own scheme.

**Stakes are declared per tool.** Both current tools are benign — a rename is
reversible by construction (append-only meta lines; the thread compacts when
the turn settles). The registry's shape forces the question at registration;
a destructive tool is where the posture and confirmation debate reopens, and
not before.

Rejected on the way, each against a fact: extending `TurnEvent` with action
events (two drivers to change, and a one-way stream cannot carry replies);
resolving the conversation from `sessionId` (mapping fragile, absent on turn
one, and the server holds the conversationId at the exact place the tool is
wired); the agent calling `/api/*` with `curl` (a durable allowlist for
`curl` opens the whole web, the token lands on argv, and it only
authenticates in `auth: none`); an HTTP MCP endpoint on the app's own
listener (the surface confusion above).

## Chat experience — the parity bar

The v1 chat must be **at least** agent-gw's PWA, which sets the bar:

- **Bubbles:** user right on accent, agent left on bordered surface, all colors via
  design tokens; sanitized markdown (agent side only); code/table overflow handling;
  dotted ephemeral bubbles; centered error bubble.
- **Tool trace ◇:** grouped under the PART of the turn it belongs to, name +
  short target (≤78 chars, never the full input), opt-in per instance. A turn
  is not one answer: an agent that speaks, goes back to its tools and speaks
  again said two things, and the thread draws and stores two — a tool called
  after a word opens the next message, so a trace always hangs above the
  answer it produced rather than above one it had nothing to do with.
- **Activity:** busy indicator with skin hook — up for as long as the turn
  runs, UNDER whatever has been said so far rather than instead of it, so an
  agent still working behind its first answer never looks finished —, pulsing
  status dot, single send↔stop button, message queueing during a turn, turn
  adoption after reload. Queueing
  and adoption are SERVER-owned (the turn desk, `server/src/turns.ts`): a turn
  runs detached from its HTTP request and an SSE response is merely a
  subscriber, so a closed tab kills a subscription, never a turn. A message
  posted mid-turn is answered `202 held`, written into the thread on
  acceptance — the predecessor kept its queue in browser RAM, where a reload
  erased it — and dispatched as ONE merged turn when the running one settles;
  `GET /api/turn/attach` replays the running turn's coalesced event log then
  follows live, through the same reducer, so an adopted turn is
  indistinguishable from one never left. A queue is NOT re-dispatched across
  a server restart, deliberately: the texts are already in the thread, and a
  reboot firing week-old prompts unprompted would be worse than the gap.
- **Tabs (beyond the bar):** parallel conversations as a browser-like tab
  strip on desktop — each tab its own session (thread, live turn, held
  bubbles, context weight), so a running turn's dots and tool trace belong to
  ONE tab instead of bleeding into whichever thread is on screen. A status
  dot carries one vocabulary everywhere (`dotFor`): waiting on a person >
  working > finished-unread > idle. Closing a tab never touches the
  conversation (the list keeps it; archiving is the other, separate exit);
  the strip is persisted like a browser's — order, membership, active tab —
  and restored on refresh, tabs re-attaching to their running turns via the
  desk. Drag to reorder. On a phone there is no strip: the thread list IS the
  navigation and wears the same dots (client sessions where this browser
  watches, the list's server-computed `turn` field and stored read-marks for
  everything else), and a reload reopens only the last active conversation.
- **Composer:** attachments (picker+paste+drag-drop, thumbnails pre- and post-send),
  ephemeral mode, Enter/Shift+Enter, mobile fold under "+". The model selector
  is the one control that did NOT stay here: which engine answers belongs to
  the conversation, so it sits in the chat header where the brand is, and the
  composer keeps its width for the field.
- **Split view:** chat rail | gutter | canvas, user-resizable and persisted.
- **Mobile/PWA:** responsive breakpoint with swipe between chat and canvas
  (touch and pen only, refused inside a field or anything scrollable
  sideways, and always alongside the header button — a gesture nobody
  discovers must never be the only route to a screen);
  installable PWA, skin-merged manifest (N instances = N discernible installs),
  service worker with network-first shell (opens offline, never serves stale JS).

And **exceed it** — the audit found what the predecessor never had:

1. **True token streaming** into a live bubble (agent-gw posts whole blocks; on long
   answers the user stares at a typing indicator). Deficit #1.
2. **Rich transcript replay:** tool trace, attachment thumbnails and interruption
   markers survive reload (today `/api/history` replays text only).
3. **Interruptions materialized** in the thread (the `stopped` flag exists and is
   dropped today).
4. **Concurrent conversations** instead of a 409-and-retry single thread.
5. **Incremental thread rendering** (no full re-render on resync; virtualize long
   transcripts) and per-message actions (copy, re-ask).
6. **Split-view drag on Pointer Events** + keyboard access + double-click reset
   (today: mouse-only, nothing on tablet).
7. **Live cost on the thinking bubble** *(bonus, capability-gated)*: while the
   agent works, the busy bubble shows the climbing token count fed by
   `liveTurnUsage` deltas; drivers that cannot feed it fall back to the plain
   busy indicator.

**Screen context** (ported after the fact — the parity audit above missed it):
on a desktop the canvas sits BESIDE the chat, so « ça » in a sentence usually
means the page in front of the reader. Each message carries `view: {route,
title}`, and the server prefixes the prompt with one line naming it. The route
and its breadcrumb only, never what the page renders: a page shows content the
agent did not write, and pouring it in would strip the "untrusted" label the
attachment framing exists to keep. It is a hint and says so — the question
comes first. Nothing is sent from the landing canvas or from a folded shell
showing the chat, and the note is applied server-side so the thread stores the
prompt as typed: a reload replays what the person wrote, never the framing.

Kept as-is from the predecessor: the theme contract — *a skin is a declaration of
tokens, never a structural rule scoped by agent* — enforced by a build/CI lint, and
narrow skin hooks (brand, crest, busy node, home).

## Extension system

Everything a plugin contributes is **declared in its manifest** and loaded at
runtime; nothing is scanned by filename convention at build time.

- **Manifest facets:** `view`, `blocks`, `chrome` (composer buttons / settings
  entries / modals as declarative data the shell renders), `styles: [...]`, lazy
  entry points, server `api`, agent contract (skills), `mcpServers`, `bin`,
  `setup`. Manifest and
  every facet validate against the versioned JSON Schemas (principle 8); a plugin
  declares `contract: N` and the shell refuses loudly what it cannot honour.
- **Factory pattern kept:** `(api) => contribution` with the API injected — already
  hot-load-ready. The API must be complete and versioned: agent-gw shipped a chrome
  API with a hole (`input`/`add` missing) that only minification hid; the contract
  therefore requires a **DOM-mount test** per plugin, since a runtime-loaded plugin
  gets no build error to save it.
- **ESM runtime:** the shell `import()`s only ACTIVE plugins from
  `/plugins/<id>/web/*` (served under session auth by default; public is opt-in).
  Shared dependencies (React, design system, sanitizer, content engine primitives)
  are published through an **import map**; everything else is vendored by the
  plugin. Heavy optional chunks (the scan decoder precedent, ~450 kB) are
  pre-bundled ESM inside the plugin folder, loaded via
  `import(new URL('./x.js', import.meta.url))` — no hard-coded build entries, no
  `window.*` delivery channel.
- **CSS contract:** stylesheets are listed in the manifest and injected/removed by
  the shell — never `import './x.css'` from a module. Design tokens are a published,
  linted API.
- **Two bundle targets preserved, resolved at boot:** views/chrome load into the
  launcher, block modules into the content engine, which waits for active plugins'
  blocks before its first render.
- **Skins:** same discovery, one active (config value, not list). A skin is tokens +
  narrow hooks + assets (favicon/manifest served pre-boot).
- **Authoring skills (v1):** `plugin-author` and `skin-author` ship with the
  product; the instance's agent scaffolds and validates extensions against the same
  schemas the loader enforces.
- **A delivered skill has ONE name.** A plugin writes its skill under a bare
  name, because inside the plugin nothing else is called that; delivery
  namespaces the folder as `<plugin-id>-<skill>` so two plugins may both ship
  an `author` without one silently overwriting the other. The core therefore
  rewrites the frontmatter `name` to match that folder. Copying the frontmatter
  through untouched left every plugin skill claiming a name its own folder
  contradicted — which costs nothing mechanically and everything in prose:
  instructions that point at a skill then have two candidate names and no way
  to choose. The namespaced folder wins, with no exception for the case where
  plugin id and skill name coincide — an exception would make the name
  unpredictable exactly where it needs to be written down.
- **Secrets are declared by NAME, never carried.** A manifest lists the names
  its server side needs; the value lives in the instance's configuration and
  the core hands each API exactly what it declared and the instance holds.
  Names rather than ownership is the other half: two plugins needing the same
  key declare the same name and it is rotated in one place. A declared secret
  the instance lacks is ABSENT rather than empty — an empty string fails later,
  in a request, blaming the API it called — and the plugin still mounts,
  reported as DEGRADED rather than refused. That distinction is part of the
  contract: a refusal means the extension is off, a degradation means it runs
  with something missing, and filing the second under the first sends somebody
  hunting for a plugin that works.
- **`absorbs` is a NAME, not a path.** A plugin declares the folder its tile
  already stands for, so the same content is not offered twice. It matches
  wherever that run of segments sits and covers everything beneath it: a plugin
  cannot know how an operator files things, and a tile that stands for a folder
  stands for its contents. Segment boundaries only, and only while the plugin
  is ACTIVE — turning it off gives the folder back rather than hiding it.
- **Owning a folder is a ROUTING rule, not a launcher detail.** `absorbs` first
  shipped as a way to retrench a tile from the home, and every link INTO an
  absorbed folder kept ignoring it: the breadcrumb out of a trip's page walked
  back to `#/section/…/broceliande-2026`, the generic list of files, from a
  screen that exists precisely because a trip is not one. The plugin could not
  fix that — the shell reserves `/section/` and `/page/` for itself, and by
  then the plugin's view is unmounted. So the shell resolves ownership in one
  place (`app/owners.ts`), and both halves of the answer come from whoever
  holds it: the shell knows WHICH plugin owns a folder, the plugin's optional
  `routeFor(folder)` says WHERE it keeps it — only the trips app knows a trip
  is addressed by the `assets/voyage.json` it carries. The rule applies to the
  links the shell draws AND to the `/section/` route itself, which hands over
  to its owner, because a bookmark and an agent-written target deserve the
  screen the breadcrumb leads to. A plugin that answers nothing gets the
  generic section back — no guessing — and an answer outside the plugin's own
  route is dropped: owning a folder is not owning the shell's navigation.
  **Answering IS claiming**, which is what lets an app with no folder name to
  give own its paths at all: the atelier's benches sit in whatever project
  folders exist, so it can absorb neither `projets` (a word half a workspace
  uses) nor `diy` (a domain full of notes it does not draw) — it answers from
  its listing instead, and a folder is a workbench because a workbook is filed
  in it rather than because of what it is called. Declared beats known, so a
  plugin volunteering never takes a folder another one claimed. The same
  resolution serves the home's brief: a target carrying a path goes to whoever
  owns it, and the shell stopped spelling out `workbook` — one plugin known by
  name, and a new line of shell code owed to every app that ever wanted to be
  a target.
- **One breadcrumb, and the plugin finishes the sentence.** The shell can name
  an app and nothing under it — a trip's title lives in a JSON file it does not
  read — so `#/voyages` and `#/voyages/baden-2026` drew the same header. Both
  ported apps had answered that by drawing their own trail inside their panel:
  two breadcrumbs stacked, which reads as a bug. A view now PUBLISHES where it
  is (`api.trail`) and the shell draws it in the one place a breadcrumb
  belongs, dropping the crumbs that repeat Home or the app's own root — so a
  ported view that says the whole trail from the top still lands right. Cleared
  on every navigation: a screen that says nothing gets the app's name alone
  rather than the last screen's words.
- **An address is READ by people, so it says as little as it can.** The first
  shapes shipped were whatever each screen had at hand:
  `#/voyages/domaines%2Fvoyages%2Fbaden-2026%2Fassets%2Fvoyage.json`. Three
  things nobody should have to read, in one link — `assets/voyage.json` is
  storage the rest of the product spends its time hiding, `%2F` escapes the one
  character a fragment always allowed (RFC 3986), and the operator's filing
  turns a bookmark into something a tidy-up can kill. What the long form bought
  is kept: the address IS the truth, so there is no registry of ids to maintain
  and the agent can link to a thing without asking anybody. So the short form
  is a NAME the plugin's own listing resolves — `#/voyages/baden-2026` — never
  an id somebody has to allocate, and it is used only where the listing PROVES
  it unambiguous: a name taken twice falls back to the path, because a pretty
  link that opens the wrong trip is not an improvement on an ugly one. The
  shell's own routes follow the same rule one notch lower, encoding segments
  and leaving slashes alone. **Every shape ever written down keeps being read**
  — a bookmark, a link the agent put in a page months ago — which is what makes
  this a change of what we WRITE rather than a migration: recognising an old
  shape costs nothing, breaking a link costs trust.
- **Portability requirement:** the architecture must be able to host the predecessor's
  plugin classes without rebuild — content-only contracts, API-only tools, full apps,
  and heavy chrome capabilities (barcode scan with camera + lazy decoder). Porting
  them all is NOT a v1 goal; being *able* to is.
- **Page-authoring contract, shared across plugins.** Five ported plugins each
  invented their own frontmatter independently before this was written down —
  `type`, `title` and `ico` had no stated rule beyond "what todo happened to
  do first". The `page-author` core skill now names three legitimate ways a
  plugin finds its own pages (`type:` dispatch, a reserved workspace folder,
  a sibling asset found by convention), and manifests can declare the `type`
  values their own code dispatches on (`types: [...]`) so discovery catches a
  collision at boot instead of a page silently misread by the wrong plugin.
  `title`/`ico` stay documented rather than schema'd: the core reads `title`
  mechanically, `ico` is convention only, and forcing either into a schema
  would fix a vocabulary this system deliberately leaves open. Scheduled notes
  got the same treatment as `schedule-author`, having shipped with no
  authoring contract at all despite executing their body as a prompt.

## v1 scope (decided)

Chat (streamed, multi-conversation, per-user) meeting the parity bar above; content
engine + block editor; runtime plugin/skin loading with schema-first contracts;
authoring skills; ~~interactive permissions~~ (shipped in v1, removed 2026-08-26 — see the decision log); **driver auth arming/refresh UI**;
**usage & quota UI** (per driver capability); **model switching** (capability-gated
listing); the **live turn counter** as a capability-gated bonus; **planif** (scheduled agent turns from
notes); **inbound MCP** (`ask_<agent>` async jobs); **attachments**; auth modes
`none` / `oidc` / `proxy`; responsive PWA.

Non-goals v1: desktop app, per-user CLI credentials, real-time collaborative editing
(single-writer-per-page with conflict surfacing is enough), Helm chart in the product
(deployer's own charts), static bearer auth, porting every predecessor plugin.

## Instructions & workspace (decided)

The predecessor's "cockpit" pattern — a git repo mounted as the agent's workspace,
carrying instructions, guard hooks and planif notes, co-edited by human and agent —
resolves in Adestia as follows:

- **Workspace convention + scaffold.** `adestia init` generates a documented layout;
  every path is repointable in config. The convention covers the **Adestia-owned
  zones** (pages, memory, planif, data); the instruction zone follows the chosen
  CLI's own conventions, scaffolded per driver. Three natures of content are explicit in the
  model because they have different lifecycles: **identity/persona** (one shared
  source of truth, referenced not copied), **instructions** (versioned, two
  authors), **memory** (single writer, no sync — snapshots are the net).
- **Two axes decide what a workspace file is, and conflating them is the
  mistake to avoid.** WHAT IT DOES: prose is a document — a bad one produces
  bad work, which is recoverable — while a permission list, a hook or MCP
  wiring decides what the agent is ABLE to do. WHO WROTE IT: the core delivers
  plugin contracts into the very same folders and rewrites them at every start,
  so a file's owner is not derivable from its location. Ownership is read from
  a `MANAGED_MARKER` the core stamps on what it delivers; that marker already
  made withdrawal safe and now also decides what may be edited.
- **Two zones, not a ladder of levels.** The driver declares
  `instructionPaths()` (prose it reads) and `authorityPaths()` (files that
  decide its authority), the way it already declares `skillsPath()`; the
  product hardcodes neither, because the two CLIs keep the same natures under
  different names and their zones overlap without matching. Prose that a PERSON
  wrote is listed and editable from the interface — delivered files are
  excluded, since offering to edit one would offer an edit that disappears at
  the next restart. Authority is refused a write from a turn without a human
  saying so. A configurable three-level taxonomy was deliberately dropped: a
  flat refusal is understood and testable, and the level in between can be
  added the day somebody actually wants to edit a hook from a browser.
- **The gate is enforcement, not instruction.** A rule that asks the model to
  seek confirmation lives in the prompt and can be argued out of it, including
  by a page the agent reads mid-turn. The authority rule is a content rule on
  proposed file edits, consulted BEFORE `autoAllow` — which is what lets an
  instance trust its file tools everywhere else and still stop here. Unattended,
  the existing policy answers deny.
- **⚠️ Its one hole, stated wherever somebody might widen it.** The gate
  inspects FILE EDITS. A shell command rewriting the same file is not one, so
  it follows the name-based policy alone: auto-allowing a shell tool reopens
  what this closes and no content rule can shut it again. The real wall there
  is an agent running as another user against a store it cannot reach — a
  feature in its own right, never obtained sideways.
- **Instructions are saved byte for byte**, in plain text, never through the
  page grammar. Pages go through a closed vocabulary with a validator because
  this product renders them; an instruction is read by a CLI, and its
  frontmatter, fences and whitespace mean things the product does not own.
- **One content exception stays gated by CONTENT rather than by path** — see
  below. Git/IDE editing remains fully supported alongside.
- **One exception, gated by CONTENT rather than by path: a mission ticking its
  own `done:`.** A scheduled note carrying `until:` must be able to end itself,
  and the honest way to grant that is not a rule about a tool's name — it is a
  rule about the resulting file. The permission layer replays the proposed edit
  against what is on disk and allows it only when the sole difference is a
  date-valued `done` line in the frontmatter; the body, which IS the prompt,
  must be byte-identical, and everything else in the zone still requires a
  human (so, unattended, is denied). This keeps the model's influence over its
  own instructions down to one enum-sized bit about itself, and gives the write
  gate a grammar to check instead of a convention to trust. The deliberate
  alternative — the turn declaring a verdict in prose for the product to parse
  — was refused: it needs the same parsing with none of the structure, and
  would have made the note's state something other than the note.
- **Git is optional and first-class, both modes from v1.** Without git: plain
  files, everything works. With git: every UI or agent edit is committed cleanly
  (explicit paths only — never `add -A` —, meaningful messages), so "who changed
  what, under which rules was the agent running" stays a `git log` away. Remote
  sync (pull-rebase with conflicts *surfaced, never guessed*, per-host credential
  helpers, hard refusal of non-git mounts becoming tracked) is a later optional
  module, not v1.
- **Enforcement lives in the product layer first.** Harness-specific guard
  mechanisms (Claude hooks) do not port (Copilot only has allow/deny tool flags),
  so no security posture may rely on them alone: interactive permissions are
  driver events surfaced by Adestia, the execution channel is env set by Adestia at
  the single spawn site, and a CLI-native guard is a declared *reinforcement*, its
  coverage stated per driver — never the wall itself.
- **Generated layer vs workspace layer.** Plugin agent-contracts ship with the code
  that reads them (zero drift) and sit UNDER workspace instructions with a defined
  precedence: the product provides the generic, the workspace owns the specific.

## Spikes (validation record)

1. **Editor round-trip — DONE, verdict Milkdown** (`spikes/editor/VERDICT.md`):
   Milkdown and Tiptap both round-tripped byte-identical with typed blocks as
   first-class nodes; BlockNote eliminated (its md import has no extension
   hook). Milkdown wins on the one-grammar criterion — its transformer is the
   same remark/micromark pipeline as the renderer.
2. **Runtime ESM plugin views — DONE, proven** (`spikes/esm-runtime/REPORT.md`):
   16/16 assertions in real Chrome — import-map-shared single React instance,
   manifest-listed CSS, lazy 450 kB chunk, strict-MIME and CORS negative
   proofs. The import map is a versioned, published contract;
   `react/jsx-runtime` is mapped from day one.
3. **Copilot CLI hands-on — DONE** (`spikes/copilot-cli/REPORT.md`): binary
   1.0.80 pinned, JSONL schema captured via BYOK mock, three auth error
   states, usage taps, static model catalog, `--acp` discovered. Remaining
   items require an authenticated session (report §9).
4. **Subscription concurrency — DONE** (`spikes/concurrency/REPORT.md`):
   27 real turns, bursts of 1–8. Turns genuinely overlap (78% parallel
   efficiency at 8), zero failures and zero rate-limit warnings; TTFT pays a
   one-time ~+1.3 s step at any concurrency then plateaus; parallel turns
   share the prompt cache perfectly, while switching models re-pays it. The
   binding constraint is ~300 MB of RSS per CLI process — `maxConcurrentTurns:
   3` is confirmed as memory-bound, and 8 is verified safe API-side.

## What is built, and what is not

**Built and verified end to end** (in a browser and against real CLIs, not only
in tests): streamed chat with tool trace and live token counter; the permission
posture (`open` / `ask`, the engine judging and the chat asking — decision log,
2026-08-26); conversations per user, replayed faithfully; pages edited by both
the agent and a Notion-like editor over one shared grammar; runtime plugin
loading from a mounted folder with a shared React through an import map;
`claude-code` and `copilot-cli` drivers behind the capability contract;
credential arming from the interface; auth in all three modes; authoring
skills the agent uses to write conformant plugins; scheduled turns; skins;
chat attachments; inbound MCP for agent-to-agent delegation; container image
and CI.

Since then: the trips app; a model selector in the composer; outbound MCP
wired end to end with OAuth-authenticating servers and health reporting; the
authority gate; the instruction zone, readable and correctable without an
IDE; the workspace's non-markdown files — served, resolvable from a page,
and shown under it as attachments; and the screen context the parity audit
had missed. And the install: a served manifest a skin renames and recolours, an
`apple-touch-icon` beside the icons it declares, and a network-first service
worker — so an instance is an app on a home screen, under its own body's name,
that opens to its own words when the network is gone.

**Not built yet**, and none of it blocked by a design question:

- **The `ask` posture, finished.** It ships and it works, and it is OUT of the
  MVP after a day on a real instance (2026-08-26): half-working on one engine,
  absent on the other. Where it breaks is a granularity the ENGINE owns and
  Adestia deliberately does not second-guess — for `Bash` the CLI proposes a
  rule on the EXACT command (`Bash(ls -la /tmp)`), so every variation asks
  again, and for a composed one (`cd x && cat <<EOF`, any heredoc) it proposes
  nothing at all: its own parser will not cut the command up, so there is no
  durable answer to offer. `WebFetch` is the counter-example that shows the
  shape is right — `WebFetch(domain:…)` is exactly the rule a person wants.
  The fix is known and is not more Adestia judgement: let the PERSON edit the
  rule in the prompt (the engine proposes `Bash(ls -la /tmp)`, they write
  `Bash(ls:*)` or `Bash`), which also turns the no-suggestion dead end into
  something answerable. On copilot-cli the posture cannot exist at all —
  no return channel in programmatic mode — so it refuses to boot there.
  Instances run `open` until that is done.

- **Remote instruction sync** (the optional git module).
- **Usage, cost and quota surfaces.** The drivers declare `usageMetrics`,
  `cost`, `subscriptionQuotas`; only the live token counter reaches a screen.
  A capability declared and never consumed is the failure mode to watch for
  here — it looks finished from the code and shows nothing to a user.
- **The per-user rebound** for user-scoped MCP addons, and the `oidc` auth mode
  it depends on (see MCP configuration).
- **User-editable authority.** The gate refuses writes from a turn, which is
  the right default and not the final answer: somebody with only a browser
  cannot change a permission at all. The sketch is dedicated screens backed by
  `dataDir` rather than the config file — a deployment's config may be
  GitOps-managed and would be reverted — with a precedence to settle: is the
  config a floor a person may raise, or a ceiling they cannot exceed?
- **`adestia init`** — the documented workspace scaffold.

## Decision log

**2026-08-31 (a result belongs to a CALL, not to a name):** the transcript
promised the tool trace back on reload, and gave it back with every call drawn
as still running — for months, in every thread. Three things had to line up.
The Claude Code driver read a tool's name off the `tool_result` block, which
carries none (only `tool_use_id`), so it reported the literal "tool"; the
server and the shell then looked for a pending call by NAME and found nothing;
and the driver's own test fed a fixture with a `name` field the SDK never
sends, so the suite agreed with the bug. Results now travel with the engine's
id, and both consumers match on it — the name stays as a fallback for a driver
that has none, and is the fallback ONLY: two calls of the same tool overlap
routinely, and "the most recent unresolved one" marks the wrong row about as
often as the right one. What this cost is worth writing down: nothing was red
and nothing was green, so the interface looked calm while telling the operator
nothing, and the JSONL kept no record of which tool call had failed — the one
question a transcript exists to answer.

**2026-08-26 (the permission layer was a doorbell sold as a wall — removed):**
interactive permissions were a v1 pillar: a broker gating every tool call
behind a human, content rules guarding the driver's authority paths and the
planif zone, an unattended policy, a prompt in the chat. All of it is gone,
and the reasoning deserves recording because every piece was individually
sound. The layer ran in Adestia's process but enforced nothing: agent and
server share one OS user, so every rule had a one-line bypass (`sed -i` for
the file gates, a raw socket for any network rule, an env dump for the
token) — and worse, LEGITIMATE work crossed it invisibly too: a granted
Bash running a Python script that fetches the network never came back to
the broker, so the layer mismeasured normal behavior, taxing the attended
user with prompts while constraining nobody else. Each hole invited one
more mechanism (pattern grammars, egress proxies) — the security-theater
ratchet, recognized and stopped. What replaces it is walls that are walls
and conventions that admit to being conventions: the CONTAINER bounds what
exists (mounts, env, network — Docker's job, not Adestia code); MCP SERVERS
carry their own authorization at the point where an act lands (the home
automation server knows what "unlock" means; Adestia cannot); and the
person's INSTRUCTIONS tell the agent what to check in chat before acting —
followed in good faith, bypassed by anything that isn't, and honest about
that. The driver now runs `bypassPermissions` explicitly — removing the
prompt surface WITHOUT it would auto-deny instead of auto-allow. The real
security features, if ever needed, are named: the CLI under a second UID
against a store it cannot reach, and blast-radius economics (a revocable
token, a committed workspace — which makes workspace auto-commit the next
safety investment, not more rules). A leftover `permissions:` config block
is tolerated and ignored.

**2026-08-26 (asking came back as a posture, with the engine as the judge):**
the removal above was right about the WALL and wrong to leave nothing: running
wide open felt, in the owner's words, like replacing a rickety wooden gate with
an open invitation. So `permissions.mode: open | ask` — optional, `open` by
default, and roll-back is a one-line config change rather than a revert. What
makes `ask` different from what was torn out: **Adestia judges nothing.** No tool
lists, no patterns, no content gates. In `ask` the driver runs the SDK's
`default` mode, so the CLI's own first line settles the harmless (a `Read`, an
`echo` never come back — measured) and only its residue reaches the chat, worded
by the engine itself (`title`, `decisionReason` — no more consent to a string
truncated at 78 characters). The third answer is **"always"**, and it returns the
engine's OWN `suggestions` untouched: the CLI writes the rule into its own file
in the workspace (`.claude/settings.local.json`) and reads it back on every
later turn — a different thread, a different day, a restarted pod. So the
durable allowlist is the ENGINE's, in a file a person can open, read and edit,
and Adestia maintains no list at all. That file is also the honest answer to
"what is my agent allowed to do", which is the question that started this whole
line of work.

Getting there took one wrong turn worth recording. Driving the real CLI showed
the suggestions carry `destination: 'localSettings'` — permanent — while the
button then read "for this conversation", so the first fix pinned them to
`destination: 'session'` to make the label true. That was fixing the wrong
half: session rules die with the turn's process (every turn is a fresh CLI), so
the promise silently became "for this turn" and the answer had to be given
again at the very next message. Carrying it in the server per conversation made
it work and made Adestia the keeper of a permission list again, by accident,
having just removed one. The honest fix was the LABEL: say "always", let the
engine persist it where it already wanted to, keep nothing here. The SDK's `'auto'` classifier
mode was TESTED and rejected for this: it approved a `rm -rf` without ever
calling back, so embedded it is a bypass wearing a gate's name. Copilot cannot
be asked at all in programmatic mode (no return channel; it auto-denies), so
`ask` on it REFUSES TO BOOT rather than degrading every question into a silent
refusal — which is what the new `interactivePermissions` capability declares.
Unattended turns (planif, delegation) refuse immediately instead of holding a
slot for five minutes. And the old prompt's real bug is fixed with a test on
it: the question now disappears the instant it is answered, optimistically,
because the turn is blocked on that answer and no event will arrive to clear
it. If `ask` proves unlivable, the fallback is `open` and the next real
security work is the one this document already names — the CLI under a second
UID against a store it cannot reach.

**2026-08-26 (a livery is what an install is called):** the manifest is
GENERATED — the product's, with the active skin's `web.manifest` merged over
it — rather than shipped as a file. Two instances are two origins, so they were
never one install; but they were two icons both called "Adestia" on the same home
screen, which is the same problem one layer up. The merge is a NAME-and-COLOUR
allowlist: `start_url`, `scope`, `id` and `display` stay the product's, because
a livery that could move the entry point changes what the app is — the line
`skin.css` already may not cross. Icons are refused there and taken by
convention instead (`assets/icon-192.png`, beside the `icon.svg` a skin already
ships): the manifest is served from the ROOT while a skin's files live under
`/skin/`, so a relative `src` in a fragment resolves against the wrong folder
— silently, and visibly wrong only once somebody has installed it.

Three facts decided the shape, and each one inverts the result if it is false.
**iOS ignores manifest icons** and reads `apple-touch-icon`: a PNG, opaque,
180×180 — so the vector alone would have installed a blank tile on the platform
most likely to install it. **The manifest and the worker are fetched by the
BROWSER, not the page**, so behind the OIDC gate they answer 401 and the offer
to install never appears at all; both, and the icons, are now in the explicit
public set beside `/api/health`. And **a cache-first shell is how a PWA serves
last week's bundle against this week's API**, with no user gesture that fixes
it: the document and everything whose name outlives its content are
network-first, and only content-addressed `/assets/*` chunks answer from the
cache — they cannot change meaning without changing name. `/api/` is not
intercepted at all: an SSE turn is a body that never ends.

A livery settles two instances wearing two liveries and settles nothing for two
wearing the same one — which is the case an operator running a second Adestia
actually hits. So `name:` was added to the config, applied LAST, over the
skin's. It is a file setting with no environment override, on the line this
product already draws: the environment says where an instance runs, the file
says what it is. It reaches the shell as well as the manifest, because iOS
proposes the DOCUMENT TITLE when somebody adds a page to their home screen — a
name that stopped at the manifest would be ignored on the platform it was most
wanted for. The header BRAND stays the skin's either way: what the OS calls
this window and what the body calls itself are two different sentences.

**2026-08-26 (a livery is a look, not a navigation):** the `home` slot handed
a skin the WHOLE landing canvas. Both liveries that took it rebuilt a tile
mosaic out of `/api/instance` — which carries plugins and nothing else — so an
instance wearing one silently lost its sections, the agent's brief, the counts
a plugin puts on its own tile (unreachable from a skin: they come from the
plugin's view, not from the API), the arrange mode, and, until somebody
noticed, settings. Not a bug in either skin: an extension point cut in the
wrong place, and one whose cost compounds — every future improvement to the
landing is automatically absent from two instances out of three.

*Taken: `hero`.* The livery draws the head — the greeting, the mascot, the way
in, which is all either of them ever wanted — and the shell keeps everything
below it. `home` is off-contract now rather than deprecated: the loader already
names ignored fields in the problems band, so a third-party livery degrades to
the shell's landing WITH a stated reason, which beats a second way of doing one
thing forever.

Which forces the other half, because "the shell keeps the mosaic" is only
acceptable if a livery can still make the mosaic look like itself. That is
paid in TOKENS, never in a rule against `.adestia-tile` — the moment a skin can
move a box, the personalities stop being one product. The tile's colour mark
became four knobs (`--tile-mark-inset/-width/-height/-tint`, and a hover that
always restores it to full) and its name two (`--tile-label-font/-track`), so
the HUD's left-edge bar and fixed-pitch label are a token declaration. The
skin sheet that stated the doctrine best — *"if a look is not reachable
through a token, the contract gets extended, not this sheet"* — is the one
that needed it.

**2026-08-26 (settings is a domain, not an accessory of the screen you were
on):** the gear opened a dialog. A dialog is 460px wide, it floats over
whatever you were reading, and everything it holds has to be small enough to
be held that way — which is why the instruction zone was a DOOR out of it
rather than a page in it, and why the MCP readout had spent a version buried
under a scroll. The row-per-subject shape fixed the finding; it did not fix
the surface.

*Taken: settings is an app of the shell.* Its own tile on the landing canvas,
its own address (`#/settings`, one per page under it), a place in the
breadcrumb, and the whole canvas to say itself in. Which is what the shape was
waiting for: Instructions became a page like the rest, because there is no box
left to leave, and Appearance became a row that SAYS which theme is in force
where the header's cycling glyph could only be inferred. The gear stays in the
header as a shortcut to the same address — arming a credential is what
somebody does when something has just stopped working, and that is not the
moment to hunt for a tile.

Two consequences worth stating. The shell's tile is pinned last rather than
dragged with the others: it is furniture, not one of the apps this workspace
was given, and a tile in the same place on every instance is one nobody has to
look for. And `#/instructions` — the address the instruction zone had when
prose could not be edited in a dialog — hands over to `#/settings/instructions`
rather than surviving as a second name for one screen. A bookmark does not
stop being one because we moved a screen.

The shell's modal went with it: nothing rendered it any more, and a component
kept warm for a dialog nobody has asked for yet is a lie about what this
product does. Plugins draw their own; git keeps ours.

**2026-08-25 (the editor is a capability, not a screen):** `journal` — a
history read on one page, one entry at a time in edit mode — asked a question
the extension system had not been asked before: how does a plugin edit a page
inside its OWN screen? Two answers were refused before the third.

*Refused: a plugin's own editor.* A textarea, or a vendored ProseMirror. Both
put a second author of markdown in the product, and the closed vocabulary
holds because there is exactly one writing path.

*Refused: publishing the content engine through the import map.* The map is
parsed before the first module resolution and exists for THIRD-PARTY
dependencies; the shell's own capabilities travel through the injected `api`,
because a plugin importing the shell would be a cycle and would pin it to a
build it cannot see. That rationale was already written at the top of the
plugin contract — the map was the wrong door.

*Taken: `api.PageEditor`.* The shell hands its own editor over as a component,
lazily mounting Milkdown exactly as `#/page/…` does. It cost a wrapper and one
field, because `Editor` was ALREADY per-instance: reading posture by default,
its own `editing` state, its own revision, its own diagnostics. Rendering one
per item is the entire "edit only this section" feature — no new grammar, and
no plugin holding its own idea of what a save means. Two positions inside it:
the attachment strip is OFF by default when embedded (furniture, plus a
request per item), and file drop is not wired at all — a plugin's layout is
not the page screen.

Which settles the storage question a journal poses, and it is not a
preference: **one markdown file per entry, never one file holding a history.**
The page API saves whole files under an optimistic revision, so a single file
would collide the agent's appended entry with whatever a person is editing,
every time; the agent adds entries with its own file tools, where a new file
cannot damage a history and a rewrite can; and `GET /api/pages/index` makes
each entry's `date` queryable, which entries buried in one document are not. A
journal is therefore a FOLDER, its cover the folder's index page
(`type: journal`), its entries the pages inside it (`type: entree`). The known
cost is stated rather than hidden: the index re-reads every markdown file on
every call, so a few hundred entries weigh on it — the same bill `todo`
already pays with one page per task.

**2026-08-25 (the screen next to the chat):** a predecessor feature the parity
audit had missed, found by the owner rather than by the review — agent-gw
joined the open page's route and breadcrumb to every message, and Adestia sent
nothing. Ported with its three boundaries intact (route and trail only, hint
not topic, snapshot at send time), and with one improvement the predecessor
needed a stripper for: the note is applied where the driver is called rather
than in the browser, so the thread stores the raw prompt and a reload has
nothing to hide. Hostile input is treated as such — a hash is steerable by any
link somebody is talked into clicking, so route and title arrive flattened to
one printable line and capped, and a newline in a route cannot forge a line of
framing.

**2026-08-25 (what a page's life is worth, and what it carries):** two gaps
the predecessor did not have, found by comparing screen for screen.

*Archiving became core knowledge rather than per-view knowledge.* The status
vocabulary — which words mean a page is over, and the `acheté`-only-archives-a-
purchase exception — moved from the web shell into `@antorfr/adestia-content`,
and `GET /api/pages/index` now publishes `finished` for every page. The reason
is the failure mode, not tidiness: a plugin may import nothing but React, so
each one that wanted to archive had to transcribe the table, and `voyages`
already carries its own copy. The predecessor lived that drift — one screen
archived what the next still showed as live. `collections` consumes the
published verdict and folds finished pages into an `🗄 Archive` section
(counts split live/archived, the fold closed like the section screen's own,
nothing ever dropped). Left deliberately alone: `todo` and `planif` close on `done:`,
which is a different regime with its own contract, and `voyages` judges the
status inside `voyage.json` — not a page, so the index cannot answer for it.

*Dropping a file on a page files it — through the agent.* The gesture people
expect, with the writing left where it belongs: the file goes up to the chat's
inbox (outside the workspace, the route that already existed), and the composer
is pre-filled with "range ces pièces jointes avec la fiche X (path)". Composed
and NOT sent, the same position the scanner takes: the drop says what, the
person says what it means — "renomme-la avant.jpg" is a thought you have while
the file is under the cursor. Deliberately not built: a `POST` that writes
straight into a page's folder. It would make the shell a general-purpose file
writer behind a session cookie and skip the one step worth keeping, somebody
deciding this file belongs in the workspace at all. Revisit when the friction
of one agent turn is measured rather than assumed.

Found while wiring it: the composer had **no drop handler at all** — picker and
paste only — though the parity bar above claims "picker+paste+drag-drop". So a
file let go on the chat made the browser leave the conversation to display it.
Fixed with the same primitive, so the two surfaces cannot disagree about what a
file drag is.

*Workspace files are served.* `GET /api/files` says what is there (`?page=`
answers "what does this page carry", `?under=` walks a folder) and
`/api/files/<path>` hands over the bytes. A page's attachments are the
non-markdown files in its own folder plus its `assets/` — the layout is the
pairing, no frontmatter to keep in step — and the reader now resolves relative
links against the page's folder, so `![Avant](assets/avant.jpg)` finally draws
and `[le devis](devis.pdf)` finally opens. What a page does not already show
appears under it as an attachment strip.

Two positions inside that: **read-only**, because a file writer behind a
session cookie is a categorically more dangerous thing than a page editor, and
files reach the workspace through the chat inbox where the agent decides they
belong there; and **inline only for inert media**, since these bytes are
same-origin with the session — an SVG or an HTML file rendered in place would
run its script as the signed-in user, so everything outside a short whitelist
is `application/octet-stream` with an attachment disposition, `nosniff`, and a
CSP that permits nothing. `voyages` keeps its own `/doc` route: it is bounded
to one trip's folder and already forces a download, so replacing it would be
churn rather than a fix.

**2026-08-20 (founding):** product-first (no parity constraint with agent-gw; the
author's pods migrate later). Shared-agent multi-user with OIDC plus a zero-auth
local single-user mode. Files as source of truth. Engines: Claude Code + GitHub
Copilot CLI behind an internal driver interface. TypeScript/Node + Fastify; React +
Vite. Runtime plugin and skin loading from mounted directories. Auth:
none/oidc/proxy. Docker+compose and npx as deployment targets. Name **Adestia**,
public repo from the start (npm scope needed — `adestia` is taken).

**2026-08-20 (second pass):** v1 additions — driver `authManagement` (arm/refresh
from the UI) and `usageMetrics` as declared capabilities; chat parity bar + six
exceed items (streaming first); adjustable split view; mobile/PWA; scan-class plugin
portability; schema-first extension contracts with `plugin-author`/`skin-author`
skills shipped in v1.

**2026-08-20 (instructions):** workspace convention with `adestia init` scaffold,
paths repointable; instructions live as workspace markdown files, editable in the
UI under risk-zoned gating (channel-gated agent self-edits, scheduled turns
excluded); git optional but first-class — bare-files and git-backed workspaces are
BOTH supported from v1 (clean per-path commits when git is present); remote sync
deferred to an optional module.

**2026-08-20 (instruction dialect):** one driver per workspace lifetime; user
instructions stay in the CLI's native dialect, agent-authored — Adestia neither
normalizes nor translates them, and the UI is structure-agnostic (risk zoning by
driver-declared path classification). Driver switch = assisted migration (the new
agent translates). Only plugin agent-contracts are harness-neutral, compiled per
driver.

**2026-08-20 (late additions):** model switching joins v1 as the `modelSelection`
capability (enumeration where the CLI provides it, config-declared list otherwise,
never a product-hardcoded catalog); the live climbing token counter on the busy
bubble joins as a capability-gated bonus (`liveTurnUsage`).

**2026-08-20 (editor verdict + tests):** Milkdown chosen (spike 1) — remark
grammar shared with the renderer, byte-identical round-trip; Tiptap kept as
proven fallback behind Adestia's editor interface; BlockNote eliminated. Unit
tests from the skeleton's first package; spike harnesses promoted to permanent
conformance suites. Spike-3 corrections folded into the copilot driver section
(`ghp_` loudly rejected; auto-update pinning; usage taps; `--acp` to evaluate).

**2026-08-20 (MCP config):** outbound MCP = three layers (operator config with
secret interpolation, plugin-declared servers, workspace-native config left
untouched), materialized per driver at spawn; conflicts loud, operator wins over
plugin; MCP tools wired end to end; `mcpStatus` and per-user token
pass-through (oidc) as capability/hook, not promises.

**2026-08-21 (page-authoring contract):** audited every shipped plugin's data
model and found four independently-invented frontmatter conventions and one
core capability (scheduled notes) with no authoring skill at all. Resolved as
a new core skill, `page-author` — `title` mechanical (core reads it, never the
first heading), `type` a shared namespace a manifest now declares its claim on
(`types: [...]`, checked for collisions at boot, mirroring the existing
unmatched-activation diagnostic), `ico` documented as convention rather than
schema'd. Named, rather than newly invented: the three dispatch patterns
already in use (`type` query, reserved folder, sibling asset by convention)
each stay the right tool for a different shape of data — no attempt to
collapse them into one mechanism. `schedule-author` gives `planif`'s notes the
same treatment. Left open, deliberately not implemented under this decision:
the `:::app` block parses, validates and round-trips but does not render a
mounted plugin view — making it live is a rendering-architecture decision
(interactivity, recursion, the security boundary of a plugin's component
mounting inside another page) for a person to make, not something to wire
silently while documenting the vocabulary around it.

**2026-08-27/29 (page identity and typed references):** a curated todo list
resolves its members with `list.refs.map((ref) => tasks[ref]).filter(Boolean)`,
and the comment above it says a missing task is *dropped rather than shown as a
broken row*. Since a ref is a path (`refs: [taches/poncer-porte]`), moving a
file silently shortens the list — and the same flaw sits under `projet:`, `sub:`
and every prose link. Resolved as three layers, none of which knows the word
"task", because the thing pointed at is a REFERENCEABLE PAGE and nothing
narrower.

*Identity.* Every page carries `id:` — an opaque string unique **within its
type**, a ULID by default (48 bits of clock in Crockford base32 + 80 bits of
randomness; measured: two writers minting 50 000 each in the same millisecond
collide zero times, and the clock is UTC by construction, so no timezone has to
be imposed). A page may declare its own id instead, because a project in a
company already has one in some referential — so the ULID is the MINTING
POLICY, not the definition of identity. The core never overwrites a declared id;
an id may not contain `/`, `#`, `:` or whitespace (the reference separators);
two pages claiming the same `type/id` are named at boot, exactly like a
block-name collision between two plugins.

*Reference.* One canonical string, `<type>/<slug>#<id>`, in both containers: a
flat YAML scalar in frontmatter (`parseFrontmatter` deliberately does not walk
nested structures — *"a query language over deep structures is a database"*),
and the EXISTING wikilink in prose, `[[task/poncer-porte#01M11K…:Poncer la
porte]]`. Measured against the real pipeline: the target carries `#` through
untouched and all three forms round-trip byte-identical, while
`[[task:01M11K…]]` silently resolves to a page named "task" with the id as its
label — `aliasDivider` defaults to `:` and this repo passes no options. Hence
the slash. Resolution has four rungs and none is silent: exact `type/id`; then
id alone across types (resolve when unique, and SAY so — that is what stops a
changed `type:` from breaking every pointer at once); then slug, so references
already written keep working; then a reference shown as LOST, which is the fix
worth making on its own.

*Rendering.* `status.ts` already answers for any page — `toneOf()` sorts every
status into underway/waiting/settled, `isFinished()` says whether its life is
over — so the generic chip is title + tone + status word, and it works for a
walk, a gift, or a type nobody has invented yet. A plugin enriches that chip for
the `types` it already claims, needing no new registry. An unknown reference
type does NOT open the page read-only, unlike an unknown block: a block is a
rendering contract the editor cannot round-trip, a typed wikilink is an ordinary
node that round-trips either way.

*The one prerequisite:* the reader must have the index, which it does not today.
That single addition also unlocks the query blocks a tracking plugin needs, so
it is paid once and spent several times — and it is the moment to pay the
index's own debt (`/api/pages/index` re-reads every file, sequentially, with no
cache: measured 10 ms at 200 pages, 226 ms at 5 000, where the real ceiling is
the 1.1 MB payload rather than the disk).

Rejected, each against a fact rather than a taste: an inline directive
(`:task{id=…}`) — the grammar deletes `constructs.text` on purpose, because
`19:30:59` parsed as a directive named `59` and put a page read-only for
mentioning a time; `[task:xxx]` — a CommonMark shortcut reference link, so a
squatted construct plus one more editor node, and this file already carries the
scar of a node the editor did not know; an incremental id — a counter is shared
mutable state, the one thing files do badly; a database — the numbers above say
storage is not the problem, and the trigger to reopen is written down (past
5 000 pages, or queries frontmatter cannot carry); and a proxy over the agent's
`Write` — the hook exists (`canUseTool`) but lives only in the `ask` posture,
which is out of the MVP, copilot-cli has no return channel for it, `Bash` and
its `cat >` route around it anyway, and rewriting an agent's write without
telling it is a door that lies. What survives from that last one: once `ask`
ships, `canUseTool` is the right place to REFUSE LOUDLY a write that fails the
closed vocabulary — a validator, never a proxy.

Decided by the owner rather than derived: no sealing pass over the existing
corpus — a page without an id is not at fault, it is *not yet linkable*, and it
stops being so the moment someone links it (a background unattended turn asks
the agent, which applies the instance's own id policy when it has one, the ULID
otherwise). The same turn repairs the reference it has just written, since the
mint is asynchronous and the reference leaves before the id exists. And no
vocabulary migration: French type names are a leftover, not a breakage — what
matters is that ONE MEANING HAS ONE WORD across an instance, which the index can
check by confronting the types pages write with the types plugins claim; new
types are named in English, a rule in `plugin-author` rather than a traversal of
the corpus. Which is the doctrine this codebase already followed in three places
without ever stating it — `done: true` still read, `statut` read as `status`,
the predecessor's `{% %}` tags parsed: **the engine accepts history, the skill
teaches the canon.**

**2026-08-30 (shell tools — the agent acts on its own instance):** argued
across four sessions, and the argument is the asset: the design reversed
itself three times before every piece carried a requirement. The need was
small (rename a conversation whose title is the first 48 characters of its
first message); the shape is a doctrine — see "Shell tools" above. What the
detours settled, in order: a token-addressed handle beats teaching the agent
any id (the session↔conversation mapping is fragile and the model never needs
it); a write-only "signal" in the output stream beats nothing but cannot
ANSWER, and the owner's requirement — the agent must be able to say "it
failed, here is why" in the same breath — makes request/response
non-negotiable; MCP is that request/response, natively, but NOT on the app's
listener (three surfaces, never confused) — a unix socket plus a generic
bridge for external binaries, a live in-process instance where the engine
allows one. Every transport fact was executed before being relied on
(spikes/shell-tools-transport). First tools: `rename_conversation` (benign,
reversible, compacts on settle) and `new_id` (ULID, the author-mints-id rule
made canonical). The MCP-forbidden-org case is a per-instance contingency the
registry absorbs later, not a constraint the design bent for.

**2026-08-31 (the MCP-forbidden org, absorbed):** the contingency above came
due sooner than "later". An org filters the CLI's MCP servers against its own
registry, so the shell-tools server is dropped and the instance's agent loses
tools it is supposed to have. Answered where the day before said it would be —
at the transport, not in the doctrine: `driver.shellToolsTransport: shell`
swaps the stdio bridge for a small CLI on the execute tool, and the socket,
the dispatch and the per-turn token do not move (see "Shell tools" above).
Two things were deliberately NOT done. The option is not offered on
claude-code, which hosts the tools in-process and has no registry to escape —
a knob that exists everywhere teaches that it matters everywhere. And nothing
is injected into the agent's prompt to announce the CLI: the core has never
written a line of instruction prose, and starting for one escape hatch would
buy discovery at the price of the rule. The operator writes it, and the cost
is stated here rather than discovered in a turn where the agent simply never
calls a tool nobody told it about.
