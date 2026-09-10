# @antorfr/adestia-drivers

The driver contract and its adapters. A driver wraps one coding-agent CLI and
declares what it can honour (`authManagement`, `usageMetrics`,
`modelSelection`, `mcpStatus`, …). The UI is generated from the capability
descriptor — no driver name ever reaches the front end.

| Driver | Engine | Notable capabilities |
|---|---|---|
| `claude-code` | Claude Code, through its TS SDK | streaming, live token counter, per-turn usage and context weight, cost, token arming over OAuth PKCE |
| `copilot-cli` | the `copilot` binary, through its JSONL output | streaming, MCP status, token arming by pasted fine-grained PAT |
| `codex-cli` | the `codex` binary, through its `app-server` JSON-RPC protocol | streaming, live token counter, real subscription windows, model enumeration, MCP status, the engine's own permission questions, arming by relayed device flow or pasted key |

## What a driver must not do

**Declare what it cannot deliver.** `checkConformance()` verifies declaration
against implementation mechanically, because a driver that claims
`usageMetrics` and lacks it produces no symptom until a user stares at an empty
panel and blames the product. The same reasoning keeps `cost` and
`liveTurnUsage` off the Copilot driver: it bills AI credits aggregated daily,
and its stream carries no running token count — declaring them would put
numbers in the UI that mean something else entirely.

**Hold its own secrets.** A driver says HOW its credential reaches the CLI —
two of them name an environment variable, and `codex-cli` names a file, because
that CLI ignores the environment and reads `auth.json` and nothing else. Either
way the core decides where the credential lives, writes it 0600, and never
sends it to a browser. A driver asking for `PATH` is refused.

The file case adds one duty: a CLI that owns its credential file may rotate it
(a ChatGPT login carries a refresh token), so the driver reads it back after
every turn and hands any change to the core. Without that, the next restart
writes a stale document over a fresh one and the instance loses its login for
no visible reason.

## What arming needs on the machine

Claude's flow needs nothing: it speaks the OAuth PKCE exchange itself
(`claude-code/oauth.ts`), so there is no CLI to drive, no pty to open and
nothing to install. It used to script `claude setup-token` through a terminal;
that reading broke on a CLI redesign, silently, and the protocol does not.

Copilot's login still needs util-linux `script` — its CLI only asks whether it
may store the token when it is on a terminal.

Codex's needs neither: it stores credentials in a file by default, so
`login --device-auth` prints its URL and code straight down a pipe. What it
does need is patience with its own process — the one that printed the code is
the one polling for the token, and killing it makes the user's approval land
nowhere, silently on both sides.

## Conformance requires a fake binary

No driver is trusted on prose. Every adapter here is exercised against a
scripted stand-in — a fake SDK for Claude, a fake process for Copilot, a fake
app-server for Codex — with no account, no network and no CLI installed. Spike 3
established this is enough:
the whole Copilot JSONL path was captured from the real 1.0.80 binary pointed
at a local mock provider, with zero GitHub credentials
(`spikes/copilot-cli/REPORT.md`), and spike 5 did the same for Codex
(`spikes/codex-cli/REPORT.md`) — approvals, sessions and MCP wiring included.

A driver whose auth path is untested is a driver whose auth path is tested by
its first user, at the worst possible moment.
