# Adestia — screens

> Product documentation. On `epic/adestia-qualite`, the inventory the epic's tranches work
> from: the screens as they are at v0.88.0, their states, and the incoherences the epic
> removes. On `main`, exactly what is built. Stable identifiers, never renumbered: `E-n`
> (screens), `Q-n` (incoherences; a closed one stays listed as closed), `P-n` and `B-n`
> (journeys and needs, `docs/parcours.md`).
>
> The night agents who make screens coherent and the visual reviewers check each screen
> against this file. Components, classes and routes are named so they can be searched.
>
> The "Lacks" column of States is an observation, not a target: the epic builds no new
> state, except a loading state where a screen shows a wrong state while it loads today
> (E-2, E-14) — coherence, not behaviour (`B-1`). Every `Q-n` is either closed by its tranche
> or written "kept: <reason>". Charter, pages, chat and plugins are built:
> the inventory and outcome paragraphs below describe their current screens.
> The numbered audit descriptions at the end are historical input, not open work.

## Format

- **Web, desktop.** One React shell (`App.tsx`): the chat rail on the left, a resizable
  gutter (`useSplit.ts`, width kept in the browser), the canvas on the right.
- **Phone.** At `--breakpoint-mobile` (820px, `tokens.css`, read by `useMobile.ts`) and
  below, the shell folds into a track of two full-width screens, **chat** and **canvas**
  (`mobile.css`, `.adestia-shell[data-screen]`). The reader moves between them by a swipe
  that follows the finger (`useSwipe.ts`), by the header buttons (`panel-right-open` icon, "Open apps", in the
  chat header, `Chat` in the canvas header), or by the edge handles (`.adestia-edge`,
  `data-side="right"` from the chat, `"left"` from the canvas). On a phone the tab strip is
  not drawn; the conversation list is the navigation. Touch screens get a 16px floor on
  fields (`tokens.css`, `pointer: coarse`) so iOS does not zoom.
- **PWA.** A web manifest per skin (`skins/*/web.manifest`) and a service worker
  (`sw/sw.ts`, rule in `sw/policy.ts`): network-first for the document and mutable files,
  cache-first for content-addressed `/assets/*`, `/api/`, `/auth/` and `/mcp` never
  touched. Offline, the cached shell opens; there is no offline screen of its own (E-21).
- **Themes and skins.** Light, dark, or system (`useTheme.ts`, chosen in E-15); four skins
  (`skins/alfred`, `dobby`, `nestor`, `skippy`) redefine tokens and may fill slots
  (hero, console band, crest, send icon, busy indicator, placeholder) through `SkinSlot.tsx`.

## Navigation

**Layout.** `.adestia-shell` = `.adestia-chat` (E-16) + `.adestia-gutter` +
`.adestia-canvas`. The canvas has an optional skin console band (`.adestia-console-host`),
a header (`.adestia-canvas__header`: on a phone `Chat`; the breadcrumb; the driver label
`.adestia-canvas__driver`, hidden on a phone; the cog E-15), and a body
(`.adestia-canvas__body`) that starts with the problems band (E-19) and then shows one
screen.

**Breadcrumb.** `nav.adestia-crumbs`: `Home`, then the trail computed by `trail.ts`
(`trailOf`) from settings, the open app and what its view published through `api.trail`,
the page or the section. A page at the root of the workspace has no folder crumb: Home, then its title (a missing or very long title is unchanged by this repair). Every crumb but the last is a button; a folder crumb resolves
through `folderRoute` (a folder an app absorbs opens that app). The same trail is sent with
each message as "where the reader is" (`screenView`).

**Hash routes** (`useRoute.ts`; the URL is the whole navigation state):

| Route | Screen |
|---|---|
| `#/` or empty | E-2 Home |
| `#/section/<folder>` | E-3 Section; replaced by the owning app's route when a plugin absorbs the folder or the folder declares `app:` |
| `#/page/<path>[?store=<id>]` | E-4 Page (E-7 when `type: collection`, E-29 when `type: meals`, a plugin layout for other claimed types); E-8 when the server refuses |
| `#/settings` | E-9 Settings mosaic |
| `#/settings/mcp[/<server>]` | E-10 MCP servers |
| `#/settings/instructions[/<path>]` | E-11 Instructions (E-12 opens over it) |
| `#/settings/delegations[/<conversation>]` | E-13 Delegations |
| `#/settings/config` | E-14 Configuration |
| `#/settings/<anything else>` | replaced by `#/settings` |
| `#/instructions` (old) | replaced by `#/settings/instructions` |
| `#/todo…` | E-22 Todo (no declared route: answers on `/<id>`) |
| `#/planif` | E-23 Planif (same) |
| `#/journal…` | E-24 Journal |
| `#/atelier…` | E-25 Atelier |
| `#/voyages…` | E-26 Voyages |
| `#/listening-post…` | E-27 Listening post |
| `#/parcours/<path>` | E-28 Parcours map |
| any other route matching an inactive plugin | E-20 Inactive app (only when a plugin is loaded without a view; an unknown route falls through to Home) |

**Dispatch order** (`App.tsx` gates, then `Canvas.tsx`), first match wins: gates (E-1: refused, sign-in, fatal,
loading) → plugin app (`openApp`, longest route first) → settings (`settingsPage`) → page
(`page`) → missing page (`pageProblem`) → section → home.

**Plugin apps.** A plugin of kind `app` (or a feature with a `view`) declares a component
and a route; the shell mounts it inside `PluginBoundary` (a throw takes down the panel, not
the shell) and hands it `pages` and `stores`. Above the view the shell draws a `Home`
(`.adestia-switch`) that always goes **home** (`closeApp = goHome`), not one step up.
Settings draws its own back, which goes **one level up** (item → page → mosaic → home) and
is labelled with the destination. Plugins with sub-screens add their own back (E-22, E-24).

## Inventory

| E-n | Name | Route or where it opens | Component file(s) | What it is for | Journeys |
|---|---|---|---|---|---|
| E-1 | Gates | instead of the shell, before `/api/instance` answers or when it refuses | `app/Gates.tsx` (`RefusedGate`, `SignInGate`, `FatalGate`, `LoadingGate`), `useInstance.ts` | Say why the shell is not there: loading, sign in (OIDC 401), not allowed (403), could not start | P-1 |
| E-2 | Home | `#/` | `app/Home.tsx`, `Brief.tsx`, `Domains.tsx`, `Tile.tsx`, `useReorder.ts`, `SkinSlot.tsx` (hero), `styles/home.css`, `tiles.css` | Greeting and "ask" button (focuses the composer), the agent's brief (« À la une »), the Domains mosaic (plugin tiles, folder tiles, the Settings tile), Arrange mode | P-4, P-11 |
| E-3 | Section | `#/section/<folder>` | `app/Section.tsx`, `sections.ts`, `styles/home.css` | A folder: header, stores, sub-rooms (`Inside`), searchable and facetable page cards, `Finished` archive | P-4 |
| E-4 | Page (reader and editor) | `#/page/<path>` | `editor/Editor.tsx`, `useAutosave.ts`, `SaveStatus.tsx`, `Reader.tsx`, `reader/`, `milkdown.ts`, `toolbar.ts`, `slash.ts`, `blockview.tsx`, `frontmatterview.tsx`, `Attachments.tsx`, `usePage.ts`, `styles/editor.css`, `reader.css`, `crepe.css` | Read a page (rendered blocks, wikilinks, attachments strip); the `pencil` control opens the Milkdown editor with toolbar, slash menu, block bars; autosave; `Done` | P-5, P-6 |
| E-5 | Page properties popover | `settings` on the frontmatter strip in the editor | `editor/PageSettings.tsx`, `pageform.ts`, `frontmatterview.tsx` | Edit frontmatter as a form drawn from declared fields | P-6 |
| E-6 | Block settings popover | `settings` on a block bar in the editor | `editor/BlockSettings.tsx`, `blockview.tsx` | Edit a `:::block`'s attributes, title, icon, frame, width; remove stray attributes | P-6 |
| E-7 | Collection page | a page with `type: collection` | `app/Collection.tsx` (`CollectionLayout`, `CollectionShell`), `collections.ts`, `styles/collection.css` | A page listing its members as cards with facets, an `Ask for a new page` button, `Everything here is finished.` | P-5 |
| E-8 | Missing page | `#/page/<path>` refused (404, 401/403, other) | `app/MissingPage.tsx`, `styles/missing-page.css` | Name the address, say which refusal, link to the folder above (to Home for a page at the root, which has none) | P-5 |
| E-9 | Settings mosaic | `#/settings` | `app/Preferences.tsx`, `Tile.tsx` | Four tiles: MCP servers, Instructions, Configuration, Delegations, with counts | P-8, P-9, P-10, P-13 |
| E-10 | MCP servers | `#/settings/mcp[/<name>]` | `app/McpServers.tsx`, `Settings.tsx` (`useMcpServers`), `styles/settings.css` | List servers with health; open one: state, per-person OAuth connect, JSON declaration editor, Save, Remove, add | P-8 |
| E-11 | Instructions | `#/settings/instructions[/<path>]` | `app/Instructions.tsx`, `styles/tiles.css` | Grouped file cards (instructions, skills, agents), search, `+` create buttons, open one in a monospace textarea, Save; delivered files read-only | P-9 |
| E-12 | Catalogue pop-in | `Catalogues` button in E-11 | `app/CataloguePopin.tsx` (`.adestia-sheet`) | Add a git repository of instructions, list its items, import, Refresh | P-9 |
| E-13 | Delegations | `#/settings/delegations[/<id>]` | `app/Delegations.tsx` | Tasks other agents delegated, grouped by caller, with state chips; open one | P-13 |
| E-14 | Configuration and restart | `#/settings/config` | `app/Configuration.tsx`, `styles/settings-pages.css` | Form of `adestia.config.yaml` from the settings catalogue; read-only notice; Save/Discard; restart bar once a restart-bound value is written | P-10 |
| E-15 | Cog menu | ⚙ in the canvas header, any screen | `app/SettingsMenu.tsx`, `Settings.tsx` (credential panel), `styles/settings.css` | Agent token state and arming flow, theme (System/Light/Dark), sign out (OIDC), build version | P-1, P-7 |
| E-16 | Chat rail | always (left; full screen on a phone) | `chat/Chat.tsx`, `ChatHeader.tsx`, `TabStrip.tsx`, `ConversationList.tsx`, `Thread.tsx`, `StatusDot.tsx`, `Composer.tsx`, `ModelPicker.tsx`, `ContextPill.tsx`, `Bubble.tsx`, `tabs.ts`, `useConversations.ts`, `styles/chat.css`, `conversations.css`, `attachments.css` | Header (crest, brand, model picker, context pill, `list` conversations, `plus` new, `panel-right-open` apps), tab strip (desktop), conversation list, thread of bubbles with live turn, MCP connect prompts, composer (attach, plugin buttons in the `More` fold, send/stop) | P-2, P-3, P-14 |
| E-17 | Permission question | above the composer while a turn waits on a permission | `chat/AskPrompt.tsx` (`.adestia-ask`) | `triangle-alert` question; neutral Refuse / Just this once, accent Always only when the engine offers a lasting rule | P-2 |
| E-18 | Signature sheet | a signature card in the thread, opened | `chat/Signatures.tsx` (`SignatureCards`, `SignatureSheet`), `app/ui/Sheet.tsx`, `styles/components.css` | State cards with icons and text; sign a held action or a standing grant in the shared sheet (or in a tab) | P-3 |
| E-19 | Problems band | top of the canvas body, any screen | `app/Problems.tsx` (`.adestia-problems--refused`, `--degraded`) | Background reading interrupted; extensions refused; running with something missing; stray `app:` | P-11, P-14 |
| E-20 | Inactive app | a plugin route whose plugin has no view | `app/Canvas.tsx`, `BackButton.tsx` (`EmptyState`, `plug`) | Say the app is not active, `Home` | P-11 |
| E-21 | Offline screen | the cached shell opened without network | `sw/sw.ts`, then `FatalGate` | Today: "Adestia could not start" with the browser's network error | P-1 |
| E-22 | Todo (and task sheet) | `#/todo`, folders `todo`, `taches` | `plugins/todo/web/app.js`, `rows.js`, `sheet.js`, `blocks.js`, `app.css` | Lists and tasks, capture field, assignees; the task sheet (`.todo-sheet`) with its own `‹`; `:::todo` blocks | P-11 |
| E-23 | Planif | `#/planif` | `plugins/planif/web/app.js`, `app.css` | Scheduled notes, clock state, last/next run | P-11, P-12 |
| E-24 | Journal | `#/journal…`, folder `journal` | `plugins/journal/web/app.js`, `model.js`, `app.css` | Journals, entries, add entry, edit with the lent editor; `‹ Journals` back link | P-11 |
| E-25 | Atelier | `#/atelier…` (no tile; reached from a folder) | `plugins/atelier/web/view.js`, `app.js` (innerHTML engine), `atelier.css` | Workbooks: cut lists, blueprints, full-screen bench mode (`.atelier-full`), piece modal (`.atelier-modal`) | P-11 |
| E-26 | Voyages | `#/voyages…`, folder `voyages` | `plugins/voyages/web/view.js`, `app.js`, `voyages.css` | Trips: day plan, suggestion tray, drag to confirm, card detail (`.vmodal`) | P-11 |
| E-27 | Listening post | `#/listening-post…`, folder `veille` | `plugins/listening-post/web/app.js`, `app.css` | Watchlist: sources, passages, dismiss | P-11 |
| E-28 | Parcours map | `#/parcours/<path>`, and the `:::parcours` block | `plugins/parcours/web/view.js`, `carte.js`, `blocks.js`, `parcours.css` | A walk as a map, markers, elevation profile, walking mode (HUD), GPX | P-11 |
| E-29 | Meals page layout | a page with `type: meals` | `plugins/meals/web/layouts.js`, `frise.js`, `meals.css` | Meal timeline (frise), drag to reorder, dish detail (`.meals-modal`) | P-5, P-11 |
| E-30 | Scan overlay | composer button "Scan barcodes" | `plugins/scan/web/chrome.js`, `scanner.js`, `scan.css` | Full-screen camera, decoded codes list, “Add to message” into the composer | P-11 |
| E-31 | Project-management blocks | `:::timeline` and `:::subproject` blocks in a page | `plugins/project-management/web/blocks.js`, `model.js`, `pm.css` | Timeline of dated sub-pages, project status pills | P-11 |

