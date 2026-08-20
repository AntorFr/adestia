# Spike 1 candidate report — Milkdown

Candidate: **Milkdown 7.22.1** (`@milkdown/kit`), ProseMirror + remark pipeline.
Harness: `npm install && npm test` in this directory (Node v26.0.0, npm 11.12.1,
headless via jsdom 30.0.1). Everything below marked *proven* was verified by
executing the harness on this machine on 2026-08-20; *read-from-source* items
were verified by reading the installed package sources but not executed.

## Verdict — round-trip fidelity per fixture

| Fixture | Result | Evidence |
|---|---|---|
| `basic.md` | **PASS — byte-identical** | `shasum` input `075d336a…` == `out/basic.md` (proven) |
| `typed-blocks.md` | **PASS — byte-identical** | `shasum` input `73d2a0ee…` == `out/typed-blocks.md` (proven) |

Strict byte equality is enforced by the harness (`output === input`); **zero
normalizations were needed for the fixtures**. The harness also asserts,
independently of the diff, that the parsed ProseMirror document contains the
required first-class node types (`frontmatter`, `callout`, `app`, `wiki_link`)
— a clean diff with typed blocks surviving as raw text would still FAIL.

Failure paths proven by execution (via `FIXTURES_DIR=<dir> npm test` on
synthetic bad fixtures): a non-canonical file produces a unified diff and exit
code 1; an unknown directive (`:::mystery`) makes the parse throw
(`MilkdownError: Cannot match target parser…`) and the fixture FAILs; a
fixture sorted after a failed one still passes (parser state is rebuilt).

## Declared normalizations

**None applied to the fixtures** (byte-identical, see above). Two knobs were
configured to match the repo's house style instead of remark-stringify
defaults: `remarkStringifyOptionsCtx = { bullet: '-', rule: '-' }`.

For markdown written in styles *other* than the fixtures' house style, the
round trip canonicalizes (each case proven by execution unless noted):

- `*` / `+` bullets → `-`; `***` thematic break → `---` (our two settings)
- `_em_` / `__strong__` → `*em*` / `**strong**` (to-markdown uses global
  marker options; Milkdown's per-node `marker` attr is ignored by the
  stringifier — read-from-source + proven on input)
