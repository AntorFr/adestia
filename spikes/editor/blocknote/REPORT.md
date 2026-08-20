# BlockNote — Spike 1 report (editor round-trip)

Candidate: **BlockNote 0.54.0** (`@blocknote/core` + `@blocknote/server-util`), headless via
`ServerBlockNoteEditor` (Node v26.0.0, npm 11.12.1, jsdom bundled by server-util).
All claims below are **proven by execution** unless explicitly marked *assumed*.

## Verdict: FAIL (eliminatory)

**Round-trip fidelity: 0/2 fixtures.** `npm test` exits 1.

| Fixture | Input lines | Lines lost/changed beyond declared normalizations | Verdict |
|---|---|---|---|
| `basic.md` | 41 | −7/+7 (−13/+14 without the frontmatter shield M1) | FAIL |
| `typed-blocks.md` | 30 | −8/+9 (−16/+18 without M1) | FAIL |

Two independent eliminatory failures:

1. **Destructive round-trip losses** on plain-vanilla markdown (inline image silently
   deleted, soft line breaks rewritten as hard breaks, see table below).
2. **Closed-vocabulary requirement failed by architecture**: `:::name{attrs}` container
   directives *cannot* become first-class nodes. BlockNote's markdown import pipeline is
   markdown → HTML → DOM parse rules; there is no markdown-level extension hook at all.
   Custom blocks exist and are well-typed, but they are unreachable from markdown input
   (proven: with `callout`/`app` custom blocks registered in the schema, the import still
   produced 0 callout and 0 app nodes — directives land as plain paragraphs).

BlockNote itself names the relevant APIs `blocksToMarkdownLossy` and
`tryParseMarkdownToBlocks`; its canonical persistence format is its own Block JSON (or
"full HTML"). Markdown is positioned as lossy interop, not as a source of truth. Our
measurement confirms the label is accurate.

## How to run

```sh
cd spikes/editor/blocknote
npm install        # local node_modules only
npm test           # round-trip harness; exit 1 = fidelity failures
node probe.mjs     # custom-block probe (closed-vocabulary evidence)
```

Artifacts: `out/<fixture>.md` (re-serialized markdown), `out/<fixture>.diff`
(differences beyond declared normalizations), `out/<fixture>.blocks.json` (the parsed
editor model — evidence of how each construct was modeled).

## Declared normalizations

- **N1** — exactly one trailing newline at EOF.
- **N2** — unordered-list bullet marker: `-`, `*`, `+` treated as equivalent
  (BlockNote always emits `*`; fixtures use `-`). Implemented as a line-level regex,
  adequate for these fixtures (no bullet-lookalike lines inside code fences).
- **M1 (frontmatter mechanism, not a normalization)** — YAML frontmatter is extracted
  verbatim (including trailing blank separator lines) *before* the editor sees the file
  and reinjected verbatim after serialization. It never enters the editor model. See
  "Frontmatter handling".

Everything else counts as a failure. Deliberately **not** declared (visible in diffs):
thematic-break marker rewrite (`---` → `***`) and table cell re-padding — both
CommonMark-equivalent but byte-level changes a file-first tool would inflict on every
save.

## Per-construct results (all executed)

