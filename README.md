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

## Status

**Early, and running.** The chat streams, pages are editable by both you and the
agent, plugins load at runtime from a mounted folder, and the container image
works. Not yet done: OIDC login, the Copilot CLI driver, and the authoring
skills. See [DESIGN.md](DESIGN.md) for the principles and every decision taken,
and [.agent/status.md](.agent/status.md) for what is in flight.

## License

[MIT](LICENSE)
