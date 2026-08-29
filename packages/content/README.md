# @antorfr/demeura-content

The content engine: **one remark/micromark grammar** shared by the renderer and
the editor (spike 1's deciding criterion — see `spikes/editor/VERDICT.md`).
Parses markdown + frontmatter + the closed vocabulary of typed block directives
(`:::name{attrs}`), validates it at the mdast level, and serializes it back
byte-faithfully.

`test/roundtrip.test.ts` is the **conformance gate** promoted from the spike:
every fixture must round-trip byte-identical. It re-runs on every markdown or
editor dependency bump. Fixtures grow with every fidelity bug ever found.
