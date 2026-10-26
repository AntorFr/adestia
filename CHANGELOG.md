# Changelog

Oldest first. Release paragraphs are translated from `.agent/status.md`, with their
reasons retained and their deployment recipes removed. An undated heading means the
source did not record a release date; dates are not inferred from git tags.

## Earlier than v0.61.0

- **v0.58.0** — The structural refactoring merged into `main` on 2026-09-15.
  It moved code without changing behaviour. The following concepts work, completed
  on September 15–16, made the chat a projection of the server, routed unattended
  turns through the same desk, distinguished conversations from engine sessions,
  documented folder ownership, and moved collections into the core. These closed
  work records remain in git.
- **Session lifetime** — Completed on 2026-09-16: the configured cookie lifetime is
  a ceiling, and losing a backing refresh token can shorten it. Discovery does not
  announce the identity provider's session lifetime, so it cannot be copied. The
  recorded deployment set `auth.oidc.sessionTtlMs` to 30 days on all three instances.
- **v0.1.0 refers to `homelab-sdlc-core`**, the external home of `dev-flow`
  mentioned by the v0.69.0 entry, not an Adestia release described by this record.
- **v0.1.3 refers to Tessera Seal**, the iframe WebAuthn fix mentioned by the
  v0.81.0 entry, not an Adestia release described by this record.

## v0.61.0

A page occupies a large screen. The canvas grows from 940 to 1400 px; prose keeps
its own measure, raised to 89ch at the owner's request, while tables, `w=` strips,
figures, cards and plugin blocks use the canvas width. The editor follows the same
split. A `:::content` header gets a badge, serif title and right-hand monospace
signature; the empty 35 px at the top of cards disappears.

## v0.62.0

`title=` and `ico=` are reserved, like `w`: any core or plugin block can carry a
title and icon, and the reader draws the header. A `:::list{title=…}` previously
passed with only a warning and displayed no title.

## v0.63.0

`:::list{source=files}` lists a page's files where the author places the block,
using the same folder and `assets/` rule as the attachment strip. `type=` filters
by kind, `view=cards` draws a board and `depth=subtree` descends into subfolders.
The bottom strip no longer repeats files already listed. An ordinary page's reader
also receives `vocabulary`, a latent omission when overriding core blocks.

## v0.64.0

`view=cards` for the timeline and checklist, replaced before any deployment by the
following release.

## v0.65.0

**`frame=card` frames any block; `view` describes only its inside layout.** The
reader draws the frame and title banner; a list's layout remains `rows`/`cards`/
`chips`. Blocks are bare by default. Deliberately without backwards compatibility,
`content{view=cards}` and `checklist{view=…}` now produce warnings without an effect.
Timeline milestone labels sit in measured rows inside the chart instead of climbing
onto the preceding block.

The content-migration work was **closed on 2026-09-20 with the decision not to
migrate**: old sections remain unframed, old checklist `view` filters do nothing,
and row lists stay bare. This was the chosen v0.65 drawing, not an unfinished
migration. The migration script and its questions are retired; git keeps them.

## v0.66.0

**`:::row` is a line break between `w=` blocks** that draws nothing in the page;
the editor shows `:::row`. The owner chose it over a `break` attribute or repurposing
`---`.

## v0.67.0

**Editing draws blocks as reading does**: cards, banners, callouts, `w=` rows and
real data-block rendering, with raw lines on click. Block settings edit attributes,
title, icon, frame and width; the slash menu offers every block, the selection bar
lists, headings and quotes. Blocks drag at the top level, can be lifted out of a
nested block, and deleted. Work driven by the owner's feedback also corrected
saving on opening, `<br />` for empty paragraphs, hidden cursors inside cards and
Crepe's CSS reset.

## v0.68.0

**A plugin can come from another repository.** `extensions.sources` declares git
with a required `ref`, or a mounted folder: pulling a repository executes its code,
so there is no implicit default branch. Clones live under `<dataDir>/extensions`;
an unreachable forge costs a refresh, never startup, which uses the cache and
reports the source's trouble. Discovery reads the image first: another source can
add a plugin, never replace one. A repository whose root is a plugin takes its name
from the manifest. Skins follow the same path.

## v0.69.0

**`dev-flow` leaves the image.** It lives in `AntorFr/homelab-sdlc-core` at v0.1.0,
beside the tooling whose records it reads, and is obtained through
`extensions.sources`. This first real use validates a root that is not itself a
plugin: its tooling directories are ignored and it supplies two plugins, including
`sdlc-console`. The image supplies ten plugins rather than eleven.

