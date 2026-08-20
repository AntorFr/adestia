# Spike 1 — editor round-trip (the spine)

**Question:** can a block editor edit our markdown files without corrupting
them? Source of truth is the FILE; the editor is a view. A lossy round-trip
disqualifies the candidate, full stop.

## Candidates

- `milkdown/` — Milkdown (ProseMirror + remark pipeline)
- `tiptap/` — Tiptap headless (+ markdown serialization)
- `blocknote/` — BlockNote (Notion-like UX, md interop to be quantified)

## Harness contract (identical for every candidate)

Each candidate directory exposes `npm test` which, headless (Node; jsdom
allowed), for every file in `../fixtures/`:

1. parses the markdown into the editor's document model,
2. serializes it back to markdown,
3. writes the result to `out/<fixture>.md`,
4. diffs against the input and exits non-zero on any difference beyond the
   candidate's DECLARED normalizations (listed in its REPORT.md).

Typed blocks (`:::name{attrs}` container directives) MUST become first-class
nodes in the editor model (the closed-vocabulary requirement) — surviving as
opaque raw text is a FAIL even if the diff is clean.

## REPORT.md structure (per candidate)

Verdict (round-trip fidelity per fixture) · declared normalizations · how
custom typed blocks are modeled (extension API, schema validation hooks) ·
frontmatter handling · headless viability · UX affordances available
(slash menu, drag handles — from docs, not built here) · weight, license,
maintenance status · open risks.

## Scoring (for the final comparison)

1. **Fidelity** (eliminatory) 2. Custom-block model quality 3. Editor UX
ceiling 4. Maintenance/ecosystem 5. Weight.
