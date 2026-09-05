---
name: page-author
description: How any page in this instance is structured — frontmatter conventions (`title`, `type`, `id`, `ico`), how to link one page to another and mint the id that makes a link survive a move, the three ways an app finds its own pages, and the closed block vocabulary for everyday writing. Read this before a plugin-specific skill (todo, collections, atelier…): they build on it and do not repeat it.
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

This is a claim on words YOUR OWN CODE pattern-matches, not on every value a
page might use `type` for. `collections`' `of: projet` targets pages typed
`projet` without collections owning that word — `projet` is the workspace's
own vocabulary, chosen by whoever writes pages, and any number of collections
can point at it.

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
- **A browser cannot put a file there.** The file API is read-only, and files
  arrive one way: somebody attaches them to a message, and YOU file them into
  the workspace. A page carrying an attachment is a decision the agent made.

Which is what a message like *"Range les fichiers joints dans les pièces
jointes de la fiche « Rangement du garage » (diy/garage.md)"* is asking for:
somebody dropped a file on that page. Move it out of the inbox to the page's
folder — `assets/` when it is an image — give it a name that will still mean
something in a year, and reference it in the page when showing it there is
useful. The inbox is swept: a file left in it is a file lost.

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

**Blocks an active plugin adds.** The three above are the core's; a plugin may
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