## v0.70.0

**The breadcrumb no longer says the same name twice.** A folder holding only one
page of its plugin's requested type opens directly on that page; folder and page
are one screen, so the old folder breadcrumb linked to the screen already open.
`opensOn` asks `folderRoute` and reads the answer through `pageAddress` instead of
copying that rule. For an unowned folder's preview the shelf is a different screen:
the folder keeps its own name instead of changing the navigation target.

## v0.71.0

**Instance settings can be edited from the browser** in Settings › Configuration.
The gesture writes `adestia.config.yaml` itself, not an overlay, preserving comments
through `yaml`'s document API and leaving `${VAR}` unsubstituted. A schemas catalogue
declares controls, help, bounds and restart needs; the server validates against it
and the screen draws from it. Only touched fields are sent.

A file bind-mounted on its own cannot be replaced by renaming a sibling over it
(`EBUSY`): writing is atomic when possible and in place only for that mounting
failure. A read-only instance says so before someone fills in a form, while still
showing its values. Commands, extension sources/apps and secrets stay outside the
catalogue: without authentication these controls would be offered to anyone reaching
the port. The first group is `workspace.watch`, needed for WSL/OneDrive.

## v0.72.0

**A restart button in Settings, without killing a process.** The launcher closes
and starts an instance inside the same process, equally under npm, Docker and
Kubernetes. A supervised child was rejected because it would add signal handling,
exit-code protocol and PID 1 zombie collection where an in-process loop is testable.
Configuration is reread before teardown: invalid configuration costs the restart,
never the serving instance. Active turns refuse a restart unless forced; the screen
waits for health to return.

An older shutdown defect was also fixed: open change/turn streams kept Fastify from
closing, causing a container stop to end in code 137. `forceCloseConnections` can
lose an in-flight response, never its work.

## v0.73.0

**Frontmatter is edited through a form**, from the properties strip's settings
control. Core and plugin field declarations supply the controls; values come from
the actual index rather than a built-in domain list. Nested structures are shown
unchanged. Reference fields select pages by `id` using the index the shell already
holds.

The YAML document API replaces regex surgery, preserving lists and comments and
refusing an unreadable document instead of repairing a partial parse. The editor's
second title writer is removed: it could write invalid YAML for a colon in a title.
The empty strip remains reachable on a new page but writes no frontmatter until its
first field. Native controls follow the chosen theme, the Crepe handle no longer
moves the properties strip into the body, and pre-existing typecheck failures were
fixed separately. Plugin field labels still appeared in English at delivery; v0.74.0
resolves that limitation.

## v0.74.0

**A plugin also translates the words it declares.** A facet supplies its word table;
the shell uses it for tiles, fields, help, block descriptions and form groups.
Lookup checks the plugin, then the shell, then the English phrase. A plugin can
translate its own declarations without renaming Settings for everyone.

All plugins with visible words are already loaded before `loaded`, so a separate
language file and manifest key would duplicate an existing channel. The sweep also
translated meals' refused move and scan's composer tooltip, changed three French
manifest tile names back to English with translations, and removed unused entries.
The ten-plugin words test reads the manifest's modules as the shell does, detecting
both untranslated phrases and translations nobody uses.

## v0.75.0

**A project also says how it is doing.** `project-status: Green | Amber | Red`
belongs to project-management's claimed page type; the existing properties form
edits it without a new field-specific interface. Values remain English because
that is what the file writes, rather than displaying “Vert” and writing `Green`.

Lifecycle status substitutes for project health when held or closed: one badge per
row, never a Green project beside “blocked”. On timeline bars, an explicit health
assessment also wins over inferred lateness. `:::subproject` owns the drawing rather
than extending the core card contract: a cross-card hook would require every card
evolution to be tested against every plugin. It already shares eligibility and
state logic with the plugin's timeline.

Semantic `--danger`/`--warning`/`--success` tokens preserve three meanings even when
a skin flattens named colours. The index exposes `tone` alongside `finished`, since
`finished` cannot distinguish held from active. Core `:::list{pull=status}` rows
also gain their coloured status badge. Shelf cards and page-header chips keep their
lifecycle status; amber still means both inferred lateness and an explicit Amber
assessment, distinguished by the hover word. A different drawing for lateness was
left for a later state-vocabulary decision.

## v0.76.0

