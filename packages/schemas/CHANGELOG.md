# Extension schema changelog

Schemas will churn while Adestia is young — that is them learning. Every version
gets a line here, so nobody has to do archaeology later.

## Plugin manifest

### v1 — 2026-08-20
Initial contract. Shaped by the predecessor's six lived plugin classes and by
spike 2 (runtime ESM loading): facets are DECLARED (`view`, `blocks`, `chrome`,
`styles`, `api`, `setup`, `bin`, `skills`, `mcpServers`, `tile`) rather than
discovered by filename at build time. `kind` decides activation
(`core`/`app`/`feature`/`tool`); presence in a folder is never activation.
`contract` pins the bare-specifier set (import map) the plugin was written
against.

## Skin manifest

### v1 — 2026-08-20
Initial contract: `module`, `styles`, `icon`, `manifest`. Exactly one skin is
active, chosen by a config value.

## Additions within schema version 1

The current plugin contract also declares `layouts`, `vocabulary`, `types`,
`fields`, `absorbs`, `secrets` and `agents`; tiles may name a `glyph` and `hue`.
The skin contract includes `scheme` (`light`, `dark`, `auto`). These additions
keep version 1; `src/plugin.ts`, `src/skin.ts` and `src/validate.ts` define the
accepted shape. The web manifest fragment supplies raster installer icons
through its `icons` entries, rather than a separate skin-manifest field.
