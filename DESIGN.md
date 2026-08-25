# Golem — founding design

> **Status: built and running.** Decisions taken 2026-08-20/21 with the product
> owner, after a full review of the predecessor (`AntorFr/agent-pods/images/agent-gw`)
> and a six-probe analysis pass. This document records the WHY; the code records the
> WHAT, and where the two disagree the code is right and this file is a bug.
>
> Everything below is implemented unless marked **not built yet**.

## What Golem is

A self-hosted web product that pairs a **chat with an AI agent** and **Apps** — visual
modules the agent can act on and the user can see and manipulate. The agent runtime is
a **coding-agent CLI** (Claude Code, GitHub Copilot CLI, more later): Golem builds
everything on top of a CLI so that a **monthly subscription** powers the whole product,
never per-token API billing.

One instance = **one agent, one workspace, one subscription** (the deployer's).
Humans who talk to that agent share its capacity.

## Lineage

Golem is a from-scratch rewrite of `agent-gw`, which was built for one homelab and
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
3. **The CLI is a replaceable engine.** Golem defines its own **driver interface**;
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
7. **Permission requests are UI, not env vars.** The CLI's permission prompts surface
   in the chat for approval; auto-approve policies are configuration. Bypass stays
   possible for trusted local use, as an explicit choice.
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
┌────────────────────────── Golem instance ──────────────────────────┐
│  web (React SPA/PWA)                                               │
│   chat ▸ streamed turns, permission prompts, attachments,          │
│          auth-arming & quota modals (per driver capability)        │
│   apps ▸ core views + plugin views (runtime ESM, import map)       │
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
│   plugins/  skins/  golem.config.yaml                              │
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
| Server | Fastify | TS-native, fast, encapsulated plugin system that maps well to Golem's plugin host |
| Frontend | React 18+ + Vite | the block-editor ecosystem and the plugin-author audience are there |
| Block editor | **Milkdown** (ProseMirror + remark) — decided by spike 1, see `spikes/editor/VERDICT.md` | byte-identical round-trip proven; same remark grammar as the renderer (one grammar, two consumers — drift eliminated structurally); wrapped behind a Golem editor interface, Tiptap spike kept as proven fallback |
| Content pipeline | unified/remark + directives (`:::block`) + wikilinks, schema-validated at the mdast level (shared by renderer, editor and agent skill); DOMPurify in depth | ONE parser both sides — two parsers means drift; replaces Markdoc from agent-gw |
| Drivers v1 | `claude-code` (Agent SDK TS), `copilot-cli` (pinned binary, JSONL) | the two requested engines; Copilot's `--acp` (Agent Client Protocol) to evaluate as an alternative transport |
| Testing | **Unit tests from the first package** (Vitest) + spike harnesses promoted to permanent suites: content-engine round-trip conformance, driver fake-binary suites (BYOK mock provider for Copilot), plugin DOM-mount tests | tests are scaffolding laid with the foundation, not retrofitted; every markdown/editor/driver dependency bump re-runs the conformance gates |
| Packaging | Docker image + compose; `npx` for bare-metal local | the two self-hosting front doors; Helm stays in the deployer's own charts (out of the product) |
| License / repo | MIT, public from day one (github.com/AntorFr/golem), docs in English | early adopters follow from the first commit; npm scope `@antorfr` |

## Driver contract

The driver interface has a **mandatory core** and **optional capabilities**. The UI
is generated from the capability descriptor — no driver name ever reaches the front.

**Core:** session lifecycle (create/resume/expire), one streamed turn as an event
sequence (`text-delta`, `tool-use`, `permission-request`, `result`), interrupt,
`env()` → dict merged UNDER the turn's own env at the single spawn site, capability
descriptor, version/capability probing at startup (never assume a flag set).

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
  asks whether it may store the token unencrypted, which is the only form Golem
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
Copilot CLI — which incidentally also reads `CLAUDE.md`) and Golem never
normalizes or translates them: realistically nobody hand-writes instructions —
people ask the agent to, and the agent writes its own dialect. Consequently,
switching driver on an existing workspace is not a config flip but an **assisted
migration**: the author of the files is also their translator — the new agent
rewrites the instructions in its own dialect on request. `golem init` scaffolds
per driver (it lays down the files that driver's CLI actually reads). The one
harness-neutral layer is Golem's own: **plugin agent-contracts**, which the driver
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

1. **Operator layer** — the `mcp:` block of `golem.config.yaml`: stdio
   (`command`) or HTTP (`url`) servers, env with `${VAR}` secret interpolation
   resolved server-side. The product's canonical surface.
2. **Plugin layer** — a plugin manifest may declare (or ship) MCP servers as a
   facet: active plugin = server wired, inactive = nothing, same rule as plugin
   APIs.
3. **Workspace-native layer** — the CLI's own MCP config (`.mcp.json`, …) is the
   user's and the agent's business: Golem neither parses nor translates it (same
   doctrine as instructions).

**Materializing 1+2 is a core driver responsibility** (like instruction
delivery): Claude gets them programmatically at the single spawn site (no file
rewritten); Copilot gets a generated `mcp-config.json` inside the driver-owned
`COPILOT_HOME`, never colliding with user files. Name conflicts across layers are
reported loudly; the operator layer wins over plugins. MCP tools pass under
interactive permissions like any other tool. MCP server health in the UI is a
driver capability (`mcpStatus`), not a promise. Designed-in hook (not v1-blocking):
in `oidc` mode, an optional per-turn env can carry the calling user's access token
so user-scoped MCP servers act as the requester — the predecessor's per-user
pass-through pattern, generalized.

Inbound MCP (the instance exposing `ask_<agent>`) is a separate subsystem, already
in v1 scope — with no default allowed-hosts baked into the product (the
predecessor's lesson: one deployment's DNS in a public image helps nobody).

## Chat experience — the parity bar

The v1 chat must be **at least** agent-gw's PWA, which sets the bar:

- **Bubbles:** user right on accent, agent left on bordered surface, all colors via
  design tokens; sanitized markdown (agent side only); code/table overflow handling;
  dotted ephemeral bubbles; centered error bubble.
- **Tool trace ◇:** grouped under the turn, name + short target (≤78 chars, never
  the full input), opt-in per instance.
- **Activity:** busy indicator with skin hook, pulsing status dot, single send↔stop
  button, message queueing during a turn, turn adoption after reload.
- **Context pill:** live weight of the next message, thresholds relative to the
  model window, clickable (compaction/reset actions).
- **Composer:** attachments (picker+paste+drag-drop, thumbnails pre- and post-send),
  ephemeral mode, model selector, Enter/Shift+Enter, mobile fold under "+".
- **Split view:** chat rail | gutter | canvas, user-resizable and persisted.
- **Mobile/PWA:** responsive breakpoint with swipe between chat and canvas;
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
authoring skills; **interactive permissions**; **driver auth arming/refresh UI**;
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
resolves in Golem as follows:

- **Workspace convention + scaffold.** `golem init` generates a documented layout;
  every path is repointable in config. The convention covers the **Golem-owned
  zones** (pages, memory, planif, data); the instruction zone follows the chosen
  CLI's own conventions, scaffolded per driver. Three natures of content are explicit in the
  model because they have different lifecycles: **identity/persona** (one shared
  source of truth, referenced not copied), **instructions** (versioned, two
  authors), **memory** (single writer, no sync — snapshots are the net).
- **Instructions are editable in the UI, as a risk-zoned area — and the UI is
  agnostic to their structure.** Golem imposes no layout on the instruction zone:
  the view renders whatever file tree exists, the editor edits any markdown
  (people ask the agent to write instructions; they rarely write them). They are
  nonetheless an *executable security boundary* (a planif note body runs verbatim
  as a prompt), so risk zoning comes from a **driver-declared path
  classification** (e.g. hooks/settings high, planif medium, prose low) plus
  config overrides — not from a fixed schema. Sensitive levels require human
  confirmation, and the agent's self-improvement writes are gated by execution
  channel: the channel is set by the product out of the model's reach, and a
  scheduled turn can never edit instructions. Git/IDE editing remains fully
  supported alongside.
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
  driver events surfaced by Golem, the execution channel is env set by Golem at
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
in tests): streamed chat with tool trace, live token counter and interactive
permissions; conversations per user, replayed faithfully; pages edited by both
the agent and a Notion-like editor over one shared grammar; runtime plugin
loading from a mounted folder with a shared React through an import map;
`claude-code` and `copilot-cli` drivers behind the capability contract;
credential arming from the interface; auth in all three modes; authoring
skills the agent uses to write conformant plugins; scheduled turns; skins;
chat attachments; inbound MCP for agent-to-agent delegation; container image
and CI.