**Each person has their own attachment inbox, and the engine knows where it is.**
Undecided uploads must be attributable: boxes use a hash of the identity, avoiding
collisions from sanitising OIDC subjects, with an `owner.txt` to make the hash
readable. Each batch ages by its own date; adding a child changes a directory's date
and cannot be a retention rule.

The inbox is declared as a working root on every chat turn, only when it exists.
Copilot now honours `roots` through `--add-dir`, as the other drivers already did.
Otherwise the instance supplies a path its engine refuses to read, and a file may
be discussed several turns after upload. Declaring the whole inbox was rejected
because it exposes everyone's undecided files, including to delegated callers;
deriving the root from client-supplied ids could grant that same broad root.

Measurement with CLI 1.0.80 showed that tool permission and path permission are
separate: `--allow-all-tools` does not open paths, `--add-dir` does, and a missing
root kills the entire turn. Temporary directories are allowed by default, so a
fixture in `/tmp` can falsely suggest no path check exists. The driver passes
neither `--allow-all-paths` nor `--disallow-temp-dir`; that policy remained separate.

## v0.77.0

**A plugin no longer asks again for what the shell already holds, and a subproject
shows its state in its dot.** `:::subproject` spent one to two seconds requesting
the same page index the shell held live; two blocks paid twice. Blocks and views
now receive `pages` and `stores` together: a page names its store but cannot supply
its label, colour or which store belongs to this shell. Supplying only half would
lose provenance and could call another person's tasks “mine”.

The timeline, subprojects, checklist and todo/journal/listening-post/voyages screens
use these props. Launcher routing and tile counts run before mounting and still
fetch; screens retain a fallback without an index or watcher. Voyages receives a
function so its long-lived imperative engine does not capture an ageing listing.

A subproject's drawn dot carries the colour and the neutral label keeps the word,
so colour is not the only information for screen readers, greyscale or colour-blind
readers. `view=cards` lays out the same list as a grid. Held/closed lifecycle status
still wins over project health. The original bench exposed hidden block settings
until hover, and fixed container names that made parallel benches destroy each
other's server.

## v0.78.0

**The Instructions screen says what each file is made of.** A flat grid of permanent
instructions, skills and agent charters could not say which files reach the model
on every turn. The driver now returns instruction zones with their nature and their
new-file shape, instead of the shell guessing from directory names.

The screen groups by nature, explains when each kind is read, and omits empty
groups. Titles retain engine terms because those are on the files being opened;
the explanatory sentence is translated. Cards use frontmatter `name` and
`description`, and search reads both. The breadcrumb now names the instruction
rather than `SKILL.md`; creating an agent no longer writes an unreadable
`.claude/agents/x/SKILL.md`.

## v0.79.0

**Background reading: an `identity: user` connection can open to unattended turns.**
`background: true` grants visibility to the clock and callbacks, never incoming
delegations: being able to delegate must not confer someone's mail access. A
background turn acts as the rebound store's only person; two identities cause an
explicit refusal instead of a guess. Subjects are not pinned in manifests because
an identity provider's reset can silently reassign them.

An engine that cannot enforce a per-tool allowlist must not promise one. Tessera
still suspends writes until signature; the flag governs background visibility only.
Missed access is logged and exposed through `backgroundTrouble`, so a background
that stopped reading cannot silently resemble one that never ran. An older shell
ignores the manifest field and keeps the connection invisible in the background.

## v0.80.0

**The clock knows fixed hours.** `every:` drifts with the last run; a briefing at
06:30, 12:30 and 18:30 needs a list of wall-clock hours, `at:`, readable where a cron
field was not. A fixed occurrence is due within its grace period and only once.
Missed occurrences are lost rather than queued; new notes await their next hour;
the 15-minute floor wraps round midnight; mixing both cadences is refused.
`Date` preserves the wall hour on daylight-saving days. The Planifications tile
shows the fixed hours and the next occurrence even before the first run.

## v0.81.0

**Tessera signatures become cards, and can be given without leaving the
conversation.** An MCP result supplies the ceremony; the server relays only origins
in `signatures.origins`, attached to the requesting message live and after reload.
Embedded signing opens Tessera in an iframe and resumes an immediate suspended call
after `assertion_ok`. Otherwise a tab and “I've signed” provide the alternative;
advance authorisations use the card without resuming a call.

Tessera Seal v0.1.3 corrected WebAuthn's rejection of cross-origin iframe signing.
The installed iPhone PWA's iframe passkey was still unmeasured; `embed: false`
retains the tab path.

