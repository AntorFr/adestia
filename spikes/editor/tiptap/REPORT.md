# Spike 1 candidate — Tiptap headless

Round-trip harness: `npm install && npm test` (Node only, no browser, no jsdom).
Outputs land in `out/<fixture>.md`; the harness exits non-zero on any byte
difference against the fixture and on any structural-assertion failure.

## Verdict — round-trip fidelity per fixture

| Fixture | model round-trip | through a live `Editor` instance | first-class checks |
| --- | --- | --- | --- |
| `basic.md` | **byte-identical** (`cmp` clean) | **byte-identical** | frontmatter node, wikilink node, single mixed bullet/task list, table node |
| `typed-blocks.md` | **byte-identical** (`cmp` clean) | **byte-identical** | 2 `callout` nodes (`type` attr), 1 `app` leaf node (`id`/`project` attrs), wikilink inside callout, frontmatter node |

Zero declared normalizations were needed for these two fixtures — the
comparison in the harness is strict byte equality on the whole file, and both
files pass it. The "live Editor" row goes one step further than the contract:
each fixture is also loaded into a real `new Editor({ element: null, ... })`
instance and re-serialized from `editor.getJSON()`, byte-identical again.

The harness additionally proves the negative space:

- parsing `:::mystery{x="1"}` **throws** (closed vocabulary, see below);
- an empty `callout` violates its `block+` content expression and is rejected
  by `doc.check()`;
- a `callout` with `type: 42` is rejected by the ProseMirror attribute
  `validate` hook;
- no text node in either parsed document contains `:::`, `[[` or `]]`
  (nothing survived as lucky raw text).

## Markdown serialization path — which one and why

Three candidate paths existed; the retained one is the **official
`@tiptap/markdown` package (v3.30.2)**, used standalone through its
`MarkdownManager` class.

- **`@tiptap/markdown` (retained)** — official, stable, released in lockstep
  with `@tiptap/core` (both 3.30.2, published 2026-08-18). Built on `marked`
  v17. Every relevant built-in extension (paragraph, heading, lists, table,
  image, link, code block...) ships its own `parseMarkdown`/`renderMarkdown`
  handlers, and the same per-extension contract is open to custom extensions,
  including custom `marked` tokenizers for non-standard syntax. This is
  exactly the hook surface the directives require, and it is the API Tiptap
  documents and maintains.
- **`tiptap-markdown` (community, 0.9.0)** — rejected: predates the official
  package, last published 2025-09, targets Tiptap 2.x; superseded by the
  official package for v3.
- **`prosemirror-markdown` direct** — viable fallback (markdown-it based,
  fully controllable) and was prototyped mentally as plan B, but it bypasses
  Tiptap's extension registry: parse/serialize rules would live outside the
  extensions, so every custom node would need a second, parallel definition.
  The official package keeps the markdown contract *inside* each extension.
  Not needed: the official path reached byte-identity after two small
  overrides (below).

Two fidelity bugs in the stock handlers had to be corrected by extension
(both upstream-reportable):

1. **Mixed bullet/task list split** — the stock `TaskList` registers a block
   tokenizer that cuts `- [ ] ...` items out of a surrounding plain list, so
   `basic.md`'s single 5-item list became `bulletList` + `taskList` with a
   blank line appearing between them. Fix: `MixedBulletList` (a
   `BulletList.extend`) allows `(listItem | taskItem)+`, keeps marked's native
   `task`/`checked` item flags, and re-types task items to `taskItem` nodes.
   One markdown list stays one list node. (`src/extensions.js`)
2. **Table blank-line padding** — the stock table renderer wraps its output
   in `\n...\n`, doubling blank lines around tables. Fix: `TightTable`
   trims them; document-level `\n\n` joining then yields exactly one blank
   line. Cell padding itself is byte-exact out of the box. (`src/extensions.js`)

## Declared normalizations