## Roles × screens × actions

No route distinguishes an owner from a user: `packages/server/src/auth.ts` resolves an
identity (`none`, `proxy`, `oidc`) and, under OIDC, only checks `allowedGroups` to **admit**
it; there is no role. Any signed-in identity can do everything. So the Owner and User
columns are the same except where the instance's configuration decides what exists.

| Screen | Owner | User | Agent (what it touches that shows here) | Calling agent |
|---|---|---|---|---|
| E-1 | sees gates | sees gates | — | — |
| E-2 | open tiles, arrange, ask | same | writes the brief, the pages behind tiles | — |
| E-3 | browse, search, facet | same | creates/moves pages (cards appear live) | — |
| E-4, E-5, E-6 | read, edit, save | same | edits the same files; a concurrent edit gives the conflict state | — |
| E-7 | add a member, open | same | writes members | — |
| E-8 | follow the folder link (Home for a root page; this link is never hidden) | same; a 401/403 shows the screen with the lock, the page itself is refused | a mistyped address it gave lands here | — |
| E-9 | open tiles | same | — | its delegations are counted |
| E-10 | add/edit/remove servers, connect | same (connect is per person) | uses the servers; health reported after a turn | — |
| E-11, E-12 | write, import, refresh | same | may write instruction files | — |
| E-13 | read | same | runs the delegated turns | creates the rows through inbound MCP `ask_<name>` |
| E-14 | edit, save, restart — only when the server got a `configPath`; else "does not expose its configuration" (the tile is still shown) | same | — | — |
| E-15 | arm the token, theme, sign out | same (token is the instance's) | — | — |
| E-16 | talk, create and archive conversations | same, own conversations under OIDC | answers, renames conversations (`rename_conversation`) | — (its threads are not in this list; they show on E-13 only, `DelegationChannel`); a refused turn (too many running) is explained to the Owner and the User alike |
| E-17, E-18 | answer, sign | same | asks permission, holds actions | may hold actions for signature |
| E-19 | read | same | background trouble from its scheduled turns | — |
| E-20 | use | same | — | — |
| E-22 | use (reads, ticks, edits, adds) | same | writes the tasks' files | — |
| E-23 | use (reads only) | same | writes the schedule notes (not this screen) | — |
| E-24 | use (reads, adds, edits) | same | writes the entries | — |
| E-25 | use (reads, ticks, moves a band) | same | writes `workbook-state.json`, `workbook-layout.json` | — |
| E-26 | use (reads, confirms, moves, dismisses) | same | writes `voyage-state.json` | — |
| E-27 | use (reads, drops a link, dismisses, restores) | same | writes `queue.json` | — |
| E-28 | use (reads) | same | — | — |
| E-29 | use (reads, reorders, sets aside) | same | writes the meals page, guarded by a revision | — |
| E-30 | use (camera; camera refusal is *shown* in the composer) | same | — | — |
| E-31 | use (reads) | same | — | — |

## States

| E-n | Has today | Lacks |
|---|---|---|
| E-1 | loading (`LoadingGate`: spinner and "Loading…"), sign-in, refused, fatal; four cards with an icon each, every string through `t()` | — |
| E-2 | loading (`.adestia-loading`, spinner and translated Loading…), normal, shared empty state (after ready), with/without brief, with/without hero, Arrange mode | — |
| E-3 | normal, shared empty/no-match states ("This section holds nothing yet." / "Nothing matches."), facet chips, finished archive, multi-store marks | loading (index-driven, renders whatever is held) |
| E-4 | reading, editing, saving/saved/"tidied", conflict (`.adestia-save--warn`), rejected, failed, read-only (`.adestia-editor__readonly` + raw source), diagnostics, drop zone, lost/ambiguous wikilink, unknown block, missing `from=` | a loading state while the page is fetched (previous screen stays); an empty-page state |
| E-5 | shared popover/fields, normal, broken frontmatter (nothing editable), unknown fields, kept-as-written | — |
| E-6 | shared popover/fields, normal, required attributes missing (a star and the text alternative), stray attributes (a named `trash-2` control each), bounded below the canvas header and the bands (anchor scrolled under the header: the panel stays at the header's edge; anchor out at the bottom or soft keyboard on a phone: the panel stays inside the viewport and scrolls internally; on a desktop an anchor out at the bottom keeps the panel inside the viewport the same way; it follows its anchor on scroll and resize) | no loading, error or offline state: it opens on a block already in the editor, so none applies; read-only mode has no settings control, so the popover cannot open |
| E-7 | normal, shared all-finished state inside a facet, count chips | empty collection state distinct from "all finished" |
| E-8 | shared empty state: 404 (`file-question`, "There is no page at this address." / « Il n’y a aucune page à cette adresse. »), 401/403 (`lock`, "This page is out of reach — the session may have expired." / « Cette page est hors de portée — la session a peut-être expiré. »), other (`circle-alert`, "The server could not serve this page." / « Le serveur n’a pas pu servir cette page. »); folder link "Open the folder above" / « Ouvrir le dossier au-dessus », or "Home" / « Accueil » for a page at the root; a very long address wraps; no loading state of its own (the screen is drawn once the server has answered; E-4 keeps the previous screen while fetching); offline after startup is unchanged (Limits kept), E-21 covers startup failure | a retry for the "server could not" case |
| E-9 | normal, tiles with Lucide icons; counts absent when unreadable | loading (tiles first render without counts; kept, a recommendation) |
| E-10 | list, empty ("None wired yet…", shared empty state), health tones each with an icon, needs-auth, connected/not, shadowed, read-only declaration, saving/saved/failed | loading; a confirmation before Remove (kept, recommendations) |
| E-11 | list, empty, no match, file open, delivered (read-only, lock icon), saving/saved/failed, the name sheet for a new skill or agent | loading (kept, a recommendation) |
| E-12 | no catalogue, reading the repository, nothing importable, error, items; in the shared sheet (Escape, focus kept and returned, bottom sheet on a phone) | — |
| E-13 | list by caller, empty (shared empty state), state chips with an icon, open conversation (read-only text, no signature card) | loading, error (kept, recommendations) |
| E-14 | loading (a spinner row), read error, not exposed (404), read-only, edited/default badges, saving/saved/failed, stale file, restart pending/asking/waiting/blocked/failed, each restart state with an icon | — |
| E-15 | token states (stored, none, refused, arming flow, failed) with an icon, theme chosen (three-icon switch), signed in, version | — |
| E-16 | empty thread, live turn (spinner or skin busy slot, counters), interrupted, error, held message, refused turn (its line now said in `en` and `fr`, kept until the next send or another conversation), tabs/list with labelled state shapes, translated shared empty list ("No conversation yet."), MCP connect prompt, composer busy/stopping/blocked, attachments and upload error | loading for the list and thread; offline/disconnected (kept: no new state under B-1; end-of-epic recommendations) |
| E-17 | translated question with `triangle-alert`, with/without lasting rule (Always absent without one) | — |
| E-18 | pending (`pen-line`), signed (`check`), denied (`x`), expired (`clock`), open in a tab; each with text; shared sheet with Escape, focus trap and return, bottom sheet on a phone | — |
| E-19 | background trouble, refused, degraded, an icon per kind; absent when nothing | — |
| E-20 | shared empty state, `plug`, translated Home action | — |
| E-21 | the fatal gate drawn, with a wifi-off icon when the failure is a thrown fetch, and the browser's network error | an offline screen; an offline banner once the shell is open (kept, recommendations) |
| E-22 | loading, empty, error, conflict, sheet (a view with a named back: « Todo ») | Escape on the task sheet does nothing (kept: it is a view, not a dialog) |
| E-23 | loading, empty, error, clock off | the notes' problem sentences (`carries both …`, `the note is empty …`) reach the screen in English on every instance (kept, Known defects) |
| E-24 | loading, no journal, empty journal, conflict, editing; back « Journals » / « Journaux » | — |
| E-25 | hub, empty (in both languages), per-section empties, piece sheet (shared sheet), full-screen bench mode with an exit that names where it leads | loading, error (kept, recommendations); the native `confirm()` before a layout reset (kept, B-1) |
| E-26 | loading, no trip, empty tray, card sheet (shared sheet), dismissed list | the native `window.alert` of a refused gesture (kept, B-1) |
| E-27 | loading, empty, no sources, error, conflict | a source's failure reason is the server's raw text (`fetch failed`), in English on every instance (kept, Known defects) |
| E-28 | map, no route in the address, no points, walking HUD with an exit that names where it leads | loading (kept, a recommendation); the walking map keeps the size it was drawn at before the walk (kept, Known defects) |
| E-29 | loading, empty, conflict, dish sheet (shared sheet) | — |
| E-30 | camera live, codes listed; camera failure said in the composer | in-overlay error state (kept: a refusal never reaches the overlay); on a phone the focus does not go back to the scan button, which the composer's fold has removed (kept, Known defects) |
| E-31 | timeline, status, no dated page, no sub-project | — |

## The plugins' screens, as built

Screens E-22 to E-31, after `adestia-qualite-plugins` (which follows the charter tranche:
tokens, `.adestia-sheet*`, `.adestia-icon`, `--z-sheet` and `--on-accent` of `docs/charte.md`
§§ 2 and 4 exist). **B-1 bound the tranche**: what a plugin does, its routes, its API, its
manifests, the prompts its ✦ buttons send to the agent and the files it writes did not change.
What changed is what is seen: the colours and sizes it reads, the form of its dialogs, the
name of its backs, and the language of its words. No state, control or screen was added or
removed; no screen was redrawn (there is no mock-up: each screen keeps its layout, and the bench
captures of § "Captures" are the reference). Where `docs/charte.md` says otherwise, this
section wins for plugin screens. The rules below are the ones the screens keep now: the token
rules live on in the header of `plugins/test/css.test.js`, which `npm run test:plugins` runs
over every plugin that ships a `web/` folder (a test compares its `CHECKED` list to those
folders), and the words in `plugins/test/words.test.js`.

### Tokens (B-9, Q-17, Q-16, Q-18)

A plugin stylesheet reads the shell's tokens by their names and defines **no** custom property
that merely renames or copies one. The vocabularies to remove, with the shell name they take:

| Plugin name (where) | Becomes |
|---|---|
| `--ink`, `--ink-soft`, `--ink-faint` (atelier, parcours) | `--text`, `--text-muted`, `--text-faint` |
| `--line` | `--border` |
| `--bg`, `--surface2`, `--sink` | `--surface`, `--surface-soft`, `--surface-sunken` (atelier's `--surface2` was `--surface-sunken`: it takes that one) |
| `--f-body`, `--f-title`, `--f-mono` | `--font`, `--font-title`, `--font-mono` |
| `--r`, `--r-s`, `--r-m`, `--r-sm`, `--r-xs`, `--r-ctl`, `--r-lg`, `--r-micro` | `--radius`, `--radius`, `--radius-lg`, `--radius-sm`, `--radius-sm`, `--radius-ctl`, `--radius-lg`, `--radius-micro` |
| `--accent-lo`, `--on-solid`, `--good`, `--crit`, `--warn`, `--proj`, `--agenda`, `--shop` | `--accent-quiet`, `--on-accent`, `--success`, `--danger`, `--warning`; `--proj` and `--agenda` were `--accent`; `--shop` was `--text-muted` |
| `--shadow-lg: var(--shadow)` (atelier) | the shell's own `--shadow-lg` |
| `--scrim`, `--on-solid: #fff` (atelier) | the shell's `--scrim` and `--on-accent` |

*Text on a tone* uses the charter's `*-text` twins (`--danger-text`, `--success-text`,
`--warning-text`, `--accent-text`) wherever a plugin sets a tone as a text colour (Q-13); a
fill keeps the bare token. A plugin's component parameter that carries a *meaning* rather than a
copy stays and is defined once in its own sheet: voyages' type colours (`--v-*`, `--tile-color`,
`--ic`), meals' `--meals-hue`, todo's `--who-color`, atelier's domain palette if it differs from
a shell token after the rename (they are derived from the accent on purpose; the colour *means*
something on a cutting diagram), parcours' `--proj` "you are here" hue (`--adestia-hue-indigo`,
kept). Such a definition names a hue or a derived mix of tokens (`color-mix(in srgb,
var(--accent) …, var(--surface))`), never a literal colour.