**Not built yet**, and none of it blocked by a design question:

- **Remote instruction sync** (the optional git module).

## Decision log

**2026-08-20 (founding):** product-first (no parity constraint with agent-gw; the
author's pods migrate later). Shared-agent multi-user with OIDC plus a zero-auth
local single-user mode. Files as source of truth. Engines: Claude Code + GitHub
Copilot CLI behind an internal driver interface. TypeScript/Node + Fastify; React +
Vite. Runtime plugin and skin loading from mounted directories. Auth:
none/oidc/proxy. Docker+compose and npx as deployment targets. Name **Golem**,
public repo from the start (npm scope needed — `golem` is taken).

**2026-08-20 (second pass):** v1 additions — driver `authManagement` (arm/refresh
from the UI) and `usageMetrics` as declared capabilities; chat parity bar + six
exceed items (streaming first); adjustable split view; mobile/PWA; scan-class plugin
portability; schema-first extension contracts with `plugin-author`/`skin-author`
skills shipped in v1.

**2026-08-20 (instructions):** workspace convention with `golem init` scaffold,
paths repointable; instructions live as workspace markdown files, editable in the
UI under risk-zoned gating (channel-gated agent self-edits, scheduled turns
excluded); git optional but first-class — bare-files and git-backed workspaces are
BOTH supported from v1 (clean per-path commits when git is present); remote sync
deferred to an optional module.

**2026-08-20 (instruction dialect):** one driver per workspace lifetime; user
instructions stay in the CLI's native dialect, agent-authored — Golem neither
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
proven fallback behind Golem's editor interface; BlockNote eliminated. Unit
tests from the skeleton's first package; spike harnesses promoted to permanent
conformance suites. Spike-3 corrections folded into the copilot driver section
(`ghp_` loudly rejected; auto-update pinning; usage taps; `--acp` to evaluate).

**2026-08-20 (MCP config):** outbound MCP = three layers (operator config with
secret interpolation, plugin-declared servers, workspace-native config left
untouched), materialized per driver at spawn; conflicts loud, operator wins over
plugin; MCP tools under interactive permissions; `mcpStatus` and per-user token
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
