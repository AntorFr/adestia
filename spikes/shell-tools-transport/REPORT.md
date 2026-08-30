# Report — shell-tools transport spike

Executed 2026-08-30 against `@anthropic-ai/claude-agent-sdk` **0.3.237** (the
repo's pinned copy in `node_modules`), model `claude-haiku-4-5-20251001`,
node v26, macOS. Five real model turns total (two in-process, three stdio).
Copilot was not re-exercised: `spikes/copilot-cli` already proves its stdio
MCP path end to end, and our driver spawns its binary per turn, so per-turn
freshness holds there by construction.

## Question 1 — lifecycle: is a stdio server's `env` fresh on every turn?

**YES — verdict clean.** Turn 1 (fresh session) and turn 2 (`resume` of the
same session) each spawned a **new bridge process** with the env given in
that turn's `mcpServers` config:

| | turn 1 | turn 2 (resumed) |
|---|---|---|
| bridge pid | 9113 | 9136 |
| `SPIKE_TOKEN` seen by bridge | `turn-1` | `turn-2` |

A per-turn token carried in the stdio server's `env` is therefore **fresh on
every turn**, including resumed ones. The token-in-env design needs no other
carrier. (Each `query()` call spawns its own CLI, which spawns its own MCP
servers — nothing survives between turns.)

## Question 2 — bridge round-trip, and the dead socket

**Works.** The 30-line pipe (`bridge.mjs`: `bridge/hello`, then
stdin↔socket verbatim) was enough for the engine to list and call tools on
the socket server on both turns; `probe` came back with the server pid, the
connection number and the bridge identity, and the model returned it
verbatim.

Two observed facts to keep:

- **More than one socket connection per turn.** The tool call of turn 1
  arrived on connection **2**, turn 2's on connection **4** — the CLI opens
  an extra connection per run (handshake/probe). The real server must treat
  connections as cheap and stateless-per-connection, exactly like
  `socket-server.mjs` does.
- **Dead socket degrades cleanly.** With the server down, the `init` event
  reports the server as `"failed"`, the turn **completes normally**
  (`is_error: false`, no crash, no hang), and the model simply reports the
  tool as unavailable. The driver's existing `mcpStatus` surface would carry
  the failure reason.

## Question 3 — `createSdkMcpServer` (in-process)

**Handlers run in the calling process.** `probe` reported `hostPid` equal to
the runner's own pid on both turns — the handler executed where the Adestia
server (and the ConversationStore) lives, no transport at all. One server
instance passed to two `query()` calls **kept its closure state across
turns** (`callNumber` 1 → 2): per-turn context must therefore be threaded
per call (closure capture at spawn time), not assumed reset.

Implication if this path is chosen for the claude-code driver: the driver
contract today hands drivers *serializable* MCP configs; an SDK instance is
not one (`McpSdkServerConfigWithInstance`, "Not serializable" per its own
docs). Copilot still needs a real transport (separate binary) — in-process
would be an asymmetric optimization, not the cross-driver answer.

## Side observation

The SDK's CLI inherited the machine user's own config: user-level MCP
servers (unrelated to this spike) connected during the runs. In production
the driver already owns env/home, and DESIGN.md documents that the CLI's own
MCP config applies on top — but a spike run on a workstation is not a clean
room, and the summaries show those extra servers in `mcp_servers`.

## What this settles for the design

- The per-turn token can ride the materialized MCP config (`env` for stdio,
  headers for HTTP) — **proven fresh per turn** on claude-code, per-turn by
  construction on copilot.
- The unix-socket + generic-bridge form (surface 3 with zero network
  exposure) is **viable as measured**, on the engine that matters most.
- The in-process form is real and even simpler for claude-code alone, at the
  price of a contract change and driver asymmetry.

The transport decision itself is NOT taken here — this report is its input.
