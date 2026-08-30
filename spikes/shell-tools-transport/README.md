# Spike — shell-tools transport

Which transport should carry the internal shell tools (the registry an agent
uses to act on its own Adestia instance — first tool: `rename_conversation`)?
The design doctrine (three surfaces; implicit target; per-turn token) is
settled; what this spike pins down is the *transport facts* the design rests
on. Types were read first (`@anthropic-ai/claude-agent-sdk` in the repo's
`node_modules`, pinned); this spike executes what types cannot prove.

## Questions

1. **Lifecycle** — does the engine spawn the stdio MCP server fresh on every
   turn (`query()` + `resume`), so a per-turn token passed in the server's
   `env` is fresh on turn 2? If the process survives across turns, the token
   in `env` goes stale and the design must carry it another way.
2. **Bridge round-trip** — a dumb stdio↔unix-socket bridge (`bridge.mjs`) in
   front of a minimal MCP server listening on a unix socket
   (`socket-server.mjs`): does a real engine list and call its tools? What
   happens when the socket is dead (server down)?
3. **In-process** — `createSdkMcpServer()` runs tool handlers inside the
   calling process (where the Adestia server, hence the ConversationStore,
   lives). Verify the handler really executes in-process, and whether one
   server instance passed to two `query()` calls shares state across turns.

Copilot is out of scope here: its stdio MCP support is already proven end to
end by `spikes/copilot-cli` (config materialization, load, status events),
and its binary is spawned per turn by our driver, so per-turn freshness holds
by construction.

## Pieces

- `socket-server.mjs` — minimal MCP server (newline-delimited JSON-RPC) on a
  unix socket: `initialize`, `tools/list`, `tools/call`. Tools: `probe`
  (reports server pid, connection number, bridge pid + token) and `echo`.
  Stands in for the Adestia server process.
- `bridge.mjs` — the generic bridge: connects to `$ADESTIA_SOCK`, announces
  itself (`bridge/hello` with its pid and `$SPIKE_TOKEN`), then pipes
  stdin↔socket verbatim. No MCP knowledge at all.
- `run-stdio.mjs` — spawns the socket server, runs turn 1 (fresh session,
  token `turn-1`), turn 2 (`resume`, token `turn-2`), then turn 3 against a
  dead socket. Prints a JSON summary.
- `run-inprocess.mjs` — same two-turn shape against a `createSdkMcpServer`
  instance with a closure counter.

Both runners ask the model to call `probe` and answer with the tool's JSON
verbatim; the comparison of `bridgePid`/`bridgeToken` (stdio) and
`hostPid`/`callNumber` (in-process) across turns answers the questions.

## Verdicts

See `REPORT.md` (written from executed runs only).
