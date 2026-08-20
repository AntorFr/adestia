# Golem

**A self-hosted web interface that pairs a chat with an AI agent and visual Apps —
built on top of coding-agent CLIs (Claude Code, GitHub Copilot CLI), so a monthly
subscription powers everything. No per-token API billing.**

One instance = one agent, one workspace, one subscription. Content lives as
markdown files that both the agent (with its native file tools) and you (in a
Notion-like block editor) can edit. Plugins and skins load at runtime from mounted
directories — no rebuild to extend an instance.

## Status

**Pre-code.** The founding design is complete — see [DESIGN.md](DESIGN.md) for the
principles, the driver contract, the extension system and every decision taken.
Current phase: validation spikes (`spikes/`) before freezing the extension schemas.

## License

[MIT](LICENSE)
