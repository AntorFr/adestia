# @antorfr/adestia-schemas

**The single source of truth for every extension contract.** Three consumers,
one definition (DESIGN.md principle 8):

1. the **loader** validates manifests against it at startup,
2. the **authoring skills** (`plugin-author`, `skin-author`) teach it,
3. the **public docs** describe it, with `src/plugin.ts`, `src/skin.ts` and
   `src/validate.ts` as the reference (there is no documentation generator).

Every manifest declares `schemaVersion`. A manifest from another version is
refused **loudly** — never loaded sideways. Schemas will churn early; that is
them learning. Each schema version gets a line in this package's `CHANGELOG.md`.
