---
name: page-author
description: How any page in this instance is structured — frontmatter conventions (`title`, `type`, `id`, `ico`), how to link one page to another and mint the id that makes a link survive a move, the three ways an app finds its own pages, and the closed block vocabulary for everyday writing (`content`, `figures`, `table`, `list`, `callout`…). Read this before a plugin-specific skill (todo, collections, atelier…): they build on it and do not repeat it.
---

# Writing a Adestia page

A page is a markdown file. Nothing here is a database row — every app that
reads pages reads THIS format, which is why a person editing a file in the
page editor and an app querying it never disagree: there is only one copy.

Optional YAML frontmatter comes first, exactly as three dashes on their own
line, the fields, three dashes again:

```markdown
---
title: Poncer la porte du garage
type: tache
---

Grain 120 puis 240.
```

Two fields the core itself reads. Everything past them is convention.

## `title` — read by the core, never guessed

The core takes `title:` verbatim if it is there. Failing that it uses the
page's first `#` heading, and failing that the file name.

That middle step was nearly removed the day this contract was written, on the
argument that a page should be able to open with any heading without changing
what it is called in a list. Measured against a real corpus it would have
renamed four pages in five: three different `INDEX.md` all reading "INDEX" in
the same list, and "Etabli MFT maison" reading "etabli-mft". A fallback that
carries most of the titles people actually see is not a guess — it is the
convention they already write.

The instability it worried about is real, though, and its cure is one line:
**set `title:` on any page whose name must not move when somebody edits its
first heading.** A list, a collection and a search all read the same title, so
a heading rewritten in passing renames the page everywhere it is cited.

## `type` — the busiest word in the system, and the one nothing enforces

`GET /api/pages/index` returns every page's frontmatter in one query. That one
query is what lets a todo app, a collections app and any app you write next
each see only the pages that matter to them — by filtering on `type`. There is
no second store: `fields.type === 'tache'` in one plugin's code is the entire
mechanism.

Which means `type` is a flat, shared namespace with no code stopping two
plugins from claiming the same word. Two apps that both decide `type: item`
means something to them will each see the other's pages too, and the failure
is silent — a page quietly misread, not an error anywhere.

**Before writing an app that dispatches on `type`, check what already exists**
(read the other plugins' manifests, or ask — this instance's set is usually
small) **and declare your claim** in `adestia-plugin.json`:

```json
{ "types": ["tache", "liste"] }
```

Discovery checks this at boot: two ACTIVE plugins claiming the same `type`
produce a boot-time line naming both, before anyone finds it by watching a
page vanish into the wrong app. See `plugin-author` for the manifest shape.

**A claim can also decide how the page is DRAWN.** A plugin that claims a type
may ship a layout for it, and a page carrying that type then opens as what it
is — a period of meals opens as a frise, not as the prose of a file. It stays
an ordinary page in every other respect: indexed, searchable, filed where you
filed it, and edited with the same ✎. Which means `type` is now the word that
decides a page's SCREEN, and choosing it deserves a moment: see
`plugin-author`, "Drawing a whole page".

This is a claim on words YOUR OWN CODE pattern-matches, not on every value a
page might use `type` for. `collections`' `of: projet` targets pages typed
`projet` without collections owning that word — `projet` is the workspace's
own vocabulary, chosen by whoever writes pages, and any number of collections
can point at it.

## The address of a page — how you tell somebody where it is

Linking one page to another is `[[…]]`, above. Telling a PERSON where a page is
takes a URL, and it has exactly one shape:

```
#/page/<the page's path, WITHOUT the .md>
```

`sante/dietetique/semaines/2026-09-07.md` is announced as
`#/page/sante/dietetique/semaines/2026-09-07`. The path is the one the MEMORY
spells — the root the stores compose — never the one on disk, and the extension
comes off. A folder is `#/section/<folder>` the same way.

Say it whenever you have just written a page somebody asked for. This is
written down because it was not: an agent that has to invent an address reaches
for a plausible neighbour, and a neighbouring page opens perfectly — which is
what makes the mistake slow to see rather than obvious.

## `id` — how another page names this one

A page may carry an `id:`, and that is what lets another page point at it by
IDENTITY rather than by where it sits:

```markdown
---
title: Vannes à pied
type: fiche
id: 01M1RXBTP8F57X5BY4N196XV1T
---
```

