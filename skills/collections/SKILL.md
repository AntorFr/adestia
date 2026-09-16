---
name: collections
description: How to declare a collection — a body of pages entered by a facet. Use when asked to organise pages by category, person, project type or any other attribute.
---

# Collections

See `page-author` for what `title`/`type`/`ico` mean everywhere in this
instance, and for why `of:` targets are the workspace's own vocabulary rather
than something a collection owns.

A collection is **a page**, not code, and Adestia itself draws it: no plugin
to activate, nothing to install. Declaring one is how a new way of browsing
comes into existence; nobody edits the interface.

```markdown
---
type: collection
title: Projets
ico: 🗂
of: projet
groupBy: cat
labels: menuiserie=Menuiserie, electronique=Électronique
into: diy/projets
---

Les chantiers en cours, rangés par métier principal.
```

| Field | Meaning |
|---|---|
| `type` | **`collection`** — what makes the page a declaration, and what makes the shell draw it as a grid |
| `of` | the `type` of the pages it collects. **Required**: without it the collection gathers nothing, and says so |
| `groupBy` | the frontmatter field that becomes the first grid of cards. Omit it to list the pages flat |
| `labels` | `value=Label` pairs, so a raw value can read properly without the code knowing your vocabulary |
| `into` | the folder a **new member** is filed in. With it, the page offers a ＋ that asks you to create one there |
| `ico` | the page's glyph, on its card and in its section |

The page's own prose is drawn above the grid: say in a sentence what the
collection is for, the way the example does.

## Where a collection lives

Wherever its subject lives. A collection of projects is filed with the
projects (`diy/projets.md` beside `diy/projets/`), and it is reached the way
any page is — from its section's cards, from a link, from search. There is no
separate "collections" screen: a collection is a page of its domain, not an
app of its own.

## What the members look like

Anything with a matching `type`. A project, for this example:

```markdown
---
type: projet
title: Rangement du garage
cat: menuiserie
status: en-cours
---
```

`status` (or `statut`) is shown on the card if present. Its vocabulary is
yours — the collection displays whatever you wrote rather than checking it
against a list, so a fifth status does not silently disappear.

## Where a new member goes

When somebody presses ＋ on the collection, you are asked to create a page of
the collected `type` in the `into:` folder. Do exactly that: one page, typed
`of`, carrying the `groupBy` facet, filed under `into`. A member filed
elsewhere still appears in the collection (it is a query), but `into` is
where the person expects to find the file.

## What is finished folds away

A status that means **the page is over** (`clos`, `terminé`, `réalisé`,
`offert`… — the table is in `page-author`) takes the page out of the grid of
live ones and into a **Finished** fold at the bottom of the screen. The counts
say both figures — "4 pages · 1 archived" — because "5 pages" over a grid
showing four is the arithmetic that teaches people to distrust a count.

The fold stays closed until somebody opens it — the same posture as the
section screens, so no corner of the app behaves differently from the rest.
Nothing is ever dropped: a category whose work is all done still gets its card,
sorted below the ones with something happening in them, and says in words that
everything in it is finished.

Which words close a page is **one table, the shell's own**: a collection, a
section screen and the editor read the same verdict, so closing a project is
a one-word edit — `status: clos` — and never a move to another folder.

## The one rule worth remembering

**Never copy a page into a collection.** A collection is a QUERY: a page
appears in every collection whose `of` matches its `type`, and editing the
page updates all of them because there is only one page. A page duplicated
into a list is a page that will disagree with itself within the week.

A member missing the grouping facet is not hidden — it lands under
"Uncategorised", where someone can see it and fix it. Hiding it would make
the collection lie about its own size.
