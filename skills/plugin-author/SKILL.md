---
name: plugin-author
description: Write a Adestia plugin — an app, a shell capability, an agent tool or a content contract. Use when asked to create, extend or debug an extension of this instance.
---

# Writing a Adestia plugin

A plugin is a folder with a manifest. Adestia discovers it by reading that
manifest, never by knowing its name — which is what lets a plugin ship from
anywhere and load with no rebuild.

Read this whole file before writing anything. The schema below is version 1
and is enforced: a manifest that does not match is refused at startup, loudly,
with the field named.

## The shape

```
plugins/<id>/
  adestia-plugin.json     REQUIRED — this file is what makes the folder a plugin
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
  "vocabulary": {
    "cutlist": {
      "content": "empty",
      "description": "A cut list, read from the workbook beside the page.",
      "attributes": { "project": { "required": true } }
    }
  },
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

### Saying where your view is

The shell draws the breadcrumb — **never draw your own**. It can name your app
and nothing under it (`#/voyages/baden-2026` is a trip whose title lives in a
file it does not read), so a view with screens of its own publishes them:

```js
api.trail([{ label: 'Baden 2026', route: '/voyages/baden-2026' }])
```

Crumbs are the ones BELOW your tile — the shell already drew Home and your
app's name, and drops any crumb repeating them, so a ported view that says the
whole trail from the top still lands right. `route` is a hash route without the
`#`, and may be absent for a step that leads nowhere (a screen still loading).
Call it on every move, `[]` included: the trail is cleared on each navigation,
so a screen that says nothing shows your app's name alone rather than the
previous screen's words.

### Owning a folder of the workspace

An app whose content lives in pages says so in the manifest, and the folder
stops being offered twice:

```json
"absorbs": ["voyages"]
```

A **name, not a path**: it matches wherever that run of segments sits
(`voyages`, `domaines/voyages`), covers everything beneath it, and only while
the plugin is active. The tile now stands for that folder — so the shell stops
drawing a section tile for it.

That claim also decides **where every link into the folder goes** — the
breadcrumb above one of its pages, a bookmark, a `cible` the agent wrote. The
shell knows the folder is yours and cannot know how you address it, so it
asks:

**`absorbs` is not required to answer.** It is a name, and some apps have no
name to give: the atelier's benches sit in whatever project folders exist, so
it claims a path by KNOWING it — asked, it looks the path up in its own
listing. Which is the more honest test anyway: a folder is a workbench because
a workbook is filed in it, not because of what it is called. Declare `absorbs`
when your tile stands for a folder (it also retrenches the section tile);
implement `routeFor` when you can say which paths are yours. A folder somebody
DECLARED is never taken from them by a plugin that merely volunteers.

```js
return {
  component: Voyages,
  route: '/voyages',
  // A workspace folder in, one of YOUR routes out.
  routeFor: (folder) => {
    const trip = trips.get(folder)          // known trips, primed from your own API
    return trip ? `/voyages/${encodeURIComponent(trip)}` : undefined
  },
}
```

Three rules, each of which has a failure behind it:

- **Synchronous.** It is called while a link is being drawn. Anything that
  needs a fetch to answer must be primed beforehand — keep a map, refresh it
  when your view mounts.
- **Answer `undefined` when you have no screen for that folder**, and the
  reader gets the generic section — the screen they had before your plugin
  existed. Deriving a path you have not verified sends them to your own error
  state from a folder that was never yours (a notes folder filed under
  `voyages/`), which is worse than the generic answer.
- **Stay inside your own `route`.** An answer outside it is dropped: owning a
  folder is not owning the shell's navigation.

Nothing to implement for the folder ITSELF — the shell already sends it to
your `route`, since that is what the tile means.

**Say as little as an address can.** `routeFor` is where your URL scheme is
decided, so decide it for a reader: a NAME your own listing resolves
(`#/voyages/baden-2026`), not the path of the file that happens to hold the
data (`#/voyages/domaines%2Fvoyages%2Fbaden-2026%2Fassets%2Fvoyage.json`).
Three rules make that safe, and `plugins/voyages/web/address.js` is the worked
example:

- **Only when it is unambiguous.** A name your listing shows twice falls back
  to the full path. A pretty link that opens the wrong thing is worse than an
  ugly one.
- **Escape segments, not slashes.** `/` is legal in a fragment; encoding the
  whole path is what makes an address unreadable for no gain.
- **Keep reading every shape you ever wrote.** Bookmarks and links the agent
  put in pages months ago must still resolve. Recognising an old shape costs a
  branch; breaking a link costs trust.

