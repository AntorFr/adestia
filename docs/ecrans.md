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
> or written "kept: <reason>".

## Format

- **Web, desktop.** One React shell (`App.tsx`): the chat rail on the left, a resizable
  gutter (`useSplit.ts`, width kept in the browser), the canvas on the right.
- **Phone.** At `--breakpoint-mobile` (820px, `tokens.css`, read by `useMobile.ts`) and
  below, the shell folds into a track of two full-width screens, **chat** and **canvas**
  (`mobile.css`, `.adestia-shell[data-screen]`). The reader moves between them by a swipe
  that follows the finger (`useSwipe.ts`), by the header buttons (`▥` "Open apps" in the
  chat header, `‹ Chat` in the canvas header), or by the edge handles (`.adestia-edge`,
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
a header (`.adestia-canvas__header`: on a phone `‹ Chat`; the breadcrumb; the driver label
`.adestia-canvas__driver`, hidden on a phone; the cog E-15), and a body
(`.adestia-canvas__body`) that starts with the problems band (E-19) and then shows one
screen.

**Breadcrumb.** `nav.adestia-crumbs`: `Home`, then the trail computed by `trail.ts`
(`trailOf`) from settings, the open app and what its view published through `api.trail`,
the page or the section. Every crumb but the last is a button; a folder crumb resolves
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

**Dispatch order** (`App.tsx`), first match wins: gates (E-1: refused, sign-in, fatal,
loading) → plugin app (`openApp`, longest route first) → settings (`settingsPage`) → page
(`page`) → missing page (`pageProblem`) → section → home.

**Plugin apps.** A plugin of kind `app` (or a feature with a `view`) declares a component
and a route; the shell mounts it inside `PluginBoundary` (a throw takes down the panel, not
the shell) and hands it `pages` and `stores`. Above the view the shell draws a `‹ Back`
(`.adestia-switch`) that always goes **home** (`closeApp = goHome`), not one step up.
Settings draws its own back, which goes **one level up** (item → page → mosaic → home) and
is labelled with the destination. Plugins with sub-screens add their own back (E-22, E-24).

## Inventory

| E-n | Name | Route or where it opens | Component file(s) | What it is for | Journeys |
|---|---|---|---|---|---|
| E-1 | Gates | instead of the shell, before `/api/instance` answers or when it refuses | `app/Gates.tsx` (`RefusedGate`, `SignInGate`, `FatalGate`, `LoadingGate`), `useInstance.ts` | Say why the shell is not there: loading, sign in (OIDC 401), not allowed (403), could not start | P-1 |
| E-2 | Home | `#/` | `app/Home.tsx`, `Tile.tsx`, `useReorder.ts`, `SkinSlot.tsx` (hero), `styles/home.css`, `tiles.css` | Greeting and "ask" button (focuses the composer), the agent's brief (« À la une »), the Domains mosaic (plugin tiles, folder tiles, the Settings tile), Arrange mode | P-4, P-11 |
| E-3 | Section | `#/section/<folder>` | `app/Section.tsx`, `sections.ts`, `styles/home.css` | A folder: header, stores, sub-rooms (`Inside`), searchable and facetable page cards, `Finished` archive | P-4 |
| E-4 | Page (reader and editor) | `#/page/<path>` | `editor/Editor.tsx`, `Reader.tsx`, `milkdown.ts`, `toolbar.ts`, `slash.ts`, `blockview.tsx`, `frontmatterview.tsx`, `Attachments.tsx`, `usePage.ts`, `styles/editor.css`, `reader.css`, `crepe.css` | Read a page (rendered blocks, wikilinks, attachments strip); ✎ opens the Milkdown editor with toolbar, slash menu, block bars; autosave; `Done` | P-5, P-6 |
| E-5 | Page properties popover | ⚙ on the frontmatter strip in the editor | `editor/PageSettings.tsx`, `pageform.ts`, `frontmatterview.tsx` | Edit frontmatter as a form drawn from declared fields | P-6 |
| E-6 | Block settings popover | ⚙ on a block bar in the editor | `editor/BlockSettings.tsx`, `blockview.tsx` | Edit a `:::block`'s attributes, title, icon, frame, width; remove stray attributes | P-6 |
| E-7 | Collection page | a page with `type: collection` | `app/Collection.tsx` (`CollectionLayout`, `CollectionShell`), `collections.ts`, `styles/collection.css` | A page listing its members as cards with facets, a `New` pill, `Everything here is finished.` | P-5 |
| E-8 | Missing page | `#/page/<path>` refused (404, 401/403, other) | `app/MissingPage.tsx`, `styles/missing-page.css` | Name the address, say which refusal, link to the folder above | P-5 |
| E-9 | Settings mosaic | `#/settings` | `app/Preferences.tsx`, `Tile.tsx` | Four tiles: MCP servers, Instructions, Configuration, Delegations, with counts | P-8, P-9, P-10, P-13 |
| E-10 | MCP servers | `#/settings/mcp[/<name>]` | `app/McpServers.tsx`, `Settings.tsx` (`useMcpServers`), `styles/settings.css` | List servers with health; open one: state, per-person OAuth connect, JSON declaration editor, Save, Remove, add | P-8 |
| E-11 | Instructions | `#/settings/instructions[/<path>]` | `app/Instructions.tsx`, `styles/tiles.css` | Grouped file cards (instructions, skills, agents), search, `+` create buttons, open one in a monospace textarea, Save; delivered files read-only | P-9 |
| E-12 | Catalogue pop-in | `Catalogues` button in E-11 | `app/CataloguePopin.tsx` (`.adestia-sheet`) | Add a git repository of instructions, list its items, import, Refresh | P-9 |
| E-13 | Delegations | `#/settings/delegations[/<id>]` | `app/Delegations.tsx` | Tasks other agents delegated, grouped by caller, with state chips; open one | P-13 |
| E-14 | Configuration and restart | `#/settings/config` | `app/Configuration.tsx`, `styles/settings-pages.css` | Form of `adestia.config.yaml` from the settings catalogue; read-only notice; Save/Discard; restart bar once a restart-bound value is written | P-10 |
| E-15 | Cog menu | ⚙ in the canvas header, any screen | `app/SettingsMenu.tsx`, `Settings.tsx` (credential panel), `styles/settings.css` | Agent token state and arming flow, theme (System/Light/Dark), sign out (OIDC), build version | P-1, P-7 |
| E-16 | Chat rail | always (left; full screen on a phone) | `chat/Chat.tsx`, `Composer.tsx`, `ModelPicker.tsx`, `ContextPill.tsx`, `Bubble.tsx`, `tabs.ts`, `useConversations.ts`, `styles/chat.css`, `conversations.css`, `attachments.css` | Header (crest, brand, model picker, context pill, `▤` list, `＋` new, `▥` apps), tab strip (desktop), conversation list, thread of bubbles with live turn, MCP connect prompts, composer (attach, plugin buttons in the `More` fold, send/stop) | P-2, P-3, P-14 |
| E-17 | Permission question | above the composer while a turn waits on a permission | `chat/AskPrompt.tsx` (`.adestia-ask`) | Allow once / always / deny a tool call | P-2 |
| E-18 | Signature sheet | a signature card in the thread, opened | `chat/Signatures.tsx` (`SignatureCards`, `.adestia-sheet`) | Sign a held action or a standing grant in an embedded ceremony (or in a tab) | P-3 |
| E-19 | Problems band | top of the canvas body, any screen | `app/Problems.tsx` (`.adestia-problems--refused`, `--degraded`) | Background reading interrupted; extensions refused; running with something missing; stray `app:` | P-11, P-14 |
| E-20 | Inactive app | a plugin route whose plugin has no view | `App.tsx` (`.adestia-empty`) | Say the app is not active, `‹ Back` | P-11 |
| E-21 | Offline screen | the cached shell opened without network | `sw/sw.ts`, then `FatalGate` | Today: "Adestia could not start" with the browser's network error | P-1 |
| E-22 | Todo (and task sheet) | `#/todo`, folders `todo`, `taches` | `plugins/todo/web/app.js`, `rows.js`, `sheet.js`, `blocks.js`, `app.css` | Lists and tasks, capture field, assignees; the task sheet (`.todo-sheet`) with its own `‹`; `:::todo` blocks | P-11 |
| E-23 | Planif | `#/planif` | `plugins/planif/web/app.js`, `app.css` | Scheduled notes, clock state, last/next run | P-11, P-12 |
| E-24 | Journal | `#/journal…`, folder `journal` | `plugins/journal/web/app.js`, `model.js`, `app.css` | Journals, entries, add entry, edit with the lent editor; `‹ Journals` back link | P-11 |
| E-25 | Atelier | `#/atelier…` (no tile; reached from a folder) | `plugins/atelier/web/view.js`, `app.js` (innerHTML engine), `atelier.css` | Workbooks: cut lists, blueprints, full-screen step mode (`.atelier-full`), piece modal (`.atelier-modal`) | P-11 |
| E-26 | Voyages | `#/voyages…`, folder `voyages` | `plugins/voyages/web/view.js`, `app.js`, `voyages.css` | Trips: day plan, suggestion tray, drag to confirm, card detail (`.vmodal`) | P-11 |
| E-27 | Listening post | `#/listening-post…`, folder `veille` | `plugins/listening-post/web/app.js`, `app.css` | Watchlist: sources, passages, dismiss | P-11 |
| E-28 | Parcours map | `#/parcours/<path>`, and the `:::parcours` block | `plugins/parcours/web/view.js`, `carte.js`, `blocks.js`, `parcours.css` | A walk as a map, markers, elevation profile, walking mode (HUD), GPX | P-11 |
| E-29 | Meals page layout | a page with `type: meals` | `plugins/meals/web/layouts.js`, `frise.js`, `meals.css` | Meal timeline (frise), drag to reorder, dish detail (`.meals-modal`) | P-5, P-11 |
| E-30 | Scan overlay | composer button "Scan barcodes" | `plugins/scan/web/chrome.js`, `scanner.js`, `scan.css` | Full-screen camera, decoded codes list, send to the composer | P-11 |
| E-31 | Project-management blocks | `:::` timeline and status blocks in a page | `plugins/project-management/web/blocks.js`, `model.js`, `pm.css` | Timeline of dated sub-pages, project status pills | P-11 |

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
| E-8 | follow the folder link | same | a mistyped address it gave lands here | — |
| E-9 | open tiles | same | — | its delegations are counted |
| E-10 | add/edit/remove servers, connect | same (connect is per person) | uses the servers; health reported after a turn | — |
| E-11, E-12 | write, import, refresh | same | may write instruction files | — |
| E-13 | read | same | runs the delegated turns | creates the rows through inbound MCP `ask_<name>` |
| E-14 | edit, save, restart — only when the server got a `configPath`; else "does not expose its configuration" (the tile is still shown) | same | — | — |
| E-15 | arm the token, theme, sign out | same (token is the instance's) | — | — |
| E-16 | talk, create and archive conversations | same, own conversations under OIDC | answers, renames conversations (`rename_conversation`) | — (its threads are not in this list; they show on E-13 only, `DelegationChannel`) |
| E-17, E-18 | answer, sign | same | asks permission, holds actions | may hold actions for signature |
| E-19 | read | same | background trouble from its scheduled turns | — |
| E-20–E-31 | use | same | writes the plugin's files (tasks, trips, journals, workbooks) | — |

## States

| E-n | Has today | Lacks |
|---|---|---|
| E-1 | loading (`LoadingGate`, bare text "Loading…" in `.adestia-loading`), sign-in, refused, fatal | a styled loading state; translation of `LoadingGate`, `SignInGate` and the body of `RefusedGate` |
| E-2 | normal, empty (`.adestia-empty` "Nothing to show yet."), with/without brief, with/without hero, Arrange mode | a loading state: until plugins and the index arrive it shows the empty state |
| E-3 | normal, no match ("Nothing matches."), empty ("This section holds nothing yet."), finished archive, multi-store marks | loading (index-driven, renders whatever is held) |
| E-4 | reading, editing, saving/saved/"tidied", conflict (`.adestia-save--warn`), rejected, failed, read-only (`.adestia-editor__readonly` + raw source), diagnostics, drop zone, lost/ambiguous wikilink, unknown block, missing `from=` | a loading state while the page is fetched (previous screen stays); an empty-page state |
| E-5 | normal, broken frontmatter (nothing editable), unknown fields, kept-as-written | — |
| E-6 | normal, required attributes missing, stray attributes | — |
| E-7 | normal, all finished | empty collection state distinct from "all finished" |
| E-8 | 404, 401/403, other | a retry for the "server could not" case |
| E-9 | normal; counts absent when unreadable | loading (tiles first render without counts) |
| E-10 | list, empty ("None wired yet…"), health tones, needs-auth, connected/not, shadowed, read-only declaration, saving/saved/failed | loading; a confirmation before Remove |
| E-11 | list, empty, no match, file open, delivered (read-only), saving/saved/failed | loading; an in-app name prompt (uses `window.prompt`) |
| E-12 | no catalogue, reading the repository, nothing importable, error, items | Escape to close, focus return |
| E-13 | list by caller, empty (`.adestia-deleg__empty`), open conversation | loading, error |
| E-14 | read error, not exposed (404), read-only, edited/default badges, saving/saved/failed, stale file, restart pending/asking/waiting/blocked/failed | loading (an empty `.adestia-prefs__page` div) |
| E-15 | token states (stored, none, refused, arming flow, failed), theme chosen, signed in, version | — |
| E-16 | empty thread, live turn (working dots or skin busy slot, counters), interrupted, error, held message, tabs with state dots, empty list ("No conversation yet." untranslated), MCP connect prompt, composer busy/stopping/blocked, attachments and upload error | a loading state for the list and the thread; an offline/disconnected state |
| E-17 | question, with/without lasting rule | — |
| E-18 | pending, signed, denied, expired, open in a tab | — |
| E-19 | background trouble, refused, degraded; absent when nothing | — |
| E-20 | single state | — |
| E-21 | none of its own (fatal gate with "Failed to fetch"-type message) | an offline screen; an offline banner once the shell is open |
| E-22 | loading, empty, error, conflict, sheet | — |
| E-23 | loading, empty, error, clock off | — |
| E-24 | loading, no journal, empty journal, conflict, editing | — |
| E-25 | hub, empty ("Aucun workbook…"), per-section empties, full-screen step | loading, error; any English |
| E-26 | loading, no trip, empty tray, detail modal, dismissed list | — |
| E-27 | loading, empty, no sources, error, conflict | — |
| E-28 | map, no route in the address, no points, walking HUD | loading |
| E-29 | loading, empty, conflict, detail modal | — |
| E-30 | camera live, codes listed; camera failure said in the composer | in-overlay error state |
| E-31 | timeline, status, no dated page, no sub-project | — |

## Target of the charter tranche

Screens E-1, E-9 to E-15, E-19, E-21, after `adestia-qualite-charte`. Every screen: the
components of `docs/charte.md` § 7.4, icons of § 7.3, words through `t()` in the instance's
locale, a visible focus ring, both themes, the four skins. No route, request or option
changes (B-1); the three allowed exceptions of the epic are marked **(B-1 exception)**.

**E-1 Gates.** One centred card (`--surface-raised`, `--shadow`, 420 px max, 24 px
padding) on the canvas: an icon above a title, one sentence, the actions.
- *Loading*: spinner icon + "Loading…" (translated). Nothing else. **(B-1 exception: a styled loading state, no new behaviour.)**
- *Sign in (OIDC 401)*: lock icon, "Sign in to continue", primary button "Sign in" (the
  same link as today).
- *Refused (403)*: alert icon, the server's reason, ghost button "Sign out".
- *Fatal*: alert icon, "Adestia could not start", the error text in `--text-muted`. No
  retry control: adding one would be a new behaviour (kept for the improvement list).
Roles: the same for everyone. Phone: the card is full width with 16 px margin.

**E-21 Offline.** The cached shell opened with no network reaches the Fatal gate with a
network error; it is drawn as its own state, wording only: wifi-off icon, "You are offline",
"Adestia needs the network to reach your agent." Detected from the error the first
`/api/instance` call already throws (a network failure, not an HTTP status; the 4xx/5xx paths
are untouched). No control is added, no offline banner once the shell is open (kept: a
feature, for the improvement list).

**E-9 Settings mosaic.** The four tiles keep their order; tile emoji become Lucide icons
(plug, book-open, sliders-horizontal, handshake) on the tile plate; counts as today; a
loading state is the tiles rendered with their counts as a short skeleton bar for the
duration of the counts request (Q: "tiles first render without counts" becomes an inline
placeholder, not a state of its own).

**E-10 MCP servers.** Buttons are `.adestia-btn`: Save (accent), Remove (danger, labelled with
verb and object, "Remove server"; no confirmation step is added: kept, a behaviour), Connect (neutral), `+` (icon
button "Add server", `plus`). The JSON declaration is a `.adestia-textarea`, monospace. Empty
state: the shared one ("None wired yet…"). Health tones keep colour **and** an icon (check,
circle-alert, loader-circle, wifi-off): colour never alone. Loading: spinner row before the list.
Fallback errors translated (Q-4).

**E-11 Instructions.** Group headers with an icon each (file-text, sparkles, users…); search
is a `.adestia-input` with a `search` icon; the three `+` buttons become ghost buttons
"New instruction", "New skill", "New agent" with `plus`; the name for a new skill or agent
is asked in a small sheet with a field (replaces `window.prompt`, Q-20), Enter confirms,
Escape cancels. The editor textarea is `.adestia-textarea`; Save accent; delivered files show a lock
icon and a "Read-only" note. Loading: spinner row.

**E-12 Catalogue pop-in.** `<Sheet>` (Escape, focus trap and return, bottom sheet on a
phone); the repository field is a `.adestia-field`; Import and Refresh are buttons; items are
rows with a checkbox-less "Import" button as today; error in the field's error slot.

**E-13 Delegations.** Grouped by caller as today; state chips keep colour and gain an icon;
empty state shared; a loading row and an error row (spinner; alert icon + the translated
failure) — **(B-1 exception: Q "E-13 lacks loading, error" is closed by the charter's form.)**

**E-14 Configuration.** Wrapped like its siblings (`--tile-color` on loading, error and
empty renders, Q-21). A loading state (spinner row inside `.adestia-prefs__page`) before the
form (Q-23). Save / Discard / `Restart now` are `.adestia-btn` (accent / ghost / danger). The
restart bar keeps its states (pending, asking, waiting, blocked, failed) and each gets an
icon. Fields are `.adestia-field`s; the "edited" and "default" badges keep their text.

**E-15 Cog menu.** `<Popover>` anchored to a `settings` icon button (aria-label "Settings").
Content top to bottom: the agent credential block (state line with an icon, the arming flow's
buttons), the theme switch (§ 7.4, three icons), "Sign out" (ghost, `log-out`, only under
OIDC), the build version in `--text-muted`.

**E-19 Problems band.** Icon per kind (circle-alert refused, triangle-alert degraded), text
colours from the `*-text` tokens, band background a 12 % tint, the dismissal controls (if
any today) as icon buttons with labels.

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

## Known incoherences (input for the epic, to be emptied by its tranches)

1. **Q-1 — Native unstyled buttons.** Save/Discard/`Restart now` in `Configuration.tsx`
   (`.adestia-config__bar`, `.adestia-config__restart-bar` style the bars, not the
   buttons), Save in `Instructions.tsx` (`.adestia-instructions__bar`) and in
   `McpServers.tsx` (`.adestia-mcp__bar`) are browser-default buttons. `.adestia-mcp__drop`
   sets only border, background and colour (no padding, radius, font, cursor). E-10, E-11,
   E-14.
2. **Q-2 — No shared button.** About 35 distinct classes on `<button>` in the shell's TSX
   alone (plus descendant rules such as `.adestia-settings__actions button`,
   `.adestia-instructions__tools button`), and three looks for "Save":
   `.adestia-editor__save` (E-4), `.adestia-settings__actions` last child (E-15), native
   (Q-1). All screens.
3. **Q-3 — Languages mixed in the editor.** Hard-coded French: `BlockSettings.tsx` (whole
   form, `Fermer`), `blockview.tsx` (`Déplacer le bloc`, `Réglages du bloc`, `Supprimer le
   bloc`, `Aperçu`/`Modifier`), `toolbar.ts` (`Blocs de texte`, `Liste à puces`…),
   `Reader.tsx` notes (`Aucun fichier ici.`, `Rien sous cette page.`, `rien ne porte ce nom
   ici`). Hard-coded English in the same screen: `Editor.tsx` `SaveStatus` and the
   read-only notice, `Reader.tsx` (`this page was not found`, `this block does not render
   yet`). E-4, E-6.
4. **Q-4 — Untranslated shell strings.** `Gates.tsx` (`LoadingGate` "Loading…" though the
   key exists, `SignInGate` entirely, `RefusedGate` paragraph and "Sign out"); `App.tsx`
   `‹ Back`, `‹ Chat`, `aria-label="Breadcrumb"`; `Chat.tsx` "No conversation yet." (an FR
   entry exists, `t()` is not called), "New conversation"/"Open apps" aria-labels,
   "Working"; `ContextPill.tsx` title; `Composer.tsx` `Remove <name>`; `Settings.tsx`,
   `McpServers.tsx`, `CataloguePopin.tsx` fallback errors (`refused (404)`, `request
   failed`); `SettingsMenu.tsx` "Adestia" build line is fine (a name). E-1, E-10, E-12,
   E-15, E-16, E-20.
5. **Q-5 — Hard-coded French in the shell.** `Home.tsx` brief heading « À la une » and the
   refresh prompt `Rafraîchis ma une`, shown on an `en` instance. E-2.
6. **Q-6 — Two registers.** `i18n.ts` speaks *vous* everywhere except the signature lines
   (`Une action attend ta signature.`); skin words use *toi* (skippy) and *vous* (dobby).
   The rule (`B-8`, `B-10`): the shell's and plugins' words say *vous*, so the signature
   lines change; a skin keeps its persona's register, so skippy's *toi* stays. E-18, E-2.
7. **Q-7 — Skins carry words.** All four `skins/*/skin.js` hard-code French (placeholder,
   greetings, busy label), against `i18n.ts`'s own rule that a skin never translates. E-2,
   E-16.
8. **Q-8 — Plugins with no or ad-hoc locale.** Atelier is French-only (no `api.locale`, no
   table) and uses `confirm()`; parcours and project-management switch with inline
   `fr ? … : …`; others use a `WORDS` table — three patterns. E-25, E-28, E-31.
9. **Q-9 — Undefined tokens.** `--text-xs` (`chat.css`, three uses, no fallback),
   `--radius-md` (`conversations.css`, fallback 8px), `--on-accent` (`voyages.css`, fallback
   `#fff`). `atelier.css` reads `--lc` that nothing sets (rule `.lcard .bar i`, also unused
   markup). E-16, E-26, E-25.
10. **Q-10 — Seven dialog implementations.** `.adestia-sheet` (E-12, E-18; scrim
    `rgb(0 0 0 / 0.45)`, z 100), `.adestia-blockset` (E-5, E-6; popover), `.adestia-cog__panel`
    (E-15; z 40), `.meals-modal` (E-29; `color-mix(#000 45%)`, z 40), `.atelier-modal`
    (E-25; `var(--scrim)`, z 50) and `.atelier-full` (z 60), `.vmodal` (E-26; `rgb(8 11 18 /
    55%)` + blur, z 60), `.scan-overlay` (E-30; `#000`, z 100). Escape is handled by the cog,
    the signature sheet and the block bar; **not** by `CataloguePopin.tsx`. Only one scrim
    uses `--scrim`.
11. **Q-11 — Close glyph.** `✕` (`Chat.tsx` connect hide, `Signatures.tsx`,
    `CataloguePopin.tsx`, `blockview.tsx`, listening-post, meals, atelier, parcours, voyages)
    vs `×` (`Chat.tsx` tab close, `Composer.tsx`, `PageSettings.tsx`, `BlockSettings.tsx`,
    scan, journal).
12. **Q-12 — Two ways back.** The shell's `‹ Back` above every plugin view goes home, and
    plugins add their own: `journal-back` `‹ Journals` (E-24), `todo-back` `‹` in the task
    sheet (E-22). The shell's back goes home while settings' back goes one level up.
    `‹ Back` is untranslated (Q-4). No two backs lead to the same place. The rule (`B-9`): each
    back is labelled by its destination (the shell's says home); none is removed; no target
    changes.
13. **Q-13 — Contrast.** `--text-faint` is used as text colour about 100 times and reaches
    2.3–2.6:1 in light, 2.6–3.1:1 in dark. In light, `--accent` (3.4–3.8:1), `--success`
    (3.0–3.4:1), `--warning` (3.3–3.8:1) and `--danger` (3.9–4.4:1) used as text are under
    4.5:1; `--accent-text` on `--accent` (user bubble, send button) is 4.3:1. All screens.
14. **Q-14 — No icon set.** Emoji on tiles and headers (`🔌 📓 🎛 🤝 ⚙`), Unicode glyphs
    in controls (`▤ ＋ ▥ ⚙ ✎ ↺ ■ ↑ ‹`), `glyphs.ts` with two SVGs, inline SVG in
    `Chat.tsx` (`ArchiveGlyph`) and `Home.tsx`. `⌘K` is printed on the home ask button on
    every platform though Ctrl+K is what works off a Mac; Ctrl+K already works everywhere
    (`Home.tsx` accepts `metaKey` or `ctrlKey`), so showing Ctrl+K off a Mac is a label, not a
    behaviour. E-2, E-9, E-16.
15. **Q-15 — Five empty-state styles in the shell.** `.adestia-empty` (E-2, E-3, E-7,
    E-20), `.adestia-instructions__empty` (E-11, E-10, E-12, and E-14's error),
    `.adestia-deleg__empty` (E-13), `.adestia-conversations__empty` (E-16),
    `.adestia-block-note` (E-4); each plugin adds its own (`.pc-vide`, voyages `.empty`…).
16. **Q-16 — Scales bypassed.** About 60 literal px font sizes, 17 distinct values, in the
    shell's stylesheets beside `--text-sm/base/lg`; pill radius `999px` (6 rules) beside
    `--radius-pill: 20px`; six breakpoints across shell and plugins (520, 560, 640, 720,
    820, 900px), only 820 being `--breakpoint-mobile`.
17. **Q-17 — Plugins restyle everything.** No plugin uses a shell class (only the
    `--adestia-hue-*` tokens); `parcours.css` (18) and `atelier.css` (27) define a second
    vocabulary (`--ink`, `--line`, `--f-mono`, `--r-xs`…), voyages a few more; raw colours
    in plugin CSS (voyages 10, meals 6, todo 4 incl. `#fff`, pm 3) and in `chat.css` (sheet
    scrim). E-22–E-31.
18. **Q-18 — No global keyboard focus.** No `:focus-visible` rule in `tokens.css`; about a
    dozen local ones. `outline: none` in `home.css` (`.adestia-search input`, E-3),
    `editor.css` (`.adestia-editor__title:focus`, E-4), `todo/app.css` (three rules, E-22),
    `skins/dobby/skin.css`.
19. **Q-19 — Dark palette written twice.** `tokens.css` repeats the whole dark palette in
    the `prefers-color-scheme: dark` block and in `:root[data-theme='dark']`.
20. **Q-20 — Native dialogs.** `window.prompt` names a new skill or agent in
    `Instructions.tsx` (E-11); `confirm()` in atelier (E-25).
21. **Q-21 — Configuration offered where it cannot open.** The Configuration tile in E-9 is
    always drawn; without `configPath` it leads to "This instance does not expose its
    configuration." Hiding the tile would change what the screen offers: **kept: behaviour**
    (`B-1`). E-14 also has no loading state and, unlike its siblings, no `--tile-color`
    wrapper on its error and empty renders; those two are coherence and stay in the epic.
22. **Q-22 — Bench gaps.** `bench/scenarios` has no scenario for the gates (E-1), the
    permission question (E-17), the model picker or the composer's `More` fold (E-16), the
    inactive app (E-20), the parcours map (E-28), the scan overlay (E-30), the offline
    start (E-21), nor any run under the nestor or skippy skins (only default, alfred,
    dobby).
23. **Q-23 — Home looks empty while it loads.** Until the plugins and the page index arrive,
    E-2 shows its empty state (`.adestia-empty` "Nothing to show yet.") instead of a loading
    state; E-14 Configuration has no loading state either (Q-21). Closed by a loading state in
    the charter's form (the one exception of `B-1`): E-2 by `adestia-qualite-pages`, E-14 by
    `adestia-qualite-charte`.