The whole gain is that the page can then be renamed, moved to another folder,
or moved to another store, and every link to it still lands. A link written as
a path cannot do that — it names a location, and a location changes.

**Unique within its `type`, not across the instance.** A `fiche` and a `tache`
may legitimately carry the same id; that is why the full form of a reference
says the type.

**Mint it with the `new_id` tool** — a ULID, 26 characters, sortable by
creation time. Never invent one by hand and never reuse one. If this instance's
own instructions define a different scheme (a project already identified in
some other system), follow that instead; the only hard rule is that the value
carries no `/`, `#`, `:` and no whitespace, since those are what a reference is
spelled with.

**A page has no id until something links to it, and that is correct.** Do not
walk the corpus adding ids to pages nobody points at. A page without one is not
faulty, it is *not yet linkable* — and it stops being so at the moment someone
links it, which is the next section.

## `ico` — a convention, not a mechanism

Several apps show a page's `ico:` field as a glyph on a card. Nothing in the
core reads it; reusing the field rather than inventing `icon`/`emoji` of your
own is what makes those cards feel like one product instead of a pile of
similar-but-different widgets.

## `status` — a page's life, and when it folds away

A page may declare where it stands: `status: en-cours`, `status: bloqué`,
`status: clos`. Nothing enforces the word — write the one that is true, and a
word the core has never met is shown as written and treated as LIVE, which is
the direction that loses nobody's page.

What the core does read is whether the word means **the page is over**. Three
families, and a settled page leaves the grid of live ones for a fold at the
bottom of the screen — never dropped, because a finished project is exactly
what somebody opens when they want to know how the last one went.

| Family | Words it knows | What it does |
|---|---|---|
| underway | `en cours`, `idée`, `en réflexion`, `veille`, `référence retenue` | the normal state of a live page |
| waiting | `bloqué`, `en attente`, `à acheter`, `commandé` | you cannot advance it yourself |
| settled | `clos`, `fait`, `terminé`, `réalisé`, `choix fait`, `décidé`, `offert`, `archivé`, `done`, `closed` | archived: folded away |

`acheté` is the one exception worth knowing: settled everywhere as a colour,
but it only ARCHIVES a page that is itself a purchase (`type: achat`). A gift
bought is still a gift to give.

`statut` is read as a synonym of `status`, because a body of pages written in
French usually has both.

**Do not compute this in a view.** `GET /api/pages/index` publishes
`finished: true|false` next to every page's fields — that is the core's own
verdict, and reading it is what keeps a plugin's archive and the shell's
agreeing. A private table of statuses inside one app is the thing that drifts.

## Linking to a page — and what to do when it has no id

Two spellings, both live, and they answer different questions.

```markdown
[[diy/poncer-porte]]                          a PATH
[[fiche#01M1RXBTP8F57X5BY4N196XV1T:la boucle de Vannes]]    a REFERENCE
```

**The path** is how this corpus is written today and it keeps working: the file
name without its extension, opened in place. It says *where*, so it breaks the
day the file moves.

**The reference** says *what*, and survives the move. Prefer it for anything
worth pointing at more than once.

**Always write a label** — the part after the `:`. An id is unreadable, so the
label is the only thing a human can make sense of in the raw file, and it is
what stays on the screen when the link cannot be resolved. A reference without
one shows a bare id to the reader who most needs to understand it.

`[[#<id>:label]]` — no type — is the short form, resolved across types when the
id turns out to be unique. Write it only when you genuinely do not know the
type; the full form is the one that keeps working when a second page later
takes the same id.

**What the reader does when nothing answers.** The label stays on screen, in
grey, underlined dotted, and it is not clickable — a link that died, visibly.
Same for a reference several pages answer to, because choosing one would be
correcting a page while reading another. Nothing is ever silently dropped: a
gap nobody sees is a gap nobody repairs.

### The one manoeuvre to know

You are writing page A and want to link page B. You have to open B anyway, to
read its id. So:

1. **Read B's frontmatter.** It has `id:` — use it, done.
2. **It has none** — call `new_id`, write `id:` into B's frontmatter (and
   `type:` if B has none), save B, then write the link in A.

Do it in the turn you are already in. It is one extra write, it needs nobody's
permission, and it is exactly what "not yet linkable" was waiting for. What is
NOT allowed is writing a reference to an id you have neither read nor just
minted: a reference to an id that does not exist is a dead link the day it is
written.

