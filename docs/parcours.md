# Adestia — who it is for, needs, journeys

> Product documentation. On `epic/adestia-qualite`, the target of the epic's framing; on
> `main`, exactly what is built. Stable identifiers, never renumbered: `B-n` (needs), `P-n`
> (journeys), `E-n` (screens, `docs/ecrans.md`), `AD-n` (decisions, `ARCHITECTURE.md`).
>
> This file was written by the epic `adestia-qualite` (2026-10-15), a quality pass that
> changed **no behaviour** (B-1; `adestia-correctifs` then repairs the defects it wrote down, B-13 to B-16): the journeys below are the product as it is at v0.88.0; the needs
> `B-1` to `B-12` are what the epic adds — documentation, a test bench without docker, a
> visual charter, coherent screens, cleaner code.

Adestia is a self-hosted web shell around a coding-agent CLI (Claude Code, Copilot CLI,
Codex CLI): the subscription pays for the agent, the shell gives it a chat, a workspace of
markdown pages it shares with its people, plugins, schedules and a door for other agents.
One instance is one agent, one workspace, one subscription.

## Who it is for

| Role | Who, when, where | Device |
|---|---|---|
| **Owner** | Installs and runs an instance: writes `adestia.config.yaml`, arms the agent's credential, chooses plugins and skin, edits settings from the browser. Today it is Monsieur, for three instances (Skippy, Alfred, Nestor) deployed from `k8s-home-lab`. | computer |
| **User** | Talks to the agent and works in its pages: at a desk on a computer, or on a phone from the sofa or on the move (PWA). Under OIDC several people share one instance; each has their own conversations. No route distinguishes an owner from a user: every signed-in identity can do everything. | computer and phone |
| **Agent** | The engine behind the instance: answers turns, edits the same pages with its own file tools, uses the shell tools (`rename_conversation`, `new_id`, `find_pages`), runs scheduled turns unattended. | — |
| **Calling agent** | Another agent (often another instance) delegating work through inbound MCP (`ask_<name>`), optionally called back when done. | — |
| **Developer** | A person or a night agent changing Adestia's code: builds, tests, launches it locally, captures its screens. Since this epic, a night agent has no docker and only a Claude token. | computer, pod |

## Needs

Form of the `exigences` skill; each need names the journeys it serves.

### Unchanged behaviour
- **B-1** *(`adestia-qualite`; `adestia-correctifs` lifts it for its register, B-13; `adestia-ajouts` lifts it for B-17 to B-22 only)* — Every journey `P-1` to `P-14` behaves after the epic as it did at v0.88.0: same
  routes, same API, same configuration keys, same files on disk and their formats, same MCP
  tools, same words where a word is not corrected by `B-8` or `B-9`. A visible change is limited to
  the look (`B-6`, `B-7`, `B-9`), to the language of a string (`B-8`), to the labels of back
  controls, which name their destination (`B-9`), and to the loading states below. The one contract change the epic allows is additive and only for words: the shell
  hands a skin's module the instance's locale as an extra, optional input (AD-5); a skin that
  ignores it works unchanged, including skins from `extensions.skinsDir` or
  `extensions.sources`. The "Lacks" column of `docs/ecrans.md` › States is an observation, not
  a target: the epic builds no new state, except a loading state where a screen shows a wrong
  state while it loaded before this epic (E-2 and E-14 now show spinner rows) — that is
  coherence, not behaviour. Every `Q-n` of `docs/ecrans.md` is either closed by its tranche or
  written "kept: <reason>". *(all)*

### Corrections (adestia-correctifs)

- **B-13** — Every defect of the register (`ARCHITECTURE.md` › AD-17) is either repaired with a
  test that failed before, or leaves the register as *not reproduced*, or is kept under Known
  defects with its reason. None disappears unwritten. *(all journeys)*
- **B-14** — Where a journey states a behaviour the product did not keep — P-2 step 4 (a refused
  turn is explained to the user) — the product does what the journey says. P-5 step 7 says the
  open page is not reloaded: that stayed through `adestia-correctifs`, and `adestia-ajouts` changes it on purpose (B-17). *(P-2)*
- **B-15** — A changed behaviour is written in `CHANGELOG.md`, and in the journey or screen that
  states it, in the same task. *(all)*
- **B-16** — A repaired screen shows right under the four skins, in `en` and `fr`, in both themes,
  at desk and phone width (AD-20); a word the user reads is in their language, except data the
  author wrote. *(all screens)*

### The developer's journey
- **B-2** — A developer launches Adestia locally with one documented command and no docker,
  either on the **fake engine** (a scripted fake driver, deterministic turns; AD-2) or on the **real Claude engine**
  with only `CLAUDE_CODE_OAUTH_TOKEN`; the Copilot and Codex engines keep their existing fakes
  in the tests, and their real runs stay manual. *(P-15)*
- **B-3** — A developer captures every screen of `docs/ecrans.md` in light and dark, at desk
  and phone width, for a chosen skin, with one documented command that needs no docker
  (Playwright and Chromium from the environment), on seeded data that exercises the screen's
  states. *(P-15)*
