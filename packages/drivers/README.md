# @antorfr/adestia-drivers

The driver contract and its adapters. A driver wraps one coding-agent CLI and
declares what it can honour (`authManagement`, `usageMetrics`,
`modelSelection`, `mcpStatus`, …). The UI is generated from the capability
descriptor — no driver name ever reaches the front end.

| Driver | Engine | Notable capabilities |
|---|---|---|
| `claude-code` | Claude Code, through its TS SDK | streaming, live token counter, per-turn usage and context weight, cost, token arming over OAuth PKCE |
| `copilot-cli` | the `copilot` binary, through its JSONL output | streaming, MCP status, token arming by pasted fine-grained PAT |

## What a driver must not do

**Declare what it cannot deliver.** `checkConformance()` verifies declaration
against implementation mechanically, because a driver that claims
`usageMetrics` and lacks it produces no symptom until a user stares at an empty
panel and blames the product. The same reasoning keeps `cost` and
`liveTurnUsage` off the Copilot driver: it bills AI credits aggregated daily,
and its stream carries no running token count — declaring them would put
numbers in the UI that mean something else entirely.

**Hold its own secrets.** A driver says which environment variable hands its
credential to the CLI; the core decides where that credential lives, writes it
0600, and never sends it to a browser. A driver asking for `PATH` is refused.

## What arming needs on the machine

Claude's flow needs nothing: it speaks the OAuth PKCE exchange itself
(`claude-code/oauth.ts`), so there is no CLI to drive, no pty to open and
nothing to install. It used to script `claude setup-token` through a terminal;
that reading broke on a CLI redesign, silently, and the protocol does not.

Copilot's login still needs util-linux `script` — its CLI only asks whether it
may store the token when it is on a terminal.

## Conformance requires a fake binary

No driver is trusted on prose. Every adapter here is exercised against a
scripted stand-in — a fake SDK for Claude, a fake process for Copilot — with no
account, no network and no CLI installed. Spike 3 established this is enough:
the whole Copilot JSONL path was captured from the real 1.0.80 binary pointed
at a local mock provider, with zero GitHub credentials
(`spikes/copilot-cli/REPORT.md`).

A driver whose auth path is untested is a driver whose auth path is tested by
its first user, at the worst possible moment.