**Blocks are not linkable yet.** `id` is accepted as an attribute on any block
without being declared, so `:::callout{id=…}` is legal and will not warn — but
nothing resolves a reference INTO a page yet. Do not write `[[…#…#…]]` links.

## Three ways an app finds its own pages

Every plugin picks one, and none of them requires touching a shared registry.

**By `type`.** The pattern above — a query over frontmatter, always current,
free to compute. Use it for anything that is naturally "every page shaped like
X": tasks, curated lists, a collection's members.

**By a reserved workspace folder.** `planif` reads whatever `.md` files sit in
the instance's `planif/` folder directly — no `type:` field involved, because
what makes a note a scheduled turn is *where it lives*, not what it claims to
be. Right for content whose location IS its meaning. See `schedule-author` for
that folder's own frontmatter contract.

**By a sibling asset, found by convention.** `atelier` asks memory for
`**/assets/workbook.json` — wherever it is, and across every store this
instance composes — and treats whichever page sits in the same
project folder as that workbook's owner — nothing declares the pairing, the
folder layout IS the pairing. Right when an app's real data does not fit
markdown at all (geometry, a timeline) but still belongs to one page's world.

Pick by what the data actually is, not by habit: forcing timeline JSON into
frontmatter to stay in the `type` camp is worse than an honest sibling file.

## Sections — folders, and nothing to maintain

The landing screen shows the workspace's own shape: **any folder holding
pages is a section**, and one holding sections is where they live. Nothing
declares this and nothing has to be kept in step — move a page, the tiles
follow.

An index page is **optional**, and its only job is to DRESS the section:

```markdown
<!-- domaines/sante/INDEX.md — or sante/sante.md, either works -->
---
title: Santé
ico: ❤️
couleur: rouge
---
```

| Field | Effect |
|---|---|
| `title` | the tile's label; without it, the folder's own name, prettified |
| `ico` | an emoji on the tile's plate; without it, a neutral mark |
| `couleur` | one of the twelve named hues — the skin decides what each means, so never a hex |

Two spellings are read, because a body of pages usually has both: `INDEX.md`,
and a page named after its folder (`dietetique/dietetique.md`) — the second
suits a section that is itself one subject with its own assets. Either way
that page is the section's overview, not one of its contents, and it is not
listed among them.

**Do not create index pages for the sake of it.** A section with none is a
section: it simply wears its folder's name. Write one when the name alone is
not enough, or when the section deserves a colour — never as bookkeeping.

## Files a page carries — its attachments

A page is rarely only words: a project has its plan as a PDF, a trip its
tickets, a recipe the photo of the dish. Those files live **next to the page**,
and the layout IS the pairing — nothing declares it:

```
domaines/diy/projets/
  garage.md          the page
  devis.pdf          a document it carries
  assets/
    avant.jpg        and another
```

A page's attachments are the non-markdown files **in its own folder** plus
everything under that folder's `assets/`. Files in a SIBLING folder belong to
the pages that live there, not to this one.

Reference them the way markdown always did — relative to the page:

```markdown
![Avant](assets/avant.jpg)

Le [devis](devis.pdf) est parti le 12.
```

Relative links resolve against the page's own folder and are served from
`/api/files/…`. A link to a neighbouring `.md` opens that page in place, like
a `[[wikilink]]`. Whatever a page does not already show in its body appears
under it as an attachment strip — photos as thumbnails, the rest as
downloadable rows — so nothing you file next to a page is invisible.

Two things worth knowing:

- **Images, PDFs, audio, video and plain text display in place. Everything
  else downloads**, including `.svg` and `.html`. That is not a limitation to
  work around: those two render as documents, from the same origin as the
  interface and its session, so they are handed over as files rather than
  drawn. Never rename an SVG to make it show.
- **A browser never writes INTO the workspace**, and that is the whole of the
  restriction — not the sending. The file API is read-only, so a file always
  arrives in the inbox first and YOU file it. A page carrying an attachment is
  a decision the agent made.

Two gestures send a file, and the second is the one to know about, because a
message arrives worded by the shell rather than by the person:

- **dropped in the composer**, with a message the person writes themselves;
- **let go over a page** in reading posture. The file is sent the same way, and
  the composer is filled — not sent — with *"File the attached files with the
  page X"*. So a request naming a page you did not expect usually means
  somebody dropped a file ON that page.

