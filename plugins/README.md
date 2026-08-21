# Bundled plugins

Golem ships five plugins and one skin. None of them is active until you name it
in your config — discovery is not activation, and a folder sitting here costs
nothing until you ask for it.

```yaml
extensions:
  apps: [todo, planif, collections, atelier]   # tiles in the launcher
  features: [scan]                             # things that live in the shell
  tools: []                                    # agent-facing only
  skin: alfred
```

Which list a plugin belongs in is not a preference — it is the plugin's `kind`,
declared in its manifest. Name one under the wrong heading, or misspell it, and
the plugin simply never activates; the server says so at boot rather than
leaving you to wonder where the tile went.

| Plugin | Kind | What it is |
|---|---|---|
| [`todo`](todo/) | app | Tasks as pages. One base, curated lists that hold references, dynamic lists that are queries over frontmatter. Ticking a task anywhere ticks it everywhere, because there is only ever one task. |
| [`collections`](collections/) | app | Enter a body of pages by a facet rather than by folders — projects by trade, gifts by person. The grouping is declared in a page, so a new collection is a page, not a code change. |
| [`planif`](planif/) | app | What runs on its own, when, and whether the clock is ticking. Read-only by design: its buttons ask the agent rather than editing the schedule behind your back. |
| [`atelier`](atelier/) | app | The workbench. Reads a `workbook.json` a project carries in its own assets and draws the cutting diagram — sheets, bands, pieces, edges to band — plus a full-screen bench mode readable from across a workshop. |
| [`scan`](scan/) | feature | A barcode reader in the composer. Uses the browser's own `BarcodeDetector` where it exists and only downloads a decoder where it does not. |

| Skin | What it is |
|---|---|
| [`alfred`](../skins/alfred/) | Warm paper, a quiet chevron, and nothing that shouts. Light and dark, following the system. |

## Their agent contracts

A plugin that expects the agent to write a particular shape of file ships the
contract that describes it, and Golem delivers those contracts to the agent
alongside its own. `atelier` ships `workbook-json`, `todo` ships `todo`, and
`collections` ships `collections`.

This is why asking the agent for a cutting plan produces a workbook the
workbench can actually draw: the format is not folklore passed between prompts,
it is a document that travels with the plugin.

What is shared across all of them — `title`/`type`/`ico`, and the three ways a
plugin finds its own pages — lives in the core `page-author` skill instead of
being repeated in each one. Read it first; a plugin-specific skill builds on
it rather than restating it. `schedule-author` is the same idea for
`planif`'s scheduled notes.

A plugin whose own code dispatches on a frontmatter `type:` value declares the
claim in its manifest (`"types": ["tache", "liste"]`, `todo`'s own). Discovery
checks this at boot: two active plugins claiming the same word produce a line
naming both, rather than a page silently misread by whichever one ran last.

## Adding your own

Put the folder here — or anywhere you mount — and name it in the config. The
manifest schema, the facets a plugin may contribute, and the import map it can
rely on are all described by the `plugin-author` contract that ships with the
product. Ask the agent for a plugin and it reads that contract first.

Nothing here is privileged. These five are ordinary plugins that happen to live
in the repository, and they load through exactly the same path as yours.