- setext headings → ATX (`# …`)
- reference links/images → inline links (`remark-inline-links` is part of
  Milkdown's commonmark preset)
- `1)` markers → `1.`; ordered lists renumbered sequentially (`1. a / 5. b` →
  `1. a / 2. b`)
- `~~~` fences → ``` fences
- runs of 2+ blank lines collapse to one
- trailing-double-space hard break → backslash hard break (`\`)
- html nodes that are exactly `<br/>` variants are deleted by the preset's
  `remarkPreserveEmptyLinePlugin` (read-from-source, not executed)
- output always ends with exactly one `\n` (both fixtures already do)

Soft line wraps inside paragraphs round-trip exactly (proven by `basic.md`):
the preset's `remarkLineBreak` plugin turns them into `hardbreak` nodes with
`isInline: true`, serialized back as a plain `\n`.

## How custom typed blocks are modeled

`:::name{attrs}` container directives are **first-class ProseMirror nodes**,
not preserved text. Parsing is done by `micromark-extension-directive` +
`mdast-util-directive` registered through Milkdown's `$remark` plugin helper;
each vocabulary entry is a Milkdown `$nodeSchema` (see `plugins.js`):

- **`callout`** — `content: 'block+'`, `group: 'block'`, attrs
  `{ attributes }` (the directive's `{…}` map, order preserved). Its
  `parseMarkdown.runner` maps mdast `containerDirective[name=callout]` →
  `openNode / next(children) / closeNode`, so the body is a real editable
  rich-text region (the fixture's bold, wikilink, list and blockquote all
  land inside the node — proven by dumping `doc.toJSON()`).
- **`app`** — `atom: true` leaf block with attrs `{ attributes }`
  (`{"id":"workbench","project":"rangement-garage"}` proven in the model).

Serialization goes back through mdast `containerDirective` and
`directiveToMarkdown({ preferShortcut: false })` — without that option the
serializer rewrites `id="workbench"` to `#workbench` (both behaviors proven).

**Closed vocabulary / schema-validation hooks.** Enforcement points, outermost
first:

1. **Unknown directive name** → no `parseMarkdown.match` succeeds → Milkdown
   throws `Cannot match target parser for node: {"type":"containerDirective",
   "name":"mystery",…}` (proven). The file is refused rather than corrupted.
2. **Per-node validation in the `parseMarkdown.runner`** — demonstrated: the
   `app` runner throws if the directive has body content instead of silently
   dropping it (proven; before this guard the body was silently lost).
3. **ProseMirror native hooks** — attrs support `validate` (the preset itself
   uses `validate: "boolean"`), and content expressions (`block+`) constrain
   nesting; edit-time invariants can be enforced with `filterTransaction` /
   `appendTransaction` plugins via `$prose`.

## Frontmatter handling

Dedicated block node, byte-perfect (proven on both fixtures, including nested
maps, lists, em dash and accents). Mechanism: `remark-frontmatter@5` is added
with `$remark(…, 'yaml')` — note the trap: `$remark` defaults options to
`{}`, which remark-frontmatter rejects (`Missing type in matter`), so the
`'yaml'` preset must be passed explicitly. The mdast `yaml` node carries the
raw YAML text (without `---` fences) in `node.value`; our `frontmatter`
node schema (`atom: true`, first block of the doc) stores it untouched in an
attr and re-emits it verbatim; `mdast-util-frontmatter` re-adds the fences.
YAML is never parsed, so no key reordering / reformatting can occur.

## Headless viability

**Proven.** The full editor (including the ProseMirror `EditorView`) boots
under Node + jsdom; `npm test` runs in ~0.75 s wall clock for both fixtures.
Two shims were required beyond plain jsdom globals (see `bootstrap-dom.js`):

- jsdom globals must be installed **before** any Milkdown/ProseMirror import
  (prosemirror-view sniffs `navigator` at module-evaluation time);
- `@milkdown/ctx` timers call bare `addEventListener` / `dispatchEvent` as
  globals — they must be bound from `window` onto `globalThis`.

Parse/serialize themselves need no DOM at all once the editor exists: the
round trip is `parserCtx` → ProseMirror doc → `serializerCtx`, no view
involved.

## UX affordances available (from package exports/docs — not built here)

The installed `@milkdown/kit` ships, as export subpaths: `plugin/slash`
(slash-menu factory), `plugin/block` (block drag handle), `plugin/tooltip`
(selection toolbar), `plugin/history`, `plugin/clipboard`, `plugin/indent`,
`plugin/trailing`, plus prebuilt components: `component/table-block`
(interactive table editing), `component/list-item-block`,
`component/image-block`, `component/link-tooltip`, `component/code-block`.
Milkdown also publishes `@milkdown/crepe`, a batteries-included editor with
these wired up. Custom node views (React/Vue/vanilla) are the standard way to
render `callout` / `app` blocks with bespoke UI.

## Weight, license, maintenance status

- **License:** MIT (`npm view` — kit and scoped packages).
- **Installed weight** (this spike, unminified ESM + maps + types):
  `@milkdown/*` 8.2 MB, `prosemirror-*` 3.4 MB, jsdom (harness-only) 8.3 MB;
  whole `node_modules` 74 MB including the remark/unified tree.
  `@milkdown/kit` itself is a 121 kB re-export shell.
- **Maintenance:** active — kit created 2024-08-02, latest publish
  2026-08-12 (8 days before this spike), version 7.22.1.

## Open risks

1. **Shared parser state after a failed parse** (read-from-source + proven):
   `ParserState.create` reuses one state instance per `parserCtx` closure; an
   exception mid-parse leaves it dirty and breaks the *next* parse. The
   harness rebuilds the editor after any throw; a real app must do the same
   (or get a fresh parser per document).
2. **Marker fidelity is global, not per-node**: files mixing `_` and `*`
   emphasis (or `*` bullets) will be canonicalized on first save. Acceptable
   if the vault adopts one house style; otherwise needs a custom stringify
   handler.
3. **Directive attribute formatting** relies on `mdast-util-directive`
   options (`preferShortcut: false`, default `"` quotes); unquoted or
   single-quoted attributes in source files would be rewritten.
4. **remark-in-the-middle churn**: fidelity depends on the exact
   remark/mdast-util versions Milkdown pins; upgrades can shift stringify
   defaults, so the fixture harness should run in CI on every bump.
5. `pretendToBeVisual` jsdom flag is required for `requestAnimationFrame`;
   without a DOM the *view* plugins can't load, though parse/serialize would
   still work if one assembled schema + transformer manually.

## Files

- `bootstrap-dom.js` — jsdom globals (must load first)
- `plugins.js` — frontmatter / directive (`callout`, `app`) / wikilink nodes
- `editor.js` — headless editor factory + round-trip action
- `test.js` — the `npm test` harness (spike contract)
- `out/` — serialized outputs, one per fixture