Either way the answer is the same: move the file out of the inbox into the
page's folder — `assets/` when it is an image — give it a name that will still
mean something in a year, and reference it in the page when showing it there is
useful. The inbox is swept: a file left in it is a file lost.

**A file can also be CITED rather than copied.** A relative link resolves
against the page's own folder and is served like any other, so
`[le devis](../admin/assurance/devis.pdf)` shows a document that stays where it
lives, in one copy. Prefer it whenever a file already belongs to another page
and this one merely refers to it — a duplicate is two files to keep in step.

## The closed block vocabulary

A page's body is markdown, plus a small set of `:::name{attrs}` blocks —
closed on purpose, so every page looks like one product no matter who wrote
it. `plugin-author` covers how the set is EXTENDED (a coded change); this is
how to USE what already exists.

**`callout`** — a highlighted aside, for a note, a tip or a warning that
should not blend into the surrounding prose:

```markdown
:::callout{type=warning}
Le guide de refente doit être reréglé après ce changement de lame.
:::
```

`type` is `note` (the default), `tip` or `warning` — nothing else. Anything
else is a diagnostic, not a silently-accepted typo.

**`content`** — a title and a passage of prose. **The one block to reach for
first**, because its subject is an attribute rather than a name: a summary, a
scope, a context and a letter to Father Christmas are the same drawing, so
they are the same block.

```markdown
:::content{type=synthese by=Antor on=2026-09-09}
Huit lots sur treize ; l'identité de fiche reste le chemin critique.
:::

:::content{type=perimetre}
Le socle de contenu et son shell, hors infra.
:::
```

`type` is **required and free** — any word. Inventing a kind of content costs
nothing: no code, no manifest entry, no restart. It is required because a
block that lost what it was about must be a visible refusal, not a paragraph
that quietly forgot its subject. `by` and `on` are optional provenance.

**`title=` and `ico=`** dress the header, on the same words a PAGE declares
(`title:`, `ico:`) and the same ladder the tiles taught — the occurrence beats
a configured label, which beats the prettified type:

```markdown
:::content{type=perimetre title="Périmètre du lot" ico=📐}
Le socle de contenu et son shell, hors infra.
:::
```

Without them the title is the type, prettified — `perimetre` becomes
"Perimetre", accents lost. ⚠️ **`title=` does not replace `type=`.** The title
is display; the SUBJECT is what queries, `pull=content:…` and configuration
address. A block with a title and no type is refused — it has lost what it
was about, however nice the heading.

**`view=cards`** puts the section in a box. Reach for it when a page is made
of several sections that should read as **blocks** rather than as one column
of prose — a status beside a scope, three panels across a band:

```markdown
:::content{type=perimetre title="Périmètre" view=cards w=1/2}
Le socle de contenu et son shell, hors infra.
:::
```

It changes nothing else: the subject, the title, the icon and the signature
are all still there. Note the word is the plural `cards`, the same one `list`
uses — an unknown value is an error that locks the page, so there is one word
for "boxed" and no `view=card` to mistype.

⚠️ **A boxed content is not a `callout`.** A callout is an ASIDE — a remark
set apart from the flow, coloured by its tone, with no subject and no
signature. Use it to interrupt. Use a boxed `content` when the thing IS a
section of the page and you only want it framed.

**`figures`** — numbers as tiles, read from a markdown list the file keeps
readable:

```markdown
:::figures
- Avancement: 62 % — 8 lots sur 13
- Jalon: 12 sept. — dans 3 jours
:::
```

The label is what precedes the colon, the figure what follows it, and an em
dash opens a caption. A line that does not split is kept as a tile without a
label rather than dropped. No attributes: everything it needs is in the list,
which is also what somebody editing the file by hand can still read.

**`table`** — a markdown table, given a block so it can be dressed and, one
day, specialised:

```markdown
:::table
| Fournisseur | Délai | Prix |
|---|---|---|
| Dispano | 5 jours | 412 € |
| Leroy | le jour même | 448 € |
:::
```

It **scrolls in its own box**, so a wide grid never makes the page move
sideways, and its **first column is emphasised** as the key of its row. That is
all it does — no attributes, no colours, no scale of severities. A domain that
wants one (a risk register grading `moyen` and `fort`) OVERRIDES this block and
brings its own vocabulary; the core has no opinion about what a first column
means.