- **B-4** — A newcomer, person or agent, finds in the repository what the product does
  (`docs/parcours.md`), its screens (`docs/ecrans.md`), its data (`docs/donnees.md`), its
  map, invariants and decisions (`ARCHITECTURE.md`), its look (`docs/charte.md`), how to
  build, test and launch it (`README.md`, `CLAUDE.md`); what these say is true of the code
  (the `relire-doc` pass is the fresh-context `relecteur-depot` review, using
  ARCHITECTURE.md's "What counts as a contradiction" bar). *(P-15)*
- **B-5** — `.agent/status.md` says the state — current version, what is known broken or half
  built, the traps still true — in under 150 lines; the history of versions lives in
  `CHANGELOG.md`, in version order. *(P-15)*

### The look
- **B-6** — The visual charter (`docs/charte.md`) is written and the shell follows it: one
  token source (`packages/web/src/app/tokens.css`) that every shell and plugin stylesheet
  reads; no token used and never defined; no colour written outside the token and skin
  files; one type scale and one radius set actually used; every text and non-text pair of
  the base palette and of each skin's palette at WCAG 2.2 AA in both themes, measured and
  listed (`docs/charte.md` § 5). *(all journeys with a screen)*
- **B-7** — The shell's controls are drawn by shared components: one button family
  (neutral, accent, danger, ghost, icon), one dialog/sheet with one scrim, Escape and focus
  return, one empty state, one icon set served by the product next to every navigation item
  and action, a visible keyboard focus everywhere; no native unstyled control where a drawn
  one is expected. *(all journeys with a screen)*
- **B-8** — Every string of the interface goes through the locale, in the shell, in the
  editor, in the plugins and in the skins' words: an `en` instance shows no French and an
  `fr` instance no English, outside the user's own content. The shell's and the plugins'
  French speaks with one register (*vous*); a skin keeps its persona's own register and
  voice (`B-10`) — Skippy may say *tu*. *(all journeys with a screen)*
- **B-9** — A plugin screen looks like the shell: it reads the shell's tokens (no second
  vocabulary) and uses the shared dialog. Every back control is labelled by its destination —
  the shell's `Home` above a plugin goes home and says so; a plugin's own back (one level up
  inside the plugin, `‹ Journals`, the task sheet's `‹`) stays and names where it leads. No back
  is removed and no navigation target changes (`B-1`): at v0.88.0 no two backs lead to the
  same place.
  *(P-11)*
- **B-10** — Each skin keeps its identity — palette, fonts, hero, crest, scheme, and its
  persona's voice and register in its own words — and every
  screen is legible and unbroken under each of the four skins. *(all journeys with a screen)*

### The code
- **B-11** — The code carries each idea once: no duplicated helper, no second implementation
  of a module that exists, no dead export or file, no comment pointing to a document absent
  from the repository; `app.ts` mounts routes and holds no business logic; the test stub
  driver is shared. The list of targets is `ARCHITECTURE.md` › Refactoring targets, and each
  target is closed or written down as kept, with its reason. *(P-15)*
- **B-12** — Typecheck, lint and the whole test suite are green on every tranche and in CI;
  lint runs in CI. *(P-15)*

### What `adestia-ajouts` adds
Six functions, kept by Monsieur on 2026-10-25 from the recommendations of `adestia-correctifs`
(AD-18 there). Each one is a new behaviour, so `B-1` (no functional change) does not bind them;
nothing else is added (see Out of scope).

- **B-17** — The page that is open follows what the agent writes. In reading mode (E-4) it
  refreshes by itself when its file changes on disk (when the workspace watch is off, nothing refreshes, as today). If the agent deletes or moves the open page, reading mode shows E-8; editing mode shows the same banner and **Reload** leads to E-8. In editing mode a banner "The page
  changed" offers **Reload**; nothing is ever replaced under the cursor, and the text being
  typed is never lost. *(P-16)*
- **B-18** — Every screen whose "Lacks" names a loading state shows one while it fetches
  (E-3, E-4, E-9, E-10, E-11, E-13, E-16, E-25, E-28), and every one of those that fetches its
  own data says so in a message with a **Retry** when the fetch fails (E-4, E-8, E-10, E-11,
  E-13, E-16, E-25, E-28). E-3 and E-9 draw from the instance index: they get the loading
  state only, their failure is the offline banner (B-19). The empty states of E-4 and E-7 are
  not part of this need. *(P-16)*
- **B-19** — When the server does not answer, a banner over the open shell says so ("The
  server is not responding"), and it goes away by itself when the server answers again. There
  is no offline screen and no cache of pages. The reason: away from home, Adestia sits behind
  a VPN, and a dropped VPN must not look like a broken product. *(P-16)*
- **B-20** — "Remove" on an MCP server (E-10) asks first, in the shared sheet: the server's
  name, **Cancel** and **Remove**. Escape and Cancel keep the server. *(P-16)*
- **B-21** — The owner sets the number of simultaneous turns (`maxConcurrentTurns`) from the
  settings screen (E-14), like the other fields of `SETTING_GROUPS`, with the same "restart
  needed" mark. *(P-16)*
- **B-22** — When a conversation continues on a fresh engine session because the one it
  carried cannot be resumed (after a restart), the chat marks it where it happened — the turn runs fresh, on the same conversation: the user
  learns that the engine no longer remembers the earlier messages. Only the engines that can
  still lose it get the mark (checked in AD-23). *(P-16)*


## Journeys

### P-1 — Reach the instance
A user opens the instance in a browser or from its installed icon, at a desk or on a phone.

1. The user opens the address; the shell asks `GET /api/instance`. While it waits, E-1 shows the loading gate (`LoadingGate`).
2. Under `auth.mode: none` there is no gate: everyone is the implicit user `local`. Under `auth.mode: proxy`, the identity comes from `auth.proxy.userHeader` (groups from `groupsHeader`); a request without the header gets a 401.
3. Under `auth.mode: oidc`, a 401 shows the sign-in gate on E-1 (`SignInGate`). The user presses **Sign in**, goes through `/auth/login` to the issuer and comes back through `/auth/callback` to the address they asked for (`returnTo`).
4. A signed-in account that is in none of `auth.oidc.allowedGroups` gets a 403, and E-1 shows the refused gate (`RefusedGate`) with a **Sign out** button.
5. If `/api/instance` fails in any other way, E-1 shows the fatal gate (`FatalGate`, "Adestia could not start") with the error message.
6. The user installs the PWA from the browser. The manifest is generated by the server (`/manifest.webmanifest`, `webmanifest.ts`): it takes its name from `name:` in `adestia.config.yaml`, failing that from the active skin, failing that it is "Adestia". Its icons (`/icon.svg`, `/icon-180.png`, `/icon-192.png`, `/icon-512.png`) come from the skin.
7. Offline, the service worker (`sw/sw.ts`, rules in `sw/policy.ts`) serves the cached shell for a navigation. `/api/` is never cached, so the instance request fails and the shell shows E-21: today this is the fatal gate carrying the browser's network error, not a dedicated screen.
8. Under OIDC, the user signs out from the cog menu on E-15 (`POST /auth/logout`). This ends Adestia's session only, not the identity provider's.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-2 — Chat with the agent
A user talks to the agent in the chat rail, beside whatever the canvas shows (on a phone, the chat and the canvas are two screens with a swipe between them).

1. The user types in the composer on E-16 and presses **Send**. Without an open conversation, the first message creates one (`POST /api/conversations`). The turn is posted to `POST /api/turn` and streamed from `GET /api/turn/attach`.
2. The agent's reply streams in as one bubble per part, with a collapsible tool trace (`ToolTrace`), a working indicator (or the skin's `busy` slot) and a live output-token counter. The reply is rendered as markdown by the page renderer, so a workspace path it names opens that page.
3. The user picks a model in the header (`ModelPicker`, stored in this browser as `adestia.model`). The picker is hidden when `driver.models` is empty; on `codex-cli` the engine lists its own models (`/api/models`). The context pill (`ContextPill`) shows how much of the model's window the conversation fills, from the first token on.
4. While a turn runs, the send button becomes **Stop** (`POST /api/turn/stop`). Messages sent meanwhile show as held bubbles: the server queues them and sends them as one merged turn when the running one ends. Past `maxConcurrentTurns`, a new turn is refused with a 429 and the chat says why.
5. Under `permissions: ask` (claude-code or codex-cli only), the engine's question appears above the composer on E-17 (`AskPrompt`). The user answers **Refuse**, **Just this once** or **Always** (`POST /api/permission`); the composer stays blocked until they do. "Always" lets the engine write its own rule into `<workspace>/.claude/settings.local.json`. This posture is marked unfinished in `adestia.config.example.yaml`.
6. On a desktop (or on a phone with the canvas showing), each message carries the open route and its breadcrumb as a hint (`screenView` in `trail.ts`, `frameView` in `screen.ts`). It is never sent from the home screen, and never what the page shows.
7. The user drops or picks files in the composer (**More** › **Attach files**, or drag and drop) — `POST /api/upload`. The files go to an inbox under `dataDir`, outside the workspace, in a box per person (not per conversation), and are cleared after `attachments.ttlMs`. The prompt tells the agent that their contents are data, and the agent reads them with its own tools.
8. The agent names the conversation with its `rename_conversation` tool (it also has `new_id` and `find_pages`). The new title shows on the tab and in the list.
9. The user manages conversations from E-16. Tabs are desktop only; the browser remembers which are open (`adestia.tabs`) and which have been read (`adestia.read`). The user drags tabs to reorder them, closes one with the `x` icon or archives it with the `archive` icon, on the tab or on its list entry (`POST /api/conversations/:id/archive`). The `list` icon opens the conversation list, which is the only navigation on a phone, and the `plus` icon starts a new draft. From the screen the user creates and archives, nothing more: renaming is the agent's (step 8), and the server's rename (`PATCH /api/conversations/:id`), unarchive (`archived: false`) and delete (`DELETE /api/conversations/:id`) are reached by no screen. An archived conversation leaves the list, which never asks for archived ones.
10. When a reply arrives while the user is reading something else, the dot on the tab or list entry marks the conversation as unread.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16, B-14

### P-3 — Sign a ceremony
The agent calls a tool held at a Tessera façade, and the user has to sign before the call goes through.

1. The owner lists the façade in `signatures.origins` in `adestia.config.yaml`, and optionally sets `signatures.embed: true`.
2. The agent makes a tool call. The driver finds the ceremony in the tool result (`signatureRequest` in `packages/drivers/src/signatures.ts`: `CONSENT PENDING` for an immediate consent, `REQUEST OPENED` for a grant given ahead of time). Only origins listed in the configuration are kept.
3. On E-16, a signature card (`SignatureCards`) appears under the message that asked, whatever the agent says in its text, showing the façade's host and, while pending, the deadline.
4. The user presses **Sign**. With `embed`, the ceremony opens in a sheet over the chat on E-18 (`SignatureSheet`), with **Open in a tab** as an alternative; without it, the ceremony opens in a new tab and the card then offers **I signed it**.
5. The sheet listens for the ceremony's messages: `assertion_ok` marks the card signed and closes the sheet, `denied` marks it denied, `assertion_err` (or no answer in time) suggests signing in a tab.
6. For a consent that was signed, the chat itself sends ``Signed — resume the held call with {"_consent": "<id>"}``, so the agent calls the tool again. A grant needs nothing more.
7. The card shows signed (`check` icon), denied (`x`) or expired (`clock`, past its deadline), each with a text label. What this browser saw is kept in `localStorage` under `adestia.signatures`.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-4 — Find one's way
A user looks for a page or a domain from the landing canvas.

1. The user opens `#/` and sees E-2: a greeting (or the skin's `hero` slot), a line of context and an ask bar. Clicking the ask bar, or pressing Ctrl+K or Meta+K, puts the cursor in the composer; the label is Ctrl K off Apple platforms and ⌘K on them. Until plugins load and the first index request settles (including failure), a spinner row says Loading… (Chargement… in French) in place of the brief and Domains; the greeting or hero stays visible.
2. If `home/brief.json` exists in a store (`GET /api/home/brief`), the daily brief shows up to four entries, with how old it is and who chose it. Each entry opens its target: an app, a page, a section or a path an app claims. An entry with no target asks the agent instead. The `rotate-ccw` refresh control sends Refresh my highlights in English, Rafraîchis ma une in French; the heading is Highlights / À la une.
3. Under **Domains**, one tile per active app that has a `tile`, then one tile per top-level folder of pages (its index page gives the icon and colour; `home/` and the folders an active app absorbs are left out), then the **Settings** tile.
4. The user presses **Arrange** and drags the tiles. The order is kept in this browser (`adestia.order.domains`) and moves nothing on disk. **Done** ends the arranging.
5. The user opens a section tile and lands on E-3 at `#/section/<folder>`: its sub-folders, then the live pages as cards, then the finished ones folded under **Finished**. A search field appears past five pages, and facet pills when the pages declare `status`, `role` or `cat` (the first of these found).
6. The breadcrumb in the canvas header (`adestia-crumbs`) names each level and walks back up; **Home** goes to `#/`. On a phone, **Chat** in the canvas header returns to the conversation.
7. A folder link always goes through `folderRoute` (`owners.ts`). A folder an active app owns opens that app's screen. A folder holding a single typed page of its owner's kind opens directly on that page (`#/page/<folder>`). Anything else opens the section. A `#/section/…` address typed by hand is redirected the same way.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-5 — Read a page
A user reads a markdown page of the workspace.

1. The user opens `#/page/<path>` (with `?store=<id>` when two stores hold the same name); the shell reads `GET /api/pages/<path>.md`, and E-4 shows it in reading mode (`Reader`).
2. Typed blocks written in the `:::` grammar (`packages/content/src/vocabulary.ts`: `callout`, `app`, `row`, `gallery`, `content`, `figures`, `table`, `list`), and those an active plugin adds, are drawn with their `title`, `ico`, `frame=card` and `w` width. A block is drawn by the plugin named in `from=` when one is given.
3. In a `:::list`, finished pages (`isFinished` on `status`/`statut`) are folded into a `<details>` by default (`closed=fold`).
4. A page with `type: collection` is drawn by E-7 (`CollectionLayout`): its own text, then its members (as facet cards when grouped, otherwise as pages), the finished ones folded. Its Ask for a new page button (when `of:`, `into:` and the agent callback are present) uses `plus` and asks the agent to create a new member; facet cards show shared count chips. Inside a facet whose members are all finished, the shared empty state uses `check`.
5. A page whose `type` a plugin claims is drawn by that plugin's layout (E-29 for `meals`).
6. Under the page, the attachments strip (`Attachments`, `GET /api/files?page=…`) lists the files in the page's folder and its `assets/` that the page body does not already show.
7. When the agent writes the page, the server pushes the change (`GET /api/events`, `workspace.watch`) and the pages index is refetched (new pages appear in the navigation); the open page is not reloaded, since the editor may hold unsaved words, and a conflicting save is refused by its revision check (`adestia-ajouts` changes this: B-17, P-16).
8. A page that cannot load shows E-8 (`MissingPage`), with three cases: no page at this address (404), out of reach because the session may have expired (401/403), or a server error. It names the path and links to the folder above, using file-question, lock or circle-alert in the shared empty state.
9. A page using blocks the vocabulary does not know opens read-only, showing a lock icon, its raw source and the diagnostics. Block notes use the translated inline empty state.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-6 — Edit a page
A user corrects or writes a page that the agent also edits.

1. On E-4 the user presses **Edit** (the `pencil` control), and the page opens in the Milkdown/Crepe editor (`Editor.tsx`, `milkdown.ts`).
2. The user types **/** to open the slash menu (`slash.ts`), which offers every block that has a body in the vocabulary, including those of active plugins. The core `app` block has no body and is excluded. Selecting text shows the toolbar: Crepe's text formats, plus list, heading and quote (`toolbar.ts`).
3. Each block in the editor has a frame with its `:::name`, a grip to move it, a raw/preview switch and a `settings` control that opens E-6 (`BlockSettings`). That form is built from the block's declared attributes and the shared ones (`title`, `ico`, `frame`, `w`).
4. The **Page properties** button (`settings`) on the frontmatter row opens E-5 (`PageSettings`), a form over the frontmatter that includes the fields plugins declare for the page's `type`. YAML lines it cannot handle are kept unchanged. E-5 and E-6 use shared popovers and fields; Escape or an outside click closes them and returns focus to their settings anchor.
5. The page saves itself 1.6 s after typing stops, and again on **Done** (`PUT /api/pages/<path>` with the revision it opened). The translated status reads Saving…, Saved, or "Saved, tidied to house style", with a spinner or check icon. Toolbar, slash menu and block controls use the instance locale.
6. If the agent wrote the file in the meantime, the server answers 409: the status says "The agent changed this page. Reload to see its version.", the editor stays open with the text, and nothing more is saved. A save that breaks the vocabulary is refused with its first diagnostic.
7. Files the user drops on the page go to the chat inbox, and the composer is filled with "File the attached files with the page …" so the agent files them in the right place.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-7 — Arm the agent's credential and choose the theme
The owner or a user adjusts this session without leaving the screen they are on.

1. The user opens **⚙** in the canvas header (`SettingsMenu`), which shows E-15. It closes on a click outside, on Escape or on navigation.
2. **Tokens** shows the credential state (`GET /api/auth/driver`): Armed, Refused upstream, Using the CLI's own credentials, No token stored here.
3. **Arm a token** / **Renew the token** starts the flow (`POST /api/auth/driver/begin`), and its screens follow the driver's `mode`. With `url+code` (claude-code), the user opens the link and pastes the code back, then **Validate**. With `device-code` (copilot-cli, codex-cli), the user enters the code shown at the link, then **I have approved — finish**. Both end with `POST /api/auth/driver/complete`. The contract also declares `api-key`, which no bundled driver uses today.
4. The token stays on the server (`<dataDir>/secrets/<driver>.token`, mode 0600) and is never sent to a browser. **Forget it** removes it (`DELETE /api/auth/driver`), and **Cancel** stops a flow (`POST /api/auth/driver/cancel`).
5. **Appearance** offers System / Light / Dark, kept in this browser (`adestia.theme`). A skin with its own `scheme` sets the default.
6. Under OIDC, **Sign out** shows who is signed in. The last line shows "Adestia" and the version (`ADESTIA_VERSION`) when there is one.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-8 — Manage MCP servers
The owner wires the servers the agent may call, and each person connects to the servers that act on their behalf.

1. The owner opens the **Settings** tile (E-9, `#/settings`), then **MCP servers** (E-10, `#/settings/mcp`). There is one tile per server (`GET /api/mcp/servers`), showing where it comes from (the configuration, a plugin, or added here), whether it uses HTTP or a local process, and whether it is read-only.
2. Each server's health (`GET /api/mcp/status`) is the state the CLI reported when a turn last ran.
3. **Add a server**, or opening a server added here, shows its declaration as JSON. **Save** (`POST`/`PUT /api/mcp/servers`) checks it with the same grammar as the YAML file, and **Remove** deletes it (`DELETE`). Such servers are kept in `<dataDir>/mcp-servers.json` and reached from the next turn. Secrets come back masked, and a masked value saved unchanged keeps the stored one.
4. Servers declared in `mcp.servers` or by a plugin are shown read-only. On a name conflict the configuration file wins.
5. For a server declared `identity: user` with `signIn: oauth`, the user presses **Connect** on the server's page or on the card in the chat ("… asks you to connect before it can act for you"). A window runs `GET /api/mcp/signin/:name`, the provider, then `/api/mcp/signin/callback`; the person's refresh key goes to `<dataDir>/mcp-signin.json`. **Not now** hides the chat card in this browser.
6. A person who has not connected, or a turn with no person behind it (a schedule or a delegation), does not see that server at all. A plain `identity: user` server uses the person's OIDC token minted from `auth.oidc.reboundAudience`.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-9 — Edit the agent's instructions and import from catalogues
The owner reads and corrects what the agent is told, and imports skills from git repositories.

1. The owner opens **Instructions** (E-11, `#/settings/instructions`, a tile of the Settings mosaic E-9; the old `#/instructions` redirects there). It shows one card per file in the engine's own folders (`GET /api/instructions`), grouped by when the engine reads them (standing instructions, `skills`, `agents`), with a search field.
2. Opening a card (`#/settings/instructions/<path>`) shows the plain text, which is saved byte for byte (**Save**, `PUT /api/instructions/<path>`). A button per place creates a new instruction there.
3. Files delivered by the product (core skills, plugin skills, the generated `this-instance`, catalogue imports) carry a **delivered** badge and have no Save; the server refuses writing them too. They are rewritten at every start.
4. **Catalogues** opens E-12 (`CataloguePopin`). The owner declares a repository (address, required ref, optional token — `POST /api/instruction-catalogues`), then opens it to list what it holds (`GET …/:id/items`).
5. **Import** copies one item into the folder the active engine reads (`PUT …/:id/items/<path>`), and **Remove** deletes only that copy. An item the engine has no folder for is listed with its button disabled.
6. **Refresh** fetches the repository again and re-copies what was imported from it (`POST …/:id/refresh`). The same happens at boot, within a 20 s limit (`instruction-catalogues-refresh.ts`). The list is kept in `<dataDir>/instruction-catalogues.json`, not in the configuration file.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-10 — Edit the configuration from the browser and restart
The owner changes a setting of the instance without a shell on the machine.

1. The owner opens **Configuration** (E-14, `#/settings/config`, a tile of the Settings mosaic E-9; `GET /api/settings`). It names the file it writes to.
2. The form is built from `SETTING_GROUPS` in `packages/schemas/src/settings.ts`; today that is `workspace.watch.enabled`, `workspace.watch.polling` and `workspace.watch.intervalMs`. Each field says whether its value is written in the file or is the default, and that it "applies after a restart".
3. On a read-only file (a ConfigMap, a `:ro` mount), a banner says so; the values stay visible and nothing can be edited.
4. **Save** (`PUT /api/settings` with the revision it read) writes `adestia.config.yaml` in place and keeps its comments. If the file changed on disk, the save is refused and asks for a reload. **Discard** throws the changes away.
5. The restart bar says "Saved, and waiting for a restart." **Restart now** (`POST /api/restart`) is refused while turns are running and says how many; **Restart anyway** sends `force`.
6. `routes/restart.ts` requests the restart; `bin/adestia.js` closes and boots the server again in the same process. The screen shows "Coming back…" until the instance answers again, or "The instance did not come back" if it does not.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-11 — Use a plugin
A user works in an app or meets a feature plugin the owner turned on.

1. The owner names plugins in `extensions.apps` and `extensions.features`. Each active app with a `tile` shows a tile on E-2 and opens at `#/<route>` (default `#/<id>`), with a **Home** control (Accueil in French, chevron-left) above the plugin's view. A plugin that crashes takes down only its own panel (`PluginBoundary`), which says why in its place.
2. **todo** (E-22): tasks are pages (`type: tache`), and lists are curated (`liste`) or dynamic. Ticking a task writes its `done:`. Opening a task shows the task sheet (`sheet.js`), whose note is the shell's own page editor. The `:::checklist` block lets any page carry tasks.
3. **planif** (E-23): see P-12. **journal** (E-24): a folder is a journal and each page in it an entry; the history reads on one screen and each entry is edited in place. **atelier** (E-25, no tile, reached at `#/atelier/<path>` or from a path it claims): draws the cutting diagram from a project's `workbook.json`, with a bench mode; ticking a step or moving a band writes `workbook-state.json` or `workbook-layout.json` beside the workbook, through the plugin's API.
4. **voyages** (E-26): a per-day timeline and suggestions from a trip's `voyage.json` (secret `GOOGLE_MAPS_API_KEY`); confirming, moving or dismissing a card writes `voyage-state.json` beside the trip, through the plugin's API. **listening-post** (E-27, folder `veille`): a queue fed by feeds and pasted links (dropping a link, dismissing or restoring a candidate writes `<dataDir>/listening-post/queue.json`), transcripts with `yt-dlp`, and a search; its ✦ buttons ask the agent.
5. **parcours** is a feature, not an app: the `:::parcours` block draws a `.parcours.json` as a map with markers, an elevation profile and a walking mode (E-28).
6. **meals** draws a page with `type: meals` as a day-by-day strip with a tray to drag from (E-29). The agent writes through the plugin's `meals` MCP server, guarded by a revision.
7. **scan** adds a button to the composer that opens a camera overlay (E-30) and drops the codes it reads into the composer.
8. **project-management** adds the `:::timeline` block (phases and milestones on a time axis) and the `:::subproject` block (sub-projects with their `project-status`) (E-31).
9. Many plugin buttons send a prompt to the agent (`api.ask`) instead of writing anything themselves.
10. **Dialogs and backs (B-9).** Dani, who keeps the household's meals and trips in Adestia, opens a dish on the meals strip (E-29), reads it in a sheet and presses Escape: the sheet closes and the card has the focus. She opens a task in the todo app, reads its note, and takes the back that says « Todo » to the list; she opens a journal entry and takes « Journals » back to the list of journals. In the atelier she enters the bench mode, and leaves it by the button that says « Leave the bench mode ». Her **failure path**: with the network lost while she ticks a task, the plugin shows its own error state (today's) and the tick is not recorded; the camera denied in the scan overlay (E-30) is said in the composer. Her instance speaks French: every word she reads in these plugins is French and says *vous*, and the same page on an English instance is English throughout; under each of the four skins the sheet and the backs keep their shape. Other failure paths: the listening post (E-27) opened while its queue file changed under it shows its conflict state; the walking HUD (E-28) leaves by its exit button, « Leave walking mode » / « Quitter le mode balade » (or Escape), and the map is where she was; a `:::timeline` with no dated sub-page (E-31) says what the block needs. Every back names where it leads; none is removed: the task sheet's says « Todo », the journal's « Journals » / « Journaux », the atelier's bench mode leaves by « Leave the bench mode » / « Quitter le mode atelier », every sheet closes by Escape, its scrim or an icon button named « Close » / « Fermer », and the focus goes back to what opened it (on a phone the scan overlay cannot hand it back: the composer's fold has removed its button, a known defect). The shell's own `‹ Back` above the plugin says it leads Home, in the instance's language.
11. An address whose app is not active (a bookmark, a plugin turned off) matches no loaded plugin and falls through to Home (E-2). E-20 (the shared empty state with plug, "That app is not active on this instance.", and **Home**) shows when a matched, loaded plugin has no view, for example because its view module failed to import; E-19 lists that refusal under "Extensions refused".

Needs: B-1, B-6, B-7, B-8, B-9, B-10, B-13, B-15, B-16

### P-12 — Schedule unattended turns
The owner has the agent act on a schedule, with nobody watching.

1. The owner sets `schedule.enabled: true` in `adestia.config.yaml`; it is off by default.
2. A note in `workspace/planif/` (the folder is hard-coded: the plugin ignores the `workspace.planif` key) holds the schedule; its body is the prompt. No screen writes one: the owner writes it in the workspace by hand, or asks the agent to write it (skill `schedule-author`); E-23 only reads. Its frontmatter carries either `every:` (`30m`, `2h`, `1d`, at least 15 min) or `at:` (fixed local times), and `enabled:`. The `schedule-author` skill describes the format.
3. The clock (`clock.ts`, `schedule.ts`) runs each note when it is due, as an unattended turn framed as scheduled. An occurrence missed by more than 5 minutes is lost, never replayed. Under `permissions: ask`, any question the engine asks is refused straight away.
4. A note with `until: YYYY-MM-DD` is a mission. The agent writes `done:` when the goal is met, and the note stops. Past the deadline the product stamps `expired:` and runs one last turn to escalate, even if the instance was down at the time.
5. The user opens the **planif** app (E-23, tile "Schedules"). It lists the notes with their next and last runs, invalid ones with their problem, and says when the clock is off. It is read-only: its buttons ask the agent to create or change a note.
6. E-23 has no back of its own beside the shell's, and no window: its words are in both languages, except the sentences the server gives for a note's problem, which stay English (Known defects). The rule that a mission may only write its own `done:` is a convention in the `schedule-author` skill; nothing in the code enforces it.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-13 — Delegate to the instance from another agent
A calling agent (often another Adestia) hands this instance a task over MCP and comes back for the answer.

1. The owner sets `mcp.enabled: true`, `mcp.token`, `mcp.agentName` and optionally `mcp.description`. The instance refuses to boot when it is enabled without a token.
2. The calling agent connects to `/mcp` with `Authorization: Bearer <mcp.token>` (a wrong token gets a 401), names itself with `x-adestia-caller` and optionally gives `x-adestia-callback-url`.
3. It calls `ask_<agentName>` with `prompt`, and optionally `task_id` (to continue an earlier conversation) and `notify`. It gets a `job_id` straight away. Past `mcp.maxPending` running jobs, the call is refused as busy.
4. The task runs as a turn in a conversation kept under `dataDir/delegations`, one folder per caller.
5. The calling agent polls `ask_<agentName>_status` with the `job_id` until the answer comes back with a `task_id`. A job is forgotten `mcp.ttlMs` after it ends.
6. If the caller gave a callback URL, this instance sends a `{from, job_id}` ping to it when the job ends. On the receiving side, `POST /callback` accepts only a `from` naming one of its own outbound servers, checks the job with that peer's status tool, and then wakes its own agent with an unattended turn.
7. A user opens **Delegations** (E-13, `#/settings/delegations`, a tile of the Settings mosaic E-9; `GET /api/delegations`): threads grouped by caller, with running/waiting markers. Opening one (`GET /api/delegations/:caller/:id`) shows it read-only, with no composer.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-14 — Install and extend an instance
The owner deploys an instance and makes it their own.

1. The owner runs the image (`Dockerfile`, `docker-compose.yml`): `/workspace` and `/data` as volumes, `adestia.config.yaml` mounted at `/app/adestia.config.yaml`, extra `plugins/` and `skins/` folders mounted, and `CLAUDE_CODE_OAUTH_TOKEN` in the environment (or the credential armed in P-7). Port 8730, health at `/api/health`. Without docker: `npm ci`, the two builds, then `node packages/server/bin/adestia.js [-c <path>]`.
2. The owner writes `adestia.config.yaml`. Every key is optional, unknown keys are refused at boot, and `${VAR}` placeholders whose variable is unset are refused (`adestia.config.example.yaml`).
3. The owner turns plugins on by kind in `extensions.apps`, `extensions.features` and `extensions.tools`, and picks one skin in `extensions.skin` (`alfred`, `dobby`, `nestor`, `skippy`, or `default`). Plugins and skins are found in `extensions.pluginsDir` and `extensions.skinsDir`; being present is not being active. A restart applies the change. A plugin refused at boot (an invalid manifest, for instance) or in the browser (a module that would not import) is listed on E-19 under "Extensions refused"; a refused skin is only logged.
4. The owner adds `extensions.sources` (a `repo` with a required `ref` and an optional `token`, or a mounted `dir`). The repositories are cloned into `<dataDir>/extensions` at boot. A bundled plugin wins over one from a source with the same id. Problems such as an unreachable or stale source or a missing secret show on E-19.
5. At boot, the product delivers its skills (`skills/`: `page-author`, `collections`, `plugin-author`, `skin-author`, `schedule-author`, `persona-author`), each active plugin's skills and subagents, and the generated `this-instance` contract (`introduction.ts`) into the engine's folders. Every turn carries a line pointing at that contract.
6. On a fresh instance whose instructions do not say who the agent is, the user talks to the agent in the chat (E-16). The `persona-author` skill has it ask for a name, a role and a voice, then write them into the instructions.
7. The user asks the agent for a plugin, a skin, a page or a schedule. The agent follows `plugin-author`, `skin-author`, `page-author`/`collections` or `schedule-author` and writes files the product loads after the owner names them and restarts.

Needs: B-1, B-6, B-7, B-8, B-10, B-13, B-15, B-16

### P-15 — Develop Adestia
A developer, a person or a night agent without docker, changes Adestia's code, checks it and looks at it. The tools below are built; the independent documentation review checks their instructions against the code.

1. **Today.** Install and check the install: `npm ci` (never `npm install`), then `ls node_modules/micromark-extension-directive` (`CLAUDE.md`).
2. **Today.** Build, typecheck, lint and test: `npm run build`, `npm run typecheck`, `npm run lint` (`eslint packages plugins`), and `npm test` (vitest, then `npm run test:plugins` with `node --test`). CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a docker build (B-12). The server tests share one support module (`packages/server/test/support/`: fake driver, git repository, temp dirs; R-9), wait on signals the test owns rather than on turns or fixed delays (R-10), and `npm test` runs the catalogue screens suite when Playwright is there, building the shell it needs, and says `no playwright` when it is not (R-14).
3. **Today.** Run from source on the real engine: build, then `node packages/server/bin/adestia.js`, with `CLAUDE_CODE_OAUTH_TOKEN` in the environment for claude-code. For the shell's hot reload, `npm run dev --workspace @antorfr/adestia-web` (Vite, which proxies `/api`, `/plugins` and `/manifest.webmanifest` to `127.0.0.1:8730`).
4. **Today (B-2).** Launch locally (`node bench/launch.mjs --engine fake|claude`, ARCHITECTURE.md › AD-2 detail) with one documented command and no docker, either on the fake engine (AD-2) or on real Claude with only `CLAUDE_CODE_OAUTH_TOKEN`. The fake engine is a bench tool (`bench/fake-engine.mjs`), not a product mode. The Copilot and Codex engines keep their fakes in the tests.
5. **Today, docker only.** Look at a change: `bench/run.sh bench/scenarios/<change>.mjs` builds the image, fakes the engine (unless `BENCH_REAL_ENGINE=1`), drives headless Chromium in a container and drops screenshots in `bench/shots/`; `bench/live-codex.sh` runs a real codex engine.
6. **Today (B-3).** Capture every screen of `docs/ecrans.md` (`node bench/sweep.mjs [--skin <id>] [--locale en|fr] [--out <dir>] [--only E-n]`, ARCHITECTURE.md › AD-3 detail), in light and dark, at desk and phone width, for a chosen skin, on seeded data and with no docker (Playwright and Chromium from the environment): 124 captures in `bench/shots-sweep/<skin>/`, and a non-zero exit naming each screen that did not show.
7. **Today (B-4, B-5).** Find what the product does in `docs/parcours.md`, `docs/ecrans.md`, `docs/donnees.md`, `ARCHITECTURE.md`, `docs/charte.md`, `README.md` and `CLAUDE.md`, and the current state in `.agent/status.md` (under 150 lines) with the history in `CHANGELOG.md`.
8. **Today (B-11).** Work on code that carries each idea once, following the refactoring targets in `ARCHITECTURE.md`.
9. **Today.** Commit by explicit path in a worktree; the work comes back to `main` before it is tagged (`CLAUDE.md`).

Needs: B-2, B-3, B-4, B-5, B-11, B-12, B-13, B-15, B-16

### P-16 — Follow the agent, and know when the server is gone
The user works with a page open and the agent writes in it; the owner is away from home.

1. The user reads a page (E-4) while the agent, asked in the chat (E-16), rewrites it. The page redraws by itself (B-17).
2. The user is editing the same page when the agent writes it. A banner "The page changed" appears over the editor (E-4) with **Reload**; what was typed stays until the user reloads or saves (B-17). The save-time conflict of the revision check is unchanged.
   If the agent deletes or moves the open page, the screen shows E-8 (not found) in reading and in editing, and in editing mode the banner stays until the user chooses **Reload** (B-17). When the workspace watch is off, nothing refreshes, as today.
3. The user opens a screen listed in B-18 on a slow link: a loading state shows (E-3, E-4, E-9, E-10, E-11, E-13, E-16, E-25, E-28). If the fetch of E-4, E-10, E-11, E-13, E-16, E-25 or E-28 fails, a message and **Retry** replace it, and Retry fetches again; E-4's failure is E-8 with its Retry. E-3 and E-9 have no Retry: their failure is the banner of step 4.
4. The VPN drops. A banner "The server is not responding" shows over whatever screen is open (E-32). The user waits, or reconnects the VPN; the banner goes away by itself when the server answers.
5. The owner opens the MCP servers (E-10) and presses **Remove** on one. A sheet (E-33) names the server and asks; **Remove** confirms, **Cancel** or Escape keeps it (B-20).
6. The owner opens the settings (E-14) and changes "Simultaneous turns"; the field says a restart is needed, like the others (B-21).
7. After the container was recreated, the user writes in an old Claude conversation. The turn runs on a fresh engine session and the thread shows a marker at that point (B-22). The conversation itself and its messages are untouched.

Needs: B-17, B-18, B-19, B-20, B-21, B-22

## Out of scope

- **Any functional change, except the six of `adestia-ajouts` (B-17 to B-22)** (from `adestia-qualite`; `adestia-correctifs` repairs defects but adds no function, AD-18): a new feature, a removed feature, a renamed configuration key,
  route or file, a changed data format, a changed MCP tool. A defect found on the way is
  written down (`ARCHITECTURE.md` › Known defects) and left for its own feature.
- **Catalogue security corrections** belonged to the separate catalogue work, not
  this quality pass. They are now integrated: `sources.ts` refuses option-like
  repository/ref values, and `copyMarkedTree` skips links and special files.
- The half-built features listed in `.agent/status.md` (the `ask` posture, usage and quota
  display, Copilot permission plumbing, the editor embedded in plugins without attachments,
  `adestia init`): written down, not built.
- Running the Copilot and Codex engines for real: done with Monsieur at the end of the epic,
  before it reaches `main`.
- **Kept for later by Monsieur (2026-10-25), not built by `adestia-ajouts`**: deleting a
  conversation (the archive serves to audit), the engine's permissions, a cost view (the
  token counter per conversation suffices). **Refused**: `adestia init` and the ephemeral
  question. Also not built: an offline screen, a cache of pages for offline reading, toasts,
  the empty states of E-4 and E-7, and
  a volume for the Claude home in the deployment (`k8s-home-lab` is Monsieur's).
- Deployment: nothing here changes `k8s-home-lab`; the epic reaches `main` and is tagged,
  the bodies are bumped by Monsieur.
