---
name: plugin-author
description: Write a Golem plugin — an app, a shell capability, an agent tool or a content contract. Use when asked to create, extend or debug an extension of this instance.
---

# Writing a Golem plugin

A plugin is a folder with a manifest. Golem discovers it by reading that
manifest, never by knowing its name — which is what lets a plugin ship from
anywhere and load with no rebuild.

Read this whole file before writing anything. The schema below is version 1
and is enforced: a manifest that does not match is refused at startup, loudly,
with the field named.

## The shape

```
plugins/<id>/
  golem-plugin.json     REQUIRED — this file is what makes the folder a plugin
  web/app.js            a launcher view
  web/blocks.js         content blocks for the editor and renderer
  web/chrome.js         composer buttons, settings entries
  web/app.css           styles, LISTED in the manifest (never imported)
  api.js                a Fastify plugin, mounted at startup
  setup                 an idempotent executable, run at startup
  skills/<name>/SKILL.md  what the agent is told this plugin offers
```

`<id>` is the FOLDER NAME, and the folder wins. A manifest claiming a
different `id` is refused rather than silently re-mapped: the thing enabled in
config must be the thing that loaded.

## The manifest

```json
{
  "schemaVersion": 1,
  "id": "workbench",
  "kind": "app",
  "description": "A woodworking workbook: cut lists, offcuts, progress.",
  "version": "1.0.0",
  "contract": 1,

  "view": "./web/app.js",
  "blocks": "./web/blocks.js",
  "chrome": "./web/chrome.js",
  "styles": ["./web/app.css"],
  "tile": { "label": "Workbench", "icon": "🪚" },

  "api": "./api.js",
  "setup": "./setup",
  "skills": ["./skills/workbench/SKILL.md"],
  "mcpServers": [{ "name": "cutlist", "command": "node", "args": ["./bin/cutlist.js"] }]
}
```

Every field beyond `schemaVersion`, `id`, `kind` and `description` is
optional. Declare only what the plugin actually ships — a facet named but
absent is a load failure the user sees.

### `kind` decides when the plugin is active

| `kind` | Active when | For |
|---|---|---|
| `core` | always | what every agent must have: a writing contract, a body capability |
| `app` | its id is in `extensions.apps` | a launcher module: a tile, a route |
| `feature` | its id is in `extensions.features` | a shell capability: a composer control, a settings entry |
| `tool` | its id is in `extensions.tools` | an agent capability with no interface at all |

**Presence is not activation.** A folder someone mounted ships no code to any
browser until the config names it, on the axis matching its kind. An unknown
`kind` is refused rather than defaulted: a plugin whose activation rule nobody
knows is a plugin nobody can reason about.

### Paths are relative and stay inside the folder

`"../../etc/passwd"`, `"/etc/passwd"` and `"https://cdn.example/x.js"` are all
refused. The server dereferences these paths and serves them to browsers.

## Writing a view

```js
// web/app.js — default-exports a factory
import { createElement, useState } from 'react'

export default function view(api) {
  return function Workbench() {
    const [items, setItems] = useState([])
    return createElement('div', { className: 'workbench' }, /* … */)
  }
}
```

**Bare specifiers you may import** are exactly what the shell's import map
publishes: `react`, `react-dom/client`, `react/jsx-runtime`. Anything else must
be vendored into your plugin folder and imported relatively. A bare import
outside the map fails at load time, in the browser, with an error you will
never see while writing the plugin — declare `"contract": 1` so the shell
refuses a mismatch instead.

**Heavy dependencies load on demand:**

```js
const decoder = await import(new URL('./heavy.js', import.meta.url))
```

Pre-bundle that chunk into your folder. Relative imports inside it keep
working; bare ones still resolve through the page's import map.

**Never `import './app.css'`.** The shell owns stylesheets: list them under
`styles` and it injects and removes them. A CSS import only works under a
bundler, and a runtime-loaded plugin has none.

## Writing content blocks

Blocks extend the CLOSED vocabulary — the reason pages look like one product
whoever wrote them. A block is a `:::name{attrs}` directive that becomes a
first-class node, never text that happens to look like markup.

```js
// web/blocks.js
export default function blocks(api) {
  return {
    tags: {
      cutlist: {
        render: 'CutList',
        attributes: { project: { type: String, required: true } },
      },
    },
  }
}
```

Extending the vocabulary is a deliberate act: a coded component, an entry in
the schema, and a line in the skill that teaches it. It is never something a
document can do by itself.

## Writing an API

```js
// api.js — a Fastify plugin
export default async function api(app, options) {
  app.get('/api/workbench/:id', async (request) => loadWorkbook(request.params.id))
}
```

An inactive plugin mounts nothing. An API that fails to import is reported and
skipped: a broken plugin costs its own view, never the server.

## Before you finish

1. `golem-plugin.json` parses and matches the schema above.
2. Every path it names exists.
3. The view mounts — write a DOM test. A runtime-loaded plugin gets no build
   error to save it, so a typo in an import is found by a user otherwise.
4. The id in the manifest equals the folder name.
5. The plugin's id is added to the right list in `golem.config.yaml`, or
   nothing will happen and nothing will say why.