**`list`** — rows: the pages under this one, opening in place, or the lines
written in the block:

```markdown
:::list{type=chantier pull=status,content:etat sort=due}
:::
```

- **`depth`** gives three answers, and the middle one matters. `self` is what
  is filed directly here. `children` is that **plus the index page of each
  direct sub-folder** — because a sub-subject is a FOLDER in this product, so
  the row standing for it is that folder's index, not a page beside it. A rule
  that only looked at files would list a project's loose notes and miss every
  one of its sub-projects. `subtree` is everything below, at any depth.
- **`type`** keeps only the children whose own `type:` matches, comma-separated
  for several (`type=chantier,lot`). **`depth` says how far to look, `type`
  says what to keep**, and you usually want both: a worksite's folder holds
  its sub-worksites AND the loose notes filed beside them, so a list scoped by
  position alone mixes "Sortie mobile" with "Note de lecture". Free-valued —
  page types belong to you.
- **`pull`** names what each row shows of its child, comma-separated, and
  there are TWO kinds:
  - a bare name is a **header field** — `status`, `due` — drawn as a chip;
  - `content:<type>` is what the child's own **`:::content{type=…}` block
    says — `pull=content:etat` puts each sub-worksite's state under its title,
    as a sentence. The index publishes a bounded digest of those blocks, so
    this costs no request per child; it is a SUMMARY, truncated, never the
    page. Only `content` blocks are digested — a table or a timeline is not
    a sentence, and a row is not the place to redraw one.
- **`closed`** decides what happens to what is over: `fold` (the default) puts
  it behind a summary, `hide` drops it, `show` mixes it in. Folded rather than
  hidden because a finished thing is exactly what somebody opens to see how the
  last one went.
- **`source`** accepts `children` and nothing else today. It is the slot a
  plugin widens when it has something to list. (`from=` is a different word on
  purpose: reserved on EVERY block, it names which plugin draws it — see below.)
- **`view`** chooses the shape: `rows` (the default), `cards` — a grid, when
  each entry is meant to be scanned on its own rather than read down a column
  — and `chips`, a plate of initials beside a name.
- Each row wears a **glyph**, and you never write it on the list: the child's
  own `ico:` if it declares one — the same field the tiles and the section
  cards read — else `◆` when the row stands for a FOLDER and `•` when it is a
  plain page. So giving a page an `ico:` dresses it everywhere at once.

**Never write a default.** `depth=children`, `closed=fold`, `source=children`
and `view=rows` are what you already get; writing one reads as a decision to
the next person, who then wonders what it was for. Write the attribute that
changes something.

**A list can also be WRITTEN.** Put lines in the body and they ARE the rows,
split at the first colon, and nothing is queried:

```markdown
:::list{view=chips}
- PM: Machine
- IT PM: Bidule
- BA: Truc
:::
```

Reach for this whenever the list is a **declaration** — who holds which role,
what the ground rules are — something decided by somebody and derivable from
nothing. It is still a list, so it stays `list`; writing it as `content` would
make that word mean "prose" on one page and "rows" on another.

What a written row does NOT have is a page behind it: nothing opens, `pull`
has nothing to pull, and `closed` has no status to close by. If the entries
are pages, query them instead of retyping them.

A page that carries this block never lists itself, and a folder's index page is
the folder rather than one of its contents.

⚠️ **It needs the page index to answer.** Rendered where that index is not at
hand — inside a chat bubble, a preview — it SAYS so instead of drawing an empty
list, because an empty list reads as "this folder holds nothing" when the truth
is "I could not look".

**`gallery`** — a group of images shown as a set rather than as a run of
inline images down the page:

```markdown
:::gallery
![Avant](avant.jpg)
![Après](apres.jpg)
:::
```

**`app`** — reserved for embedding a plugin's own view inline in a page, by
id. It parses, validates and round-trips today; it does **not yet render a
live plugin** — a page holding one shows an inert placeholder rather than a
mounted app. Do not write one expecting an embedded widget until this note is
gone from the skill; ask a person before relying on it for anything real.

**Blocks an active plugin adds.** The seven above are the core's; a plugin may
contribute more, and they are written exactly the same way. What a plugin
contributes is documented in ITS OWN skill — `:::parcours` in `parcours-json`,
and so on — so look there rather than guessing. Two consequences worth
knowing: a block belongs to the plugin, so turning the plugin off takes the
word back out and a page holding one opens read-only until it comes back; and
the vocabulary is still closed — a page cannot invent a block, only an
operator activating a plugin can add one.

