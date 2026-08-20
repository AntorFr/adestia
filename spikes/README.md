# Spikes — validation before freezing

Prototypes that de-risk the architecture BEFORE `schemaVersion: 1` is frozen
(see DESIGN.md → Open spikes). Each spike is self-contained (local
`node_modules`, never global installs) and ends with a `REPORT.md` stating what
was proven, what broke, and what remains uncertain.

| Spike | Question it answers |
|---|---|
| `editor/` | Which ProseMirror-based editor round-trips our markdown losslessly (frontmatter + typed blocks included)? **The product's spine.** |
| `esm-runtime/` | Can plugin views load at runtime as ESM from a mounted folder — shared React via import map, manifest-listed CSS, lazy heavy chunks — with zero rebuild? |
| `copilot-cli/` | What does the Copilot CLI binary actually expose headlessly (flags, JSONL, models, usage)? |
| (deferred) concurrency | Parallel turns vs Claude subscription limits — runs against real quota, needs an explicit go. |