## Editing a page from your own screen

`api.PageEditor` is the shell's OWN page editor, handed to you as a component.
Not an import-map entry, and the difference is the loading model: the map
publishes third-party dependencies, while the shell's capabilities travel
through `api` — a plugin importing the shell would be a cycle.

```js
h(api.PageEditor, { path: 'journal/atelier/2026-08-25.md', onSaved: reload })
```

| Prop | What it does |
|---|---|
| `path` | the page to edit, as `/api/pages/…` spells it. It fetches it itself. |
| `attachments` | draw the page's attachment strip underneath. **Off by default** here — a strip of documents under every item is furniture, and one more request per item. |
| `onSaved` | called after a save the server accepted: the moment to reload the list you drew from the index. |

It behaves exactly as it does on `#/page/…`: **reading posture until its own ✎
is pressed**, its own revision against an agent writing the same file, a 409
surfaced rather than an overwrite, and a page breaking the vocabulary opened
read-only with its diagnostics.

Which is why a screen made of several of them needs no code to do the obvious
thing: render one per item and clicking one pencil puts THAT item into edit
mode while the rest stay readable. `journal` is the whole app built this way.

⚠️ **Do not restyle `.adestia-editor`.** It is the shell's, and a plugin that
repaints it makes the same page look like two products depending on where it
was opened.

## Writing content blocks

Blocks extend the CLOSED vocabulary — the reason pages look like one product
whoever wrote them. A block is a `:::name{attrs}` directive that becomes a
first-class node, never text that happens to look like markup.

A block is declared in **two halves that never restate each other**.

**The manifest says what the block IS** — data, under `vocabulary`:

```json
"vocabulary": {
  "cutlist": {
    "content": "empty",
    "description": "A cut list, read from the workbook beside the page.",
    "attributes": {
      "project": { "required": true },
      "vue": { "values": ["table", "compact"], "default": "table" }
    }
  }
}
```

`content` is `flow` (the block holds markdown — a callout, a gallery) or
`empty` (its attributes are its whole meaning). An attribute with `values` is
a closed set; anything else is a diagnostic, not a silently-accepted typo.

Why in the manifest and not in the module: **the server validates pages**. It
decides `editable` on every read and refuses a save that breaks the
vocabulary, and it cannot execute a module written for a browser to find out
what is legal. Declared data is the only form both sides can read.

**The module says what the block LOOKS LIKE** — components, keyed by the same
names:

```js
// web/blocks.js
import { createElement as h } from 'react'

export default function blocks(api) {
  function CutList({ attributes, resolve, locate, children }) {
    // `attributes` was validated against the manifest before this ran.
    return h('div', { className: 'cutlist' }, attributes.project)
  }
  return { tags: { cutlist: CutList } }
}
```

A block component is handed four things beyond its own plugin's `api`:

| | |
|---|---|
| `attributes` | already validated against the spec above |
| `resolve(path)` | a path written in the page → a URL to fetch. `source="assets/x.json"` means "next to the page", the way it reads on disk — nothing in a document should know files are served under `/api/files` |
| `locate(path)` | the same path as the WORKSPACE spells it — what you name to your own API |
| `children` | the block's body, already rendered. Only for a `flow` block |

Declare both halves or neither: a component with no manifest entry never
renders (the parser leaves the name as prose), and a manifest entry with no
component draws the "does not render yet" placeholder. Both are reported at
load rather than left to be discovered by staring at a page.

**The core wins a name collision.** A plugin declaring `callout` is refused
and named at startup — `callout` quietly meaning something else on one
instance is exactly what a closed vocabulary exists to prevent.

**Only while the plugin is ACTIVE.** Turning it off takes the words back out,
and a page written `:::yourblock` then opens read-only with a diagnostic
naming it — the honest answer, not a blank where a map used to be. A page
written in the predecessor's `{% %}` spelling instead shows the tag as text:
an unknown legacy tag is left verbatim, because a store two products share
must not have its pages refused over one instance's plugin list.

Extending the vocabulary is a deliberate act: a manifest entry, a coded
component, and a line in the skill that teaches it. It is never something a
document can do by itself.

## Needing a key

A plugin's server side sometimes needs a credential — an API key, a token.
It **declares** the name and the core hands it over at mount time:

```json
{ "secrets": ["GOOGLE_MAPS_API_KEY"] }
```

