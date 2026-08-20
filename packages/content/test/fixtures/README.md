# Round-trip conformance fixtures

**These files are a contract, not examples.** Every one of them must survive
parse → serialize **byte-identical**. The suite that enforces it
(`../roundtrip.test.ts`) is the gate every markdown, remark or editor
dependency bump has to pass.

Seeded from spike 1 (`spikes/editor/fixtures/`), where three editor candidates
were measured against them. **The corpus only grows**: every fidelity bug ever
found becomes a fixture here, so it can only ever be found once.

Adding one: write the file in house style, run the suite, and if it fails,
either the file is not house style (fix the file) or the pipeline has a
fidelity bug (fix the pipeline — never the assertion).