## v0.81.1 — 2026-09-30

**A message sent during a turn is reread after the answer it awaited, and always
goes out.** The pending message is written on arrival, the answer only on completion;
`turn` and `after` let the store reconstruct the intended order without rewriting
old exchanges. The browser keeps it pending across a reload during the turn.
A confirmed race also closed the queue while a pending message was being written:
it now enters the queue first, and the next turn waits for that write.

## v0.82.0 — 2026-10-01

**A plugin delivers its whole skill folder, and its subagents.** Copying only
`SKILL.md` left referenced scripts and documents absent. The whole folder now
travels, excluding hidden files and symbolic links; managed folders are cleared
before rewriting, manual ones left alone. The manifest's `agents` files are
namespaced `<plugin>-<name>.md`, and skills' agent references follow the namespace.
A driver without an agents directory reports it at startup.

## v0.83.0 — 2026-10-01

**A fourth skin, `dobby`: an evening college library.** Walnut, vellum, gilding,
oxblood leather, Garamond for reading and typewriter for the apparatus and code;
an ex-libris at home, a candle during turns and an explicitly requested parchment
day mode. Bundled OFL fonts keep LAN instances independent of the internet.
It addresses “Madame”, as Alfred says “Monsieur”: no personal first name in a
public repository.

## v0.84.0 — 2026-10-01

**A core `persona-author` skill lets a new instance ask who it is instead of
inventing itself.** It interviews one question at a time, proposing rather than
interrogating, on role, borrowed name and figure, address, register, traits,
measured habits, initiative and guardrails. It tries three responses before writing
the person's instruction file, then hands screen words to `skin-author`. It had
not been played on a real instance at delivery.

## v0.85.0 — 2026-10-01

**The skin contract expands so Dobby can be what was drawn.** Code gains
`--font-code` defaulting to `--font-mono`, freeing Dobby's apparatus for small caps;
send and crest gain their own tokens and send gains a glyph. Inert drop-cap tokens
allow Dobby's gilded initial. Hero/console slots receive the OIDC user for the
ex-libris and greeting without putting personal names in the repository. The bench
found that rebuilding the slot context had dropped `user`. The stop control's
non-red colour remained outside this work at delivery.

## v0.86.0 — 2026-10-01

**The instance knows its own address when the operator declares it.** An agent had
answered that it did not know an address already known by its operator. `url:`
in configuration accepts HTTP(S), a path for a reverse-proxy prefix, and no query
or fragment; a trailing slash is removed for stable display. `this-instance` says
“It answers at …” only when supplied: no automatic derivation from the process's
internal bind host and port.

## v0.87.0 — 2026-10-04

**Dobby's icon becomes a green wax seal that fills its square**, and its favicon
loses the nearly black background that vanished in a dark tab and stained a light
one. The favicon is the round transparent seal; installed PNGs use the same wax in
an opaque square, keeping the sock inside the central 80% for circular cropping.
The interface seals remain red.

## v0.87.1 — 2026-10-13

**Reopening an entry just written no longer empties it.** The embedded editor used
the text loaded when the screen opened, not the latest saved text: reopening a new
journal entry showed an empty editor and the first keystroke overwrote the file.
It now starts from `saved`, read through a ref so autosave cannot remount the editor
under the cursor.

## v0.87.2 — 2026-10-15

**The page index reads in parallel**, for WSL/OneDrive where each filesystem call
crosses 9p: about 1.3 s becomes 0.15 s on 147 pages with identical output. Leaf I/O
is capped at 32 concurrent calls to protect descriptors; the digest cache keys by
text hash rather than retaining a second workspace copy. It depends on no timestamp:
an edit or deletion by any writer appears on the next call.

## v0.87.3

Tagged by mistake on the v0.87.2 commit before `cliName` merged. Its image contains
nothing beyond v0.87.2; the source explicitly says not to deploy it.

## v0.87.4

**An MCP server can declare `cliName`**, the key passed to Copilot where an enterprise
registry filters by that name. The UI still shows `name`, and CLI health maps back
to it. Duplicate effective CLI keys are rejected during configuration parsing so
one server cannot silently overwrite another. Only Copilot reads this option;
Claude ignores it.

## v0.88.0 — 2026-10-15

