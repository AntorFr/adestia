# Golem

**A self-hosted web interface that pairs a chat with an AI agent and visual Apps —
built on top of coding-agent CLIs (Claude Code, GitHub Copilot CLI), so a monthly
subscription powers everything. No per-token API billing.**

One instance = one agent, one workspace, one subscription. Content lives as
markdown files that both the agent (with its native file tools) and you (in a
Notion-like block editor) can edit. Plugins and skins load at runtime from mounted
directories — no rebuild to extend an instance.

## Running it

With Docker — copy the example config, then start:

```sh
cp golem.config.example.yaml golem.config.yaml
mkdir -p workspace data plugins skins
docker compose up
```

Without Docker, from a clone:

```sh
npm ci
npm run build --workspace @antorfr/golem-server
npm run build:web --workspace @antorfr/golem-web
node packages/server/bin/golem.js
```

Either way, with no config file at all Golem runs a single-user instance on
<http://127.0.0.1:8730> with no authentication. Every setting is documented in
[golem.config.example.yaml](golem.config.example.yaml).

The agent CLI is **not** bundled: which engine runs is the operator's
configuration, and its credentials come from the environment or are armed from
Golem's own interface.

## What it does today

- **Chat that streams**, with a tool trace, a live token counter, interactive
  permissions, and threads that survive a reload with everything the interface
  drew — tool calls, interruptions, context weight.
- **Pages both hands write**: markdown files with a closed vocabulary of typed
  blocks, edited in a Notion-like editor or by the agent with its own file
  tools. One grammar renders, edits and validates them, so a save cannot change
  what a page means. A save is refused if the agent wrote underneath you.
- **Extensions at runtime**: drop a plugin folder in, name it in the config,
  restart. No image rebuild. Shared React comes from the page's import map;
  the shell owns the stylesheets; a broken plugin costs its own view and says
  why.
- **Two engines** behind one contract — Claude Code and GitHub Copilot CLI.
  The interface is built from declared capabilities and never from a driver's
  name, so a second engine changed no UI code.
- **A credential armed from the interface**, held server-side at 0600 and never
  sent to a browser.
- **Three ways in**: none (local), a trusted proxy header, or any OIDC issuer.
  No local accounts, ever.
- **Contracts the agent reads**: `plugin-author` and `skin-author` ship with
  the product, so asking the agent for a plugin produces a valid one.

## Status

**Early, and running.** What is not done yet, and known: scheduled turns
(planif), inbound MCP so other agents can delegate here, chat attachments, and
the skin system beyond its schema. See [DESIGN.md](DESIGN.md) for the
principles and every decision taken, and [.agent/status.md](.agent/status.md)
for what is in flight.

## License

[MIT](LICENSE)
