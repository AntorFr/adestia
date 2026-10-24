# Spikes — validation before freezing

Validation records behind the shipped architecture and extension schema version 1.
The decisions live in `DESIGN.md`; current unfinished work lives in `.agent/status.md`.
Each spike is self-contained (local
`node_modules`, never global installs) and ends with a `REPORT.md` stating what
was proven, what broke, and what remains uncertain.

| Spike | Question it answers |
|---|---|
| `editor/` | Which ProseMirror-based editor round-trips our markdown losslessly (frontmatter + typed blocks included)? **The product's spine.** |
| `esm-runtime/` | Can plugin views load at runtime as ESM from a mounted folder — shared React via import map, manifest-listed CSS, lazy heavy chunks — with zero rebuild? |
| `copilot-cli/` | What does the Copilot CLI binary actually expose headlessly (flags, JSONL, models, usage)? |
| `codex-cli/` | Same question for the OpenAI Codex CLI — and it has two surfaces: `exec --json`, and an `app-server` JSON-RPC protocol that answers every capability including the approval round trip. |
| `concurrency/` | 27 live Claude turns, bursts up to eight: memory per CLI process sets the cap (`REPORT.md`). |
| `shell-tools-transport/` | How do agent CLIs reach the shell tools over a local bridge? |