None fire on the two fixtures (proof: strict byte equality passes). The
serializer is still canonicalizing, so files written in a different style
would be normalized on first save:

- emphasis delimiters become `**bold**` / `*italic*` (a source `__bold__`
  would be rewritten);
- bullet markers become `-`; ordered items are renumbered sequentially from
  the list's start number;
- task checkboxes become lowercase `[x]`;
- table cells are re-padded to the widest cell per column (min 3 dashes in
  the separator row); alignment colons are regenerated from cell attrs;
- directive attributes are serialized double-quoted, in schema-declared
  order, e.g. `{id="workbench" project="rangement-garage"}`;
- markdown-significant characters in plain text (`` ` `` `*` `_` `[` `]` `~`
  `\`) are backslash-escaped on output even when the source left them bare
  (verified: `with_underscores` → `with\_underscores` on a synthetic
  fixture); HTML-significant characters are entity-encoded;
- the file always ends with exactly one trailing newline (the harness
  appends it; both fixtures already end that way).

## How custom typed blocks are modeled

`:::name{attrs}` directives are **first-class ProseMirror nodes**, one node
type per directive name, produced by a small factory
(`createDirectiveNode` in `src/directives.js`):

```js
export const Callout = createDirectiveNode({
  name: 'callout',
  attributes: { type: { default: null, validate: 'string|null' } },
})
export const AppBlock = createDirectiveNode({
  name: 'app',
  attributes: { id: { ... }, project: { ... } },
  leaf: true, // atom node, empty body (`:::app{...}` + `:::`)
})
```

Each generated `Node.create` config carries four markdown-specific fields
consumed by `@tiptap/markdown`'s registry:

- `markdownTokenizer` — a block-level `marked` tokenizer matching
  `^:::name{...}\n(body)\n:::`; the body is re-lexed as block markdown via
  `helpers.blockTokens()`, so nested lists/blockquotes/wikilinks inside a
  callout are themselves real nodes (asserted by the harness);
- `parseMarkdown(token, helpers)` — token → `{ type: name, attrs, content }`;
- `renderMarkdown(node, helpers)` — node → `:::name{attrs}` + rendered
  children + `:::`;
- `markdownTokenName` — dispatch key linking token type to the extension.

**Closed vocabulary.** The allowed names live in `DIRECTIVE_VOCABULARY`.
A dedicated `UnknownDirectiveGuard` extension registers a lower-priority
tokenizer for `^:::(\w+)` that **throws** on any name outside the
vocabulary, so an unknown directive aborts the parse loudly instead of
degrading to paragraph text. Adding a block to the vocabulary = one
`createDirectiveNode` call + one entry in the list.

**Schema validation hooks.** Two independent layers, both exercised by the
harness:

1. *Content expressions* — `callout` declares `content: 'block+'`, `app` is
   an `atom` with no content; `schema.nodeFromJSON(json).check()` rejects
   violations (empty callout test).
2. *Attribute validation* — Tiptap v3 forwards each attribute's `validate`
   (string spec or function) into the ProseMirror `NodeSpec`, enforced on
   node creation (`type: 42` test). Richer invariants (enum of callout
   types, required `id` on `app`) fit in the same hook as functions.

## Frontmatter handling

Frontmatter is a **dedicated atom node**, not a pre-/post-processing hack:

- `Document` is extended to `content: 'frontmatter? block+'`, so the schema
  itself pins frontmatter to the first position and allows at most one;
- a block tokenizer matches `^---\n...\n---` **only when the token stream is
  still empty** (i.e. at byte 0), so a mid-document `---` still parses as a
  thematic break — `basic.md` contains both and round-trips;
- the raw YAML text between the fences is stored verbatim in the node's
  `content` attribute; the editor never parses or reformats it;
- `renderMarkdown` re-emits `---\n<raw>\n---` byte-perfect. The harness
  asserts `input.startsWith('---\n' + node.attrs.content + '\n---\n')` for
  every fixture, including the nested-map YAML in `typed-blocks.md`.

## Headless viability

Proven by execution, in plain Node v26, **without jsdom**:

- `getSchema(extensions)` builds the full schema with no DOM;
- `MarkdownManager` (constructed directly with the extension list, no
  editor) does both parse and serialize with no DOM;
- a full `new Editor({ element: null, extensions, content })` instance works
  headless in Tiptap v3: the harness loads each fixture into a live editor,
  runs `editor.getJSON()`, and re-serializes byte-identically. A probe also
  ran `editor.commands.insertContentAt(...)` to append a callout node and
  got correct `:::callout{type="tip"}` markdown back.

jsdom stays unnecessary as long as no node view / DOM rendering is invoked.

## UX affordances (from docs — not built here)

- **Slash menu** — `@tiptap/suggestion` (3.30.2, MIT) is the official
  utility underpinning mention/slash-command UIs; Tiptap's docs ship a
  slash-command example built on it.
- **Drag handles** — `@tiptap/extension-drag-handle` (3.30.2, MIT; React/Vue
  wrappers exist) — block drag-and-drop.
- **Menus** — `@tiptap/extension-bubble-menu` and
  `@tiptap/extension-floating-menu` (3.30.2, MIT).
- Custom nodes render through `renderHTML` or full node views (React/Vue/JS)
  — the `callout`/`app` nodes here already declare `renderHTML`, so styling
  them in the editor is a CSS/nodeview task, not a model change.
- All of the above are npm-published MIT packages verified on the registry;
  none were exercised in this headless spike.

## Weight, license, maintenance

- **Versions**: every `@tiptap/*` package at 3.30.2 (single release train);
  `marked` 17.0.6 (the only non-Tiptap runtime dependency of the pipeline).
- **License**: MIT across the board (`@tiptap/*`, `marked`).
- **Maintenance**: 3.30.2 published 2026-08-18 (two days before this spike);
  the v3 line is the actively developed one from ueberdosis/Tiptap GmbH;
  `@tiptap/markdown` is part of the official monorepo and versioned in
  lockstep with core.
- **Install weight (this candidate)**: 12 MB `node_modules`, 27 packages
  (dev harness included; no build step). The dist folders bundle
  cjs+esm+maps+types, so shipped-to-browser weight is far below the on-disk
  figure; measuring a real min+gzip bundle was out of scope for this
  headless spike.

## Open risks

1. **Serializer canonicalization on legacy files** — the escaping rules
   (underscores, brackets in plain text) mean a hand-written file using
   unescaped `_` inside words will get backslashes on first save. Semantically
   identical, but a noisy first diff. Mitigation: one-time normalization pass,
   or relax `escapeMarkdownSyntax` upstream.
2. **Two built-in overrides to track** — `MixedBulletList` and `TightTable`
   patch stock behavior; a future `@tiptap/extension-list` /
   `@tiptap/extension-table` release could change the underlying handlers.
   Both overrides are tiny and covered by the harness, so a regression shows
   up as a red `npm test`, but they are maintenance surface. Upstreaming both
   fixes would remove it.
3. **`@tiptap/markdown` is young** — it appeared with the v3 line. Its
   internals (mark-boundary handling, blank-line bookkeeping) are non-trivial;
   edge cases outside the fixtures (hard breaks inside table cells, HTML
   blocks, reference links) are untested here.
4. **No nested directives** — the directive tokenizer matches the first
   closing `:::`, so a callout containing another `:::` block would
   mis-parse. Fine for the current closed vocabulary (only `callout` has a
   body); needs fence-counting if the vocabulary ever nests.
5. **`marked` major-version coupling** — the checkbox-token shape that
   `MixedBulletList` compensates for is a marked v17 behavior; a marked major
   bump inside `@tiptap/markdown` could shift token shapes again (harness
   would catch it).
