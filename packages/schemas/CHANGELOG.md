# Extension schema changelog

Schemas will churn while Adestia is young — that is them learning. Every version
gets a line here, so nobody has to do archaeology later.

## Plugin manifest

### v1 — 2026-08-20 (unreleased)
Initial contract. Shaped by the predecessor's six lived plugin classes and by
spike 2 (runtime ESM loading): facets are DECLARED (`view`, `blocks`, `chrome`,
`styles`, `api`, `setup`, `bin`, `skills`, `mcpServers`, `tile`) rather than
discovered by filename at build time. `kind` decides activation
(`core`/`app`/`feature`/`tool`); presence in a folder is never activation.
`contract` pins the bare-specifier set (import map) the plugin was written
against.

## Skin manifest

### v1 — 2026-08-20 (unreleased)
Initial contract: `module`, `styles`, `icon`, `manifest`. Exactly one skin is
active, chosen by a config value.