**Instruction catalogues.** Instructions › Catalogues declares git repositories,
scans items by file shape, imports them individually into the active driver's zone,
and refreshes by repository. Cards show provenance. The pre-merge audit found that
contract delivery deleted imports on every restart; this was corrected and startup
reload added. A subsequent security audit rejected repository/ref values starting
with `-` (git options such as `--upload-pack`) and stopped following skill symlinks
when copying; imports report the skipped paths, which the screen does not show.
The repository list also offers catalogue withdrawal, removing its imported copies.

## v0.89.0

No release paragraph or date was recorded in the source status file.

## v0.90.0

No release paragraph or date was recorded in the source status file.

## v0.91.0

No release paragraph or date was recorded in the source status file.

## v0.92.0

No release paragraph or date was recorded in the source status file.

## v0.93.0

No release paragraph or date was recorded in the source status file.

## v0.94.0

No release paragraph or date was recorded in the source status file.

## v0.95.0-adestia-qualite.1

No release paragraph or date was recorded in the source status file.

## v0.95.0-adestia-qualite.2

No release paragraph or date was recorded in the source status file.

## v0.95.0-adestia-qualite.3

No release paragraph or date was recorded in the source status file.

## v0.95.0-adestia-qualite.4

No release paragraph or date was recorded in the source status file.

## v0.95.0

The merged quality tranches keep the product's behaviour while making its screens,
code and development bench consistent. This entry comes from their commit messages,
not from invented release notes for the tags above.

- **Bench** — A Docker-free launcher with fake or real Claude engine, reproducible
  seeds and a screen sweep make the product runnable and visible in a night pod
  (`68bea56`, `1c3c73d`). Real-engine launch removes the fake stored credential so
  it cannot mask the environment's credential.
- **Tests** — Shared fake driver, git and temporary-directory helpers; signal waits
  replace turn counting and sleeps (`19e8b89`, `ba14da4`). The catalogue browser
  suite builds its web shell when absent instead of silently omitting that path.
- **Server** — MCP header selection, engine aids and device-code flows are shared;
  server routes and boot steps are separated, the CLI tool program becomes an
  asset, unused exports are bounded and lint runs in CI (`0fb3680`, `21721bb`,
  `d2d3225`, `22051b2`, `aaca94f`, `08b372c`; R-1–R-8, R-13, R-15).
- **Charter** — Shared tokens, buttons, sheets, icons, focus and locale-aware skin
  words give the settings screens one vocabulary (`21735a2`, `dfba58c`). The
  palette and skin contrasts are measured; configuration shows loading explicitly.
- **Pages** — App, Home, Reader and Editor are split by lifetime; shared paths and
  request helpers replace duplicate rules. Pages and their editor adopt the
  charter and one language, with return controls naming their destination
  (`8109cee`, `3fabf80`, `bb74b82`).
- **Plugins** — Plugin sheets and styles read shell tokens; atelier, parcours and
  project-management use word tables; returns name their destination. Lint and
  CSS checks cover plugins (`ae0d443`, `a5566be`, `5d64f36`, `42e2891`, `65074f4`).
  Native confirm/alert flows remain as recorded defects.
- **Chat** — Request handling and stored-message conversion are shared; chat hooks
  and components are cut by lifetime (`3301a8e`). Rail, composer, permissions and
  signature sheet use the shared controls, icons and language; narrow-layout and
  contrast regressions found in the bench are corrected (`b9f8ce1`, `90323fd`,
  `c2eddf4`, `6f6f1f4`). Preserved failures, including a silent refused turn and
  delegation signatures, remain explicit in ARCHITECTURE.md.

The documentation tranche separates this history from the current state and retires
closed work files. DESIGN.md and the remaining documentation review follow separately.

## adestia-correctifs (unreleased)

- **Boot refuses a non-conformant driver** — `start()` now checks the driver it arms
  (built from the config or injected) against its own descriptor before the
  permissions check. An instance whose driver declares a capability it lacks the
  method of, or an unknown one, no longer boots: it stops with
  `Driver "<id>" is not conformant:` and one line per gap. Previously, the
  descriptor was trusted without this check.
- **Configuration file keeps its mode on save** — saving the configuration through
  the rename path used to leave the file in the umask's default mode (a 0600 file came
  back 0644). The temporary file now takes the target's mode before the rename.
- **Page and block settings stay below the canvas bands** — shared popovers now
  stay below the canvas header, skin console and problem bands, even when flipping
  above their anchor. They follow scrolling and resizing, stay inside the visible
  viewport (including a phone keyboard), and scroll internally when space is short.
  Reproduced at 1440×900 under all four skins by `bench/scenarios/pages-reglages.mjs`.
