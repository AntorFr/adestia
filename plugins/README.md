# Bundled plugins

Adestia ships nine plugins and three skins. None of them is active until you name it
in your config — discovery is not activation, and a folder sitting here costs
nothing until you ask for it.

```yaml
extensions:
  apps: [todo, planif, collections, atelier, voyages, journal, dev-flow]  # tiles
  features: [scan, parcours]                                   # things that live in the shell
  tools: []                                             # agent-facing only
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
| [`journal`](journal/) | app | A journal is a folder, an entry is a page in it. The whole history reads on one screen and a single entry goes into edit mode — the shell's own page editor, one per entry. |
| [`atelier`](atelier/) | app | The workbench. Reads a `workbook.json` a project carries in its own assets and draws the cutting diagram — sheets, bands, pieces, edges to band — plus a full-screen bench mode readable from across a workshop. |
| [`voyages`](voyages/) | app | Trips: a per-day timeline and a tray of suggestions, read from a `voyage.json` a trip carries in its own assets. Weather and legs are derived on demand. |
| [`dev-flow`](dev-flow/) | app | The work in flight across a galaxy of repositories. Reads every `.agent/lots/` fiche out of git — `main` as the index, a branch tip for its own fiche — merges the graphs and derives what nobody records: who has the hand, what is blocked, and which open question is freezing a whole chain. Never writes. |
| [`scan`](scan/) | feature | A barcode reader in the composer. Uses the browser's own `BarcodeDetector` where it exists and only downloads a decoder where it does not. |
| [`parcours`](parcours/) | feature | Walks and hikes. Adds the `:::parcours` block, which draws a `.parcours.json` as a map with numbered markers, an elevation profile and a walking mode, and assembles its GPX on demand. A feature rather than an app because a route has no domain and no tile: it hangs off whichever page has a reason to mention it. |

| Skin | What it is |
|---|---|
| [`alfred`](../skins/alfred/) | Warm paper, a quiet chevron, and nothing that shouts. Light and dark, following the system. |
| [`nestor`](../skins/nestor/) | The house's night-light: porcelain by day, plum after dark, amethyst, the roundest corners of the three — and a rabbit whose belly lights up when it works. Follows the phone's setting. |
| [`skippy`](../skins/skippy/) | The code agent's HUD: dark, monospace headings, amber, hard corners, no ambient shadow — emitted light rather than simulated depth. It imposes its night; light exists only on explicit request. |

## Their agent contracts

A plugin that expects the agent to write a particular shape of file ships the
contract that describes it, and Adestia delivers those contracts to the agent
alongside its own. `atelier` ships `workbook-json`, `todo` ships `todo`,
`collections` ships `collections`, `voyages` ships `voyage-json`,
`parcours` ships `parcours-json` and `journal` ships `journal`.

`dev-flow` deliberately ships none. The fiches it reads are written by agents in
OTHER repositories, against a contract those repositories publish themselves
(`.agent/lots/README.md`); a skill here would be a second copy of it, drifting
from the day it was written.

This is why asking the agent for a cutting plan produces a workbook the
workbench can actually draw: the format is not folklore passed between prompts,
it is a document that travels with the plugin — and why asking it to note
something in a carnet produces one more file rather than a rewritten history.

What is shared across all of them — `title`/`type`/`ico`, and the three ways a
plugin finds its own pages — lives in the core `page-author` skill instead of
being repeated in each one. Read it first; a plugin-specific skill builds on
it rather than restating it. `schedule-author` is the same idea for
`planif`'s scheduled notes.

A plugin whose own code dispatches on a frontmatter `type:` value declares the
claim in its manifest (`"types": ["tache", "liste"]`, `todo`'s own). Discovery
checks this at boot: two active plugins claiming the same word produce a line
naming both, rather than a page silently misread by whichever one ran last.

## `dev-flow` needs to be told where to look

Every other plugin here reads the workspace, which it is given. `dev-flow`
reads repositories that are not part of it, so an instance names them —
through the one channel it has for handing a plugin a named value:

```yaml
secrets:
  DEV_FLOW_REPOS: /repos/tessera:/repos/ostia    # colon- or comma-separated
```

Not a secret in the credential sense, and the plugin's manifest says so. But a
list of paths a plugin may read is the OPERATOR's business rather than a
document's: declared in a page, it would be a file-read primitive that anything
holding a pen could re-aim. Configuration that grants reach lives in the
configuration.

In a container, mount them read-only and name the paths as the container sees
them — and note that the plugin reads through `git`, which the image installs
for exactly this:

```yaml
volumes:
  - ~/Dev/tessera:/repos/tessera:ro
  - ~/Dev/ostia:/repos/ostia:ro
```

With nothing configured the plugin still mounts and its screen says what to
add. A repository that is missing, carries no `.agent/lots/`, has no local
`main`, or names a branch that has since been deleted degrades to a line in the
screen's own diagnostics — never to a blank list.

## Adding your own

Put the folder here — or anywhere you mount — and name it in the config. The
manifest schema, the facets a plugin may contribute, and the import map it can
rely on are all described by the `plugin-author` contract that ships with the
product. Ask the agent for a plugin and it reads that contract first.

Nothing here is privileged. These nine are ordinary plugins that happen to live
in the repository, and they load through exactly the same path as yours.
