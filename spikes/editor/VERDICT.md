# Spike 1 — Verdict: Milkdown

**Date:** 2026-08-20 · All three candidate harnesses executed and independently
re-verified (SHA/cmp) before judgment.

## Results recap

| Candidate | Fidelity (eliminatory) | Typed blocks | Notes |
|---|---|---|---|
| **Milkdown 7.22.1** | ✅ byte-identical, 0 normalizations | first-class nodes, unknown directive throws | remark/micromark pipeline |
| **Tiptap 3.30.2** | ✅ byte-identical, 0 normalizations | first-class nodes, hand-written tokenizer | official `@tiptap/markdown` (marked 17) |
| BlockNote 0.54.0 | ❌ 0/2, destructive losses | unreachable from markdown (no md hook) | eliminated |

## Decision: Milkdown. The deciding criterion

DESIGN.md, written before the spike: *"ONE parser shared by renderer and editor —
two parsers means drift."* Golem's renderer is unified/remark (directives are
native there). Milkdown's transformer **is** that same micromark/remark grammar —
a page parses identically at render time and edit time because it is the same
tokenizer. Tiptap's official markdown path is **marked**-based: a second grammar
in the product forever, with the cost already visible inside its own spike —
a hand-written directive tokenizer that does not support nesting, and two
stock fidelity bugs in a days-old package.

**Correction (2026-08-20, found while building `packages/content`):** this
verdict originally also credited Milkdown with not escaping `snake_case` in
prose. That was wrong — **remark-stringify escapes intraword `_` too**, so both
candidates would have churned agent-written prose out of the box. The
difference is only that remark's escaping is fixable from our own pipeline: a
narrow `text` handler unescapes `_` between two word characters, which
CommonMark defines as literal anyway (verified). The deciding criterion — one
grammar — is untouched.

Second-order scoring: markdown-path maturity (Milkdown, strong), shared
mdast-level vocabulary validation across renderer/editor/agent-skill (Milkdown),
headless story (Tiptap — pure Node, no jsdom; minor, price paid once in the
harness), UX ceiling (Tiptap's official suite, moderate — both are ProseMirror,
Crepe already provides slash menu + drag handles), known bugs (wash — Milkdown's
parser-state-after-throw has a trivial fresh-parser workaround; Tiptap's fixes
would be maintained against marked forever).

## Flip conditions (watch these facts)

1. Golem abandons remark for rendering (no reason in sight — directives).
2. Milkdown maintenance collapses (last publish 2026-08-12 at verdict time).

## Adopted mitigations

- **Editor behind a Golem interface, never bare** — the Tiptap spike is the
  proven fallback (one day of work to viability); keep it cheap to swap.
- Fresh parser per document open; rebuild after any parse throw
  (shared-ParserState bug — report upstream).
- Round-trip harness becomes the content-engine **conformance suite** in the
  monorepo, re-run on every milkdown/remark bump; fixture corpus grows with
  every fidelity bug found (next additions: hard breaks in tables, reference
  links, setext headings, HTML blocks, legacy-style files).
- Open-question rulings: legacy mixed-marker files are canonicalized on first
  save (documented house style); directive attributes are double-quoted, no
  shortcuts (house style, taught by the agent skill); a file with an unknown
  directive opens **read-only with diagnostics**, never a hard refusal and
  never a silent rewrite.