| Construct | Survives? | Observed behavior (0.54.0) |
|---|---|---|
| YAML frontmatter | **only via M1** | Without M1, destroyed: opening `---` becomes a `divider` block (`***`), keys collapse into one paragraph with hard breaks (`\` + injected leading space), and the last key + closing `---` becomes a **setext H2** (`## created: 2026-08-20`, `## count: 3`). YAML indentation (`meta:\n  nested:`) is lost. |
| ATX headings | yes | byte-perfect |
| bold / italic / inline code / link | yes | byte-perfect |
| soft-wrapped paragraph | **no** | soft line break becomes a **hard break**: `\` appended + a leading space injected on the continuation line. Changes rendered semantics (`<br>` vs space). |
| `[[wikilink]]` | as text | survives unescaped, but it is inert paragraph text, not a node |
| inline image | **no — silently deleted** | `![garage plan](./assets/plan.png)` vanishes; output reads `an image .`. BlockNote images are block-level only; inline images are dropped by the md→HTML→model import. Silent data loss. |
| bullet list + nesting | yes (N2) | model: `bulletListItem` with `children`; emits `*` |
| task list | yes (N2) | model: `checkListItem` with `checked` prop; emits `* [ ]` / `* [x]` |
| ordered list | yes | byte-perfect |
| GFM table | structure yes, bytes no | model: `table` block with `tableContent`; serializer re-pads every cell to 10-char columns (4 lines changed) |
| fenced code + language | yes | byte-perfect, `codeBlock` with `language: "js"` prop |
| blockquote | yes standalone | `quote` block — but see directive corruption below |
| thematic break | semantically | `divider` block exists; emitted as `***` instead of `---` |
| `:::name{attrs}` directives | **no** | plain `paragraph` blocks: the directive line and the following content line are merged with a hard break (`:::callout{type="warning"}\` + ` Nested …`); a blank line is inserted between a list and its closing `:::`; worst case, a closing `:::` after a blockquote is **absorbed into the quote block** (`>  :::`) — structural corruption of neighboring content. |
| accents / emoji (`éàüç`, 🛠) | yes | no encoding drift |

Loss classes: **destructive** = frontmatter (absent M1), inline image, soft→hard breaks,
directive mangling + quote absorption. **Cosmetic (undeclared)** = table re-padding,
`---`→`***`.

## Custom typed blocks — extension API and why it cannot satisfy the requirement

**The API itself is decent.** `createBlockSpec(config, implementation)` from
`@blocknote/core`:

- `config`: `{ type, propSchema, content: "inline" | "none" | "plain" }`. `propSchema`
  entries are typed with `default` and an optional closed `values` enum — e.g.
  `type: { default: "note", values: ["note", "warning"] }`. This plus
  `BlockNoteSchema.create({ blockSpecs })` is where a closed vocabulary and per-type
  attribute validation would plug in. Schema-invalid props are the extension author's
  concern; there is no external JSON-schema hook, but the PropSchema enum covers the
  closed-vocabulary case.
- `implementation`: `render()` (DOM output; works headless under server-util's jsdom),
  optional `toExternalHTML()`, optional `parse(el: HTMLElement)` / `parseContent()`.

**The fatal flaw: every conversion hook is HTML-only.** Verified in
`@blocknote/core` 0.54.0 sources/typedefs:

- Import: `markdownToHtml(markdown: string): string` — a hand-written converter that the
  source comment describes as "a direct replacement for the unified/remark/rehype
  pipeline". **No options, no plugin surface.** The resulting HTML is fed to
  ProseMirror/BlockNote HTML parse rules. A `:::callout` directive is not HTML, so a
  custom block's `parse()` can never see it. (Historically BlockNote used remark; 0.54
  ships this in-house pipeline — so even the old "fork the remark chain" escape hatch
  is gone.)
- Export: blocks → external-HTML exporter (`render`/`toExternalHTML`) →
  `htmlToMarkdown(html)` — a custom DOM-based serializer with **hardcoded** GFM rules,
  no options.

**Probe results (`node probe.mjs`, all executed):**

1. Schema registered with `callout` + `app` custom blocks, then
   `tryParseMarkdownToBlocks(typed-blocks.md)`: **0 `callout`, 0 `app`**; the three
   directives end up spread across 5 paragraphs of literal `:::` text.
2. Hand-built model `[callout(warning, "Watch out"), app(id, project), paragraph("After.")]`
   exported with `blocksToMarkdownLossy`: **`"Watch outAfter.\n"`** — the callout wrapper
   and its props vanish, the `app` block vanishes entirely, and even the block boundary
   is lost (no blank line between "Watch out" and "After."). The external HTML step still
   had everything (`<div data-callout-type … data-type="warning">…`), so the loss is in
   the hardcoded `htmlToMarkdown`.
3. Escape hatch attempt — a custom `toExternalHTML` emitting the literal
   `:::callout{type="warning"} ... :::` as text does survive export. But (a) the block's
   nested rich content would have to be hand-serialized to markdown inside that string
   (no child-serializer access), and (b) the import direction remains impossible, so the
   round-trip stays dead.

Conclusion: carrying our typed blocks would mean writing **our own**
markdown↔Block-JSON converter for the whole document (remark-directive based) and using
BlockNote only as a JSON editor — at which point BlockNote's entire markdown layer is
abandoned and the comparison with ProseMirror/remark candidates collapses.

## Frontmatter handling

BlockNote has **no concept of document metadata or frontmatter** — no dedicated block,
no API surface. Fed raw, the YAML header is destroyed (divider + hard-break paragraph +
setext H2, see table). The only viable mechanism is the one the harness implements (M1):
regex-extract the leading `---\n…\n---\n` span verbatim before parse, reinject verbatim
after serialize. With M1 the frontmatter survives **byte-perfect** (proven: no
frontmatter lines appear in `out/*.diff`), at the cost of the editor never seeing or
editing it.

## Headless viability

Good. `@blocknote/server-util`'s `ServerBlockNoteEditor` runs the full parse/serialize
cycle in plain Node (it ships jsdom and wraps conversions itself; react/react-dom are
peer deps but no browser is needed). No crashes on either fixture; one cosmetic Node 26
`ExperimentalWarning` about localStorage. Custom-block `render()` with
`document.createElement` works headless.

## UX affordances (from docs — not built here)

BlockNote's strong suit *(from official docs, not verified by execution)*: Notion-style
defaults out of the box — slash suggestion menu, side menu with drag handle and add
button, formatting toolbar, table UI, file/image upload hooks, real-time collaboration
via Yjs, localization. This is the highest-UX-ceiling candidate of the three with the
least assembly required — but it is built around Block JSON as the storage format, which
is exactly what disqualifies it here.

## Weight, license, maintenance

- **License**: MPL-2.0 (core, react, server-util) — file-level copyleft, usable in a
  proprietary/public app; modifications to BlockNote files themselves must be shared.
- **Weight**: spike `node_modules` 129 MB total; `@blocknote/*` 34 MB installed,
  plus jsdom 8.3 MB and react-dom 7.1 MB (server side). Client bundle size not measured
  in this spike (react + @blocknote/core + @blocknote/react + mantine UI would ship).
- **Maintenance**: very active — 0.54.0 published 2026-08-13 (a week before this spike),
  6 releases in the last 90 days.

## Open risks (if pursued despite the FAIL)

- The markdown layer is explicitly lossy **by design and by naming**; upstream has no
  incentive to make it byte-stable, and the 0.54 in-house pipeline removed the last
  plugin surface (remark) that a fork could have hooked into.
- Silent inline-image deletion means data loss without any error — the worst failure
  mode for a file-as-source-of-truth tool.
- Adjacent-block corruption (closing `:::` absorbed into a preceding blockquote) shows
  losses are not even locally contained.
- Making it work would require a bespoke md↔JSON converter maintained by us, tracking
  BlockNote's fast-moving (0.x) block model — permanent treadmill risk.