```js
// api.mjs — `opts.secrets` holds exactly what you declared, nothing else.
export default async function api(app, opts) {
  const key = opts.secrets.GOOGLE_MAPS_API_KEY
  app.get('/nearby', async () => fetchSomething(key))
}
```

The instance provides it once, wherever the value really lives:

```yaml
secrets:
  GOOGLE_MAPS_API_KEY: ${MAPS_KEY}   # the file holds the wiring, not the key
```

Three things follow from naming rather than owning, and each is the point:

- **Two plugins that need the same key declare the same name and get the same
  value.** One key, one place to rotate it, however many consumers.
- **You receive only what you declared.** The narrowing is done per plugin, so
  the declaration is a boundary rather than a comment — without it, one
  careless log would leak keys your plugin was never meant to know existed.
- **A declared secret the instance lacks is ABSENT, and said out loud at
  boot.** Never an empty string: a plugin handed `''` fails later, inside a
  request, with an error blaming the API it called.

⚠️ **Server side only.** Your `web/` code runs in a browser, where a secret is
a secret no longer. Nothing declared here ever reaches it — if your view needs
the result of a keyed call, put the call in your API and let the view ask
YOUR endpoint.

## The two core APIs a view can read

Before writing an API of your own, check whether the core already answers the
question. Two endpoints carry most of what an app needs, and using them is
what keeps every screen of this instance agreeing about the same pages.

**`GET /api/pages/index`** — every page's frontmatter, in one query:

```json
{ "entries": [
  { "path": "diy/garage.md", "title": "Le garage",
    "fields": { "type": "projet", "cat": "menuiserie", "status": "clos" },
    "finished": true }
] }
```

`finished` is the CONTENT ENGINE's verdict on whether the page's life is over
— it knows that `réalisé` closes a page while `acheté` closes only a purchase.
**Read it; never re-derive it.** A table of statuses copied into a plugin is
the one thing guaranteed to drift, and the predecessor proved it: a trip its
own app had archived was still listed as live by the screen next door. Fold
finished pages into a collapsed section rather than dropping them — what is
done is what somebody looks for when they want to know how the last one went.

**`GET /api/files`** — the workspace's non-markdown files:

- `?page=diy/garage.md` — what that page carries (its folder's files and its
  `assets/`), each with `{ path, name, bytes, modified, kind }`;
- `?under=diy` — everything below a folder, recursively;
- `GET /api/files/<path>` serves the bytes, `?download=1` forces a download.

Read-only, by design: a browser does not file things into the workspace, the
agent does. See `page-author` for the convention and for what displays in
place versus what downloads.

## Speaking the reader's language

A plugin ships its OWN words. The shell translates the shell — it cannot know
a sentence it has never seen — and what it hands you is `api.locale` (`fr`,
`en`…), already resolved from the instance's config or the browser.

```js
const WORDS = { fr: { 'to do': 'à faire', late: 'en retard' } }
const words = (locale) => {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}

export default function view(api) {
  const t = words(api.locale)
  // …and `api.locale` is also the right argument for toLocaleDateString,
  // so your dates match the shell's rather than the browser's.
}
```

Key by the ENGLISH SENTENCE, not by an identifier: the call site then reads
as what it renders, and a missing translation degrades to correct English
instead of `todo.list.empty` on screen.

**A SKIN never translates.** A livery is a look, not a language — words there
would mean the interface changed language when somebody changed its colours.

## Writing an API

```js
// api.js — a Fastify plugin
export default async function api(app, options) {
  app.get('/api/workbench/:id', async (request) => loadWorkbook(request.params.id))
}
```

An inactive plugin mounts nothing. An API that fails to import is reported and
skipped: a broken plugin costs its own view, never the server.

**Finding files: take `options.pagesRoot`, never derive it.** The pages
folder's NAME is instance configuration (`workspace.pages`) — one instance
calls it `pages`, another `memory` — so `join(options.workspaceRoot, 'pages')`
walks an empty tree on every instance that is not the reference layout, and
the failure looks like missing data, not like a bug. The host also hands you
`workspaceRoot`, `dataDir`, `pluginDir`, `pluginId` and `scheduleEnabled`;
paths, not objects — an API finds files, it does not reach the engine.

## Before you finish

1. `adestia-plugin.json` parses and matches the schema above.
2. Every path it names exists.
3. The view mounts — write a DOM test. A runtime-loaded plugin gets no build
   error to save it, so a typo in an import is found by a user otherwise.
4. The id in the manifest equals the folder name.
5. The plugin's id is added to the right list in `adestia.config.yaml`, or
   nothing will happen and nothing will say why.