An unknown block, or a known one with a bad attribute, never corrupts the
page and never gets silently dropped: it becomes a diagnostic, and the page
opens read-only until it is fixed. Losing a person's content is worse than
telling them what is wrong with it.

### `w` — how much of a line a block takes

Any block accepts it, whatever it is and whoever ships it. No spec declares it,
the same way none declares `id`: it says how the block sits on the page, not
what the block is.

```markdown
:::checklist{w="1/2"}
:::

:::checklist{page="../maison" w="1/2"}
:::
```

Four values and no others — `1` (the default), `2/3`, `1/2`, `1/3`. **Blocks
that follow each other fill a line until their widths reach one**, then a new
line starts. So two halves sit side by side, three thirds do too, and a `2/3`
followed by a `1/2` does not: the second takes its own line rather than being
squeezed into a width nobody asked for. Anything between them — a paragraph, a
heading — ends the run.

The set is closed because it is a LAYOUT vocabulary, not a measurement. A page
that could say `w="37%"` would be a page laying itself out in CSS written by
hand in frontmatter, and a corpus where every author invents their own column.

It is an intention, not a promise about pixels: a narrow canvas puts the blocks
back one per line rather than shrinking them past reading.

### `from` — which plugin draws a block

Like `id` and `w`, any block accepts it and no spec declares it. Its value is a
**plugin id**, or `core` for the plain rendering:

```markdown
:::table{from=core}
| Gravité | Risque |
|---|---|
| Moyen | Le CLI change son contrat |
:::
```

You almost never write it, because the default resolution is already what you
mean: **the nearest definer draws the block**. On a page inside an app's
domain, that app's version applies by itself — the page's location carries the
choice. Elsewhere, the core's. An app's OWN block (`checklist`) works on every
page of the instance, since nobody else claims its name.

Write it in exactly two situations. **`from=core`** to get the plain rendering
on a page whose app dresses a block differently. **`from=<plugin>`** to ask for
a `feature` plugin's version of a core block — a feature is everywhere, so
nothing carries that choice for you, and it never applies uninvited.

A `from=` naming a plugin that is off or gone shows a visible notice with the
body kept underneath — like a dead link: the words survive, the claim does not.

## The home brief — "À la une"

The landing screen shows up to four curated pointers when `home/brief.json`
exists in memory. Written WITHOUT the folder it sits in: what that folder is
called is this instance's business — one calls it `pages`, another `memory` —
and an instance may compose its memory from several, in which case
`memory-stores` tells you which. **You write this file**; the shell renders it
as-is — no model call happens at render time, so what you write is exactly
what people see, and its age is displayed so a stale brief reads as stale.

```json
{
  "generatedAt": "2026-08-24T18:00:00+02:00",
  "items": [
    {
      "ico": "🪚",
      "title": "Rangement garage",
      "reason": "Les panneaux sont livrés — le débit (30 pièces) peut commencer.",
      "target": { "type": "workbook", "path": "domaines/diy/projets/rangement-garage/assets/workbook.json" }
    }
  ]
}
```

`target.type` is one of `app` (with `id`, and optionally a `path` to open it
ON), `page` (with `path`), or `section` (with `path`).

**Any other type carrying a `path` goes to whoever owns that path** — the
trips app for a trip, the atelier for a project holding a workbook, the
section screen for anything else. So `{"type": "workbook", "path": "…"}`
above still works, and works for the right reason: the shell asks, the plugin
claims. Nothing in the shell knows the word `workbook`, which is what lets a
plugin you install tomorrow be a target without a line of shell code. When
you know which app you mean, name it — `{"type": "app", "id": "atelier",
"path": "…/assets/workbook.json"}` opens the bench ON that job rather than on
its hub.

A target nothing recognises is never a dead click: it falls back to asking
the agent to open it in words.

Keep `reason` to one sentence — it is the hover text, not a paragraph. Curate: four items chosen with
judgement beat ten chosen by recency, and an item whose moment has passed
should be dropped, not kept for completeness.

When someone asks to refresh their front page (the ↺ button sends
"Rafraîchis ma une"), rewrite the file and update `generatedAt`.