Rules the stylesheets of `plugins/*/web/*.css` keep afterwards (they are the exit's greps, and a
test, `plugins/test/css.test.js`, holds them):
1. every `var(--x)` without a fallback names a token that `tokens.css` defines or a parameter the
   same stylesheet defines (so `--on-accent`, `--text-xs`, `--radius-md`, `--lc` can no longer be
   used undefined);
2. no custom property whose whole value is `var(--<semantic shell token>)` (an alias); a hue renamed by its meaning (`--v-maison: var(--adestia-hue-ambre, …)`) is a parameter, not an alias;
3. no `#hex`, `rgb(`, `rgba(`, `hsl(` outside a `var(--x, <fallback>)`; `color-mix(…, #000 …)`
   is a colour in the dark too: `color-mix(in srgb, var(--text) 45%, transparent)` instead; text on
   a filled tone is `var(--on-accent)` (todo's four `#fff`);
4. no `999px`: `var(--radius-pill)`;
5. every `outline: none` sits in a rule that also paints a ring (`box-shadow: 0 0 0 2px …`), or
   goes: the global `:focus-visible` rule of the charter then shows (todo's three, E-22);
6. font sizes are the charter's steps (`--text-2xs` … `--text-2xl`), a literal size moving to the
   nearest step (at most 1 px visible, as in the shell); the sizes inside a drawing made in
   JavaScript (atelier's SVG `font-size="11.5"`, the map's canvas) are drawing units, not CSS, and
   stay;
7. `@media` widths: `820px` (`--breakpoint-mobile`, which a media query cannot read) is the
   only phone breakpoint; the 520, 560, 640, 720 and 900 px queries of plugin sheets are **kept**
   (written in AD-14 as kept, with this reason): moving them changes the layout at in-between
   widths, a visible redesign the mandate does not ask for.

Reading the tokens in the overlays: atelier's and voyages' dialogs are attached to
`document.body` (outside `.atelier` / the page), where nothing inherits; tokens live on `:root`, so
they resolve there too, and the bridge that "armed" the overlays disappears with the aliases.

### Dialogs (B-9, Q-10, Q-11)

*Sheets.* The three modals — E-25's piece (`.atelier-modal`), E-26's card (`.vmodal`), E-29's dish
(`.meals-modal`) — become the shared sheet: markup `.adestia-sheet` (scrim) > `.adestia-sheet__panel`
> `__head` (title, then a close icon button `x`), `__body`, `__foot`; the content inside is each
plugin's own, unchanged. Behaviour is the charter's: `role="dialog"`, `aria-modal`,
`aria-labelledby` the title; Escape and a click on the scrim close; focus goes to the first
control, Tab wraps, focus returns to the opener. Because a plugin imports no shell code (AD-4,
AD-8), each plugin that opens a sheet carries its own copy of the ~30 lines doing so
(`web/sheet.js` in atelier and voyages, the same few lines in an effect in meals' React view),
written to the three-line contract of `skills/plugin-author`. The close button is the icon `x` with
`aria-label` « Close » (translated, one word the three plugins already say: voyages' « Close »
button is the footer's, which stays). The sheet's phone form (bottom sheet from 820 px down) comes
with the classes: the plugins add no breakpoint for it. The close button of the sheet's head is
the one control the shared form brings (the atelier's piece and meals' dish sheets had none; Escape
and the scrim already closed them): it is the sheet, not a new function, and it is shown to
Monsieur as such.

*Full-screen modes are not sheets, and are kept so* (reason: a bench-mode view and a camera need the
whole screen; a 520 px panel would defeat them): E-25's bench mode (`.atelier-full`) and E-30's camera
(`.scan-overlay`). They take the same behaviour contract — `role="dialog"`, `aria-modal`, Escape,
focus returned to the opener — a surface from the tokens (`--surface`; the camera's letterbox
`--surface-sunken`, no `#000`), `z-index: calc(var(--z-sheet) + 1)` (they stay above a sheet, as 60
sat above 50 today), and a close control that names where it leads (§ Backs). E-28's walking HUD is
not a dialog: it is a mode of the map, left as a layer on the map.

*Close glyph (Q-11).* `✕` and `×` in plugin controls give way to the `x` icon (`<svg
class="adestia-icon"><use href="#adestia-i-x"/></svg>`, from the shell's sprite, which is on the
page; a plugin may use any icon of the charter's closed list and none outside it). Decorative
emoji in plugin chrome are left (`🖐 📄 🧭 📝` are words' companions, not the controls Q-14 names for
the shell); a **tile icon** a plugin declares in its manifest stays.

### Backs (B-9, Q-12)

A *back* is a control that leaves a level of the plugin or a mode. Every one names where it leads;
none is removed; no target changes. At v0.88.0 these are all of them in E-22 to E-31:

| Screen | Control (today) | Leads to | Becomes |
|---|---|---|---|
| all plugin views | the shell's `‹ Back` | Home | `‹ Home` above plugins and E-20, translated (`t('Home')`) |
| E-22 | `todo-back` « ‹ » (`aria-label` « Back ») in the task sheet's header | the todo list it was opened from | the icon `chevron-left` then the visible word of the list screen: « Todo » (`t('Todo')`, as the list's title says it); `aria-label` is the same words |
| E-24 | `journal-back` « ‹ Journals » | the journals list (`#/journal`) | unchanged in words (it already names its destination); its `‹` glyph becomes the `chevron-left` icon, like its sibling |
| E-25 | `#atelier-close` « ✕ » of the bench mode | the bench it was opened from | `x` icon + « Leave the bench mode » / « Quitter le mode atelier » |
| E-25 | the shell breadcrumb the atelier publishes (`crumbs`) | each level | unchanged (names already) |
| E-28 | HUD `✕`, titled « Quitter le mode balade » | the map | `x` icon + visible word « Leave walking mode » / « Quitter le mode balade » (the title's words, now the label) |
| E-30 | the camera's « cancel » and `×` per code (`.scan-cancel`) | the composer / the basket | the cancel keeps its word; it gains `aria-label` where it has none; the per-code `×` keeps today's `aria-label` « Remove <code> », not a back |
| E-26, E-29, E-25 piece | the sheet's close button | the page beneath | `aria-label` « Close »; voyages' footer « Close » stays |
| E-23, E-27, E-31 | none | — | none (E-27's `✕ dismiss` dismisses a candidate and keeps its word, `lp-quiet ✕` clears a search and gets `aria-label` « Clear »: actions, not backs) |

Drawn like the shell's back (pages tranche: a ghost small `.adestia-btn`, `chevron-left`, the
destination's name): a plugin's back is `<button|a class="adestia-btn adestia-btn--ghost
adestia-btn--sm">` with the icon and the word, so the product has one shape for a back. (This is
the one place a plugin takes the button classes; see Kept.) A back with an icon and a word never relies on the icon alone (colour or glyph alone is not a name).
`‹` characters leave plugin controls. Nothing is added as a *control* (but the sheet's close button); a word is added only where
a control had none (the todo back, the two full-screen exits).

**Names used for the screens** (one name each, for docs and for the tester): E-23 *Planif* (its tile
says « Schedules » / « Planifications »); E-27 *Listening post* (folder `veille`, « poste d'écoute »);
E-30 *Scan overlay* (the composer button says « Scan barcodes » / « Scanner un code-barres »;
« lecteur de codes » in the plan); E-29 *Meals page layout* (« frise », the day-by-day strip); E-31 the
`:::timeline` block and the `:::subproject` block (its status pills are `project-status`).

**Exact words of the names given to backs and exits** (the words the tester reads; `en` / `fr`; the
`fr` is *vous*, and a skin does not touch a plugin's words):

| Control | `en` | `fr` |
|---|---|---|
| E-22 task sheet back | « Todo » | « Todo » (the table's word for the list's title, today) |
| E-24 journal back | « Journals » | « Journaux » |
| E-25 bench mode exit | « Leave the bench mode » | « Quitter le mode atelier » |
| E-28 walking HUD exit | « Leave walking mode » | « Quitter le mode balade » |
| every sheet's close button (`aria-label`) | « Close » | « Fermer » |
| E-27 search clear (`aria-label`; the candidate's `✕ dismiss` keeps its visible word « dismiss » / « écarter » and gets only the icon) | « Clear » | « Effacer » |
| E-30 per-code removal (`aria-label`, as today's `Remove <code>`) | « Remove <code> » | « Retirer <code> » |
| E-30 overlay buttons | « Cancel » / « Add to message » (« Add 3 to message ») | « Annuler » / « Ajouter au message » (« Ajouter 3 au message ») |

The two E-30 buttons say English today on every instance (`scanner.js` has no table; the « Add N to message » sentence keeps its `%n`); the table
fixes it, and the French above is the only new French of the tranche beside the atelier's (which is
today's).

**Sheets and modes — how each opens and closes** (the sub-states of E-22, E-25, E-26, E-28, E-29,
E-30; the tester presses Escape on each):

| Sub-state | Of | Opened by | Closes by | Focus returns to |
|---|---|---|---|---|
| Task sheet | E-22 | opening a task | its back; it is a view, not a dialog (Escape does nothing, as today) | the task row |
| Piece sheet | E-25 | a piece's name in a cut list | Escape, scrim, `x` | the piece's name |
| Bench mode (full screen) | E-25 | the bench-mode button | Escape, its exit button | the bench-mode button |
| Card sheet | E-26 | a card (click) | Escape, scrim, `x`, footer « Close » | the card |
| Walking HUD | E-28 | the walk button of the map | its exit button (Escape also, as a mode of the map) | the walk button |
| Dish sheet | E-29 | a dish card | Escape, scrim, `x` | the dish card |
| Camera overlay (full screen) | E-30 | the composer's scan button | Escape, « Cancel » | the composer's scan button |

**States.** Loading, empty, error and conflict are today's, redrawn by tokens (the list per screen is
in § States above). *Offline*: no plugin has an offline state and none is added (an open shell that
loses the network shows each plugin's error state or the stale view, as today; the offline banner is a
recommendation). *Permission refused*: no plugin screen checks a role, so there is none; the one refusal
a plugin screen shows is E-30's camera permission, said in the composer (`scanner unavailable` /
« scanner indisponible »), as today. *Extreme content*: a very long task, trip, piece or dish name
truncates with an ellipsis and a `title`, never pushes a control out of its row, in the plugin's
sheet as in the shell's; a list of a hundred rows or a sheet body taller than the screen scrolls its own region
(the sheet's body), not the page, and a sheet's head and close button stay in view. Absent states
(E-25's and E-28's loading and error, E-26's, E-30's in-overlay error and E-31's, per the "Lacks" column;
E-30's overlay is only built once the camera is granted, so a refusal never reaches it and is said in the
composer) stay absent, each for that reason: B-1 allows a new loading state only where `docs/parcours.md`
names it (E-2, E-14); they are recommendations. *The text of a state* is today's string in the plugin's table
(`en` key, `fr` value) and the reference for the tester is that table and the bench captures, not a copy of
them here: copying them would make a second table to keep in step. The English words of the atelier are
written by its task, one English sentence per current French one, short, in the register of the
shell's own English; they are reviewed on the captures.

### Language (B-8, Q-8)

Every word a plugin draws goes through its `t()` in the instance's locale, in `en` **and** `fr`;
the plugin's French table says *vous* (Q-6's register rule), never *tu*. What the audit found, to be
closed by the tranche, each by the plugin's own word table (AD-8: tables stay copies, one per plugin):

- **atelier** (E-25): the only plugin with no locale at all — about 200 lines of French literals in
  `app.js` (hub, tabs, cut lists, blueprints, bench mode, errors, legends, the modal), `view.js`'s
  tile text and the SVG captions. A new `web/words.js` holds an English table keyed by the English
  sentence with the exact current French as its `fr` values (so a French instance reads the same
  words as today, B-1), `view.js` builds `t(key, vars)` from `api.locale` and hands it to the
  engine (`createAtelierApp({ …, t })`), and every literal passes through it, including the
  `title=`s, the `placeholder`s, the SVG `<text>` and the legends; `esc()` stays on user content.
  What reaches the screen from `regles.js`/`convert.js` is none: the view imports `normalise` and
  the rule helpers, not `valide`, whose messages go to the CLI and MCP tools (kept French: they are
  not a screen; the tranche checks the import list by `git grep` and writes it down).
- **parcours** (E-28): `carte.js` (29 strings: HUD, « 🧭 Suivi », profile captions, errors) is French
  only; `blocks.js` and `view.js` choose between two literals by `api.locale === 'fr'`. The
  strings go through one table (`web/words.js`) — the existing `table(locale)` of `blocks.js`
  grows into it.
- **project-management** (E-31): `blocks.js` (26 strings, empty-state sentences included) and
  `model.js` carry French literals with no `t()`; a table is added. The status words *Green, Amber,
  Red* are the owner's domain words (`model.js`) and stay as written (B-1).
- **voyages** (E-26): 108 multi-word literals, 47 through `t()`; those outside are moved in
  (the `🖐` legend, `📄 See the page`, the tray's foot, error sentences).
- **todo, journal, listening-post, meals, planif, scan** (E-22, E-24, E-27, E-29, E-23, E-30):
  already pass through a table; the tranche audits each file for a literal beside it (an `aria-label`,
  a `title`, a placeholder, a toast-like inline message) and moves it in.
- **Register** (Q-6): two *tu* lines are in French tables today and become *vous*: listening-post
  `'in your sources': 'Dans tes flux'` → « Dans vos flux », meals `… pendant que tu la lisais …` →
  « … pendant que vous la lisiez … ». The prompts the ✦ buttons send to the agent (`briefPrompt`,
  `extractPrompt`, planif's `api.ask`) are not words of the screen: they are the agent's input, in
  code and not in a table, and they stay as they are (B-1; one says *tu* to the agent — recorded
  as a recommendation, not changed here). A test (`plugins/test/words.test.js`) reads every
  plugin's French table (read as the shell reads it, through the manifest's facet modules — the test already does) and fails on a *tu*, *te*, *ton*, *ta*, *tes*, *toi* or apostrophe-elided *t'* (`t’`)
  outside a quotation, and on a sentence a plugin says with no French entry, or an entry nobody says (the English text is the
  key, so `en` needs no table); the test already covers both for the plugins that have a table, the atelier joining
  it with its table; the *tu* rule is in it too, and its list of exceptions (`TU_A_CORRIGER`) is empty.
- **Format sentences** that join a value and a word (`%n late`, `from %n`) keep their `%` placeholders:
  the table is the only place a sentence's word order is decided.

### Per screen

- **E-22 Todo.** States as today: loading, empty (no list, no task), error, conflict, task sheet.
  Tokens: `app.css` has no alias but four `#fff` (checked box, assignee chip, `hot` rail button) →
  `--on-accent`; three `outline: none` (`.todo-new__title`, the rail's input, `.todo-block__add
  input`) → the global ring; the `:::todo` block (`blocks.js`) is the same sheet's classes. The task
  sheet is not a modal (it replaces the list inside the plugin): it keeps its place and gains the
  named back. Roles: any signed-in person; ticking a task writes `done:`.
- **E-23 Planif.** Loading, empty, error, clock off: read-only; the « ask the agent » buttons keep
  their prompts; words through the table (6 `t()` of 13 literals: the rest audited).
- **E-24 Journal.** Loading, no journal, empty journal, conflict, editing (the lent editor);
  `‹ Journals` as above; the add button's `+`/`×` toggle (`journal-add__plus`) become the icons `plus`
  and `x`, keeping its `aria-expanded` meaning.
- **E-25 Atelier.** Hub, empty (« Aucun workbook… » → in both languages), per-section empties, bench
  mode, piece sheet. The engine's style bridge goes (the aliases of the table above, 38 uses); the
  piece modal becomes a sheet; the bench mode takes the contract above. Inline `style=` attributes
  in the engine's markup that hold a colour (`app.js` 487, 499, 513, 649, 1012: `background:none`,
  `var(--shop)`, `var(--warn)`) move to classes of `atelier.css` using tokens or the domain
  parameters; no literal colour remains in `app.js` either (`git grep` on `app.js` for `#hex` and
  `rgb(` is zero outside SVG attributes that read `var()`).
- **E-26 Voyages.** Loading, no trip, empty tray, card sheet, dismissed list; the sheet replaces
  `.vmodal` (scrim `rgb(8 11 18 / 55%)` + blur goes: one scrim); drag-to-confirm and the buttons'
  words unchanged; ten literal colours → type-colour parameters from hues.
- **E-27 Listening post.** Loading, empty, no sources, error, conflict; `✕ dismiss` keeps its word and
  loses the glyph for the icon; the search's clear control gets its `aria-label`.
- **E-28 Parcours map.** Map, no route in the address, no points, walking HUD; `parcours.css`'s
  second vocabulary (37 uses) removed; the map's tiles are third-party images and stay unthemed (as
  the stylesheet says); the empty marker « Parcours… » / « Route… » comes from the table. The
  page's `.parcours-dans` back-link line (`parcours-page`) names its destination: it already reads
  « in <folder> » and stays.
- **E-29 Meals.** Loading, empty, conflict, dish sheet; two literals (`#000` in the scrim, the
  shadow's `rgb(0 0 0 / 25%)` fallback) go; the dish sheet gets its close button (Escape and the
  scrim already close it today; the button is part of the shared sheet's head, see Dialogs).
- **E-30 Scan.** Camera live, codes listed, camera failure said in the composer; full-screen
  overlay as above; `999px` and `#000` go.
- **E-31 Project-management blocks.** Timeline and status pills; `999px` pill → `--radius-pill`; the
  `#fff` the stylesheet's own comment explains is replaced by the tone's text twin.

**Roles, per screen.** Owner and user see the same. Reads / writes: E-22 reads and writes (ticks
`done:`, edits the task fields, adds a task); E-23 only reads (P-12; its buttons ask the agent, which
writes); E-24 reads and writes (adds and edits entries); E-25 reads and writes (`workbook-state.json`,
`workbook-layout.json`); E-26 reads and writes (`voyage-state.json`); E-27 reads and writes (drops a
link, dismisses, restores); E-28 reads; E-29 reads and writes (reorders, sets aside, guarded by a
revision); E-30 reads the camera and writes nothing but the composer's text; E-31 reads. No control is
*hidden* by role and none is *refused* by role: the product has no role check on these screens (E-30's camera
refusal is *shown*, in the composer; E-23's clock-off state is *shown*, as a sentence, and the screen stays read-only). The
agent writes through each plugin's API or MCP server and sees none of them as a page; the calling
agent and the developer have no plugin screen of their own (the developer sees them through the
bench captures).

### Captures (the exit's proof)

`bench/scenarios/plugins-matrix.mjs` (`npm run build`, then `node bench/scenarios/plugins-matrix.mjs`;
`BENCH_OUT` names the folder, `BENCH_SKINS` narrows the skins, `BENCH_URL` plays one skin and language
on an instance already running; it starts its own otherwise) plays the bench's `plugins` seed: for each
of the four skins × `en` and `fr` × light and dark × desktop (1440×900) and phone (390×844), one
capture per plugin screen, plus each state the screen lists that the seed can show (the task sheet,
an open sheet of voyages, meals and atelier, the atelier bench mode, the walking HUD, the scan overlay
with the faked camera stream), and a keyboard check per dialog: press Escape, assert it is closed and
that focus is back on the opener. The language check is a scan in the same module: on an `en`
instance, no text node of a plugin screen contains an accented letter or one of a short list of
French stop-words (« le », « la », « des », « pour », « avec ») outside the seeded user content; on
`fr`, none of the English counterparts of the plugin tables. What the seed wrote (and the examples a
plugin ships) is content, never read as an interface word. It exits 1 naming each failing state.
The pictures are then LOOKED at, and what they showed is under « What the captures found » below.

**What the captures found** (the matrix takes 608 pictures, 19 states on each of 32 variants; every screen
and state was looked at, in light and dark, on desk and phone, across the four skins and both languages):

- *Fixed, in the plugin's own sheet.* E-26's card sheet came out half off the screen on a phone: the
  shell folds its panes with a `translateX(-50%)`, and a fixed element inside one is fixed to that pane,
  so `voyages/web/sheet.js` now carries its scrim to the body while it is open and puts it back on
  closing (the view closes it when it unmounts), and its panel keeps the `voyages` class its rules
  are scoped under (a document link in the sheet had come out in the browser's blue). E-30's panel
  with « Cancel » and « Add to message » was pushed below the screen by a tall camera image
  (`scan.css`: the video takes the space left and may shrink). E-29's dish sheet filled the shell's
  fixed 720 px for three lines (`meals.css`: the height follows the content, as the atelier's and
  voyages' do).
- *Seen and kept*, written under Known defects of `ARCHITECTURE.md`: the shell's `‹ Back` in English on
  a French instance; the English sentences planif and the listening post show from the server;
  the walking map that keeps its pre-walk size (E-28); the focus lost on closing the scan overlay on a
  phone; the workbook's own words under `en`.

### Kept, written here (B-1, mandate principle 3)

Plugin buttons, fields and empty states do **not** adopt `.adestia-btn`, `.adestia-field`,
`.adestia-empty` in this tranche, except the backs and exits of Backs and the sheet's close button (B-9 asks for the tokens and the shared dialog; the charter's
classes are available to plugin authors, not imposed on the ten screens: a visible redesign of every
button is a recommendation); the five stylesheet breakpoints other than 820 px; the prompts sent to
the agent; the native `confirm()` of E-25 (« Abandonner votre calepinage… », reset of a layout) and the
`window.alert` of E-26 (refused or impossible gesture): replacing a blocking native question with a
sheet changes the flow (the answer becomes asynchronous), which is behaviour, so Q-20 is kept for the plugins (*kept: the flow would change*) and written as a defect; `skills/` of the plugins (they describe the agent's world, not a screen).

## The charter's screens, as built

Screens E-1, E-9 to E-15, E-19, E-21, after `adestia-qualite-charte`. Every screen: the
components of `docs/charte.md` § 4, icons of its § 2, words through `t()` in the instance's
locale, a visible focus ring, both themes, the four skins. **B-1 bound the tranche**: the
words of today stay (a label is renamed only by `B-8`'s language rule), no state was added
except the loading state of E-14 (Q-23; E-2's is the pages tranche's), no control was added
or removed (the E-11 name sheet takes over the prompt's two buttons). Screens whose
today-state is richer than this section (E-4 …) are not here.

**States, for every screen of the tranche.** Loading, empty, error, offline and
extreme content are *today's*, redrawn: a state the screen has is drawn with the
shared components (spinner, empty state, alert icon, `--tile-color`); a state it lacks
(E-9 counts loading, E-10/E-11/E-13 loading, E-13 error, E-15 token loading) stays
absent and is listed in the epic's improvement recommendations. Long content (a very long
server name, instruction path, caller name) truncates with an ellipsis and a `title`,
never wraps a control out of its row. Offline: only the first start (E-21); an open shell
that loses the network keeps today's behaviour.

**E-1 Gates.** One centred card (`--surface-raised`, `--shadow`, 420 px max, 24 px
padding): an icon above the title, the sentence, the actions that exist today.
- *Loading* (exists): spinner icon + "Loading…" (translated).
- *Sign in (OIDC 401)*: lock icon, today's sentence, today's sign-in link drawn as an
  accent button, strings translated.
- *Refused (403)*: alert icon, the server's reason, today's "Sign out" as a ghost button,
  strings translated.
- *Fatal*: alert icon, "Adestia could not start", the error text in `--text-muted`.
Roles: the same for everyone. Phone: the card is full width with 16 px margin. No retry
control exists.

**E-21 Offline.** The cached shell opened with no network reaches the Fatal gate with the
browser's network error; it is drawn as that gate, with a wifi-off icon when the failure
is a network failure (a thrown fetch, not an HTTP status). Same words. A dedicated offline
screen and an offline banner are recommendations, not built.

**E-9 Settings mosaic.** The four tiles keep their order, labels and counts; tile emoji
became Lucide icons (plug, book-open, sliders-horizontal, handshake) on the tile plate.
Counts absent when unreadable, as today. The Configuration tile stays (Q-21).

**E-10 MCP servers.** Buttons are `.adestia-btn`, labels unchanged: "Save" (accent),
"Remove" (danger), connect (neutral), "Add a server" (icon `plus` beside its label); no
confirmation step is added. The JSON declaration is a `.adestia-textarea`, monospace.
Empty state shared (today's sentence). Health tones keep colour **and** gain an icon
(check, circle-alert, loader-circle, wifi-off). Fallback errors translated (Q-4).
Roles: any signed-in person; "connect" is per person, as today.

**E-11 Instructions.** Group headers with an icon each; search is a `.adestia-input` with
a `search` icon; the three `+` create buttons keep their labels and gain a `plus` icon;
the name asked for a new skill or agent is asked in a small sheet with a field instead of
`window.prompt` (Q-20): same question, same answer rule — Enter confirms, Escape or an
empty/slug-less name does nothing, as a cancelled prompt does today; no new validation
state. The editor textarea is `.adestia-textarea`; "Save" accent; delivered files keep
their read-only mark and gain a lock icon.

**E-12 Catalogue pop-in.** `<Sheet>` (Escape, focus trap and return, bottom sheet on a
phone); the repository field is a `.adestia-field`; "Import" and "Refresh" are buttons;
error in the field's error slot, translated.

**E-13 Delegations.** Grouped by caller as today; state chips keep their words and
colours and gain an icon; empty state shared. Nothing else is added.

**E-14 Configuration.** Wrapped like its siblings (`--tile-color` on loading, error and
empty renders, Q-21). A loading state (a spinner row inside `.adestia-prefs__page`) before
the form (Q-23) — the one state the tranche added. "Save" accent / "Discard" ghost /
"Restart now" danger. The restart bar keeps its states (pending, asking, waiting, blocked,
failed) and each gets an icon. Fields are `.adestia-field`s; badges keep their text.

**E-15 Cog menu.** `<Popover>` anchored to a `settings` icon button (aria-label as the
cog's today). Content top to bottom, as today: the agent credential block (today's state
lines with an icon; "Arm a token" / "Renew the token" flow; the `Armed` state), the theme
switch (three icons; accessible names System / Light / Dark as the text buttons had), "Sign
out" (ghost, `log-out`, only under OIDC; hidden otherwise as today), the build version.

**E-19 Problems band.** Icon per kind (circle-alert refused, triangle-alert degraded), text
in the `*-text` tokens, band background a 4 % tint to keep the composed contrast at AA;
present only when there is a problem.

**Roles.** Owner and user see the same on these screens (no role check exists); the agent
(a peer) sees none of them as a page — its work shows on E-13 and E-19; E-13 is
read-only for everyone.

**State strings and icons.** Every text of a loading, empty, refused or error state is
today's, through `t()`; only its drawing changes. Icons by state: ok / connected / done /
saved = `check`; working / connecting / waiting / asking / pending = `loader-circle`;
failed / refused / blocked = `circle-alert`; restart pending (E-14) = `rotate-ccw`; no token (E-15) = `key-round`; needs auth / degraded = `triangle-alert`;
unreachable / offline = `wifi-off`; delivered / read-only = `lock`. Refusals keep today's
visibility: E-14 without `configPath` shows its tile and says it does not expose its
configuration; E-10 not connected shows the needs-auth tone; E-11 delivered files are shown
read-only; "Sign out" is hidden outside OIDC. An open shell that loses the network keeps
today's behaviour (no banner). "The recommendations" are the list the epic's mandate
writes at its end (discussion of `adestia-qualite`), where the absent states and controls
above are proposed.

**E-11 name sheet.** The prompt's text is the sheet's title (today's string), its field
starts empty, and the prompt's native OK / Cancel become the sheet's two buttons (same
meaning, not a new control). Confirm with an empty name (or one the existing `slug()` reduces to nothing) closes
the sheet without creating anything, as OK on an empty prompt does today; Escape and Cancel close it; a name that
exists is handled by what `start()` does today.

**E-21** is seen by everyone, before any sign-in. The theme switch's three icons carry
today's words as accessible name and tooltip (System / Light / Dark). The agent's effects
visible on these screens are those of the matrix above (E-10, E-11 files it writes, E-13,
E-19).

**Developer** (runs the bench): no screen of its own here; it sees these through the bench
captures.

**B-9** (back labels) belongs to the pages and plugins tranches, which own the backs;
E-17 and E-18 to the chat tranche.

## The chat’s screens, as built

Screens E-16, E-17, E-18 (and the thread of E-13 where it shares `Bubble`), after
`adestia-qualite-chat`. The tranche uses what `adestia-qualite-charte` built: the
components of `docs/charte.md` § 4, the icons of § 2, the request helper (AD-11) and
the type scale. **B-1 binds this section**: words of today stay (a string is changed only by B-14 for the refused turn, and
by `B-8`'s language rule), no state, control or gesture is added or removed, the
conversation gestures stay the five of P-2 step 9 (create, archive, open, reorder, close).
Where `docs/charte.md` says otherwise, this line wins.

**Icons** (`docs/charte.md` § 2). Header: `list`, `plus`, `panel-right-open`;
tab/list archive: `archive`; every close/remove: `x`; attach and held bubble:
`paperclip`; tool trace: `chevron-right` / `chevron-down`; stop: `square`.
Signature states use `pen-line`, `check`, `x`, `clock`; the sheet origin uses `lock`,
its tab link `external-link`. Send uses the skin's `sendIcon` slot, or `arrow-up`
by default. Icon-only controls take their accessible names and tooltips through `t()`.

**Buttons and fields.** Every `adestia-ib` icon button, the tab tools, `adestia-connect__go`,
the signature actions and the three answers of E-17 are `.adestia-btn` (icon-only for the
tools, neutral for "Refuse" and "Just this once", accent for "Always" which keeps its place
and its absence when the engine offered no rule); the composer's textarea keeps its
auto-grow and takes the field's border and focus ring. Skins keep restyling these through
tokens; a skin that restyles `.adestia-ib` (it exists today) keeps working because the
class stays on the icon buttons beside `.adestia-btn--icon`.

**Dialog.** E-18 uses `<Sheet>` (scrim `--scrim`, Escape, focus trap and return, bottom
sheet below `--breakpoint-mobile`): the signature ceremony iframe is its body, the origin
(`lock` + host) and "Open in a tab" its head. The close control is the sheet's. All `.adestia-sheet*` rules, including the signature-specific `__frame`, `__hint`,
origin and tab link, live in `styles/components.css`; `chat.css` contains none.

**States, as built.** E-16: the empty list says "No conversation yet." through `t()`
in an `<EmptyState>`; the empty thread keeps its blank; the working indicator is the skin's
`busy` slot or the shared spinner icon with the counters; the interrupted note, the error
line (a turn the server refuses because too many turns already run keeps its line, under the message that was refused, which stays in the thread; the line says "Turn limit reached (N at a time) — try again in a moment." in English and "Limite de tours atteinte (N à la fois) — réessayez dans un instant." in French, N being the server's limit, for the Owner and the User alike; it stays when the conversation is read again, and goes at the next send or when the user opens another conversation; a turn that fails with no answer from the server keeps the error line the chat already draws for it, with the same words as today, under the sent message, and keeps it after the reread as long as the refusal's line stays; other HTTP refusals keep the server's text), the held bubble (`paperclip` + names when the message is attachments only), the
unread/running/idle dots (colour and a shape, not colour alone), the MCP connect prompt, the
composer busy/stopping/blocked and the upload error keep their words and places; the one line whose words, length and language change is the refused turn's. **No
loading or offline state is added** for the list or the thread (Lacks column of E-16: listed
for the end-of-epic recommendations). E-17: the question card keeps its three answers and
the "No lasting rule" line; it takes `triangle-alert`. E-18: pending, signed, denied,
expired, open-in-a-tab keep their words; each gets its icon above. E-13: a delegated conversation is read-only and has no composer (P-13 step 7), so its conversation reads as text only: a signature request in the transcript is not drawn as a card and nothing replaces it; the ceremony belongs to the calling agent's user. The refusal for too many turns is a capacity refusal, not a permission one: no "extreme content" or "permission denied" state applies to it.

**Strings.** Every visible string, `aria-label`, `title` and `alt` under `chat/` goes
through `t()`: "New conversation", "Open apps", "Working", `Remove <name>`, the context
pill's title, "tool call(s)" in the trace summary (plural by the locale's table, one key
per form), "until", "Open in a tab", "No conversation yet.". The two *tu* lines of the
signature words are the charte tranche's (Q-6). A skin's words are the charte tranche's.

**Roles.** Same as E-16 to E-18 in § Roles: nothing changes.

**Phone.** The header keeps one row (brand, model picker, context pill, three icon
buttons); the brand and context count keep their width while the model picker yields first.
At 390 and 360 px the model picker truncates with an ellipsis and a `title`;
the context count stays fully readable without pushing the buttons out.
The conversation list is full width; every target is at least 24 × 24 px
(`docs/charte.md` § 5).

## Seeded data for captures

What a capture sweep (target of B-3) needs so every state above shows; what to seed, not how.

- **Instance configs**: one with `auth: none`; one with OIDC (signed in, signed out, refused
  group) for E-1 and sign-out in E-15; one started with a `configPath` on a writable file,
  one read-only, one without `configPath` (E-14); `locale: en` and `fr`; each of the four
  skins; an instance with no plugin and no page (empty E-2).
- **Workspace pages**: a section with sub-folders, page cards with tags/roles/status,
  finished pages, two stores carrying the same name (store marks); a page using every core
  block (lists, `:::list`, file listing, cards, tables, quotes, images, a lost and an
  ambiguous wikilink, an unknown block, a `from=` naming an absent plugin); a page whose
  vocabulary is broken (read-only + diagnostics); a page with attachments; a page with
  frontmatter of each field kind and an unparseable frontmatter; a collection page with
  members, and one with every member finished; a missing page address (404) and an
  out-of-reach one (403); a folder with a stray `app:`.
- **Brief**: a brief file with four items of different target types, and none.
- **MCP**: servers in each health state (connected, failed, needs-auth, pending,
  disabled), one OAuth server per person (connected and not), one declared in the config
  file (read-only), one shadowed; and no server at all.
- **Instructions**: instruction, skill and agent files, a delivered (plugin) file, an
  imported file with a source; a catalogue with importable items, one with none, one
  unreachable; and an empty instance.
- **Delegations**: tasks from two callers in running, done and failed states; and none.
- **Credential**: token stored, none, refused upstream.
- **Conversations**: none; several with each state dot (running, unread, idle), open tabs,
  archived ones; a thread with tool outcomes, an interrupted turn, an error, a held
  message, a pending permission question, signature cards in each state, an MCP connect
  prompt; a long context for the context pill's warn and hot levels; several models.
- **Problems**: a refused plugin, a degraded one (missing secret, stale source),
  background trouble.
- **Plugins**: todo lists with tasks (assignees, done, a task with a body); planif notes
  (valid, invalid, clock off); journals with entries and an empty journal; an atelier
  workbook; a trip with confirmed, suggested and dismissed items; listening-post sources
  and passages; a `.parcours.json` referenced by a page; a `type: meals` page; dated
  sub-pages for the timeline and status blocks; a scan feature enabled with a fake camera
  stream; a route of a plugin that is loaded without a view (E-20).
- **Network**: the shell cached by the service worker, then the network cut (E-21).

## The pages' screens, as built

E-2 to E-8 and E-20 use the components of `docs/charte.md` § 4, the Lucide
sprite (§ 2), translated shell words and the token scales (AD-13). Author text,
frontmatter values, block names and `ico` remain data, in the author's words.
The shell passes `t` and the instance locale into the editor and the reader;
`editor/dom-icon.ts` gives Milkdown's DOM bars the same sprite as React.

**Shell chrome (B-9).** `BackButton.tsx` draws `chevron-left` and a destination,
with `.adestia-switch.adestia-btn--ghost.adestia-btn--sm`. Above a plugin and
in E-20 it says `Home` (`Accueil` in French) and goes home. In `CanvasHeader`
on a phone it says `Chat`, with the translated accessible name `Back to the chat`.
Settings goes one level up, labelled `Home`, `Settings` or the settings page's title.
`Breadcrumb` is translated too. Plugins' own backs remain their tranche's.

**E-2 Home.** `Home` composes the greeting or skin hero, ask bar, `Brief` and
`Domains`. The ask bar uses `search` and labels its shortcut `Ctrl K` off Apple
platforms, `⌘K` on Mac/iPhone/iPad; either Ctrl+K or Meta+K focuses the composer.
While `useInstance.ready` is false, the brief and mosaic are replaced by
`.adestia-loading` (`role="status"`, `loader-circle`, `Loading…` / `Chargement…`).
The greeting/hero stays visible. Ready means plugins loaded and the first index
request settled, including failure; there is no timeout. Once ready, Settings is
always drawn; with no app tile or section, `EmptyState` adds `folder-open`, an
empty sentence and the configuration/page hint. `Brief` says `Highlights` in
English, `À la une` in French; its `rotate-ccw` button sends `Refresh my highlights`
or `Rafraîchis ma une`. Arrange/Done use shared buttons; tiles keep their focus ring.

**E-3 Section.** Stores and sub-rooms precede cards. Past five pages the search
has a `search` icon and `.adestia-input` with a visible focus ring. Facet buttons
are `.adestia-chip` with `aria-pressed`. Finished pages fold under a chevron
summary. Empty and no-match use `EmptyState` with `folder-open` and `search-x`.

**E-4 reading.** The edit control is `pencil` (`Edit` accessible name and tooltip).
Metadata, block frames and attachments keep their content; attachments have file
icons and names with tooltips. `reader/Note.tsx` draws translated block notes as
`.adestia-empty--inline`, retaining `.adestia-block-note` as a layout/skin hook.
Lost references, absent files, unknown blocks and missing providers use this form.
Read-only pages show `lock`, raw source and diagnostics; each diagnostic sentence is translated by its `code` into the instance's language, with the block name, attribute and values left as the author wrote them (a diagnostic with no known code is drawn as received).

**E-4 editing.** Toolbar, slash menu and DOM block bars use translated words and
sprite icons: `grip-vertical`, `code`/`eye`, `settings`, `trash-2`. Milkdown's surface
uses tokens in `crepe.css`; the title has a focus ring and Done is accent.
`SaveStatus` shows `loader-circle` while saving, `check` when saved or tidied,
`triangle-alert` on conflict and `circle-alert` on rejection/failure. A conflict
keeps the editor and text open and stops saves; the words and drop-zone prompt
follow the instance locale.

**E-5 and E-6.** Page properties and block settings are shared `Popover`s anchored
to their settings controls. Escape or an outside click closes them and returns
focus to the anchor. Fields use `.adestia-field` and shared controls; Close uses
`x`. Required attributes have a textual alternative to the star; stray attributes
have named `trash-2` controls. Both forms speak the instance locale. Icon examples
in placeholders remain author data. At 360 px the block bar and toolbar wrap;
popovers stay inside the viewport with `--space-2` (8 px) margins and scroll internally. At any width a popover also stays below the canvas header and the bands above the page (problems band E-19, skin console): it never covers them, and it follows its anchor when the page scrolls or the window is resized. When the anchor scrolls up under the header, the panel stays at the header's lower edge and closes nothing; with no band present it takes the header's edge alone.

A very long diagnostic wraps in the save status instead of being cut. A save the vocabulary refuses shows, in the save status of E-4 (`Not saved: …`; in French `Non enregistré : …`), the first diagnostic in the instance's language, the editor staying open with its text. A diagnostic with no known code is drawn as received, in the save status as in read-only mode. Each sentence of `content`'s validation has its French twin, with the block name, key and values as the author wrote them; for example `Block ":::note" needs content.` reads `Le bloc « :::note » a besoin de contenu.` and `":::note" has no attribute "x"; it will be ignored.` reads `« :::note » n'a pas d'attribut « x » ; il sera ignoré.`

A page whose frontmatter lines end in `\r\n` shows the same fields as one ending in `\n`: the cards and facets of E-3 and E-7 (`status`, `role`, `cat`) and the notes list of E-23 read them as the editor does. The bench scenarios of this repair (`bench/scenarios/`, files named for the root breadcrumb, E-6 at 1440 px, the translated diagnostic and a CRLF page) are in the repository next to the screens they judge.

**E-7.** Members follow the collection text. Facet cards carry shared count chips;
Ask for a new page uses a small button with `plus` when `of:`, `into:` and the
agent callback are present. Inside a facet, all finished uses
`EmptyState` with `check`. An empty collection has no additional distinct state.

**E-8.** `EmptyState` names the path, with `file-question` for 404, `lock` for
401/403 and `circle-alert` otherwise. Its ghost folder link uses `folder-open` and goes to the folder above the address; for a page at the root of the workspace, which has none, it goes Home.
There is no retry control.

**E-20.** `Canvas` shows `EmptyState` with `plug`, `That app is not active on this
instance.` and the Home action when a matched, loaded plugin has no view (for
example, its view module failed to import). An unknown or disabled plugin route
falls through to Home; E-19 reports browser module refusals.

**Limits kept (B-1).** E-3 has no loading state; E-4 keeps the previous screen
while fetching and has no special empty-page state. E-7 has no distinct empty
collection state and E-8 has no retry. Offline after startup keeps existing
behaviour; E-21 covers startup failure. These remain end-of-epic recommendations.
Roles are unchanged: every admitted person can read/edit/save; the agent writes
the same files and may cause the conflict state. There is no screen for a calling agent.

**Capture tools.** `bench/scenarios/pages-matrix.mjs` runs the four skins × en/fr ×
light/dark × desk/phone. `pages-states.mjs` includes held-index loading, section,
collection, missing-page cases and E-20; `pages-editor.mjs` includes blocks,
attachments, read-only diagnostics, conflict and E-5/E-6.
`pages-editor-narrow.mjs` separately checks the default skin at 360×740, en/fr.

## Known incoherences (historical input; outcomes below each item)

The descriptions record the state before the epic. **closed** marks the resolved
portion; **kept: reason** names what B-1 deliberately leaves.

1. **Q-1 — Native unstyled buttons.** Save/Discard/`Restart now` in `Configuration.tsx`
   (`.adestia-config__bar`, `.adestia-config__restart-bar` style the bars, not the
   buttons), Save in `Instructions.tsx` (`.adestia-instructions__bar`) and in
   `McpServers.tsx` (`.adestia-mcp__bar`) are browser-default buttons. `.adestia-mcp__drop`
   sets only border, background and colour (no padding, radius, font, cursor). E-10, E-11,
   E-14.
   **closed** by `adestia-qualite-charte`: the Save, Discard, `Restart now`, Remove and connect buttons of E-10, E-11 and E-14 are `.adestia-btn`s, and `.adestia-mcp__drop` is gone with the native drop-zone look; no browser-default button is left on those screens.
2. **Q-2 — No shared button.** About 35 distinct classes on `<button>` in the shell's TSX
   alone (plus descendant rules such as `.adestia-settings__actions button`,
   `.adestia-instructions__tools button`), and three looks for "Save":
   `.adestia-editor__save` (E-4), `.adestia-settings__actions` last child (E-15), native
   (Q-1). All screens.
   **closed** for the shared piece: `.adestia-btn` and `<Button>` exist (`docs/charte.md` § 4) and every button of E-1, E-9 to E-15 is one, with one "Save" look there. **closed** for the pages: editor and home actions use shared buttons. **closed** for the chat: rail, composer, permission and signature actions use the shared button family; the skin send slot remains its own.
3. **Q-3 — Languages mixed in the editor.** Hard-coded French: `BlockSettings.tsx` (whole
   form, `Fermer`), `blockview.tsx` (`Déplacer le bloc`, `Réglages du bloc`, `Supprimer le
   bloc`, `Aperçu`/`Modifier`), `toolbar.ts` (`Blocs de texte`, `Liste à puces`…),
   `Reader.tsx` notes (`Aucun fichier ici.`, `Rien sous cette page.`, `rien ne porte ce nom
   ici`). Hard-coded English in the same screen: `Editor.tsx` `SaveStatus` and the
   read-only notice, `Reader.tsx` (`this page was not found`, `this block does not render
   yet`). E-4, E-6.
    **closed**: the editor chrome, settings forms, save status, attachments and reader notes use the instance translator; author data stays untouched (AD-13 e).
4. **Q-4 — Untranslated shell strings.** `Gates.tsx` (`LoadingGate` "Loading…" though the
   key exists, `SignInGate` entirely, `RefusedGate` paragraph and "Sign out"); `App.tsx`
   `‹ Back`, `‹ Chat`, `aria-label="Breadcrumb"`; `Chat.tsx` "No conversation yet." (an FR
   entry exists, `t()` is not called), "New conversation"/"Open apps" aria-labels,
   "Working"; `ContextPill.tsx` title; `Composer.tsx` `Remove <name>`; `Settings.tsx`,
   `McpServers.tsx`, `CataloguePopin.tsx` fallback errors (`refused (404)`, `request
   failed`); `SettingsMenu.tsx` "Adestia" build line is fine (a name). E-1, E-10, E-12,
   E-15, E-16, E-20.
   **closed** for the charter's files: `Gates.tsx` (all four gates), `Settings.tsx`, `McpServers.tsx` and `CataloguePopin.tsx` say every string through `t()`, and their fallback errors come from `requestJson` with a translated fallback (`request failed (%n)`). **closed** for the shell chrome: `Canvas` and `CanvasHeader` translate Home, Chat and Breadcrumb. **closed** for the chat: `Chat.tsx`, `ChatHeader.tsx`, `ConversationList.tsx`, `Thread.tsx`, `Bubble.tsx`, `ContextPill.tsx`, `Composer.tsx` and `Signatures.tsx` use `t()` for shell words, accessible names and tooltips, including upload network fallbacks from the request helper.
5. **Q-5 — Hard-coded French in the shell.** `Home.tsx` brief heading « À la une » and the
   refresh prompt `Rafraîchis ma une`, shown on an `en` instance. E-2.
    **closed**: Brief uses Highlights / À la une and translates the refresh prompt.
6. **Q-6 — Two registers.** `i18n.ts` speaks *vous* everywhere except the signature lines
   (`Une action attend ta signature.`); skin words use *toi* (skippy) and *vous* (dobby).
   The rule (`B-8`, `B-10`): the shell's and plugins' words say *vous*, so the signature
   lines change; a skin keeps its persona's register, so skippy's *toi* stays. E-18, E-2.
   **closed**: `i18n.ts` has no *tu* form left (the signature lines say *vous*) and skippy keeps its own *toi*, as its persona does.
7. **Q-7 — Skins carry words.** All four `skins/*/skin.js` hard-code French (placeholder,
   greetings, busy label), against `i18n.ts`'s own rule that a skin never translates. E-2,
   E-16.
   **closed**: the shell hands each `skin.js` `{ locale }` and the four skins carry their words in `en` and `fr`, each in its persona's voice; a skin that ignores the locale still loads, in French.
8. **Q-8 — Plugins with no or ad-hoc locale.** Atelier is French-only (no `api.locale`, no
   table) and uses `confirm()`; parcours and project-management switch with inline
   `fr ? … : …`; others use a `WORDS` table — three patterns. E-25, E-28, E-31.
   **closed** for the plugins' screens: every plugin says its words through a table keyed by the English sentence (the atelier has its own `web/words.js`; parcours and project-management read one table each), the French is *vous*, and the matrix finds no French on an `en` instance and no table word in English on a `fr` one. **kept: what is not a word of the screen** — the atelier's rule messages (`regles.js` › `valide`, which go to the CLI and the MCP tools), the prompts sent to the agent, the owner's status words *Green, Amber, Red*; and the sentences the server hands the screen as data (E-23's problems, E-27's failure reasons), under Known defects.
9. **Q-9 — Undefined tokens.** `--text-xs` (`chat.css`, three uses, no fallback),
   `--radius-md` (`conversations.css`, fallback 8px), `--on-accent` (`voyages.css`, fallback
   `#fff`). `atelier.css` reads `--lc` that nothing sets (rule `.lcard .bar i`, also unused
   markup). E-16, E-26, E-25.
   **closed** for the shell's tokens: `--text-xs` and `--on-accent` are defined in `tokens.css`, so the `--text-xs` uses of `chat.css` and the `--on-accent` of `voyages.css` resolve. **closed** for the chat: `chat.css` and `conversations.css` use defined tokens; the undefined `--radius-md` use is replaced by `--radius-sm`. **closed** for the plugins: no plugin sheet reads `--lc` any more.
10. **Q-10 — Seven dialog implementations.** `.adestia-sheet` (E-12, E-18; scrim
    `rgb(0 0 0 / 0.45)`, z 100), `.adestia-blockset` (E-5, E-6; popover), `.adestia-cog__panel`
    (E-15; z 40), `.meals-modal` (E-29; `color-mix(#000 45%)`, z 40), `.atelier-modal`
    (E-25; `var(--scrim)`, z 50) and `.atelier-full` (z 60), `.vmodal` (E-26; `rgb(8 11 18 /
    55%)` + blur, z 60), `.scan-overlay` (E-30; `#000`, z 100). Escape is handled by the cog,
    the signature sheet and the block bar; **not** by `CataloguePopin.tsx`. Only one scrim
    uses `--scrim`.
    **closed** for E-12: `CataloguePopin.tsx` is the shared `<Sheet>` (one scrim `--scrim`, one z-index, Escape, focus trapped and returned, a bottom sheet under 820 px), and the cog menu (E-15) is a `<Popover>`. **closed** for E-18: `SignatureSheet` uses `<Sheet>` with the same scrim, Escape, focus trap and return, and phone layout; its iframe and hint rules also live in `components.css`. **closed** for E-5 and E-6: shared Popover, Escape/outside close and focus return to the settings anchor. **closed** for the plugins: the piece (E-25), card (E-26) and dish (E-29) dialogs are the shared sheet (`.adestia-sheet`, one scrim, `--z-sheet`, a close button, Escape, focus returned), each carrying its own copy of the contract (AD-14 b); `.meals-modal`, `.atelier-modal` and `.vmodal` are gone. **kept: E-25's bench mode (`.atelier-full`) and E-30's camera (`.scan-overlay`)** as full-screen modes, one z-index above the sheet, with the same contract (dialog, Escape, focus returned) and an exit that names where it leads.
11. **Q-11 — Close glyph.** `✕` (`Chat.tsx` connect hide, `Signatures.tsx`,
    `CataloguePopin.tsx`, `blockview.tsx`, listening-post, meals, atelier, parcours, voyages)
    vs `×` (`Chat.tsx` tab close, `Composer.tsx`, `PageSettings.tsx`, `BlockSettings.tsx`,
    scan, journal).
    **closed** for the plugins: no control of E-22 to E-31 draws `✕` or `×`; the close controls are the `x` icon (the `×` left in the atelier's and the fiches' text is a dimension sign).
    **closed** for the charter's screens: the close controls there are the `x` icon, and the new/edit/restart glyphs are icons too. **closed** for the chat: tab close, MCP dismiss, attachment remove and signature sheet close all use `x`. **closed** for the pages: block removal is `trash-2`, popover close is `x`.
12. **Q-12 — Two ways back.** The shell's `‹ Back` above every plugin view goes home, and
    plugins add their own: `journal-back` `‹ Journals` (E-24), `todo-back` `‹` in the task
    sheet (E-22). The shell's back goes home while settings' back goes one level up.
    `‹ Back` is untranslated (Q-4). No two backs lead to the same place. The rule (`B-9`): each
    back is labelled by its destination (the shell's says home); none is removed; no target
    changes.
    **closed** for the plugins: every back of E-22 to E-31 names where it leads (« Todo », « Journals », « Leave the bench mode », « Leave walking mode », see Backs) and the sheets' close button says « Close ». **closed for the shell**: BackButton labels Home above plugins/E-20, Chat on a phone, and the destination in settings.
13. **Q-13 — Contrast.** `--text-faint` is used as text colour about 100 times and reaches
    2.3–2.6:1 in light, 2.6–3.1:1 in dark. In light, `--accent` (3.4–3.8:1), `--success`
    (3.0–3.4:1), `--warning` (3.3–3.8:1) and `--danger` (3.9–4.4:1) used as text are under
    4.5:1; `--accent-text` on `--accent` (user bubble, send button) is 4.3:1. All screens.
    **closed** for the base palette and the four skins: `--text-faint` is corrected in both themes, the `*-text` twins carry the text uses of the fills, and `contrast.test.ts` prints every pair in `docs/charte.md` § 5 — all at their threshold, no departure in § 6. The settings, entry and pages sheets and `shell.css` use the twins. **closed** for chat and plugins: text uses of the semantic fills use their `*-text` twins; filled controls keep the fill and `--on-accent`.
14. **Q-14 — No icon set.** Emoji on tiles and headers (`🔌 📓 🎛 🤝 ⚙`), Unicode glyphs
    in controls (the chat was `▤ ＋ ▥ ■ ↑`), and `⚙ ✎ ↺ ‹` elsewhere; `glyphs.ts` with two SVGs, inline SVG in `Home.tsx`. `⌘K` is printed on the home ask button on
    every platform though Ctrl+K is what works off a Mac; Ctrl+K already works everywhere
    (`Home.tsx` accepts `metaKey` or `ctrlKey`), so showing Ctrl+K off a Mac is a label, not a
    behaviour. E-2, E-9, E-16.
    **closed** for the charter screens (E-1, E-9 to E-15, E-19) and **closed for E-2 and the pages**: sprite icons replace product glyphs; the ask bar prints Ctrl K off Apple platforms and ⌘K on them. **closed** for E-16 to E-18: the rail, composer, permission and signature controls use `<Icon>`; `ArchiveGlyph` is gone, and the skin send slot stays.
15. **Q-15 — Five empty-state styles in the shell.** `.adestia-empty` (E-2, E-3, E-7,
    E-20), `.adestia-instructions__empty` (E-11, E-10, E-12, and E-14's error),
    `.adestia-deleg__empty` (E-13), `.adestia-conversations__empty` (E-16),
    `.adestia-block-note` (E-4); each plugin adds its own (`.pc-vide`, voyages `.empty`…).
    **closed** for the settings screens and **closed for E-2, E-3, E-7, E-8 and E-20**: shared EmptyState; E-4 notes use the inline variant, keeping adestia-block-note only as a hook. **closed** for the chat's empty conversation list: `ConversationList.tsx` uses `<EmptyState>` with translated text; and `.adestia-block-note` stays only a hook in E-4. **kept: E-12's reading status (`.adestia-instructions__empty`) and the plugins' own empties preserve their existing layouts under B-1.**
16. **Q-16 — Scales bypassed.** About 60 literal px font sizes, 17 distinct values, in the
    shell's stylesheets beside `--text-sm/base/lg`; pill radius `999px` (6 rules) beside
    `--radius-pill: 20px`; six breakpoints across shell and plugins (520, 560, 640, 720,
    820, 900px), only 820 being `--breakpoint-mobile`.
    **closed** for the four sheets of the charter (`tokens.css`, `settings.css`, `settings-pages.css`, `tiles.css`): the seven-step type scale and the radius set are the only sizes and radii they use, and `--radius-pill` is 999 px. **closed** for the chat: `chat.css`, `conversations.css` (Delegations rules included) and `attachments.css` use tokens for font sizes, radii and colours. **closed** for the pages sheets (`home`, `mobile`, `missing-page`, `collection`, `reader`, `editor`, `crepe`): tokens supply type, radius and colours (Crepe keeps its base font variable). **closed** for plugin type sizes and radii (`plugins/test/css.test.js`). **kept: the six breakpoints preserve existing layouts under B-1; only 820 px is a token.**
17. **Q-17 — Plugins restyle everything.** No plugin uses a shell class (only the
    `--adestia-hue-*` tokens); `parcours.css` (18) and `atelier.css` (27) define a second
    vocabulary (`--ink`, `--line`, `--f-mono`, `--r-xs`…), voyages a few more; raw colours
    in plugin CSS (voyages 10, meals 6, todo 4 incl. `#fff`, pm 3) and in `chat.css` (sheet
    scrim). E-22–E-31.
    **closed**: no plugin stylesheet defines a second vocabulary, a literal colour outside a `var()` fallback, `999px` or a literal font size; `plugins/test/css.test.js` holds it for every plugin that ships a `web/` folder, and a test compares its `CHECKED` list to those folders. **kept: the plugins' own buttons and fields** do not adopt `.adestia-btn` / `.adestia-field` (a redesign), except the backs, the exits and the sheets' close button, and the five breakpoints other than 820 px (see Kept).
18. **Q-18 — No global keyboard focus.** No `:focus-visible` rule in `tokens.css`; about a
    dozen local ones. `outline: none` in `home.css` (`.adestia-search input`, E-3),
    `editor.css` (`.adestia-editor__title:focus`, E-4), `todo/app.css` (three rules, E-22),
    `skins/dobby/skin.css`.
    **closed** for the rule: `tokens.css` carries one global `:focus-visible` ring. **closed** for E-3 search and E-4 title: visible replacement rings. **closed** for the plugins: `todo/app.css` has no `outline: none` left, and `css.test.js` refuses one without a 2px ring; Dobby's skin no longer has one.
19. **Q-19 — Dark palette written twice.** `tokens.css` repeats the whole dark palette in
    the `prefers-color-scheme: dark` block and in `:root[data-theme='dark']`.
    **closed**: the dark palette is written once, as `light-dark()`; the `prefers-color-scheme` and `[data-theme='dark']` blocks of `tokens.css` redeclare only the geometry of `--shadow` and `--shadow-lg`.
20. **Q-20 — Native dialogs.** `window.prompt` names a new skill or agent in
    `Instructions.tsx` (E-11); `confirm()` in atelier (E-25).
    **closed** for E-11: the name of a new skill or agent is asked in a small sheet with a field (`instructions/NamePrompt.tsx`), same answer rule as the prompt's; `window.prompt` is gone from the web sources. **kept: `confirm()` in atelier (E-25) and `window.alert` in voyages (E-26)**: replacing a blocking dialog changes the flow (B-1), as recorded under Known defects of `ARCHITECTURE.md`.
21. **Q-21 — Configuration offered where it cannot open.** The Configuration tile in E-9 is
    always drawn; without `configPath` it leads to "This instance does not expose its
    configuration." Hiding the tile would change what the screen offers: **kept: behaviour**
    (`B-1`). E-14 also has no loading state and, unlike its siblings, no `--tile-color`
    wrapper on its error and empty renders; those two are coherence and stay in the epic.
    **kept: behaviour** — the Configuration tile stays drawn without `configPath` (`B-1`). **closed** for the coherence part: E-14 now wraps its loading, error and empty renders in `--tile-color`, like its siblings.
22. **Q-22 — Bench gaps.** `bench/scenarios` has no scenario for the gates (E-1), the
    permission question (E-17), the model picker or the composer's `More` fold (E-16), the
    inactive app (E-20), the parcours map (E-28), the scan overlay (E-30), the offline
    start (E-21), nor any run under the nestor or skippy skins (only default, alfred,
    dobby).
    **closed** for E-20 and the pages matrix under all four skins and both locales. **closed** for the chat: `chat-rail.mjs` covers the model picker, context pill, rail states and keyboard focus (also at 360 px); `chat-compositeur.mjs` covers the More fold, tray, upload error, long input and busy/blocked states; `chat-permission.mjs` covers permission with/without a lasting rule, signature states and the sheet. `chat-matrix.mjs` runs each across four skins × en/fr, with light/dark and desktop/phone inside each scenario. `chat-permission-live.mjs` compares a real Claude reply in the thread against its stored text. **kept: real Copilot/Codex permission checks** — these scenarios use stand-ins; the overall acceptance owns the real engines. **closed** for the remaining seeded screens: `bench/sweep.mjs` dispatches E-1, E-17, E-20, E-21, E-28 and E-30 with per-screen proof selectors; the plugin matrix covers E-22 to E-31.
23. **Q-23 — Home looks empty while it loads.** Until the plugins and the page index arrive,
    E-2 shows its empty state (`.adestia-empty` "Nothing to show yet.") instead of a loading
    state; E-14 Configuration has no loading state either (Q-21). Closed by a loading state in
    the charter's form (the one exception of `B-1`): E-2 by `adestia-qualite-pages`, E-14 by
    `adestia-qualite-charte`.
    **closed**: E-2 uses the ready-gated spinner row and E-14 its configuration loading row; neither shows an empty state while waiting.
